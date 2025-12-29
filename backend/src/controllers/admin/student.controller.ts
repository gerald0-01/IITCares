import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

export const adminStudentController = {
  // Get all students
  async getAllStudents(req: Request, res: Response) {
    try {
      const cacheKey = `admin_students_${JSON.stringify(req.query)}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const { departmentId, yearLevel, course, sex, search } = req.query;
      const where: any = {};

      if (departmentId) where.departmentId = departmentId as string;
      if (yearLevel) where.yearLevel = parseInt(yearLevel as string);
      if (sex) where.sex = sex;

      if (course) {
        where.course = { contains: course as string, mode: 'insensitive' };
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { studentNumber: { contains: search as string, mode: 'insensitive' } },
          { user: { email: { contains: search as string, mode: 'insensitive' } } }
        ];
      }

      const students = await prisma.studentProfile.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, role: true, emailVerified: true } },
          department: true
        },
        orderBy: [{ yearLevel: 'asc' }, { course: 'asc' }]
      });

      await redisClient.set(cacheKey, JSON.stringify(students), { EX: 60 });
      res.json(students);
    } catch (error) {
      console.error('Get students error:', error);
      res.status(500).json({ error: 'Failed to fetch students' });
    }
  },

  // Get student by ID
  async getStudentById(req: Request, res: Response) {
    try {
      const cacheKey = `admin_student_${req.params.id}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const { id } = req.params;

      const student = await prisma.studentProfile.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, email: true, role: true, emailVerified: true, createdAt: true }
          },
          department: true
        }
      });

      if (!student) return res.status(404).json({ error: 'Student not found' });

      const [appointmentCount, moodCount] = await Promise.all([
        prisma.appointment.count({ where: { userId: student.userId } }),
        prisma.moodEntry.count({ where: { userId: student.userId } })
      ]);

      const response = {
        ...student,
        stats: {
          totalAppointments: appointmentCount,
          totalMoodEntries: moodCount
        }
      };

      await redisClient.set(cacheKey, JSON.stringify(response), { EX: 60 });
      res.json(response);
    } catch (error) {
      console.error('Get student error:', error);
      res.status(500).json({ error: 'Failed to fetch student' });
    }
  },

  // Create student
  async createStudent(req: Request, res: Response) {
    try {
      const { userId, name, studentNumber, yearLevel, course, sex, profile, departmentId } = req.body;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.role !== 'STUDENT') return res.status(400).json({ error: 'User is not a student' });

      const existing = await prisma.studentProfile.findUnique({ where: { userId } });
      if (existing) return res.status(409).json({ error: 'Profile already exists' });

      const duplicateNumber = await prisma.studentProfile.findUnique({ where: { studentNumber } });
      if (duplicateNumber) return res.status(409).json({ error: 'Student number already exists' });

      const studentProfile = await prisma.studentProfile.create({
        data: { userId, name, studentNumber, yearLevel, course, sex, profile, departmentId },
        include: { user: { select: { id: true, email: true, role: true } }, department: true }
      });

      const adminStudentsKeys = await redisClient.keys('admin_students_*');
      if (adminStudentsKeys.length) await Promise.all(adminStudentsKeys.map(k => redisClient.del(k)));
      res.status(201).json(studentProfile);
    } catch (error) {
      console.error('Create student error:', error);
      res.status(500).json({ error: 'Failed to create student' });
    }
  },

  // Update student
  async updateStudent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, studentNumber, yearLevel, course, profile, departmentId } = req.body;

      const existing = await prisma.studentProfile.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Student not found' });

      if (studentNumber && studentNumber !== existing.studentNumber) {
        const duplicate = await prisma.studentProfile.findUnique({ where: { studentNumber } });
        if (duplicate) return res.status(409).json({ error: 'Student number already exists' });
      }

      const updated = await prisma.studentProfile.update({
        where: { id },
        data: { name, studentNumber, yearLevel, course, profile, departmentId },
        include: { user: { select: { id: true, email: true, role: true } }, department: true }
      });

      const adminStudentsKeys = await redisClient.keys('admin_students_*');
      if (adminStudentsKeys.length) await Promise.all(adminStudentsKeys.map(k => redisClient.del(k)));
      await redisClient.del(`admin_student_${id}`);

      res.json(updated);
    } catch (error) {
      console.error('Update student error:', error);
      res.status(500).json({ error: 'Failed to update student' });
    }
  },

  // Delete student
  async deleteStudent(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const existing = await prisma.studentProfile.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Student not found' });

      await prisma.studentProfile.delete({ where: { id } });

      const adminStudentsKeys = await redisClient.keys('admin_students_*');
      if (adminStudentsKeys.length) await Promise.all(adminStudentsKeys.map(k => redisClient.del(k)));
      await redisClient.del(`admin_student_${id}`);

      res.json({ message: 'Student profile deleted successfully' });
    } catch (error) {
      console.error('Delete student error:', error);
      res.status(500).json({ error: 'Failed to delete student' });
    }
  }
};
