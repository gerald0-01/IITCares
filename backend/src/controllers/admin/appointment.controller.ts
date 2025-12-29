import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { AppointmentStatus } from '../../../generated/prisma/enums';
import redisClient from '../../lib/redis/redisClient';

export const adminAppointmentController = {
  // Get all appointments
  async getAllAppointments(req: Request, res: Response) {
    try {
      const cacheKey = `admin:appointments:all:${JSON.stringify(req.query)}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const { status, counselorId, studentId, startDate, endDate } = req.query;
      const where: any = {};

      if (status) where.status = status as AppointmentStatus;
      if (counselorId) where.counselorId = counselorId as string;
      if (studentId) where.userId = studentId as string;

      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) where.startTime.gte = new Date(startDate as string);
        if (endDate) where.startTime.lte = new Date(endDate as string);
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              studentProfile: {
                select: {
                  studentNumber: true,
                  yearLevel: true,
                  course: true
                }
              }
            }
          },
          counselor: {
            select: {
              id: true,
              email: true,
              counselorProfile: {
                select: { office: true, phone: true }
              }
            }
          }
        },
        orderBy: { startTime: 'desc' },
        take: 100
      });

      await redisClient.set(cacheKey, JSON.stringify(appointments), { EX: 30 });
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
      const cacheKey = `admin:appointment:${id}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, studentProfile: true } },
          counselor: { select: { id: true, email: true, counselorProfile: true } }
        }
      });

      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      await redisClient.set(cacheKey, JSON.stringify(appointment), { EX: 60 });
      res.json(appointment);
    } catch (error) {
      console.error('Get appointment error:', error);
      res.status(500).json({ error: 'Failed to fetch appointment' });
    }
  },

  // Update appointment
  async updateAppointment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, notes, startTime, endTime } = req.body;

      const existing = await prisma.appointment.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;
      if (startTime) updateData.startTime = new Date(startTime);
      if (endTime) updateData.endTime = new Date(endTime);

      const appointment = await prisma.appointment.update({
        where: { id },
        data: updateData,
        include: {
          user: { select: { id: true, email: true, studentProfile: true } },
          counselor: { select: { id: true, email: true, counselorProfile: true } }
        }
      });

      // 🔥 invalidate caches (remove any admin appointments list variants)
      const adminApptKeys = await redisClient.keys('admin:appointments:all*');
        if (adminApptKeys.length) await Promise.all(adminApptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`admin:appointment:${id}`);

      res.json(appointment);
    } catch (error) {
      console.error('Update appointment error:', error);
      res.status(500).json({ error: 'Failed to update appointment' });
    }
  },

  // Delete appointment
  async deleteAppointment(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const existing = await prisma.appointment.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      await prisma.appointment.delete({ where: { id } });

      // 🔥 invalidate caches (remove any admin appointments list variants)
      const adminApptKeys = await redisClient.keys('admin:appointments:all*');
        if (adminApptKeys.length) await Promise.all(adminApptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`admin:appointment:${id}`);

      res.json({ message: 'Appointment deleted successfully' });
    } catch (error) {
      console.error('Delete appointment error:', error);
      res.status(500).json({ error: 'Failed to delete appointment' });
    }
  }
};
