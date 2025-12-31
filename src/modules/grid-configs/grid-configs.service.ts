import { gridConfigs } from './domain/data/grid-configs.data';

export class GridConfigsService {
  findAll() {
    return gridConfigs;
  }

  findById(id: string) {
    return gridConfigs.find((config) => config.id === id) || null;
  }
}
