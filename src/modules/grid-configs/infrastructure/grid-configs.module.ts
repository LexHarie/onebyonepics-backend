import { Module } from '@nestjs/common';
import { GridConfigsController } from './grid-configs.controller';
import { GridConfigsService } from './grid-configs.service';

@Module({
  controllers: [GridConfigsController],
  providers: [GridConfigsService],
})
export class GridConfigsModule {}
