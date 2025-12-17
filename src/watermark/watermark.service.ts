import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);

  /**
   * Apply a diagonal text watermark to an image
   * @param imageBuffer The original image buffer
   * @param text The watermark text (default: "PREVIEW")
   * @returns The watermarked image buffer
   */
  async applyWatermark(imageBuffer: Buffer, text = 'PREVIEW'): Promise<Buffer> {
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const { width = 800, height = 800 } = metadata;

      // Calculate font size based on image dimensions
      const fontSize = Math.max(Math.min(width, height) * 0.12, 40);
      const strokeWidth = Math.max(fontSize * 0.05, 2);

      // Create SVG with repeating diagonal watermark pattern
      const svgWatermark = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="watermark" patternUnits="userSpaceOnUse"
                     width="${width * 0.6}" height="${height * 0.4}"
                     patternTransform="rotate(-30)">
              <text x="50%" y="50%"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="${fontSize}"
                    font-weight="bold"
                    fill="rgba(255, 255, 255, 0.5)"
                    stroke="rgba(0, 0, 0, 0.3)"
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

      // Composite the watermark onto the image
      const result = await image
        .composite([
          {
            input: Buffer.from(svgWatermark),
            gravity: 'center',
          },
        ])
        .png()
        .toBuffer();

      this.logger.debug(`Applied watermark "${text}" to image (${width}x${height})`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to apply watermark: ${(error as Error).message}`);
      // Return original image if watermarking fails
      return imageBuffer;
    }
  }

  /**
   * Apply onebyonepics branding watermark
   */
  async applyBrandWatermark(imageBuffer: Buffer): Promise<Buffer> {
    return this.applyWatermark(imageBuffer, 'onebyonepics');
  }

  /**
   * Apply both preview and brand watermark
   */
  async applyPreviewWatermark(imageBuffer: Buffer): Promise<Buffer> {
    return this.applyWatermark(imageBuffer, 'PREVIEW');
  }
}
