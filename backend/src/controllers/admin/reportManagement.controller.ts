import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

export const reportManagementController = {
  // Get all reported posts (with caching)
  async getReportedPosts(req: Request, res: Response) {
    try {
      const { reviewed } = req.query;
      const cacheKey = `reportedPosts:${reviewed ?? 'all'}`;
      const cached = await redisClient.get(cacheKey);

      if (cached) return res.json(JSON.parse(cached));

      const where: any = {};
      if (reviewed !== undefined) where.reviewed = reviewed === 'true';

      const reports = await prisma.ventReport.findMany({
        where,
        include: {
          post: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  studentProfile: {
                    select: { name: true, studentNumber: true }
                  }
                }
              }
            }
          },
          reporter: {
            select: {
              id: true,
              email: true,
              studentProfile: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      await redisClient.set(cacheKey, JSON.stringify(reports), { EX: 60 * 2 }); // cache for 2 minutes

      res.json(reports);
    } catch (error) {
      console.error('Get reported posts error:', error);
      res.status(500).json({ error: 'Failed to fetch reported posts' });
    }
  },

  // Review report
  async reviewReport(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { action, removePost, issueWarning } = req.body;

      const report = await prisma.ventReport.findUnique({
        where: { id },
        include: { post: true }
      });

      if (!report) return res.status(404).json({ error: 'Report not found' });

      // Update report
      const updated = await prisma.ventReport.update({
        where: { id },
        data: { reviewed: true, action }
      });

      // Take action on post
      if (removePost) {
        await prisma.ventPost.update({
          where: { id: report.postId },
          data: { status: 'REMOVED' }
        });
      }

      // Issue warning to post author
      if (issueWarning) {
        await prisma.userWarning.create({
          data: {
            userId: report.post.userId,
            reason: 'INAPPROPRIATE_CONTENT',
            details: `Post removed: ${action}`,
            issuedBy: req.user?.id!,
            postId: report.postId
          }
        });

        const warningCount = await prisma.userWarning.count({
          where: { userId: report.post.userId }
        });

        if (warningCount >= 3) {
          // TODO: Suspend account or additional actions
        }
      }

      // Invalidate cache (remove any reportedPosts variants)
      const reportedKeys = await redisClient.keys('reportedPosts:*');
      if (reportedKeys.length) await Promise.all(reportedKeys.map(k => redisClient.del(k)));

      res.json({ message: 'Report reviewed', report: updated });
    } catch (error) {
      console.error('Review report error:', error);
      res.status(500).json({ error: 'Failed to review report' });
    }
  }
};
