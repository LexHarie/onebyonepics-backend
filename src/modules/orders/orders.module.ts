import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './interfaces/controllers/orders.controller';
import { OrdersService } from './application/orders.service';
import { OrdersRepositoryInterfaces } from './infrastructure/index.interface';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { GenerationModule } from '../generation/generation.module';
import { PaymentsModule } from '../payments/payments.module';
import { CompositionModule } from '../composition/composition.module';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    forwardRef(() => GenerationModule),
    CompositionModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    ...OrdersRepositoryInterfaces,
    OptionalAuthGuard,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
