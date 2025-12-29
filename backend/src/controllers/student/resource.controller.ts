import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';
import { updateUserStreak } from './streak.controller';

const CACHE_EXPIRE = 60 * 5; // 5 minutes

export const resourceController = {
  // Get all resources
  async getAll(req: Request, res: Response) {
    try {
      const { category, type, offlineOnly, search } = req.query;

      const cacheKey = `resources:${category || ''}:${type || ''}:${offlineOnly || ''}:${search || ''}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = {};
      if (category) where.category = category;
      if (type) where.type = type;
      if (offlineOnly === 'true') where.offlineAvailable = true;
      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
          { tags: { has: search as string } }
        ];
      }

      const resources = await prisma.resource.findMany({ where, orderBy: { viewCount: 'desc' } });

      await redisClient.set(cacheKey, JSON.stringify(resources), { EX: CACHE_EXPIRE });

      res.json(resources);
    } catch (error) {
      console.error('Get resources error:', error);
      res.status(500).json({ error: 'Failed to fetch resources' });
    }
  },

  // Get resource by ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const resource = await prisma.resource.findUnique({ where: { id } });
      if (!resource) return res.status(404).json({ error: 'Resource not found' });

      // Increment view count
      await prisma.resource.update({ where: { id }, data: { viewCount: { increment: 1 } } });

      // Track task completion for points
      const userId = req.user?.id;
      if (userId) {
        // Import this helper from your streakController or wherever it's defined
        await updateUserStreak(userId, 'RESOURCE_READ');
      }

      res.json(resource);
    } catch (error) {
      console.error('Get resource error:', error);
      res.status(500).json({ error: 'Failed to fetch resource' });
    }
  },

  // Get offline resources
  async getOfflineResources(req: Request, res: Response) {
    try {
      const cacheKey = 'resources:offline';
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const resources = await prisma.resource.findMany({
        where: { offlineAvailable: true },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          category: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          duration: true
        }
      });

      await redisClient.set(cacheKey, JSON.stringify(resources), { EX: CACHE_EXPIRE });

      res.json(resources);
    } catch (error) {
      console.error('Get offline resources error:', error);
      res.status(500).json({ error: 'Failed to fetch offline resources' });
    }
  }
};
