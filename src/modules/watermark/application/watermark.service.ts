import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

type OutputFormat = 'png' | 'jpeg';

const MAX_INPUT_PIXELS = 60_000_000;
const DEFAULT_PREVIEW_MAX_SIZE = 1024;
const MIN_PREVIEW_MAX_SIZE = 256;
const FULL_QUALITY = 95;
const PREVIEW_QUALITY = 85;
const MIN_FONT_SIZE = 24;
const MAX_FONT_SIZE = 160;
const TILE_WIDTH_MIN = 220;
const TILE_WIDTH_MAX = 600;
const TILE_HEIGHT_MIN = 180;
const TILE_HEIGHT_MAX = 450;
const TEXT_WIDTH_FACTOR = 0.62;

const SHARP_INPUT_OPTIONS = {
  failOn: 'none' as const,
  sequentialRead: true,
  limitInputPixels: MAX_INPUT_PIXELS,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// Configure sharp globally for low-memory environments
sharp.cache({ memory: 50, files: 20, items: 100 });
sharp.concurrency(1);

type ImageInfo = {
  width: number;
  height: number;
  format?: string;
};

@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);
  private readonly previewMaxSize: number;

  constructor(private readonly configService: ConfigService) {
    const configured = this.configService.get<number>('images.previewMaxSize');
    const resolved =
      Number.isFinite(configured) && configured !== undefined
        ? configured
        : DEFAULT_PREVIEW_MAX_SIZE;
    this.previewMaxSize = Math.max(MIN_PREVIEW_MAX_SIZE, Math.round(resolved));
  }

  private resolveOutputFormat(
    mimeType?: string,
    metadataFormat?: string,
  ): { format: OutputFormat; mimeType: string } {
    const normalizedMime = mimeType?.toLowerCase() || '';

    if (normalizedMime.includes('png')) {
      return { format: 'png', mimeType: 'image/png' };
    }

    if (normalizedMime.includes('jpeg') || normalizedMime.includes('jpg')) {
      return { format: 'jpeg', mimeType: 'image/jpeg' };
    }

    if (metadataFormat === 'png') {
      return { format: 'png', mimeType: 'image/png' };
    }

    if (metadataFormat === 'jpeg' || metadataFormat === 'jpg') {
      return { format: 'jpeg', mimeType: 'image/jpeg' };
    }

    return { format: 'png', mimeType: 'image/png' };
  }

  private async getImageInfo(imageBuffer: Buffer): Promise<ImageInfo> {
    const metadata = await sharp(imageBuffer, SHARP_INPUT_OPTIONS).metadata();

    if (metadata.width && metadata.height) {
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      };
    }

    const { info } = await sharp(imageBuffer, SHARP_INPUT_OPTIONS).toBuffer({
      resolveWithObject: true,
    });

    return {
      width: info.width,
      height: info.height,
      format: metadata.format ?? info.format,
    };
  }

  /**
   * Normalize an image to a square crop for consistent 1:1 outputs.
   */
  async normalizeToSquare(
    imageBuffer: Buffer,
    mimeType?: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      const { width, height, format } = await this.getImageInfo(imageBuffer);
      const size = Math.min(width, height);
      const output = this.resolveOutputFormat(mimeType, format);

      const pipeline = this.createPipeline(imageBuffer).resize(size, size, {
        fit: 'cover',
        position: 'center',
      });

      const buffer =
        output.format === 'jpeg'
          ? await pipeline.jpeg({ quality: FULL_QUALITY }).toBuffer()
          : await pipeline.png().toBuffer();

      return { buffer, mimeType: output.mimeType };
    } catch (error) {
      this.logger.error(
        `Failed to normalize image to square: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Apply a diagonal text watermark to an image
   * @param imageBuffer The original image buffer
   * @param text The watermark text (default: "PREVIEW")
   * @returns The watermarked image buffer
   */
  async applyWatermark(
    imageBuffer: Buffer,
    text = 'PREVIEW',
    mimeType?: string,
  ): Promise<Buffer> {
    try {
      return await this.applyWatermarkInternal(imageBuffer, text, mimeType);
    } catch (error) {
      this.logger.error(`Failed to apply watermark: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Apply onebyonepics branding watermark
   */
  async applyBrandWatermark(imageBuffer: Buffer, mimeType?: string): Promise<Buffer> {
    return this.applyWatermark(imageBuffer, 'onebyonepics', mimeType);
  }

  /**
   * Apply both preview and brand watermark
   */
  async applyPreviewWatermark(imageBuffer: Buffer, mimeType?: string): Promise<Buffer> {
    try {
      return await this.applyWatermarkInternal(imageBuffer, 'PREVIEW', mimeType, {
        maxSize: this.previewMaxSize,
        quality: PREVIEW_QUALITY,
      });
    } catch (error) {
      this.logger.error(
        `Failed to apply preview watermark: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private createPipeline(imageBuffer: Buffer) {
    return sharp(imageBuffer, SHARP_INPUT_OPTIONS).rotate();
  }

  private createWatermarkTile(text: string, width: number, height: number) {
    const baseSize = Math.min(width, height);
    const textLength = Math.max(text.trim().length, 1);
    const baseFontSize = clamp(
      Math.round(baseSize * 0.1),
      MIN_FONT_SIZE,
      MAX_FONT_SIZE,
    );

    let tileWidth = clamp(
      Math.round(baseFontSize * textLength * TEXT_WIDTH_FACTOR + baseFontSize),
      TILE_WIDTH_MIN,
      TILE_WIDTH_MAX,
    );
    const maxFontByTile = Math.floor(
      (tileWidth * 0.85) / (textLength * TEXT_WIDTH_FACTOR),
    );
    const fontSize = clamp(
      Math.min(baseFontSize, maxFontByTile),
      MIN_FONT_SIZE,
      MAX_FONT_SIZE,
    );
    tileWidth = clamp(
      Math.round(fontSize * textLength * TEXT_WIDTH_FACTOR + fontSize),
      TILE_WIDTH_MIN,
      TILE_WIDTH_MAX,
    );
    const tileHeight = clamp(
      Math.round(fontSize * 2.6),
      TILE_HEIGHT_MIN,
      TILE_HEIGHT_MAX,
    );
    const strokeWidth = Math.max(Math.round(fontSize * 0.08), 2);

    const svgWatermark = `
      <svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(${Math.round(tileWidth / 2)} ${Math.round(
      tileHeight / 2,
    )}) rotate(-30)">
          <text x="0" y="0"
            font-family="Arial, Helvetica, sans-serif"
            font-size="${fontSize}"
            font-weight="bold"
            fill="rgba(128, 128, 128, 0.4)"
            stroke="rgba(80, 80, 80, 0.25)"
            stroke-width="${strokeWidth}"
            text-anchor="middle"
            dominant-baseline="middle">
            ${text}
          </text>
        </g>
      </svg>
    `;

    return { svgWatermark };
  }

  private async applyWatermarkInternal(
    imageBuffer: Buffer,
    text: string,
    mimeType?: string,
    options?: { maxSize?: number; quality?: number },
  ): Promise<Buffer> {
    const { width, height, format } = await this.getImageInfo(imageBuffer);
    const output = this.resolveOutputFormat(mimeType, format);
    const maxSize = options?.maxSize;
    const scale = maxSize ? Math.min(1, maxSize / Math.max(width, height)) : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const { svgWatermark } = this.createWatermarkTile(
      text,
      targetWidth,
      targetHeight,
    );

    const pipeline = this.createPipeline(imageBuffer);
    if (scale < 1) {
      pipeline.resize({
        width: targetWidth,
        height: targetHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    pipeline.composite([
      {
        input: Buffer.from(svgWatermark),
        tile: true,
        top: 0,
        left: 0,
      },
    ]);

    const quality = options?.quality ?? FULL_QUALITY;
    const result =
      output.format === 'jpeg'
        ? await pipeline.jpeg({ quality }).toBuffer()
        : await pipeline.png().toBuffer();

    this.logger.debug(
      `Applied watermark "${text}" to image (${targetWidth}x${targetHeight}, format: ${format})`,
    );

    return result;
  }
}
