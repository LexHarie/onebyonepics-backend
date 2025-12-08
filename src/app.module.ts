import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
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
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('database.url'),
        autoLoadEntities: true,
        synchronize: true,
        logging: false,
      }),
    }),
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
