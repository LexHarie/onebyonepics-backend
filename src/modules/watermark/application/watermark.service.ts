import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

type OutputFormat = 'png' | 'jpeg';

type ImageInfo = {
  width: number;
  height: number;
  format?: string;
};

@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);

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
    const metadata = await sharp(imageBuffer, { failOn: 'none' }).metadata();

    if (metadata.width && metadata.height) {
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      };
    }

    const { info } = await sharp(imageBuffer, { failOn: 'none' }).toBuffer({
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

      const pipeline = sharp(imageBuffer, { failOn: 'none' })
        .rotate()
        .resize(size, size, { fit: 'cover', position: 'center' });

      const buffer =
        output.format === 'jpeg'
          ? await pipeline.jpeg({ quality: 95 }).toBuffer()
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
      // Clone the buffer to avoid mutation issues
      const inputBuffer = Buffer.from(imageBuffer);
      const { width, height, format } = await this.getImageInfo(inputBuffer);
      const output = this.resolveOutputFormat(mimeType, format);

      // Calculate font size based on image dimensions
      const fontSize = Math.max(Math.min(width, height) * 0.1, 36);
      const strokeWidth = Math.max(fontSize * 0.08, 3);

      // Create SVG with repeating diagonal watermark pattern
      // Using dark semi-transparent text that's visible on white backgrounds
      const svgWatermark = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="watermark" patternUnits="userSpaceOnUse"
                     width="${width * 0.5}" height="${height * 0.35}"
                     patternTransform="rotate(-30)">
              <text x="50%" y="50%"
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
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#watermark)"/>
        </svg>
      `;

      // Composite the watermark onto the image, preserving original dimensions
      const pipeline = sharp(inputBuffer, { failOn: 'none' })
        .rotate()
        .composite([
          {
            input: Buffer.from(svgWatermark),
            top: 0,
            left: 0,
          },
        ]);

      const result =
        output.format === 'jpeg'
          ? await pipeline.jpeg({ quality: 95 }).toBuffer()
          : await pipeline.png().toBuffer();

      this.logger.debug(`Applied watermark "${text}" to image (${width}x${height}, format: ${format})`);

      return result;
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
    return this.applyWatermark(imageBuffer, 'PREVIEW', mimeType);
  }
}
