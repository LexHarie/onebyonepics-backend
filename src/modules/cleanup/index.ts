import { Elysia } from 'elysia';
import { CleanupService } from './cleanup.service';
import { createCleanupRepository } from './cleanup.repository';
import { StorageService } from '../storage/storage.service';
import { AppLogger } from '../../lib/logger';

const cleanupService = new CleanupService(
  createCleanupRepository(),
  new StorageService(),
);
const logger = new AppLogger('Cleanup');

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export const cleanupPlugin = new Elysia({ name: 'cleanup' })
  .onStart(async () => {
    await cleanupService.handleCleanup();
    cleanupInterval = setInterval(() => {
      cleanupService.handleCleanup().catch((error) => {
        logger.error('Cleanup failed', error);
      });
    }, CLEANUP_INTERVAL_MS);
  })
  .onStop(() => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  });
