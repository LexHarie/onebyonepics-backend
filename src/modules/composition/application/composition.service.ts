import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { StorageService } from '../../storage/infrastructure/storage.service';
import {
  gridConfigs,
  TILE_DIMENSIONS,
  type GridConfig,
} from '../../grid-configs/domain/data/grid-configs.data';
import { mapWithConcurrency } from '../../../common/utils/concurrency';

// 4R paper size at 300 DPI (4x6 inches)
const PAPER_SIZE = { width: 1200, height: 1800 };
const DEFAULT_COMPOSITION_CONCURRENCY = 2; // Reduced for memory efficiency

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
export class CompositionService implements OnModuleInit {
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

  onModuleInit() {
    // Configure sharp for low-memory environments
    // Limit cache to reduce memory footprint
    sharp.cache({ memory: 50, files: 20, items: 100 });
    // Limit concurrent operations within sharp itself
    sharp.concurrency(1);
    this.logger.log('Sharp configured for low-memory environment');
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

    // Process images sequentially to minimize memory usage
    // Instead of loading all images into memory, process one at a time
    const compositeOps: sharp.OverlayOptions[] = [];
    const processedImages = new Map<number, Buffer>();

    for (const pos of positions) {
      const imageIndex = params.tileAssignments[pos.index];
      if (imageIndex === undefined) {
        this.logger.debug(`No image assigned to tile ${pos.index}`);
        continue;
      }

      try {
        // Check if we already processed this image index
        let resizedBuffer = processedImages.get(imageIndex);

        if (!resizedBuffer) {
          const key = params.imageKeys[imageIndex];
          if (!key) continue;

          // Load and resize in one operation to minimize memory
          const buffer = await this.storageService.getObjectBuffer(key);
          resizedBuffer = await sharp(buffer, { failOn: 'none' })
            .resize(pos.width, pos.height, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 90 }) // Slightly lower quality for memory efficiency
            .toBuffer();

          // Cache resized buffer if same image used in multiple tiles
          processedImages.set(imageIndex, resizedBuffer);

        }

        compositeOps.push({
          input: resizedBuffer,
          left: pos.x,
          top: pos.y,
        });
      } catch (error) {
        this.logger.error(
          `Failed to process image for tile ${pos.index}: ${(error as Error).message}`,
        );
      }
    }

    // Clear the cache after building composite ops
    processedImages.clear();

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
      .jpeg({ quality: 90, mozjpeg: true }) // mozjpeg for better compression
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
}
