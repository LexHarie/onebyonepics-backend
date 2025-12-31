import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/env';
import { AppLogger } from '../../lib/logger';
import {
  RateLimiterService,
  RateLimitExceededException,
} from '../rate-limiter/rate-limiter.service';
import { DEFAULT_TOKEN_ESTIMATE } from '../rate-limiter/domain/rate-limiter.constants';

const PROMPT = `Transform this casual photo into a formal ID/passport photo suitable for official documents.

REQUIREMENTS:
1. BACKGROUND: Replace with pure white background (#FFFFFF), clean and uniform
2. ATTIRE: If the subject is wearing casual clothing, transform it into formal business attire (collared shirt/blouse or suit). Keep the transformation natural and matching the person's appearance
3. LIGHTING: Apply even, professional studio lighting - soft, diffused front light that eliminates harsh shadows
4. COMPOSITION: Center the face with proper head-to-frame ratio (head should occupy 70-80% of vertical space), slight crop below shoulders
5. EXPRESSION: Maintain a neutral, natural expression with a slight professional demeanor
6. SKIN & FEATURES: Keep natural skin tone and all facial features authentic - no beautification or smoothing
7. HAIR: Keep hair neat and tidy as-is, only minor cleanup if needed
8. QUALITY: Output must be sharp, high-resolution, and print-ready for official ID document
9. ASPECT RATIO: 1:1 square format

IMPORTANT: The result must look like a professionally taken studio photo, not an edited selfie. Preserve the person's natural appearance while making them look professional and presentable for formal ID use.`;

export type GeneratedImageResult = {
  mimeType: string;
  data: string;
};

export interface GenerationResult {
  images: GeneratedImageResult[];
  modelUsed: string;
  isFallback: boolean;
  totalTokens: number;
}

export class GenAIService {
  private readonly logger = new AppLogger('GenAIService');
  private readonly client: GoogleGenAI;
  private readonly primaryModel: string;
  private readonly fallbackModel: string;

  constructor(private readonly rateLimiterService: RateLimiterService) {
    const apiKey = config.google.apiKey;
    this.primaryModel = config.google.primaryModel || 'gemini-3-pro-image-preview';
    this.fallbackModel = config.google.fallbackModel || 'gemini-2.5-flash-image';
    this.client = new GoogleGenAI({ apiKey: apiKey as string });

    this.logger.log(
      `GenAI initialized with primary model: ${this.primaryModel}, fallback: ${this.fallbackModel}`,
    );
  }

  private extractTokenCount(response: unknown): number {
    try {
      const usageMetadata = (response as any)?.usageMetadata;
      if (usageMetadata?.totalTokenCount) {
        return usageMetadata.totalTokenCount;
      }
      const promptTokens = usageMetadata?.promptTokenCount || 0;
      const candidateTokens = usageMetadata?.candidatesTokenCount || 0;
      if (promptTokens > 0 || candidateTokens > 0) {
        return promptTokens + candidateTokens;
      }
    } catch {
      // fallthrough
    }
    return DEFAULT_TOKEN_ESTIMATE;
  }

  private async generateSingleImage(
    imageData: string,
    modelName: string,
  ): Promise<{ result: GeneratedImageResult; tokenCount: number }> {
    const isPrimaryModel = modelName.includes('gemini-3-pro-image-preview');
    const imageConfig = isPrimaryModel
      ? { aspectRatio: '1:1', imageSize: '2K' }
      : { aspectRatio: '1:1' };

    const response = await this.client.models.generateContent({
      model: modelName,
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
      config: {
        responseModalities: ['image', 'text'],
        temperature: 1,
        topP: 0.95,
        maxOutputTokens: 32768,
        imageConfig,
      },
    });

    const inlineData = (response as any).candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData,
    )?.inlineData;

    if (!inlineData?.data) {
      throw new Error('No image data returned from model');
    }

    const tokenCount = this.extractTokenCount(response);

    return {
      result: {
        mimeType: inlineData.mimeType || 'image/png',
        data: inlineData.data,
      },
      tokenCount,
    };
  }

  async generateImages(
    imageBuffer: Buffer,
    variationCount: number,
  ): Promise<GenerationResult> {
    const imageData = imageBuffer.toString('base64');
    const results: GeneratedImageResult[] = [];
    let totalTokens = 0;
    let modelUsed = this.primaryModel;
    let isFallback = false;

    for (let i = 0; i < variationCount; i += 1) {
      let selectedModel: string;

      try {
        const available = await this.rateLimiterService.acquireSlot(
          DEFAULT_TOKEN_ESTIMATE,
        );
        selectedModel = available.model;
        isFallback = isFallback || available.isFallback;

        if (available.isFallback && modelUsed === this.primaryModel) {
          this.logger.warn(
            `Switched to fallback model ${this.fallbackModel} for variation ${i + 1}`,
          );
          modelUsed = this.fallbackModel;
        }
      } catch (error) {
        if (error instanceof RateLimitExceededException) {
          this.logger.error(`Rate limit exceeded: ${error.message}`);
          throw error;
        }
        throw error;
      }

      try {
        this.logger.debug(
          `Generating variation ${i + 1}/${variationCount} using model ${selectedModel}`,
        );
        const { result, tokenCount } = await this.generateSingleImage(
          imageData,
          selectedModel,
        );
        results.push(result);
        totalTokens += tokenCount;

        await this.rateLimiterService.recordRequest(selectedModel, tokenCount);

        this.logger.debug(
          `Variation ${i + 1} generated successfully, tokens: ${tokenCount}`,
        );
      } catch (error) {
        const message = (error as Error).message;
        this.logger.error(
          `Gemini generation failed for variation ${i + 1}: ${message}`,
        );

        if (
          selectedModel === this.primaryModel &&
          (message.includes('429') ||
            message.includes('RATE_LIMIT') ||
            message.includes('quota'))
        ) {
          this.logger.warn(
            'Primary model returned rate limit error, trying fallback',
          );
          const { result, tokenCount } = await this.generateSingleImage(
            imageData,
            this.fallbackModel,
          );
          results.push(result);
          totalTokens += tokenCount;
          isFallback = true;
          modelUsed = this.fallbackModel;

          await this.rateLimiterService.recordRequest(
            this.fallbackModel,
            tokenCount,
          );
          this.logger.log(`Fallback successful for variation ${i + 1}`);
          continue;
        }

        throw error;
      }
    }

    this.logger.log(
      `Generated ${results.length} images using ${modelUsed}${isFallback ? ' (fallback used)' : ''}, total tokens: ${totalTokens}`,
    );
    return {
      images: results,
      modelUsed,
      isFallback,
      totalTokens,
    };
  }

  async getRateLimitStatus() {
    const [primaryStatus, fallbackStatus] = await Promise.all([
      this.rateLimiterService.getModelStatus(this.primaryModel),
      this.rateLimiterService.getModelStatus(this.fallbackModel),
    ]);

    return {
      primary: primaryStatus,
      fallback: fallbackStatus,
    };
  }
}
