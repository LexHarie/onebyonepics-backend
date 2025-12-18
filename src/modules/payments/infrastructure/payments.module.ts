import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MayaService } from './maya.service';

@Module({
  imports: [ConfigModule],
  providers: [MayaService],
  exports: [MayaService],
})
export class PaymentsModule {}
