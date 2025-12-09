import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ImagesModule } from './images/images.module';
import { GenerationModule } from './generation/generation.module';
import { GridConfigsModule } from './grid-configs/grid-configs.module';
import { StorageModule } from './storage/storage.module';
import { GenAIModule } from './genai/genai.module';
import { CleanupModule } from './cleanup/cleanup.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    StorageModule,
    GenAIModule,
    UsersModule,
    AuthModule,
    ImagesModule,
    GenerationModule,
    GridConfigsModule,
    CleanupModule,
  ],
})
export class AppModule {}
