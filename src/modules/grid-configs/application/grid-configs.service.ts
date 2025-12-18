import { Injectable, NotFoundException } from '@nestjs/common';
import { gridConfigs } from './data/grid-configs.data';

@Injectable()
export class GridConfigsService {
  findAll() {
    return gridConfigs;
  }

  findById(id: string) {
    const config = gridConfigs.find((c) => c.id === id);
    if (!config) {
      throw new NotFoundException('Grid configuration not found');
    }
    return config;
  }
}
