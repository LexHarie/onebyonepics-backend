import { Elysia } from 'elysia';
import { WatermarkService } from './watermark.service';

export const watermarkPlugin = new Elysia({ name: 'watermark' }).decorate(
  'watermark',
  new WatermarkService(),
);
