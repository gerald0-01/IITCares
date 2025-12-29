import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

export const adminDepartmentController = {
  async createDepartment(req: Request, res: Response) {
    try {
      const { code, name } = req.body;

      const existing = await prisma.department.findUnique({ where: { code } });
      if (existing) {
        return res.status(409).json({ error: 'Department code already exists' });
      }

      const department = await prisma.department.create({
        data: { code, name }
      });

      // 🔥 invalidate
      const deptKeys = await redisClient.keys('admin:departments:all*');
      if (deptKeys.length) await Promise.all(deptKeys.map(k => redisClient.del(k)));

      res.status(201).json(department);
    } catch (error) {
      console.error('Create department error:', error);
      res.status(500).json({ error: 'Failed to create department' });
    }
  },

  async getAllDepartments(req: Request, res: Response) {
    try {
      const cacheKey = 'admin:departments:all';

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const departments = await prisma.department.findMany({
        include: {
          _count: { select: { students: true, counselors: true } }
        },
        orderBy: { code: 'asc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(departments), { EX: 60 });
      res.json(departments);
    } catch (error) {
      console.error('Get departments error:', error);
      res.status(500).json({ error: 'Failed to fetch departments' });
    }
  },

  async getDepartmentById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const cacheKey = `admin:department:${id}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const department = await prisma.department.findUnique({
        where: { id },
        include: {
          students: { include: { user: { select: { id: true, email: true } } } },
          counselors: { include: { user: { select: { id: true, email: true } } } },
          _count: { select: { students: true, counselors: true } }
        }
      });

      if (!department) {
        return res.status(404).json({ error: 'Department not found' });
      }

      await redisClient.set(cacheKey, JSON.stringify(department), { EX: 60 });
      res.json(department);
    } catch (error) {
      console.error('Get department error:', error);
      res.status(500).json({ error: 'Failed to fetch department' });
    }
  },

  async updateDepartment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { code, name } = req.body;

      const existing = await prisma.department.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'Department not found' });
      }

      if (code && code !== existing.code) {
        const duplicate = await prisma.department.findUnique({ where: { code } });
        if (duplicate) {
          return res.status(409).json({ error: 'Department code already exists' });
        }
      }

      const updateData: any = {};
      if (code !== undefined) updateData.code = code;
      if (name !== undefined) updateData.name = name;

      const department = await prisma.department.update({
        where: { id },
        data: updateData
      });

      // 🔥 invalidate
      const deptKeys = await redisClient.keys('admin:departments:all*');
      if (deptKeys.length) await Promise.all(deptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`admin:department:${id}`);

      res.json(department);
    } catch (error) {
      console.error('Update department error:', error);
      res.status(500).json({ error: 'Failed to update department' });
    }
  },

  async deleteDepartment(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const existing = await prisma.department.findUnique({
        where: { id },
        include: { _count: { select: { students: true, counselors: true } } }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Department not found' });
      }

      if (existing._count.students > 0 || existing._count.counselors > 0) {
        return res.status(400).json({
          error: 'Cannot delete department with associated students or counselors'
        });
      }

      await prisma.department.delete({ where: { id } });

      // 🔥 invalidate
      const deptKeys = await redisClient.keys('admin:departments:all*');
      if (deptKeys.length) await Promise.all(deptKeys.map(k => redisClient.del(k)));
      await redisClient.del(`admin:department:${id}`);

      res.json({ message: 'Department deleted successfully' });
    } catch (error) {
      console.error('Delete department error:', error);
      res.status(500).json({ error: 'Failed to delete department' });
    }
  }
};
