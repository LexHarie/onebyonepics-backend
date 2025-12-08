import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/genai';

const PROMPT = `Transform this photo into a professional ID/passport photo:

1. BACKGROUND: Pure white background (#FFFFFF)
2. LIGHTING: Even, professional studio lighting
3. COMPOSITION: Center face, proper head-to-frame ratio
4. EXPRESSION: Neutral, natural look
5. QUALITY: Sharp, high-resolution for official documents

Preserve natural appearance and features.`;

export type GeneratedImageResult = {
  mimeType: string;
  data: string; // base64
};

@Injectable()
export class GenAIService {
  private readonly logger = new Logger(GenAIService.name);
  private readonly client: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('google.apiKey');
    this.modelName =
      this.configService.get<string>('google.model') || 'gemini-2.0-flash-exp';
    this.client = new GoogleGenerativeAI(apiKey as string);
  }

  async generateImages(
    imageBuffer: Buffer,
    variationCount: number,
  ): Promise<GeneratedImageResult[]> {
    const model = this.client.getGenerativeModel({ model: this.modelName });
    const imageData = imageBuffer.toString('base64');

    const results: GeneratedImageResult[] = [];

    for (let i = 0; i < variationCount; i++) {
      try {
        const response = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [
                { text: PROMPT },
                {
                  inlineData: {
                    data: imageData,
                    mimeType: 'image/jpeg',
                  },
                },
              ],
            },
          ],
        });

        const inlineData =
          response.response?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!inlineData?.data) {
          throw new Error('No image data returned from model');
        }

        results.push({
          mimeType: inlineData.mimeType || 'image/png',
          data: inlineData.data,
        });
      } catch (err) {
        this.logger.error(`Gemini generation failed: ${(err as Error).message}`);
        throw err;
      }
    }

    return results;
  }
}
