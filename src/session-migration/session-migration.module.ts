import { Module } from '@nestjs/common';
import { SessionMigrationController } from './session-migration.controller';
import { SessionMigrationService } from './session-migration.service';
import { SessionMigrationRepositoryInterfaces } from './index.interface';
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
