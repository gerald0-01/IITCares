import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

const CACHE_EXPIRE = 60 * 5; // 5 minutes

// ---------- Student Notifications ----------
export const notificationController = {
  async getMyNotifications(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { unreadOnly, limit = 50 } = req.query;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `notifications:student:${userId}:${unreadOnly || ''}:${limit}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { userId };
      if (unreadOnly === 'true') where.isRead = false;

      const notifications = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string)
      });

      await redisClient.set(cacheKey, JSON.stringify(notifications), { EX: CACHE_EXPIRE });

      res.json(notifications);
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  },

  async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const notification = await prisma.notification.findUnique({ where: { id } });
      if (!notification || notification.userId !== userId)
        return res.status(404).json({ error: 'Notification not found' });

      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true }
      });

      // Invalidate cache (remove any notifications list variants)
      const notifKeys = await redisClient.keys(`notifications:student:${userId}:*`);
      if (notifKeys.length) await Promise.all(notifKeys.map(k => redisClient.del(k)));

      res.json(updated);
    } catch (error) {
      console.error('Mark notification error:', error);
      res.status(500).json({ error: 'Failed to mark notification' });
    }
  },

  async markAllAsRead(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
      });

      // Invalidate cache (remove any notifications list variants)
      const notifKeys = await redisClient.keys(`notifications:student:${userId}:*`);
      if (notifKeys.length) await Promise.all(notifKeys.map(k => redisClient.del(k)));

      res.json({ message: 'All notifications marked as read' });
    } catch (error) {
      console.error('Mark all notifications error:', error);
      res.status(500).json({ error: 'Failed to mark notifications' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const notification = await prisma.notification.findUnique({ where: { id } });
      if (!notification || notification.userId !== userId)
        return res.status(404).json({ error: 'Notification not found' });

      await prisma.notification.delete({ where: { id } });

      // Invalidate cache (remove any notifications list variants)
      const notifKeys = await redisClient.keys(`notifications:student:${userId}:*`);
      if (notifKeys.length) await Promise.all(notifKeys.map(k => redisClient.del(k)));

      res.json({ message: 'Notification deleted' });
    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  },

  async getUnreadCount(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const count = await prisma.notification.count({ where: { userId, isRead: false } });
      res.json({ unreadCount: count });
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  }
};