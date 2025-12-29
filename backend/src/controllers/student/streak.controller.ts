import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

const CACHE_EXPIRE = 60 * 5; // 5 minutes

export const streakController = {
  // Get my streak
  async getMyStreak(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `streak:${userId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      let streak = await prisma.userStreak.findUnique({ where: { userId } });
      if (!streak) {
        streak = await prisma.userStreak.create({ data: { userId } });
      }

      await redisClient.set(cacheKey, JSON.stringify(streak), { EX: CACHE_EXPIRE });
      res.json(streak);
    } catch (error) {
      console.error('Get streak error:', error);
      res.status(500).json({ error: 'Failed to fetch streak' });
    }
  },

  // Get task completions
  async getTaskCompletions(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { startDate, endDate } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `tasks:${userId}:${startDate || ''}:${endDate || ''}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { userId };
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) where.date.lte = new Date(endDate as string);
      }

      const tasks = await prisma.taskCompletion.findMany({
        where,
        orderBy: { date: 'desc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(tasks), { EX: CACHE_EXPIRE });
      res.json(tasks);
    } catch (error) {
      console.error('Get tasks error:', error);
      res.status(500).json({ error: 'Failed to fetch task completions' });
    }
  },

  // Daily check-in
  async checkIn(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const updatedStreak = await updateUserStreak(userId, 'DAILY_LOGIN');

      // Invalidate cache after streak update (remove any streak/tasks variants)
      const streakKeys = await redisClient.keys(`streak:${userId}*`);
      if (streakKeys.length) await Promise.all(streakKeys.map(k => redisClient.del(k)));
      const taskKeys = await redisClient.keys(`tasks:${userId}*`);
      if (taskKeys.length) await Promise.all(taskKeys.map(k => redisClient.del(k)));

      res.json({
        message: 'Check-in successful!',
        streak: updatedStreak
      });
    } catch (error) {
      console.error('Check-in error:', error);
      res.status(500).json({ error: 'Failed to check in' });
    }
  }
};

// Helper function for streak updates
export async function updateUserStreak(userId: string, taskType: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = await prisma.userStreak.findUnique({ where: { userId } });
  if (!streak) {
    streak = await prisma.userStreak.create({ data: { userId } });
  }

  const lastCheckIn = streak.lastCheckIn;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let newStreak = streak.currentStreak;
  if (!lastCheckIn) {
    newStreak = 1;
  } else {
    const lastDate = new Date(lastCheckIn);
    lastDate.setHours(0, 0, 0, 0);

    if (lastDate.getTime() === yesterday.getTime()) {
      newStreak += 1;
    } else if (lastDate.getTime() !== today.getTime()) {
      newStreak = 1;
    }
  }

  const points = {
    JOURNAL_ENTRY: 10,
    MOOD_CHECK_IN: 5,
    COUNSELING_SESSION: 20,
    RESOURCE_READ: 5,
    DAILY_LOGIN: 2
  }[taskType] || 0;

  const updatedStreak = await prisma.userStreak.update({
    where: { userId },
    data: {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, streak.longestStreak),
      totalCheckIns: streak.totalCheckIns + 1,
      lastCheckIn: today,
      totalPoints: streak.totalPoints + points
    }
  });

  await prisma.taskCompletion.upsert({
    where: {
      userId_taskType_date: {
        userId,
        taskType: taskType as any,
        date: today
      }
    },
    create: {
      userId,
      taskType: taskType as any,
      date: today,
      points
    },
    update: {}
  });

  return updatedStreak;
}
