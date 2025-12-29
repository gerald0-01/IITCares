import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

const CACHE_EXPIRE = 60 * 5; // 5 minutes

// ---------- Counselor Notifications ----------
export const counselorNotificationController = {
  async getMyNotifications(req: Request, res: Response) {
    try {
      const counselorId = req.user?.id;
      const { unreadOnly, limit = 50 } = req.query;
      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `notifications:counselor:${counselorId}:${unreadOnly || ''}:${limit}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { counselorId };
      if (unreadOnly === 'true') where.isRead = false;

      const notifications = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string)
      });

      await redisClient.set(cacheKey, JSON.stringify(notifications), { EX: CACHE_EXPIRE });

      res.json(notifications);
    } catch (error) {
      console.error('Get counselor notifications error:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  },

  async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const counselorId = req.user?.id;
      const { unreadOnly, limit = '50' } = req.query;

     const notifications = await prisma.notification.findMany({
        where: {
            user: { role: 'COUNSELOR' }, // Prisma supports filtering via relations
            ...(unreadOnly === 'true' ? { isRead: false } : {})
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string)
    });

      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true }
      });

      // Invalidate cache (remove any notifications list variants)
      const notifKeys = await redisClient.keys(`notifications:counselor:${counselorId}:*`);
      if (notifKeys.length) await Promise.all(notifKeys.map(k => redisClient.del(k)));

      res.json(updated);
    } catch (error) {
      console.error('Mark notification error:', error);
      res.status(500).json({ error: 'Failed to mark notification' });
    }
  },

  async markAllAsRead(req: Request, res: Response) {
    try {
      const counselorId = req.user?.id;
      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });

      await prisma.notification.updateMany({
        where: { counselorId, isRead: false },
        data: { isRead: true }
      });

      const notifKeys = await redisClient.keys(`notifications:counselor:${counselorId}:*`);
      if (notifKeys.length) await Promise.all(notifKeys.map(k => redisClient.del(k)));

      res.json({ message: 'All notifications marked as read' });
    } catch (error) {
      console.error('Mark all notifications error:', error);
      res.status(500).json({ error: 'Failed to mark notifications' });
    }
  },

  async getUnreadCount(req: Request, res: Response) {
    try {
      const counselorId = req.user?.id;
      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });

      const count = await prisma.notification.count({ where: { counselorId, isRead: false } });
      res.json({ unreadCount: count });
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  }
};