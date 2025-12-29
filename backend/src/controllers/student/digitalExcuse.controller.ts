import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';
import { ExcuseStatus } from '../../../generated/prisma/client';

const CACHE_EXPIRE = 60 * 5; // 5 minutes

export const digitalExcuseController = {
  // Get my excuses (Student)
  async getMyExcuses(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { status } = req.query;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `excuses:${userId}:${status || 'all'}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { userId };
      if (status) where.status = status as ExcuseStatus;

      const excuses = await prisma.digitalExcuse.findMany({
        where,
        include: {
          counselor: {
            select: {
              counselorProfile: {
                select: { name: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(excuses), { EX: CACHE_EXPIRE });
      res.json(excuses);
    } catch (error) {
      console.error('Get excuses error:', error);
      res.status(500).json({ error: 'Failed to fetch excuses' });
    }
  },

  // Get excuse details
  async getExcuseById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const cacheKey = `excuse:${id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const excuse = await prisma.digitalExcuse.findUnique({
        where: { id },
        include: {
          counselor: {
            select: {
              counselorProfile: {
                select: { name: true, office: true }
              }
            }
          }
        }
      });

      if (!excuse) return res.status(404).json({ error: 'Excuse not found' });
      if (excuse.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      await redisClient.set(cacheKey, JSON.stringify(excuse), { EX: CACHE_EXPIRE });
      res.json(excuse);
    } catch (error) {
      console.error('Get excuse error:', error);
      res.status(500).json({ error: 'Failed to fetch excuse' });
    }
  }
};
