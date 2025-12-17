import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { GenerationModule } from '../generation/generation.module';
import { PaymentsModule } from '../payments/payments.module';
import { CompositionModule } from '../composition/composition.module';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    GenerationModule,
    CompositionModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
