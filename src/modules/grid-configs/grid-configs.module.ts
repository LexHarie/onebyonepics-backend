import { Module } from '@nestjs/common';
import { GridConfigsController } from './interfaces/controllers/grid-configs.controller';
import { GridConfigsService } from './application/grid-configs.service';

@Module({
  controllers: [GridConfigsController],
  providers: [GridConfigsService],
})
export class GridConfigsModule {}
