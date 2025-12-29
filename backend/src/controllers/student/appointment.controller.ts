import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { AppointmentStatus } from '../../../generated/prisma/enums';
import redisClient from '../../lib/redis/redisClient';
import { error } from 'node:console';

export const studentAppointmentController = {
  // Book appointment
  async bookAppointment(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { counselorId, startTime, endTime, notes } = req.body;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const start = new Date(startTime);
      const end = new Date(endTime);

      if (start >= end) return res.status(400).json({ error: 'Invalid time range' });

      const counselor = await prisma.counselorProfile.findUnique({where: {id: counselorId}})
      if (!counselor) return res.status(400).json({error: "Counselor doesn't exist"})

      // Check for conflicts
      const conflict = await prisma.appointment.findFirst({
        where: {
          counselorId,
          status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
          OR: [
            { AND: [{ startTime: { lte: start } }, { endTime: { gt: start } }] },
            { AND: [{ startTime: { lt: end } }, { endTime: { gte: end } }] },
            { AND: [{ startTime: { gte: start } }, { endTime: { lte: end } }] }
          ]
        }
      });

      if (conflict) return res.status(409).json({ error: 'Time slot not available' });

      const appointment = await prisma.appointment.create({
        data: {
          userId,
          counselorId,
          startTime: start,
          endTime: end,
          notes,
          status: AppointmentStatus.PENDING
        },
        include: {
          counselor: {
            select: {
              id: true,
              email: true,
              counselorProfile: { select: { office: true, phone: true } }
            }
          }
        }
      });

      // Invalidate caches (remove any appointments list variants)
      const apptKeys = await redisClient.keys(`appointments_user_${userId}_*`);
      if (apptKeys.length) await Promise.all(apptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`appointment_${appointment.id}`);
      res.status(201).json(appointment);
    } catch (error) {
      console.error('Book appointment error:', error);
      res.status(500).json({ error: 'Failed to book appointment' });
    }
  },

  // Get my appointments
  async getMyAppointments(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { status, startDate, endDate } = req.query;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `appointments_user_${userId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { userId };
      if (status) where.status = status as AppointmentStatus;
      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) where.startTime.gte = new Date(startDate as string);
        if (endDate) where.startTime.lte = new Date(endDate as string);
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: {
          counselor: {
            select: {
              id: true,
              email: true,
              counselorProfile: true
            }
          }
        },
        orderBy: { startTime: 'asc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(appointments), { EX: 60 }); // cache 1 minute

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

      const cacheKey = `appointment_${id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: {
          counselor: {
            select: { id: true, email: true, counselorProfile: true }
          }
        }
      });

      if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
      if (appointment.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      await redisClient.set(cacheKey, JSON.stringify(appointment), { EX: 60 });

      res.json(appointment);
    } catch (error) {
      console.error('Get appointment error:', error);
      res.status(500).json({ error: 'Failed to fetch appointment' });
    }
  },

  // Cancel appointment
  async cancelAppointment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const existing = await prisma.appointment.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Appointment not found' });
      if (existing.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      const appointment = await prisma.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.CANCELLED },
        include: {
          counselor: { select: { id: true, email: true, counselorProfile: true } }
        }
      });

      // Invalidate caches (remove any appointments list variants)
      const apptKeys = await redisClient.keys(`appointments_user_${userId}*`);
      if (apptKeys.length) await Promise.all(apptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`appointment_${id}`);

      res.json(appointment);
    } catch (error) {
      console.error('Cancel appointment error:', error);
      res.status(500).json({ error: 'Failed to cancel appointment' });
    }
  },

  // Get available counselors
  async getAvailableCounselors(req: Request, res: Response) {
    try {
      const { departmentId } = req.query;

      const where: any = {};
      if (departmentId) where.departments = { some: { id: departmentId as string } };

      const counselors = await prisma.counselorProfile.findMany({
        where,
        include: { user: { select: { id: true, email: true } }, departments: true }
      });

      res.json(counselors);
    } catch (error) {
      console.error('Get counselors error:', error);
      res.status(500).json({ error: 'Failed to fetch counselors' });
    }
  },

  // Get available time slots
  async getAvailableSlots(req: Request, res: Response) {
    try {
      const { counselorId } = req.params;
      const { date } = req.query;

      if (!date) return res.status(400).json({ error: 'Date is required' });

      const selectedDate = new Date(date as string);
      const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));

      const appointments = await prisma.appointment.findMany({
        where: {
          counselorId,
          status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
          startTime: { gte: startOfDay, lte: endOfDay }
        },
        select: { startTime: true, endTime: true }
      });

      res.json({ bookedSlots: appointments });
    } catch (error) {
      console.error('Get slots error:', error);
      res.status(500).json({ error: 'Failed to fetch available slots' });
    }
  }
};
