import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

export const emergencyController = {
  // Create emergency alert
  async createAlert(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { type, message, location } = req.body;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!type) return res.status(400).json({ error: 'Emergency type is required' });

      const alert = await prisma.emergencyAlert.create({
        data: {
          userId,
          type,
          message,
          location,
          status: 'ACTIVE'
        },
        include: {
          user: {
            select: {
              studentProfile: {
                select: { name: true, studentNumber: true, yearLevel: true, course: true }
              }
            }
          }
        }
      });

      // TODO: Send real-time notifications to counselors
      // This would be implemented with WebSockets or push notifications

      // Cache user alerts for quick retrieval
      const cacheKey = `emergencyAlerts:${userId}`;
      const alerts = await prisma.emergencyAlert.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      await redisClient.set(cacheKey, JSON.stringify(alerts), { EX: 60 * 5 }); // 5 min cache

      res.status(201).json(alert);
    } catch (error) {
      console.error('Create emergency error:', error);
      res.status(500).json({ error: 'Failed to create emergency alert' });
    }
  },

  // Get my alerts (with optional caching)
  async getMyAlerts(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { status } = req.query;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `emergencyAlerts:${userId}${status ? `:${status}` : ''}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { userId };
      if (status) where.status = status;

      const alerts = await prisma.emergencyAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(alerts), { EX: 60 * 5 }); // cache for 5 min

      res.json(alerts);
    } catch (error) {
      console.error('Get alerts error:', error);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  }
};
