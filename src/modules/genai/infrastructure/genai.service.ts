import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  RateLimiterService,
  RateLimitExceededException,
} from '../rate-limiter/rate-limiter.service';
import { DEFAULT_TOKEN_ESTIMATE } from '../rate-limiter/rate-limiter.constants';

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

export interface GenerationResult {
  images: GeneratedImageResult[];
  modelUsed: string;
  isFallback: boolean;
  totalTokens: number;
}

@Injectable()
export class GenAIService {
  private readonly logger = new Logger(GenAIService.name);
  private readonly client: GoogleGenAI;
  private readonly primaryModel: string;
  private readonly fallbackModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly rateLimiterService: RateLimiterService,
  ) {
    const apiKey = this.configService.get<string>('google.apiKey');
    this.primaryModel =
      this.configService.get<string>('google.primaryModel') || 'gemini-3-pro-image-preview';
    this.fallbackModel =
      this.configService.get<string>('google.fallbackModel') || 'gemini-2.5-flash-image';
    this.client = new GoogleGenAI({ apiKey: apiKey as string });

    this.logger.log(`GenAI initialized with primary model: ${this.primaryModel}, fallback: ${this.fallbackModel}`);
  }

  /**
   * Extract token count from Gemini API response metadata
   */
  private extractTokenCount(response: any): number {
    try {
      const usageMetadata = response?.usageMetadata;
      if (usageMetadata?.totalTokenCount) {
        return usageMetadata.totalTokenCount;
      }
      // Fallback: try individual counts
      const promptTokens = usageMetadata?.promptTokenCount || 0;
      const candidateTokens = usageMetadata?.candidatesTokenCount || 0;
      if (promptTokens > 0 || candidateTokens > 0) {
        return promptTokens + candidateTokens;
      }
    } catch {
      // Ignore parsing errors
    }
    return DEFAULT_TOKEN_ESTIMATE;
  }

  /**
   * Generate a single image with rate limiting and fallback
   */
  private async generateSingleImage(
    imageData: string,
    modelName: string,
  ): Promise<{ result: GeneratedImageResult; tokenCount: number }> {
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
    });

    const inlineData = response.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData,
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

  /**
   * Generate images with automatic rate limiting and model fallback
   */
  async generateImages(
    imageBuffer: Buffer,
    variationCount: number,
  ): Promise<GenerationResult> {
    const imageData = imageBuffer.toString('base64');
    const results: GeneratedImageResult[] = [];
    let totalTokens = 0;
    let modelUsed = this.primaryModel;
    let isFallback = false;

    for (let i = 0; i < variationCount; i++) {
      // Check rate limits and get available model
      let selectedModel: string;

      try {
        const available = await this.rateLimiterService.acquireSlot(DEFAULT_TOKEN_ESTIMATE);
        selectedModel = available.model;
        isFallback = isFallback || available.isFallback;

        if (available.isFallback && modelUsed === this.primaryModel) {
          this.logger.warn(
            `Switched to fallback model ${this.fallbackModel} for variation ${i + 1}`,
          );
          modelUsed = this.fallbackModel;
        }
      } catch (err) {
        if (err instanceof RateLimitExceededException) {
          this.logger.error(`Rate limit exceeded: ${err.message}`);
          throw err;
        }
        throw err;
      }

      try {
        this.logger.debug(
          `Generating variation ${i + 1}/${variationCount} using model ${selectedModel}`,
        );

        const { result, tokenCount } = await this.generateSingleImage(imageData, selectedModel);
        results.push(result);
        totalTokens += tokenCount;

        // Record the successful request
        await this.rateLimiterService.recordRequest(selectedModel, tokenCount);

        this.logger.debug(
          `Variation ${i + 1} generated successfully, tokens: ${tokenCount}`,
        );
      } catch (err) {
        const error = err as Error;
        this.logger.error(
          `Gemini generation failed for variation ${i + 1}: ${error.message}`,
        );

        // If primary model fails with rate limit error from API, try fallback
        if (
          selectedModel === this.primaryModel &&
          (error.message.includes('429') ||
            error.message.includes('RATE_LIMIT') ||
            error.message.includes('quota'))
        ) {
          this.logger.warn(`Primary model returned rate limit error, trying fallback`);

          try {
            const { result, tokenCount } = await this.generateSingleImage(
              imageData,
              this.fallbackModel,
            );
            results.push(result);
            totalTokens += tokenCount;
            isFallback = true;
            modelUsed = this.fallbackModel;

            await this.rateLimiterService.recordRequest(this.fallbackModel, tokenCount);
            this.logger.log(`Fallback successful for variation ${i + 1}`);
            continue;
          } catch (fallbackErr) {
            this.logger.error(
              `Fallback also failed: ${(fallbackErr as Error).message}`,
            );
            throw fallbackErr;
          }
        }

        throw err;
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

  /**
   * Get rate limit status for all models
   */
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
