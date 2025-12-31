import { Elysia } from 'elysia';
import { CompositionService } from './composition.service';
import { StorageService } from '../storage/storage.service';

export const compositionPlugin = new Elysia({ name: 'composition' }).decorate(
  'composition',
  new CompositionService(new StorageService()),
);
