import { Module } from '@nestjs/common';
import { QuotasController } from './quotas.controller';
import { QuotasService } from './quotas.service';
import { QUOTAS_REPOSITORY, QuotasRepository } from './quotas.repository';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotasController],
  providers: [QuotasService, { provide: QUOTAS_REPOSITORY, useClass: QuotasRepository }],
  exports: [QuotasService],
})
export class QuotasModule {}
