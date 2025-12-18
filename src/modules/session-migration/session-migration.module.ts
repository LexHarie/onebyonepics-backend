import { Module } from '@nestjs/common';
import { SessionMigrationController } from './interfaces/controllers/session-migration.controller';
import { SessionMigrationService } from './application/session-migration.service';
import { SessionMigrationRepositoryInterfaces } from './infrastructure/index.interface';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SessionMigrationController],
  providers: [
    SessionMigrationService,
    ...SessionMigrationRepositoryInterfaces,
  ],
  exports: [SessionMigrationService],
})
export class SessionMigrationModule {}
