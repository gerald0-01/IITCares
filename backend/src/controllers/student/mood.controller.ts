import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import redisClient from "../../lib/redis/redisClient";

export const studentMoodController = {
  // Create or update mood for a specific date (upsert)
  async upsertMood(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { date, moods, intensity, notes, triggers, activities } = req.body;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!moods || moods.length === 0) return res.status(400).json({ error: 'At least one mood is required' });
      if (intensity && (intensity < 1 || intensity > 10)) return res.status(400).json({ error: 'Intensity must be between 1 and 10' });

      const normalizedDate = new Date(date || new Date());
      normalizedDate.setHours(0, 0, 0, 0);

      const moodEntry = await prisma.moodEntry.upsert({
        where: { userId_date: { userId, date: normalizedDate } },
        create: { userId, date: normalizedDate, moods, intensity: intensity || 5, notes, triggers, activities },
        update: { moods, intensity: intensity || 5, notes, triggers, activities }
      });

      // Invalidate related cache (remove any mood entries/list variants)
      const moodEntryKeys = await redisClient.keys(`mood_entry:${userId}:*`);
      if (moodEntryKeys.length) await Promise.all(moodEntryKeys.map(k => redisClient.del(k)));
      const moodListKeys = await redisClient.keys(`mood_entries:${userId}:*`);
      if (moodListKeys.length) await Promise.all(moodListKeys.map(k => redisClient.del(k)));

      res.json(moodEntry);
    } catch (error) {
      console.error('Upsert mood entry error:', error);
      res.status(500).json({ error: 'Failed to save mood entry' });
    }
  },

  // Get mood for a specific date
  async getMoodByDate(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { date } = req.params;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);
      const cacheKey = `mood_entry:${userId}:${normalizedDate.toISOString().split('T')[0]}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const entry = await prisma.moodEntry.findUnique({
        where: { userId_date: { userId, date: normalizedDate } }
      });

      if (!entry) return res.status(404).json({ error: 'No mood entry for this date' });

      await redisClient.set(cacheKey, JSON.stringify(entry), { EX: 30 });
      res.json(entry);
    } catch (error) {
      console.error('Get mood by date error:', error);
      res.status(500).json({ error: 'Failed to fetch mood entry' });
    }
  },

  // Get moods for a date range
  async getMoodsByDateRange(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { startDate, endDate } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate are required' });

      const cacheKey = `mood_entries:${userId}:${startDate}:${endDate}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      const entries = await prisma.moodEntry.findMany({
        where: { userId, date: { gte: start, lte: end } },
        orderBy: { date: 'asc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(entries), { EX: 30 });
      res.json(entries);
    } catch (error) {
      console.error('Get moods by date range error:', error);
      res.status(500).json({ error: 'Failed to fetch mood entries' });
    }
  },

  // Get moods by month
  async getMoodsByMonth(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { year, month } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!year || !month) return res.status(400).json({ error: 'year and month are required' });

      const yearNum = parseInt(year as string);
      const monthNum = parseInt(month as string);
      if (monthNum < 1 || monthNum > 12) return res.status(400).json({ error: 'month must be between 1 and 12' });

      const cacheKey = `mood_entries:${userId}:${yearNum}-${monthNum}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

      const entries = await prisma.moodEntry.findMany({
        where: { userId, date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' }
      });

      const moodMap: Record<string, any> = {};
      entries.forEach(entry => {
        const dateKey = entry.date.toISOString().split('T')[0];
        moodMap[dateKey] = entry;
      });

      await redisClient.set(cacheKey, JSON.stringify(entries), { EX: 30 });

      res.json({ year: yearNum, month: monthNum, totalEntries: entries.length, entries: moodMap });
    } catch (error) {
      console.error('Get moods by month error:', error);
      res.status(500).json({ error: 'Failed to fetch mood entries' });
    }
  },

  // Delete mood entry
  async deleteMoodByDate(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { date } = req.params;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);

      const existing = await prisma.moodEntry.findUnique({ where: { userId_date: { userId, date: normalizedDate } } });
      if (!existing) return res.status(404).json({ error: 'Mood entry not found' });

      await prisma.moodEntry.delete({ where: { userId_date: { userId, date: normalizedDate } } });

      // Invalidate caches (remove any mood entries/list variants)
        const moodEntryKeys = await redisClient.keys(`mood_entry:${userId}:*`);
        if (moodEntryKeys.length) await Promise.all(moodEntryKeys.map(k => redisClient.del(k)));
        const moodListKeys = await redisClient.keys(`mood_entries:${userId}:*`);
        if (moodListKeys.length) await Promise.all(moodListKeys.map(k => redisClient.del(k)));

      res.json({ message: 'Mood entry deleted successfully' });
    } catch (error) {
      console.error('Delete mood entry error:', error);
      res.status(500).json({ error: 'Failed to delete mood entry' });
    }
  },

  // Get mood statistics for date range
  async getMoodStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { startDate, endDate } = req.query;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const where: any = { userId };

      if (startDate || endDate) {
        where.date = {};
        if (startDate) {
          const start = new Date(startDate as string);
          start.setHours(0, 0, 0, 0);
          where.date.gte = start;
        }
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.date.lte = end;
        }
      }

      const entries = await prisma.moodEntry.findMany({ 
        where,
        orderBy: { date: 'asc' }
      });

      if (entries.length === 0) {
        return res.json({
          totalDays: 0,
          averageIntensity: 0,
          moodDistribution: {},
          commonTriggers: {},
          commonActivities: {},
          moodsByDayOfWeek: {},
          intensityTrend: []
        });
      }

      const stats = {
        totalDays: entries.length,
        averageIntensity: 0,
        moodDistribution: {} as Record<string, number>,
        commonTriggers: {} as Record<string, number>,
        commonActivities: {} as Record<string, number>,
        moodsByDayOfWeek: {} as Record<string, { count: number; totalIntensity: number; avgIntensity: number }>,
        intensityTrend: [] as Array<{ date: string; intensity: number }>
      };

      // Calculate average intensity
      const totalIntensity = entries.reduce((sum, e) => sum + e.intensity, 0);
      stats.averageIntensity = Math.round((totalIntensity / entries.length) * 10) / 10;

      // Day names
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      // Initialize day of week stats
      dayNames.forEach(day => {
        stats.moodsByDayOfWeek[day] = { count: 0, totalIntensity: 0, avgIntensity: 0 };
      });

      // Process each entry
      entries.forEach(entry => {
        // Count moods
        entry.moods.forEach(mood => {
          stats.moodDistribution[mood] = (stats.moodDistribution[mood] || 0) + 1;
        });

        // Count triggers
        entry.triggers.forEach(trigger => {
          stats.commonTriggers[trigger] = (stats.commonTriggers[trigger] || 0) + 1;
        });

        // Count activities
        entry.activities.forEach(activity => {
          stats.commonActivities[activity] = (stats.commonActivities[activity] || 0) + 1;
        });

        // Day of week stats
        const dayOfWeek = entry.date.getDay();
        const dayName = dayNames[dayOfWeek];
        stats.moodsByDayOfWeek[dayName].count++;
        stats.moodsByDayOfWeek[dayName].totalIntensity += entry.intensity;

        // Intensity trend (for charts)
        stats.intensityTrend.push({
          date: entry.date.toISOString().split('T')[0],
          intensity: entry.intensity
        });
      });

      // Calculate average intensity by day of week
      Object.keys(stats.moodsByDayOfWeek).forEach(day => {
        const dayStats = stats.moodsByDayOfWeek[day];
        if (dayStats.count > 0) {
          dayStats.avgIntensity = Math.round((dayStats.totalIntensity / dayStats.count) * 10) / 10;
        }
      });

      res.json(stats);
    } catch (error) {
      console.error('Get mood stats error:', error);
      res.status(500).json({ error: 'Failed to fetch mood statistics' });
    }
  },

  // Get mood streak (consecutive days with entries)
  async getMoodStreak(req: Request, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const entries = await prisma.moodEntry.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        select: { date: true }
      });

      if (entries.length === 0) {
        return res.json({ 
          currentStreak: 0, 
          longestStreak: 0,
          totalDays: 0
        });
      }

      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 1;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if today or yesterday has entry for current streak
      const latestEntry = new Date(entries[0].date);
      latestEntry.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (latestEntry.getTime() === today.getTime()) {
        currentStreak = 1;
      } else if (latestEntry.getTime() === yesterday.getTime()) {
        currentStreak = 1;
      } else {
        currentStreak = 0;
      }

      // Calculate streaks
      for (let i = 0; i < entries.length - 1; i++) {
        const current = new Date(entries[i].date);
        const next = new Date(entries[i + 1].date);
        current.setHours(0, 0, 0, 0);
        next.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          tempStreak++;
          if (currentStreak > 0 && i === 0) {
            currentStreak = tempStreak;
          } else if (currentStreak > 0) {
            currentStreak++;
          }
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }

      longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

      res.json({ 
        currentStreak, 
        longestStreak,
        totalDays: entries.length
      });
    } catch (error) {
      console.error('Get mood streak error:', error);
      res.status(500).json({ error: 'Failed to fetch mood streak' });
    }
  }
};