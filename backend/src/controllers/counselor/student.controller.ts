import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { DepartmentCode } from '../../../generated/prisma/enums';
import redisClient from '../../lib/redis/redisClient';

// Counselor Student Controller
export const counselorStudentController = {
  // Get my students
  async getMyStudents(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { departmentCode, yearLevel, course } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `counselor_students_${userId}_${departmentCode || 'all'}_${yearLevel || 'all'}_${course || 'all'}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const counselor = await prisma.counselorProfile.findUnique({ where: { userId }, include: { departments: true } });
      if (!counselor) return res.status(404).json({ error: 'Counselor profile not found' });

      const allowedCodes = counselor.departments.map(d => d.code);
      const where: any = {};

      if (departmentCode) {
        const deptCode = (departmentCode as string).toUpperCase().trim() as DepartmentCode;
        if (!allowedCodes.includes(deptCode)) return res.json({ students: [] });
        where.department = { code: deptCode };
      } else where.department = { code: { in: allowedCodes } };

      if (yearLevel) where.yearLevel = parseInt(yearLevel as string);
      if (course) where.course = { contains: course as string, mode: 'insensitive' };

      const students = await prisma.studentProfile.findMany({
        where,
        include: { user: { select: { id: true, email: true } }, department: true },
        orderBy: [{ yearLevel: 'asc' }, { course: 'asc' }]
      });

      await redisClient.set(cacheKey, JSON.stringify(students), { EX: 60 });
      res.json({ students });
    } catch (error) {
      console.error('Get students error:', error);
      res.status(500).json({ error: 'Failed to fetch students' });
    }
  },

  // Get student by ID
  async getStudentById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `counselor_student_${id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const student = await prisma.studentProfile.findUnique({ where: { id }, include: { user: { select: { id: true, email: true } }, department: true } });
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const counselor = await prisma.counselorProfile.findUnique({ where: { userId }, include: { departments: true } });
      const hasAccess = counselor?.departments.some(d => d.id === student.departmentId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

      await redisClient.set(cacheKey, JSON.stringify(student), { EX: 60 });
      res.json(student);
    } catch (error) {
      console.error('Get student error:', error);
      res.status(500).json({ error: 'Failed to fetch student' });
    }
  },

  // Get student appointments
  async getStudentAppointments(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const student = await prisma.studentProfile.findUnique({ where: { id } });
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const counselor = await prisma.counselorProfile.findUnique({ where: { userId }, include: { departments: true } });
      const hasAccess = counselor?.departments.some(d => d.id === student.departmentId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

      const appointments = await prisma.appointment.findMany({
        where: { userId: student.userId, counselorId: userId },
        orderBy: { startTime: 'desc' }
      });

      res.json(appointments);
    } catch (error) {
      console.error('Get student appointments error:', error);
      res.status(500).json({ error: 'Failed to fetch student appointments' });
    }
  },

  // Get student moods
  async getStudentMoods(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { startDate, endDate, limit = 50 } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const student = await prisma.studentProfile.findUnique({ where: { id } });
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const counselor = await prisma.counselorProfile.findUnique({ where: { userId }, include: { departments: true } });
      const hasAccess = counselor?.departments.some(d => d.id === student.departmentId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

      const where: any = { userId: student.userId };
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) where.date.lte = new Date(endDate as string);
      }

      const moods = await prisma.moodEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        take: parseInt(limit as string)
      });

      res.json(moods);
    } catch (error) {
      console.error('Get student moods error:', error);
      res.status(500).json({ error: 'Failed to fetch student moods' });
    }
  },

  // Get student mood stats
  async getStudentMoodStats(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { startDate, endDate } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const student = await prisma.studentProfile.findUnique({ where: { id } });
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const counselor = await prisma.counselorProfile.findUnique({ where: { userId }, include: { departments: true } });
      const hasAccess = counselor?.departments.some(d => d.id === student.departmentId);
      if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

      const where: any = { userId: student.userId };
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) where.date.lte = new Date(endDate as string);
      }

      const entries = await prisma.moodEntry.findMany({ where });

      const stats = {
        totalEntries: entries.length,
        averageIntensity: entries.length > 0 ? entries.reduce((sum, e) => sum + e.intensity, 0) / entries.length : 0,
        moodDistribution: {} as Record<string, number>,
        commonTriggers: {} as Record<string, number>
      };

      entries.forEach(entry => {
        entry.moods.forEach(mood => { stats.moodDistribution[mood] = (stats.moodDistribution[mood] || 0) + 1; });
        entry.triggers.forEach(trigger => { stats.commonTriggers[trigger] = (stats.commonTriggers[trigger] || 0) + 1; });
      });

      res.json(stats);
    } catch (error) {
      console.error('Get student mood stats error:', error);
      res.status(500).json({ error: 'Failed to fetch student mood statistics' });
    }
  }
};
