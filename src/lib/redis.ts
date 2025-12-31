import { RedisClient } from 'bun';
import { config } from '../config/env';
import { AppLogger } from './logger';

let client: RedisClient | null = null;
const logger = new AppLogger('Redis');

export const getRedis = () => {
  if (!client) {
    const redisUrl = config.redis.url;
    client = redisUrl ? new RedisClient(redisUrl) : new RedisClient();

    client.onconnect = () => {
      logger.log('Redis connected');
    };

    client.onclose = (error) => {
      if (error) {
        logger.error('Redis connection error', error);
      } else {
        logger.log('Redis connection closed');
      }
    };
  }

  return client;
};

export const initRedis = async () => {
  const redis = getRedis();
  const connected = (redis as { connected?: boolean }).connected;
  if (!connected) {
    await redis.connect();
  }
  return redis;
};

export const closeRedis = () => {
  if (client) {
    client.close();
    client = null;
  }
};
