import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { AppointmentStatus } from '../../../generated/prisma/enums';
import redisClient from '../../lib/redis/redisClient';

// Counselor Appointments Controller
export const counselorAppointmentController = {
  // Get my appointments
  async getMyAppointments(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { status, startDate, endDate } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `counselor_appointments_${userId}_${status || 'all'}_${startDate || ''}_${endDate || ''}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { counselorId: userId };
      if (status) where.status = status as AppointmentStatus;
      if (startDate || endDate) {
        const startTimeFilter: any = {};
        if (startDate) startTimeFilter.gte = new Date(startDate as string);
        if (endDate) startTimeFilter.lte = new Date(endDate as string);
        where.startTime = startTimeFilter;
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: { user: { select: { id: true, email: true, studentProfile: true } } },
        orderBy: { startTime: 'asc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(appointments), { EX: 60 });
      res.json(appointments);
    } catch (error) {
      console.error('Get appointments error:', error);
      res.status(500).json({ error: 'Failed to fetch appointments' });
    }
  },

  // Get appointment by ID
  async getAppointmentById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const cacheKey = `counselor_appointment_${id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: { user: { select: { id: true, email: true, studentProfile: true } } }
      });
      if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
      if (appointment.counselorId !== userId) return res.status(403).json({ error: 'Access denied' });

      await redisClient.set(cacheKey, JSON.stringify(appointment), { EX: 60 });
      res.json(appointment);
    } catch (error) {
      console.error('Get appointment error:', error);
      res.status(500).json({ error: 'Failed to fetch appointment' });
    }
  },

  // Confirm appointment
  async confirmAppointment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const existing = await prisma.appointment.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Appointment not found' });
      if (existing.counselorId !== userId) return res.status(403).json({ error: 'Access denied' });

      const appointment = await prisma.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.CONFIRMED },
        include: { user: { select: { id: true, email: true, studentProfile: true } } }
      });

      // Invalidate caches (remove any counselor appointments list variants)
      const counselorApptKeys = await redisClient.keys(`counselor_appointments_${userId}_*`);
      if (counselorApptKeys.length) await Promise.all(counselorApptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`counselor_appointment_${id}`);

      res.json(appointment);
    } catch (error) {
      console.error('Confirm appointment error:', error);
      res.status(500).json({ error: 'Failed to confirm appointment' });
    }
  },

  // Complete appointment
  async completeAppointment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const existing = await prisma.appointment.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Appointment not found' });
      if (existing.counselorId !== userId) return res.status(403).json({ error: 'Access denied' });

      const appointment = await prisma.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.COMPLETED },
        include: { user: { select: { id: true, email: true, studentProfile: true } } }
      });

      // Invalidate caches (remove any counselor appointments list variants)
      const counselorApptKeys = await redisClient.keys(`counselor_appointments_${userId}_*`);
      if (counselorApptKeys.length) await Promise.all(counselorApptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`counselor_appointment_${id}`);

      res.json(appointment);
    } catch (error) {
      console.error('Complete appointment error:', error);
      res.status(500).json({ error: 'Failed to complete appointment' });
    }
  },

  // Mark no-show
  async markNoShow(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const existing = await prisma.appointment.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Appointment not found' });
      if (existing.counselorId !== userId) return res.status(403).json({ error: 'Access denied' });

      const appointment = await prisma.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.NO_SHOW },
        include: { user: { select: { id: true, email: true, studentProfile: true } } }
      });

      // Invalidate caches (remove any counselor appointments list variants)
      const counselorApptKeys = await redisClient.keys(`counselor_appointments_${userId}_*`);
      if (counselorApptKeys.length) await Promise.all(counselorApptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`counselor_appointment_${id}`);

      res.json(appointment);
    } catch (error) {
      console.error('Mark no-show error:', error);
      res.status(500).json({ error: 'Failed to mark no-show' });
    }
  },

  // Cancel appointment
  async cancelAppointment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const existing = await prisma.appointment.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Appointment not found' });
      if (existing.counselorId !== userId) return res.status(403).json({ error: 'Access denied' });

      const appointment = await prisma.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.CANCELLED },
        include: { user: { select: { id: true, email: true, studentProfile: true } } }
      });

      // Invalidate caches (remove any counselor appointments list variants)
      const counselorApptKeys = await redisClient.keys(`counselor_appointments_${userId}_*`);
      if (counselorApptKeys.length) await Promise.all(counselorApptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`counselor_appointment_${id}`);

      res.json(appointment);
    } catch (error) {
      console.error('Cancel appointment error:', error);
      res.status(500).json({ error: 'Failed to cancel appointment' });
    }
  },

  // Update appointment (time, notes)
  async updateAppointment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { startTime, endTime, notes } = req.body;

      const existing = await prisma.appointment.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Appointment not found' });
      if (existing.counselorId !== userId) return res.status(403).json({ error: 'Access denied' });

      const updateData: any = {};
      if (startTime) updateData.startTime = new Date(startTime);
      if (endTime) updateData.endTime = new Date(endTime);
      if (notes !== undefined) updateData.notes = notes;

      const appointment = await prisma.appointment.update({
        where: { id },
        data: updateData,
        include: { user: { select: { id: true, email: true, studentProfile: true } } }
      });

      // Invalidate caches (remove any counselor appointments list variants)
      const counselorApptKeys = await redisClient.keys(`counselor_appointments_${userId}_*`);
      if (counselorApptKeys.length) await Promise.all(counselorApptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`counselor_appointment_${id}`);

      res.json(appointment);
    } catch (error) {
      console.error('Update appointment error:', error);
      res.status(500).json({ error: 'Failed to update appointment' });
    }
  },

  // Get dashboard stats
  async getDashboardStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [total, pending, confirmed, todayCount] = await Promise.all([
        prisma.appointment.count({ where: { counselorId: userId } }),
        prisma.appointment.count({ where: { counselorId: userId, status: AppointmentStatus.PENDING } }),
        prisma.appointment.count({ where: { counselorId: userId, status: AppointmentStatus.CONFIRMED } }),
        prisma.appointment.count({ where: { counselorId: userId, startTime: { gte: today, lt: tomorrow } } })
      ]);

      res.json({
        totalAppointments: total,
        pendingAppointments: pending,
        confirmedAppointments: confirmed,
        todayAppointments: todayCount
      });
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  },

  // Get upcoming appointments
  async getUpcomingAppointments(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { limit = 10 } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const appointments = await prisma.appointment.findMany({
        where: {
          counselorId: userId,
          startTime: { gte: new Date() },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }
        },
        include: { user: { select: { id: true, email: true, studentProfile: { select: { studentNumber: true, yearLevel: true, course: true } } } } },
        orderBy: { startTime: 'asc' },
        take: parseInt(limit as string)
      });

      res.json(appointments);
    } catch (error) {
      console.error('Get upcoming appointments error:', error);
      res.status(500).json({ error: 'Failed to fetch upcoming appointments' });
    }
  }
};
