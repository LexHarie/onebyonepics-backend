import { Module } from '@nestjs/common';
import { SessionMigrationController } from './session-migration.controller';
import { SessionMigrationService } from './session-migration.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SessionMigrationController],
  providers: [SessionMigrationService],
  exports: [SessionMigrationService],
})
export class SessionMigrationModule {}
