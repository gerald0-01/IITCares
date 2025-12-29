import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';
import { updateUserStreak } from './streak.controller';


const CACHE_EXPIRE = 60 * 5; // 5 minutes

export const journalController = {
  // Create journal entry
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { title, content, mood, tags, isPrivate = true } = req.body;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!content) return res.status(400).json({ error: 'Content is required' });

      const entry = await prisma.journalEntry.create({
        data: { userId, title, content, mood, tags: tags || [], isPrivate }
      });

      // Invalidate cache (remove any journals list variants)
      const journalKeys = await redisClient.keys(`journals:${userId}:*`);
      if (journalKeys.length) await Promise.all(journalKeys.map(k => redisClient.del(k)));
      await redisClient.del(`journalStats:${userId}`);

      // Update streak
      await updateUserStreak(userId, 'JOURNAL_ENTRY');

      res.status(201).json(entry);
    } catch (error) {
      console.error('Create journal error:', error);
      res.status(500).json({ error: 'Failed to create journal entry' });
    }
  },

  // Get my journals
  async getMyJournals(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { startDate, endDate, search, limit = 50 } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `journals:${userId}:${startDate || ''}:${endDate || ''}:${search || ''}:${limit}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { userId };
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) where.date.lte = new Date(endDate as string);
      }
      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { content: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const entries = await prisma.journalEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        take: parseInt(limit as string)
      });

      await redisClient.set(cacheKey, JSON.stringify(entries), { EX: CACHE_EXPIRE });
      res.json(entries);
    } catch (error) {
      console.error('Get journals error:', error);
      res.status(500).json({ error: 'Failed to fetch journals' });
    }
  },

  // Get journal by ID
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const cacheKey = `journal:${id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const entry = await prisma.journalEntry.findUnique({ where: { id } });
      if (!entry) return res.status(404).json({ error: 'Journal not found' });
      if (entry.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      await redisClient.set(cacheKey, JSON.stringify(entry), { EX: CACHE_EXPIRE });
      res.json(entry);
    } catch (error) {
      console.error('Get journal error:', error);
      res.status(500).json({ error: 'Failed to fetch journal' });
    }
  },

  // Update journal
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { title, content, mood, tags, isPrivate } = req.body;

      const existing = await prisma.journalEntry.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId)
        return res.status(404).json({ error: 'Journal not found' });

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (mood !== undefined) updateData.mood = mood;
      if (tags !== undefined) updateData.tags = tags;
      if (isPrivate !== undefined) updateData.isPrivate = isPrivate;

      const updated = await prisma.journalEntry.update({ where: { id }, data: updateData });

      // Invalidate caches (remove any journals list variants)
      const journalKeys = await redisClient.keys(`journals:${userId}:*`);
      if (journalKeys.length) await Promise.all(journalKeys.map(k => redisClient.del(k)));
      await redisClient.del(`journal:${id}`);
      await redisClient.del(`journalStats:${userId}`);

      res.json(updated);
    } catch (error) {
      console.error('Update journal error:', error);
      res.status(500).json({ error: 'Failed to update journal' });
    }
  },

  // Delete journal
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const existing = await prisma.journalEntry.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId)
        return res.status(404).json({ error: 'Journal not found' });

      await prisma.journalEntry.delete({ where: { id } });

      // Invalidate caches (remove any journals list variants)
      const journalKeys = await redisClient.keys(`journals:${userId}:*`);
      if (journalKeys.length) await Promise.all(journalKeys.map(k => redisClient.del(k)));
      await redisClient.del(`journal:${id}`);
      await redisClient.del(`journalStats:${userId}`);

      res.json({ message: 'Journal deleted successfully' });
    } catch (error) {
      console.error('Delete journal error:', error);
      res.status(500).json({ error: 'Failed to delete journal' });
    }
  },

  // Get journal statistics
  async getStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { startDate, endDate } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `journalStats:${userId}:${startDate || ''}:${endDate || ''}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { userId };
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) where.date.lte = new Date(endDate as string);
      }

      const entries = await prisma.journalEntry.findMany({ where });

      const stats = {
        totalEntries: entries.length,
        averageLength:
          entries.length > 0
            ? Math.round(entries.reduce((sum, e) => sum + e.content.length, 0) / entries.length)
            : 0,
        moodDistribution: {} as Record<string, number>,
        commonTags: {} as Record<string, number>
      };

      entries.forEach(entry => {
        if (entry.mood) stats.moodDistribution[entry.mood] = (stats.moodDistribution[entry.mood] || 0) + 1;
        entry.tags.forEach(tag => {
          stats.commonTags[tag] = (stats.commonTags[tag] || 0) + 1;
        });
      });

      await redisClient.set(cacheKey, JSON.stringify(stats), { EX: CACHE_EXPIRE });
      res.json(stats);
    } catch (error) {
      console.error('Get journal stats error:', error);
      res.status(500).json({ error: 'Failed to fetch journal statistics' });
    }
  }
};
