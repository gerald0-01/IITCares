import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { DepartmentCode } from '../../../generated/prisma/client';
import { getDepartmentName } from '../../lib/profile/departmentName';
import redisClient from '../../lib/redis/redisClient';

// Counselor Profile Controller
export const counselorProfileController = {
  // Get my profile
  async getMyProfile(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `counselor_profile_${userId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const profile = await prisma.counselorProfile.findUnique({
        where: { userId },
        include: {
          user: { select: { id: true, email: true, role: true } },
          departments: true
        }
      });

      if (!profile) return res.status(404).json({ error: 'Profile not found' });

      await redisClient.set(cacheKey, JSON.stringify(profile), { EX: 60 });
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
      const { name, office, phone, sex, departmentCodes, bio } = req.body;

      if (!name || !office || !phone || !sex || !departmentCodes) {
        return res.status(400).json({ message: "Fill in the required fields!" });
      }

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const existing = await prisma.counselorProfile.findUnique({ where: { userId } });
      if (existing) return res.status(409).json({ error: 'Profile already exists' });

      // Validate department codes
      const validDepartments: DepartmentCode[] = [];
      const invalidCodes: string[] = [];
      departmentCodes.forEach((code: string) => {
        const upperCode = code.toUpperCase().trim() as DepartmentCode;
        if (Object.values(DepartmentCode).includes(upperCode)) validDepartments.push(upperCode);
        else invalidCodes.push(code);
      });

      if (invalidCodes.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid department codes',
          message: `The following codes are invalid: ${invalidCodes.join(', ')}`,
          validDepartments: Object.values(DepartmentCode).map(code => ({
            code,
            name: getDepartmentName(code),
          }))
        });
      }

      // Find departments in DB
      const departmentsInDb = await prisma.department.findMany({ where: { code: { in: validDepartments } } });
      if (departmentsInDb.length !== validDepartments.length) {
        const dbMissing = validDepartments.filter(code => !departmentsInDb.some(d => d.code === code));
        return res.status(400).json({
          success: false,
          error: 'Department not found',
          message: `The following departments do not exist in the system: ${dbMissing.join(', ')}`,
          suggestion: 'Please contact administrator to add these departments.'
        });
      }

      const profilePath = req.file?.path;

      const data: any = {
        userId,
        name,
        office,
        phone,
        sex,
        profile: profilePath,
        bio,
        departments: { connect: departmentsInDb.map(d => ({ id: d.id })) }
      };

      const counselorProfile = await prisma.counselorProfile.create({
        data,
        include: { user: { select: { id: true, email: true, role: true } }, departments: true }
      });

      // Invalidate profile cache (remove any profile variants)
      const profileKeys = await redisClient.keys(`counselor_profile_${userId}*`);
      if (profileKeys.length) await Promise.all(profileKeys.map(k => redisClient.del(k)));

      res.status(201).json(counselorProfile);
    } catch (error) {
      console.error('Create counselor profile error:', error);
      res.status(500).json({ error: 'Failed to create counselor profile' });
    }
  },

  // Update my profile
  async updateMyProfile(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { name, office, phone, departmentCodes, bio } = req.body;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const existing = await prisma.counselorProfile.findUnique({ where: { userId } });
      if (!existing) return res.status(404).json({ error: 'Counselor profile not found' });

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (office !== undefined) updateData.office = office;
      if (phone !== undefined) updateData.phone = phone;
      if (bio !== undefined) updateData.bio = bio;
      if (req.file?.path) updateData.profile = req.file.path;

      if (departmentCodes !== undefined && Array.isArray(departmentCodes)) {
        const departments = await prisma.department.findMany({
          where: { code: { in: departmentCodes } },
          select: { id: true }
        });
        const departmentIds = departments.map(d => d.id);
        updateData.departments = { set: departmentIds.map(id => ({ id })) };
      }

      const updated = await prisma.counselorProfile.update({
        where: { userId },
        data: updateData,
        include: { user: { select: { id: true, email: true, role: true } }, departments: true }
      });

      // Invalidate profile cache (remove any profile variants)
      const profileKeys = await redisClient.keys(`counselor_profile_${userId}*`);
      if (profileKeys.length) await Promise.all(profileKeys.map(k => redisClient.del(k)));

      res.json(updated);
    } catch (error) {
      console.error('Update counselor profile error:', error);
      res.status(500).json({ error: 'Failed to update counselor profile' });
    }
  }
};
