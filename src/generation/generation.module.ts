import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationJob } from './entities/generation-job.entity';
import { GeneratedImage } from './entities/generated-image.entity';
import { ImagesModule } from '../images/images.module';
import { StorageModule } from '../storage/storage.module';
import { GenAIModule } from '../genai/genai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([GenerationJob, GeneratedImage]),
    ImagesModule,
    StorageModule,
    GenAIModule,
    AuthModule,
  ],
  controllers: [GenerationController],
  providers: [GenerationService],
})
export class GenerationModule {}
