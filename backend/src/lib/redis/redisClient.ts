import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis connected!'));

export const connectRedis = async () => {
  await redisClient.connect();
};

// Delete keys matching a glob-style pattern using SCAN (non-blocking)
export const delByPattern = async (pattern: string) => {
  const keys: string[] = [];
  for await (const key of redisClient.scanIterator({ MATCH: pattern })) {
    keys.push(key);
  }
  if (keys.length) await redisClient.del(...keys);
};

// Delete keys matching a glob-style pattern using KEYS (blocking).
// Useful when controllers expect KEYS semantics (small datasets).
export const delKeysByPattern = async (pattern: string) => {
  const keys = await redisClient.keys(pattern);
  if (keys.length) await redisClient.del(...keys);
};

export default redisClient;

