import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateGenerationDto {
  @IsString()
  uploadedImageId!: string;

  @IsString()
  gridConfigId!: string;

  @IsInt()
  @Min(1)
  @Max(4)
  variationCount!: number;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
