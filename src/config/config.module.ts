import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';
import configuration from './configuration';

class EnvironmentVariables {
  @IsOptional()
  @IsNumber()
  PORT?: number;

  @IsOptional()
  @IsString()
  API_PREFIX?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_API_KEY!: string;

  @IsOptional()
  @IsString()
  GOOGLE_GENAI_MODEL?: string;

  @IsString()
  @IsNotEmpty()
  DO_SPACES_KEY!: string;

  @IsString()
  @IsNotEmpty()
  DO_SPACES_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  DO_SPACES_REGION!: string;

  @IsString()
  @IsNotEmpty()
  DO_SPACES_BUCKET!: string;

  @IsString()
  @IsNotEmpty()
  DO_SPACES_CDN_ENDPOINT!: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsNumber()
  CLEANUP_ORIGINAL_IMAGES_HOURS?: number;

  @IsOptional()
  @IsNumber()
  CLEANUP_GENERATED_IMAGES_DAYS?: number;
}

function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration: ${errors
        .map((err) => Object.values(err.constraints || {}).join(', '))
        .join('; ')}`,
    );
  }

  return validated;
}

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      cache: true,
      expandVariables: true,
    }),
  ],
})
export class ConfigModule {}
