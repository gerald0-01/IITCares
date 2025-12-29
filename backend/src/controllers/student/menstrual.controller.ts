import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import redisClient from "../../lib/redis/redisClient";

export const studentMenstrualController = {
  // Start new cycle
  async startCycle(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { startDate } = req.body;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      // End active cycles
      await prisma.menstrualCycle.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false }
      });

      const cycle = await prisma.menstrualCycle.create({
        data: {
          userId,
          startDate: startDate ? new Date(startDate) : new Date(),
          isActive: true
        },
        include: { dailyLogs: true, symptoms: true }
      });

      // Invalidate caches (remove any menstrual cycles/stats variants)
      const cyclesKeys = await redisClient.keys(`menstrual_cycles:${userId}*`);
      if (cyclesKeys.length) await Promise.all(cyclesKeys.map(k => redisClient.del(k)));
      await redisClient.del(`active_cycle:${userId}`);
      const statsKeys = await redisClient.keys(`menstrual_stats:${userId}*`);
      if (statsKeys.length) await Promise.all(statsKeys.map(k => redisClient.del(k)));

      res.status(201).json(cycle);
    } catch (error) {
      console.error('Start cycle error:', error);
      res.status(500).json({ error: 'Failed to start cycle' });
    }
  },

  // Get all cycles
  async getMyCycles(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `menstrual_cycles:${userId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const { isActive, startDate, endDate } = req.query;
      const where: any = { userId };
      if (isActive !== undefined) where.isActive = isActive === 'true';
      if (startDate || endDate) {
        where.startDate = {};
        if (startDate) where.startDate.gte = new Date(startDate as string);
        if (endDate) where.startDate.lte = new Date(endDate as string);
      }

      const cycles = await prisma.menstrualCycle.findMany({
        where,
        include: {
          dailyLogs: { orderBy: { date: 'asc' } },
          symptoms: { orderBy: { date: 'asc' } }
        },
        orderBy: { startDate: 'desc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(cycles), { EX: 30 });

      res.json(cycles);
    } catch (error) {
      console.error('Get cycles error:', error);
      res.status(500).json({ error: 'Failed to fetch cycles' });
    }
  },

  // Get active cycle
  async getActiveCycle(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `active_cycle:${userId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const cycle = await prisma.menstrualCycle.findFirst({
        where: { userId, isActive: true },
        include: {
          dailyLogs: { orderBy: { date: 'desc' }, take: 7 },
          symptoms: { orderBy: { date: 'desc' }, take: 10 }
        }
      });

      if (!cycle) return res.status(404).json({ error: 'No active cycle found' });

      const today = new Date();
      const start = new Date(cycle.startDate);
      const dayOfCycle = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const result = { ...cycle, currentDayOfCycle: dayOfCycle };

      await redisClient.set(cacheKey, JSON.stringify(result), { EX: 30 });

      res.json(result);
    } catch (error) {
      console.error('Get active cycle error:', error);
      res.status(500).json({ error: 'Failed to fetch active cycle' });
    }
  },

  // Get cycle statistics
  async getMyStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `menstrual_stats:${userId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const cycles = await prisma.menstrualCycle.findMany({
        where: { userId, endDate: { not: null } },
        orderBy: { startDate: 'desc' },
        take: 12
      });

      if (cycles.length === 0) return res.json({
        message: 'No completed cycles found',
        averageCycleLength: null,
        averagePeriodLength: null,
        nextPeriodPrediction: null
      });

      const avgCycleLength = cycles.filter(c => c.cycleLength).reduce((sum, c) => sum + (c.cycleLength || 0), 0) / cycles.filter(c => c.cycleLength).length;
      const avgPeriodLength = cycles.filter(c => c.periodLength).reduce((sum, c) => sum + (c.periodLength || 0), 0) / cycles.filter(c => c.periodLength).length;

      const lastCycle = cycles[0];
      let nextPeriodDate = null;
      if (lastCycle.endDate && avgCycleLength) nextPeriodDate = new Date(new Date(lastCycle.endDate).getTime() + avgCycleLength * 24 * 60 * 60 * 1000);

      const symptoms = await prisma.menstrualSymptom.groupBy({
        by: ['symptom'],
        where: { cycle: { userId } },
        _count: { symptom: true },
        orderBy: { _count: { symptom: 'desc' } },
        take: 10
      });

      const stats = {
        totalCycles: cycles.length,
        averageCycleLength: Math.round(avgCycleLength * 10) / 10,
        averagePeriodLength: Math.round(avgPeriodLength * 10) / 10,
        nextPeriodPrediction: nextPeriodDate,
        commonSymptoms: symptoms
      };

      await redisClient.set(cacheKey, JSON.stringify(stats), { EX: 30 });

      res.json(stats);
    } catch (error) {
      console.error('Get cycle stats error:', error);
      res.status(500).json({ error: 'Failed to fetch cycle statistics' });
    }
  },

  // Get cycle by ID
  async getCycleById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const cycle = await prisma.menstrualCycle.findUnique({
        where: { id },
        include: {
          dailyLogs: { orderBy: { date: 'asc' } },
          symptoms: { orderBy: { date: 'asc' } }
        }
      });

      if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
      if (cycle.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      res.json(cycle);
    } catch (error) {
      console.error('Get cycle error:', error);
      res.status(500).json({ error: 'Failed to fetch cycle' });
    }
  },

  // End cycle
  async endCycle(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { endDate } = req.body;

      const existing = await prisma.menstrualCycle.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Cycle not found' });
      if (existing.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      const end = endDate ? new Date(endDate) : new Date();
      const start = new Date(existing.startDate);
      const cycleLength = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      const logsWithFlow = await prisma.menstrualDailyLog.count({
        where: { cycleId: id, flowType: { not: null } }
      });

      const updated = await prisma.menstrualCycle.update({
        where: { id },
        data: {
          endDate: end,
          cycleLength,
          periodLength: logsWithFlow > 0 ? logsWithFlow : null,
          isActive: false
        },
        include: { dailyLogs: true, symptoms: true }
      });

      // Invalidate caches (remove any menstrual cycles/stats variants)
      const cyclesKeys = await redisClient.keys(`menstrual_cycles:${userId}*`);
      if (cyclesKeys.length) await Promise.all(cyclesKeys.map(k => redisClient.del(k)));
      await redisClient.del(`active_cycle:${userId}`);
      const statsKeys = await redisClient.keys(`menstrual_stats:${userId}*`);
      if (statsKeys.length) await Promise.all(statsKeys.map(k => redisClient.del(k)));

      res.json(updated);
    } catch (error) {
      console.error('End cycle error:', error);
      res.status(500).json({ error: 'Failed to end cycle' });
    }
  },

  // Delete cycle
  async deleteCycle(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const existing = await prisma.menstrualCycle.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Cycle not found' });
      if (existing.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      await prisma.menstrualCycle.delete({ where: { id } });

      // Invalidate caches (remove any menstrual cycles/stats variants)
      const cyclesKeys = await redisClient.keys(`menstrual_cycles:${userId}*`);
      if (cyclesKeys.length) await Promise.all(cyclesKeys.map(k => redisClient.del(k)));
      await redisClient.del(`active_cycle:${userId}`);
      const statsKeys = await redisClient.keys(`menstrual_stats:${userId}*`);
      if (statsKeys.length) await Promise.all(statsKeys.map(k => redisClient.del(k)));

      res.json({ message: 'Cycle deleted successfully' });
    } catch (error) {
      console.error('Delete cycle error:', error);
      res.status(500).json({ error: 'Failed to delete cycle' });
    }
  },

  // Add daily log
  async addDailyLog(req: Request, res: Response) {
    try {
      const { cycleId } = req.params;
      const userId = req.user?.id;
      const { date, flowType, phase, temperature, cervicalMucus, notes } = req.body;

      const cycle = await prisma.menstrualCycle.findUnique({ where: { id: cycleId } });
      if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
      if (cycle.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      const logDate = date ? new Date(date) : new Date();
      const start = new Date(cycle.startDate);
      const dayOfCycle = Math.ceil((logDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const dailyLog = await prisma.menstrualDailyLog.upsert({
        where: { cycleId_date: { cycleId, date: logDate } },
        create: { cycleId, date: logDate, dayOfCycle, flowType, phase, temperature, cervicalMucus, notes },
        update: { flowType, phase, temperature, cervicalMucus, notes }
      });

      // Invalidate caches (remove any menstrual cycles/stats variants)
      const cyclesKeys = await redisClient.keys(`menstrual_cycles:${userId}*`);
      if (cyclesKeys.length) await Promise.all(cyclesKeys.map(k => redisClient.del(k)));
      await redisClient.del(`active_cycle:${userId}`);
      const statsKeys = await redisClient.keys(`menstrual_stats:${userId}*`);
      if (statsKeys.length) await Promise.all(statsKeys.map(k => redisClient.del(k)));

      res.status(201).json(dailyLog);
    } catch (error) {
      console.error('Add daily log error:', error);
      res.status(500).json({ error: 'Failed to add daily log' });
    }
  },

  // Add symptom
  async addSymptom(req: Request, res: Response) {
    try {
      const { cycleId } = req.params;
      const userId = req.user?.id;
      const { date, symptom, severity, notes } = req.body;

      const cycle = await prisma.menstrualCycle.findUnique({ where: { id: cycleId } });
      if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
      if (cycle.userId !== userId) return res.status(403).json({ error: 'Access denied' });
      if (!symptom) return res.status(400).json({ error: 'Symptom is required' });
      if (!severity) return res.status(400).json({ error: 'Severity is required' });

      const symptomEntry = await prisma.menstrualSymptom.create({
        data: { cycleId, date: date ? new Date(date) : new Date(), symptom, severity, notes }
      });

      // Invalidate caches (remove any menstrual cycles/stats variants)
      const cyclesKeys = await redisClient.keys(`menstrual_cycles:${userId}*`);
      if (cyclesKeys.length) await Promise.all(cyclesKeys.map(k => redisClient.del(k)));
      await redisClient.del(`active_cycle:${userId}`);
      const statsKeys = await redisClient.keys(`menstrual_stats:${userId}*`);
      if (statsKeys.length) await Promise.all(statsKeys.map(k => redisClient.del(k)));

      res.status(201).json(symptomEntry);
    } catch (error) {
      console.error('Add symptom error:', error);
      res.status(500).json({ error: 'Failed to add symptom' });
    }
  }
};
