import { Module } from '@nestjs/common';
import { QuotasController } from './interfaces/controllers/quotas.controller';
import { QuotasService } from './application/quotas.service';
import { QuotasRepositoryInterfaces } from './infrastructure/index.interface';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotasController],
  providers: [QuotasService, ...QuotasRepositoryInterfaces],
  exports: [QuotasService],
})
export class QuotasModule {}
