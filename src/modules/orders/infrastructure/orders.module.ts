import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from '../application/orders.service';
import { OrdersRepositoryInterfaces } from './index.interface';
import { DatabaseModule } from '../../database/infrastructure/database.module';
import { StorageModule } from '../../storage/infrastructure/storage.module';
import { GenerationModule } from '../../generation/infrastructure/generation.module';
import { PaymentsModule } from '../../payments/infrastructure/payments.module';
import { CompositionModule } from '../../composition/infrastructure/composition.module';
import { OptionalAuthGuard } from '../../../common/guards/optional-auth.guard';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    GenerationModule,
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
