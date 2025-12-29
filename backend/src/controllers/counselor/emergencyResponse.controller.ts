import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

export const emergencyResponseController = {
  // Get active emergencies (with caching)
  async getActiveEmergencies(req: Request, res: Response) {
    try {
      const counselorId = req.user?.id;
      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `activeEmergencies`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const emergencies = await prisma.emergencyAlert.findMany({
        where: {
          status: { in: ['ACTIVE', 'RESPONDED'] }
        },
        include: {
          user: {
            select: {
              studentProfile: {
                select: {
                  name: true,
                  studentNumber: true,
                  yearLevel: true,
                  course: true,
                  phone: true,
                  department: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // TODO: Implement real-time push notifications to counselors

      await redisClient.set(cacheKey, JSON.stringify(emergencies), { EX: 60 * 2 }); // cache for 2 min

      res.json(emergencies);
    } catch (error) {
      console.error('Get emergencies error:', error);
      res.status(500).json({ error: 'Failed to fetch emergencies' });
    }
  },

  // Respond to emergency
  async respondToEmergency(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const counselorId = req.user?.id;
      const { resolution } = req.body;

      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });

      const alert = await prisma.emergencyAlert.findUnique({ where: { id } });
      if (!alert) return res.status(404).json({ error: 'Emergency not found' });

      const updated = await prisma.emergencyAlert.update({
        where: { id },
        data: {
          status: 'RESPONDED',
          respondedBy: counselorId,
          respondedAt: new Date(),
          resolution
        }
      });

      // Invalidate cache (remove any activeEmergencies variants)
      const emerKeys = await redisClient.keys('activeEmergencies*');
      if (emerKeys.length) await Promise.all(emerKeys.map(k => redisClient.del(k)));

      res.json(updated);
    } catch (error) {
      console.error('Respond to emergency error:', error);
      res.status(500).json({ error: 'Failed to respond to emergency' });
    }
  },

  // Resolve emergency
  async resolveEmergency(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const counselorId = req.user?.id;
      const { resolution } = req.body;

      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });

      const alert = await prisma.emergencyAlert.findUnique({ where: { id } });
      if (!alert) return res.status(404).json({ error: 'Emergency not found' });
      if (alert.respondedBy !== counselorId) {
        return res.status(403).json({ error: 'Only the responding counselor can resolve this' });
      }

      const updated = await prisma.emergencyAlert.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolution
        }
      });

      // Invalidate cache (remove any activeEmergencies variants)
      const emerKeys = await redisClient.keys('activeEmergencies*');
      if (emerKeys.length) await Promise.all(emerKeys.map(k => redisClient.del(k)));

      res.json(updated);
    } catch (error) {
      console.error('Resolve emergency error:', error);
      res.status(500).json({ error: 'Failed to resolve emergency' });
    }
  }
};
