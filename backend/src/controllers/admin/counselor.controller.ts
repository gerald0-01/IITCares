import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

export const adminCounselorController = {
  async getAllCounselors(req: Request, res: Response) {
    try {
      const cacheKey = `admin:counselors:all:${JSON.stringify(req.query)}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const { departmentId, search } = req.query;
      const where: any = {};

      if (departmentId) {
        where.departments = { some: { id: departmentId as string } };
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { user: { email: { contains: search as string, mode: 'insensitive' } } }
        ];
      }

      const counselors = await prisma.counselorProfile.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, role: true, emailVerified: true } },
          departments: true,
          _count: { select: { departments: true } }
        }
      });

      await redisClient.set(cacheKey, JSON.stringify(counselors), { EX: 60 });
      res.json(counselors);
    } catch (error) {
      console.error('Get counselors error:', error);
      res.status(500).json({ error: 'Failed to fetch counselors' });
    }
  },

  async getCounselorById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const cacheKey = `admin:counselor:${id}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const counselor = await prisma.counselorProfile.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, role: true, emailVerified: true, createdAt: true } },
          departments: true
        }
      });

      if (!counselor) {
        return res.status(404).json({ error: 'Counselor not found' });
      }

      const appointmentCount = await prisma.appointment.count({
        where: { counselorId: counselor.userId }
      });

      const response = {
        ...counselor,
        stats: { totalAppointments: appointmentCount }
      };

      await redisClient.set(cacheKey, JSON.stringify(response), { EX: 60 });
      res.json(response);
    } catch (error) {
      console.error('Get counselor error:', error);
      res.status(500).json({ error: 'Failed to fetch counselor' });
    }
  },

  async createCounselor(req: Request, res: Response) {
    try {
      const { userId, name, office, phone, sex, profile, departmentIds } = req.body;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const existing = await prisma.counselorProfile.findUnique({ where: { userId } });
      if (existing) return res.status(409).json({ error: 'Profile already exists' });

      const data: any = { userId, name, office, phone, sex, profile };

      if (departmentIds?.length) {
        data.departments = {
          connect: departmentIds.map((id: string) => ({ id }))
        };
      }

      const counselorProfile = await prisma.counselorProfile.create({
        data,
        include: {
          user: { select: { id: true, email: true, role: true } },
          departments: true
        }
      });

      const adminCounselorsKeys = await redisClient.keys('admin:counselors:all*');
      if (adminCounselorsKeys.length) await Promise.all(adminCounselorsKeys.map(k => redisClient.del(k)));
      res.status(201).json(counselorProfile);
    } catch (error) {
      console.error('Create counselor error:', error);
      res.status(500).json({ error: 'Failed to create counselor' });
    }
  },

  async updateCounselor(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, office, phone, profile, departmentIds } = req.body;

      const existing = await prisma.counselorProfile.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Counselor not found' });

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (office !== undefined) updateData.office = office;
      if (phone !== undefined) updateData.phone = phone;
      if (profile !== undefined) updateData.profile = profile;

      if (Array.isArray(departmentIds)) {
        updateData.departments = {
          set: departmentIds.map((deptId: string) => ({ id: deptId }))
        };
      }

      const updated = await prisma.counselorProfile.update({
        where: { id },
        data: updateData,
        include: {
          user: { select: { id: true, email: true, role: true } },
          departments: true
        }
      });

      const adminCounselorsKeys = await redisClient.keys('admin:counselors:all*');
      if (adminCounselorsKeys.length) await Promise.all(adminCounselorsKeys.map(k => redisClient.del(k)));
      await redisClient.del(`admin:counselor:${id}`);

      res.json(updated);
    } catch (error) {
      console.error('Update counselor error:', error);
      res.status(500).json({ error: 'Failed to update counselor' });
    }
  },

  async deleteCounselor(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const existing = await prisma.counselorProfile.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Counselor not found' });

      await prisma.counselorProfile.delete({ where: { id } });

      const adminCounselorsKeys = await redisClient.keys('admin:counselors:all*');
      if (adminCounselorsKeys.length) await Promise.all(adminCounselorsKeys.map(k => redisClient.del(k)));
      await redisClient.del(`admin:counselor:${id}`);

      res.json({ message: 'Counselor profile deleted successfully' });
    } catch (error) {
      console.error('Delete counselor error:', error);
      res.status(500).json({ error: 'Failed to delete counselor' });
    }
  }
};
