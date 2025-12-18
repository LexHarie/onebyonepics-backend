import { Module } from '@nestjs/common';
import { QuotasController } from './quotas.controller';
import { QuotasService } from './quotas.service';
import { QuotasRepositoryInterfaces } from './index.interface';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotasController],
  providers: [QuotasService, ...QuotasRepositoryInterfaces],
  exports: [QuotasService],
})
export class QuotasModule {}
