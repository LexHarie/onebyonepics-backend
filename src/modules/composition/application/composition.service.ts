import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { StorageService } from '../../storage/infrastructure/storage.service';
import {
  gridConfigs,
  TILE_DIMENSIONS,
  type GridConfig,
} from '../../grid-configs/domain/data/grid-configs.data';

// 4R paper size at 300 DPI (4x6 inches)
const PAPER_SIZE = { width: 1200, height: 1800 };
const DEFAULT_COMPOSITION_CONCURRENCY = 4;

type TileSize = keyof typeof TILE_DIMENSIONS;

interface TilePosition {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  size: TileSize;
}

@Injectable()
export class CompositionService {
  private readonly logger = new Logger(CompositionService.name);
  private readonly maxConcurrency: number;

  constructor(
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {
    const configured = this.configService.get<number>('composition.maxConcurrency');
    this.maxConcurrency = Math.max(
      1,
      configured ?? DEFAULT_COMPOSITION_CONCURRENCY,
    );
  }

  /**
   * Compose a 4R grid image from generated images
   * @param gridConfigId The grid configuration ID
   * @param tileAssignments Map of tile index to image index
   * @param imageKeys Storage keys for generated images (unwatermarked)
   * @returns The composed image buffer
   */
  async composeGrid(params: {
    gridConfigId: string;
    tileAssignments: Record<number, number>;
    imageKeys: string[];
  }): Promise<Buffer> {
    const config = gridConfigs.find((c) => c.id === params.gridConfigId);
    if (!config) {
      throw new Error(`Grid config not found: ${params.gridConfigId}`);
    }

    this.logger.log(`Composing grid for config ${params.gridConfigId} with ${params.imageKeys.length} images`);

    // Calculate tile positions
    const positions = this.calculateTilePositions(config);

    // Load all unique images needed
    const uniqueIndices = [...new Set(Object.values(params.tileAssignments))];
    const imageBuffers = new Map<number, Buffer>();

    await this.mapWithConcurrency(uniqueIndices, this.maxConcurrency, async (index) => {
      const key = params.imageKeys[index];
      if (!key) return;
      try {
        const buffer = await this.storageService.getObjectBuffer(key);
        imageBuffers.set(index, buffer);
      } catch (error) {
        this.logger.error(`Failed to load image ${key}: ${(error as Error).message}`);
      }
    });

    const compositeResults = await this.mapWithConcurrency<
      TilePosition,
      sharp.OverlayOptions | null
    >(positions, this.maxConcurrency, async (pos) => {
        const imageIndex = params.tileAssignments[pos.index];
        if (imageIndex === undefined) {
          this.logger.debug(`No image assigned to tile ${pos.index}`);
          return null;
        }

        const buffer = imageBuffers.get(imageIndex);
        if (!buffer) {
          this.logger.warn(`Image buffer not found for index ${imageIndex}`);
          return null;
        }

        try {
          // Resize image to fit tile with center crop
          const resizedBuffer = await sharp(buffer)
            .resize(pos.width, pos.height, { fit: 'cover', position: 'center' })
            .toBuffer();

          const overlay: sharp.OverlayOptions = {
            input: resizedBuffer,
            left: pos.x,
            top: pos.y,
          };
          return overlay;
        } catch (error) {
          this.logger.error(
            `Failed to resize image for tile ${pos.index}: ${(error as Error).message}`,
          );
          return null;
        }
      });

    // Create composite operations
    const compositeOps = compositeResults.filter(
      (op): op is sharp.OverlayOptions => Boolean(op),
    );

    // Create white background and composite all tiles
    const result = await sharp({
      create: {
        width: PAPER_SIZE.width,
        height: PAPER_SIZE.height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(compositeOps)
      .jpeg({ quality: 95 })
      .toBuffer();

    this.logger.log(`Composed grid image: ${result.length} bytes`);

    return result;
  }

  /**
   * Calculate tile positions using row-based packing with centering
   */
  private calculateTilePositions(config: GridConfig): TilePosition[] {
    const positions: TilePosition[] = [];
    const { width: paperW, height: paperH } = PAPER_SIZE;

    // Map tiles with their dimensions
    const tilesWithDims = config.preview.map((tile, index) => ({
      index,
      size: tile.size,
      ...TILE_DIMENSIONS[tile.size],
    }));

    // Sort by size (largest first) for better packing
    const sortOrder: Record<TileSize, number> = { '2x2': 0, passport: 1, '1x1': 2 };
    const sortedTiles = [...tilesWithDims].sort(
      (a, b) => sortOrder[a.size] - sortOrder[b.size],
    );

    // Row-based packing
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;

    for (const tile of sortedTiles) {
      // Check if tile fits in current row
      if (currentX + tile.width > paperW) {
        // Move to next row
        currentX = 0;
        currentY += rowHeight;
        rowHeight = 0;
      }

      // Check if tile fits in paper height
      if (currentY + tile.height > paperH) {
        this.logger.warn(`Tile ${tile.index} doesn't fit on paper, skipping`);
        continue;
      }

      positions.push({
        index: tile.index,
        x: currentX,
        y: currentY,
        width: tile.width,
        height: tile.height,
        size: tile.size,
      });

      currentX += tile.width;
      rowHeight = Math.max(rowHeight, tile.height);
    }

    // Calculate centering offset
    let maxX = 0;
    let maxY = 0;
    for (const pos of positions) {
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    }

    const offsetX = Math.floor((paperW - maxX) / 2);
    const offsetY = Math.floor((paperH - maxY) / 2);

    // Apply centering offset
    for (const pos of positions) {
      pos.x += offsetX;
      pos.y += offsetY;
    }

    // Sort back to original order
    positions.sort((a, b) => a.index - b.index);

    this.logger.debug(`Calculated ${positions.length} tile positions`);

    return positions;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) return [];

    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(concurrency, items.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= items.length) {
          return;
        }
        results[currentIndex] = await mapper(items[currentIndex] as T);
      }
    });

    await Promise.all(workers);
    return results;
  }
}
