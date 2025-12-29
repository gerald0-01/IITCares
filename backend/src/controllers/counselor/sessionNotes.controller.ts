import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

const CACHE_EXPIRE = 60 * 5; // 5 minutes

export const sessionNoteController = {
  // Create session note
  async create(req: Request, res: Response) {
    try {
      const counselorId = req.user?.id;
      const { appointmentId, studentId, notes, observations, recommendations, followUp } = req.body;

      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });
      if (!notes) return res.status(400).json({ error: 'Notes are required' });

      const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
      if (!appointment || appointment.counselorId !== counselorId) {
        return res.status(403).json({ error: 'Invalid appointment' });
      }

      const note = await prisma.sessionNote.create({
        data: {
          appointmentId,
          counselorId,
          studentId,
          notes,
          observations,
          recommendations,
          followUp: followUp ? new Date(followUp) : null
        }
      });

      // Invalidate relevant cache (remove any notes list variants)
      const noteKeys = await redisClient.keys(`notes:${counselorId}:${studentId || ''}:*`);
      if (noteKeys.length) await Promise.all(noteKeys.map(k => redisClient.del(k)));

      res.status(201).json(note);
    } catch (error) {
      console.error('Create note error:', error);
      res.status(500).json({ error: 'Failed to create session note' });
    }
  },

  // Get my notes
  async getMyNotes(req: Request, res: Response) {
    try {
      const counselorId = req.user?.id;
      const { studentId, startDate, endDate } = req.query;

      if (!counselorId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `notes:${counselorId}:${studentId || ''}:${startDate || ''}:${endDate || ''}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { counselorId };
      if (studentId) where.studentId = studentId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const notes = await prisma.sessionNote.findMany({
        where,
        include: {
          appointment: { select: { startTime: true, endTime: true, status: true } },
          student: { select: { studentProfile: { select: { name: true, studentNumber: true, yearLevel: true, course: true } } } }
        },
        orderBy: { createdAt: 'desc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(notes), { EX: CACHE_EXPIRE });
      res.json(notes);
    } catch (error) {
      console.error('Get notes error:', error);
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  },

  // Get note by ID
  async getNoteById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const counselorId = req.user?.id;

      const cacheKey = `note:${id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const note = await prisma.sessionNote.findUnique({
        where: { id },
        include: {
          appointment: true,
          student: { select: { studentProfile: true } }
        }
      });

      if (!note) return res.status(404).json({ error: 'Note not found' });
      if (note.counselorId !== counselorId) return res.status(403).json({ error: 'Access denied' });

      await redisClient.set(cacheKey, JSON.stringify(note), { EX: CACHE_EXPIRE });
      res.json(note);
    } catch (error) {
      console.error('Get note error:', error);
      res.status(500).json({ error: 'Failed to fetch note' });
    }
  },

  // Update note
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const counselorId = req.user?.id;
      const { notes, observations, recommendations, followUp } = req.body;

      const existing = await prisma.sessionNote.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Note not found' });
      if (existing.counselorId !== counselorId) return res.status(403).json({ error: 'Access denied' });

      const updateData: any = {};
      if (notes !== undefined) updateData.notes = notes;
      if (observations !== undefined) updateData.observations = observations;
      if (recommendations !== undefined) updateData.recommendations = recommendations;
      if (followUp !== undefined) updateData.followUp = followUp ? new Date(followUp) : null;

      const updated = await prisma.sessionNote.update({ where: { id }, data: updateData });

      // Invalidate caches (remove any notes list variants)
      const noteKeys = await redisClient.keys(`notes:${counselorId}:${existing.studentId || ''}:*`);
      if (noteKeys.length) await Promise.all(noteKeys.map(k => redisClient.del(k)));
      await redisClient.del(`note:${id}`);

      res.json(updated);
    } catch (error) {
      console.error('Update note error:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  },

  // Delete note
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const counselorId = req.user?.id;

      const existing = await prisma.sessionNote.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Note not found' });
      if (existing.counselorId !== counselorId) return res.status(403).json({ error: 'Access denied' });

      await prisma.sessionNote.delete({ where: { id } });

      // Invalidate caches (remove any notes list variants)
        const noteKeys = await redisClient.keys(`notes:${counselorId}:${existing.studentId || ''}:*`);
        if (noteKeys.length) await Promise.all(noteKeys.map(k => redisClient.del(k)));
        await redisClient.del(`note:${id}`);

      res.json({ message: 'Note deleted successfully' });
    } catch (error) {
      console.error('Delete note error:', error);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  }
};
