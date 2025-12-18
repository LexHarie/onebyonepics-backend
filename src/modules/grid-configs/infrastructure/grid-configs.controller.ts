import { Controller, Get, Param } from '@nestjs/common';
import { GridConfigsService } from '../application/grid-configs.service';

@Controller('grid-configs')
export class GridConfigsController {
  constructor(private readonly gridConfigsService: GridConfigsService) {}

  @Get()
  findAll() {
    return this.gridConfigsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gridConfigsService.findById(id);
  }
}
