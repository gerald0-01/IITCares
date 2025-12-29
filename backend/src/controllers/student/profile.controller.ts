import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { DepartmentCode } from '../../../generated/prisma/enums';
import { getDepartmentName } from '../../lib/profile/departmentName';
import redisClient from '../../lib/redis/redisClient';

export const studentProfileController = {
  // Get my profile with caching
  async getMyProfile(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `student_profile:${userId}`;

      // Try to get from Redis
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      const profile = await prisma.studentProfile.findUnique({
        where: { userId },
        include: {
          user: { select: { id: true, email: true, role: true } },
          department: true
        }
      });

      if (!profile) return res.status(404).json({ error: 'Profile not found' });

      // Save in Redis for 30 seconds (adjust as needed)
      await redisClient.set(cacheKey, JSON.stringify(profile), { EX: 30 });

      res.json(profile);
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  },

  // Create my profile
  async createMyProfile(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { studentNumber, name, yearLevel, course, sex, departmentCode, bio } = req.body;

      if (!studentNumber || !yearLevel || !course || !name || !sex || !departmentCode) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['studentNumber', 'name', 'yearLevel', 'course', 'sex', 'departmentCode']
        });
      }

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const existing = await prisma.studentProfile.findUnique({ where: { userId } });
      if (existing) return res.status(409).json({ error: 'Profile already exists' });

      const duplicateNumber = await prisma.studentProfile.findUnique({ where: { studentNumber } });
      if (duplicateNumber) return res.status(409).json({ error: 'Student number already exists' });

      const upperCode = departmentCode.toUpperCase().trim() as DepartmentCode;
      if (!Object.values(DepartmentCode).includes(upperCode)) {
        return res.status(400).json({
          error: 'Invalid department code',
          validDepartments: Object.values(DepartmentCode).map(code => ({ code, name: getDepartmentName(code) }))
        });
      }

      const department = await prisma.department.findUnique({ where: { code: upperCode } });
      if (!department) return res.status(400).json({ error: `Department '${departmentCode}' does not exist.` });

      const profileFile = req.file?.path;

      const studentProfile = await prisma.studentProfile.create({
        data: {
          userId,
          studentNumber: studentNumber.trim(),
          name: name.trim(),
          yearLevel: parseInt(yearLevel),
          course: course.trim(),
          sex: sex.toUpperCase(),
          profile: profileFile,
          departmentId: department.id,
          bio: bio?.trim()
        },
        include: {
          user: { select: { id: true, email: true, role: true } },
          department: true
        }
      });

      // Cache new profile
      await redisClient.set(`student_profile:${userId}`, JSON.stringify(studentProfile), { EX: 30 });

      res.status(201).json(studentProfile);
    } catch (error) {
      console.error('Create profile error:', error);
      res.status(500).json({ error: 'Failed to create profile' });
    }
  },

  // Update my profile and invalidate cache
  async updateMyProfile(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const existing = await prisma.studentProfile.findUnique({ where: { userId } });
      if (!existing) return res.status(404).json({ error: 'Profile not found' });

      const { studentNumber, yearLevel, course, departmentCode, sex, name, bio } = req.body || {};
      const updateData: any = {};

      if (studentNumber && studentNumber !== existing.studentNumber) {
        const duplicate = await prisma.studentProfile.findUnique({ where: { studentNumber } });
        if (duplicate) return res.status(409).json({ error: 'Student number already exists' });
        updateData.studentNumber = studentNumber.trim();
      }

      if (yearLevel !== undefined) updateData.yearLevel = parseInt(yearLevel);
      if (course !== undefined) updateData.course = course.trim();
      if (sex !== undefined) updateData.sex = sex.toUpperCase();
      if (name !== undefined) updateData.name = name.trim();
      if (bio !== undefined) updateData.bio = bio.trim();

      if (departmentCode) {
        const upperCode = departmentCode.toUpperCase().trim() as DepartmentCode;
        if (!Object.values(DepartmentCode).includes(upperCode)) {
          return res.status(400).json({
            error: 'Invalid department code',
            validDepartments: Object.values(DepartmentCode).map(code => ({ code, name: getDepartmentName(code) }))
          });
        }

        const department = await prisma.department.findUnique({ where: { code: upperCode } });
        if (!department) return res.status(400).json({ error: `Department '${departmentCode}' does not exist.` });

        updateData.departmentId = department.id;
      }

      if (req.file?.path) updateData.profile = req.file.path;

      const updated = await prisma.studentProfile.update({
        where: { userId },
        data: updateData,
        include: { user: { select: { id: true, email: true, role: true } }, department: true }
      });

      // Invalidate and refresh cache (remove any profile variants)
      const cacheKey = `student_profile:${userId}`;
      const profileKeys = await redisClient.keys(`${cacheKey}*`);
      if (profileKeys.length) await Promise.all(profileKeys.map(k => redisClient.del(k)));
      await redisClient.set(cacheKey, JSON.stringify(updated), { EX: 30 });

      res.json(updated);
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
};
