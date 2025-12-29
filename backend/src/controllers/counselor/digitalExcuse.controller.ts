import { Request, Response } from 'express';
import { ExcuseStatus } from '../../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';
import { randomBytes } from 'crypto';

const CACHE_EXPIRE = 60 * 5; // 5 minutes

export const counselorExcuseController = {
  // Generate excuse after session
  async generateExcuse(req: Request, res: Response) {
    try {
      const counselorId = req.user?.id;
      const { studentId, appointmentId, publicReason, validDays = 1 } = req.body;

      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });
      if (!studentId || !appointmentId) return res.status(400).json({ error: 'Student ID and Appointment ID required' });

      // Verify appointment
      const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
      if (!appointment || appointment.counselorId !== counselorId) return res.status(403).json({ error: 'Invalid appointment' });
      if (appointment.status !== 'COMPLETED') return res.status(400).json({ error: 'Appointment must be completed first' });

      // Generate unique QR code
      const qrCode = randomBytes(32).toString('hex');
      const now = new Date();
      const validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + validDays);

      const excuse = await prisma.digitalExcuse.create({
        data: {
          userId: studentId,
          counselorId,
          appointmentId,
          qrCode,
          excuseDate: now,
          validUntil,
          publicReason: publicReason || 'Counseling Session',
          status: ExcuseStatus.ACTIVE
        },
        include: {
          user: {
            select: {
              studentProfile: {
                select: { name: true, studentNumber: true, yearLevel: true, course: true }
              }
            }
          }
        }
      });

      // Invalidate cache (remove any issuedExcuses variants)
      const excuseKeys = await redisClient.keys(`issuedExcuses:${counselorId}:${studentId || ''}:*`);
      if (excuseKeys.length) await Promise.all(excuseKeys.map(k => redisClient.del(k)));

      res.status(201).json(excuse);
    } catch (error) {
      console.error('Generate excuse error:', error);
      res.status(500).json({ error: 'Failed to generate excuse' });
    }
  },

  // Get issued excuses
  async getIssuedExcuses(req: Request, res: Response) {
    try {
      const counselorId = req.user?.id;
      const { studentId, status } = req.query;

      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `issuedExcuses:${counselorId}:${studentId || ''}:${status || 'all'}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { counselorId };
      if (studentId) where.userId = studentId;
      if (status) where.status = status as ExcuseStatus;

      const excuses = await prisma.digitalExcuse.findMany({
        where,
        include: {
          user: {
            select: {
              studentProfile: { select: { name: true, studentNumber: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(excuses), { EX: CACHE_EXPIRE });
      res.json(excuses);
    } catch (error) {
      console.error('Get issued excuses error:', error);
      res.status(500).json({ error: 'Failed to fetch issued excuses' });
    }
  },

  // Revoke excuse
  async revokeExcuse(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const counselorId = req.user?.id;

      const excuse = await prisma.digitalExcuse.findUnique({ where: { id } });
      if (!excuse) return res.status(404).json({ error: 'Excuse not found' });
      if (excuse.counselorId !== counselorId) return res.status(403).json({ error: 'Access denied' });

      const updated = await prisma.digitalExcuse.update({
        where: { id },
        data: { status: ExcuseStatus.REVOKED }
      });

      // Invalidate cache (remove any issuedExcuses variants)
      const excuseKeys = await redisClient.keys(`issuedExcuses:${counselorId}:${excuse.userId || ''}:*`);
      if (excuseKeys.length) await Promise.all(excuseKeys.map(k => redisClient.del(k)));
      await redisClient.del(`excuse:${id}`);

      res.json(updated);
    } catch (error) {
      console.error('Revoke excuse error:', error);
      res.status(500).json({ error: 'Failed to revoke excuse' });
    }
  }
};
