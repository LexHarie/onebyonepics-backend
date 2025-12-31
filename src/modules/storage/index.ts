import { Elysia } from 'elysia';
import { StorageService } from './storage.service';

export const storagePlugin = new Elysia({ name: 'storage' }).decorate(
  'storage',
  new StorageService(),
);
