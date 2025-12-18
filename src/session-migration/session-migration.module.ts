import { Module } from '@nestjs/common';
import { SessionMigrationController } from './session-migration.controller';
import { SessionMigrationService } from './session-migration.service';
import {
  SESSION_MIGRATION_REPOSITORY,
  SessionMigrationRepository,
} from './session-migration.repository';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SessionMigrationController],
  providers: [
    SessionMigrationService,
    { provide: SESSION_MIGRATION_REPOSITORY, useClass: SessionMigrationRepository },
  ],
  exports: [SessionMigrationService],
})
export class SessionMigrationModule {}
