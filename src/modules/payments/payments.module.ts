import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MayaService } from './infrastructure/maya.service';

@Module({
  imports: [ConfigModule],
  providers: [MayaService],
  exports: [MayaService],
})
export class PaymentsModule {}
