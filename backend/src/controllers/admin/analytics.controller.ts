import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { AppointmentStatus } from '../../../generated/prisma/enums';
import redisClient from '../../lib/redis/redisClient';

export const adminAnalyticsController = {
  // Get system overview
  async getSystemOverview(req: Request, res: Response) {
    try {
      const cacheKey = 'admin:analytics:overview';

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const [
        totalStudents,
        totalCounselors,
        totalAppointments,
        pendingAppointments,
        totalDepartments,
        totalMoodEntries
      ] = await Promise.all([
        prisma.studentProfile.count(),
        prisma.counselorProfile.count(),
        prisma.appointment.count(),
        prisma.appointment.count({ where: { status: AppointmentStatus.PENDING } }),
        prisma.department.count(),
        prisma.moodEntry.count()
      ]);

      const response = {
        students: totalStudents,
        counselors: totalCounselors,
        appointments: totalAppointments,
        pendingAppointments,
        departments: totalDepartments,
        moodEntries: totalMoodEntries
      };

      await redisClient.set(cacheKey, JSON.stringify(response), { EX: 60 });
      res.json(response);
    } catch (error) {
      console.error('Get overview error:', error);
      res.status(500).json({ error: 'Failed to fetch system overview' });
    }
  },

  // Get appointment analytics
  async getAppointmentAnalytics(req: Request, res: Response) {
    try {
      const cacheKey = `admin:analytics:appointments:${JSON.stringify(req.query)}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const { startDate, endDate } = req.query;
      const where: any = {};

      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) where.startTime.gte = new Date(startDate as string);
        if (endDate) where.startTime.lte = new Date(endDate as string);
      }

      const [byStatus, byCounselor] = await Promise.all([
        prisma.appointment.groupBy({
          by: ['status'],
          where,
          _count: { status: true }
        }),
        prisma.appointment.groupBy({
          by: ['counselorId'],
          where,
          _count: { counselorId: true },
          orderBy: { _count: { counselorId: 'desc' } },
          take: 10
        })
      ]);

      const response = { byStatus, topCounselors: byCounselor };

      await redisClient.set(cacheKey, JSON.stringify(response), { EX: 60 });
      res.json(response);
    } catch (error) {
      console.error('Get appointment analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch appointment analytics' });
    }
  },

  // Get student analytics
  async getStudentAnalytics(req: Request, res: Response) {
    try {
      const cacheKey = 'admin:analytics:students';

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const [byDepartment, byYearLevel, bySex] = await Promise.all([
        prisma.studentProfile.groupBy({
          by: ['departmentId'],
          _count: { departmentId: true }
        }),
        prisma.studentProfile.groupBy({
          by: ['yearLevel'],
          _count: { yearLevel: true },
          orderBy: { yearLevel: 'asc' }
        }),
        prisma.studentProfile.groupBy({
          by: ['sex'],
          _count: { sex: true }
        })
      ]);

      const response = { byDepartment, byYearLevel, bySex };

      await redisClient.set(cacheKey, JSON.stringify(response), { EX: 120 });
      res.json(response);
    } catch (error) {
      console.error('Get student analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch student analytics' });
    }
  },

  // Get mood trends
  async getMoodTrends(req: Request, res: Response) {
    try {
      const cacheKey = `admin:analytics:moods:${JSON.stringify(req.query)}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const { startDate, endDate } = req.query;
      const where: any = {};

      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) where.date.lte = new Date(endDate as string);
      }

      const entries = await prisma.moodEntry.findMany({
        where,
        select: { date: true, moods: true, intensity: true }
      });

      const avgIntensity =
        entries.length > 0
          ? entries.reduce((sum, e) => sum + e.intensity, 0) / entries.length
          : 0;

      const moodCounts: Record<string, number> = {};
      entries.forEach(entry => {
        entry.moods.forEach(mood => {
          moodCounts[mood] = (moodCounts[mood] || 0) + 1;
        });
      });

      const response = {
        totalEntries: entries.length,
        averageIntensity: Math.round(avgIntensity * 10) / 10,
        moodDistribution: moodCounts
      };

      await redisClient.set(cacheKey, JSON.stringify(response), { EX: 120 });
      res.json(response);
    } catch (error) {
      console.error('Get mood trends error:', error);
      res.status(500).json({ error: 'Failed to fetch mood trends' });
    }
  }
};
