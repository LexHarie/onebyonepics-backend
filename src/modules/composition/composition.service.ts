import sharp from 'sharp';
import { config } from '../../config/env';
import { StorageService } from '../storage/storage.service';
import {
  gridConfigs,
  TILE_DIMENSIONS,
  type GridConfig,
} from '../grid-configs/domain/data/grid-configs.data';

const PAPER_SIZE = { width: 1200, height: 1800 };
const DEFAULT_COMPOSITION_CONCURRENCY = 2;

type TileSize = keyof typeof TILE_DIMENSIONS;

interface TilePosition {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  size: TileSize;
}

export class CompositionService {
  private readonly maxConcurrency: number;

  constructor(private readonly storageService: StorageService) {
    const configured = config.composition.maxConcurrency;
    this.maxConcurrency = Math.max(1, configured ?? DEFAULT_COMPOSITION_CONCURRENCY);

    sharp.cache({ memory: 50, files: 20, items: 100 });
    sharp.concurrency(1);
  }

  async composeGrid(params: {
    gridConfigId: string;
    tileAssignments: Record<number, number>;
    imageKeys: string[];
  }): Promise<Buffer> {
    const configEntry = gridConfigs.find((c) => c.id === params.gridConfigId);
    if (!configEntry) {
      throw new Error(`Grid config not found: ${params.gridConfigId}`);
    }

    const positions = this.calculateTilePositions(configEntry);

    const compositeOps: sharp.OverlayOptions[] = [];
    const processedImages = new Map<string, Buffer>();

    for (const pos of positions) {
      const imageIndex = params.tileAssignments[pos.index];
      if (imageIndex === undefined) {
        continue;
      }

      const cacheKey = `${imageIndex}-${pos.width}x${pos.height}`;
      let resizedBuffer = processedImages.get(cacheKey);

      if (!resizedBuffer) {
        const key = params.imageKeys[imageIndex];
        if (!key) continue;

        const buffer = await this.storageService.getObjectBuffer(key);
        resizedBuffer = await sharp(buffer, { failOn: 'none' })
          .resize(pos.width, pos.height, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 90 })
          .toBuffer();

        processedImages.set(cacheKey, resizedBuffer);
      }

      compositeOps.push({
        input: resizedBuffer,
        left: pos.x,
        top: pos.y,
      });
    }

    processedImages.clear();

    const result = await sharp({
      create: {
        width: PAPER_SIZE.width,
        height: PAPER_SIZE.height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(compositeOps)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return result;
  }

  private calculateTilePositions(configEntry: GridConfig): TilePosition[] {
    const positions: TilePosition[] = [];
    const { width: paperW, height: paperH } = PAPER_SIZE;

    const tilesWithDims = configEntry.preview.map((tile, index) => ({
      index,
      size: tile.size,
      ...TILE_DIMENSIONS[tile.size],
    }));

    const sortOrder: Record<TileSize, number> = {
      '2x2': 0,
      passport: 1,
      '1x1': 2,
    };
    const sortedTiles = [...tilesWithDims].sort(
      (a, b) => sortOrder[a.size] - sortOrder[b.size],
    );

    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;

    for (const tile of sortedTiles) {
      if (currentX + tile.width > paperW) {
        currentX = 0;
        currentY += rowHeight;
        rowHeight = 0;
      }

      if (currentY + tile.height > paperH) {
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

    let maxX = 0;
    let maxY = 0;
    for (const pos of positions) {
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    }

    const offsetX = Math.floor((paperW - maxX) / 2);
    const offsetY = Math.floor((paperH - maxY) / 2);

    for (const pos of positions) {
      pos.x += offsetX;
      pos.y += offsetY;
    }

    positions.sort((a, b) => a.index - b.index);

    return positions;
  }
}
