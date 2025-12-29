import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma'; // Prisma instance
import { PostStatus } from '../../../generated/prisma/client'; // Enum

export const ventingWallController = {
  // Create post (All students)
  async createPost(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { content, isAnonymous = true } = req.body;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!content || content.trim().length === 0) return res.status(400).json({ error: 'Content is required' });

      const warnings = await prisma.userWarning.count({ where: { userId } });
      if (warnings >= 3) return res.status(403).json({ error: 'Account suspended due to violations. Please contact support.' });

      const post = await prisma.ventPost.create({ data: { userId, content, isAnonymous } });
      res.status(201).json(post);
    } catch (error) {
      console.error('Create post error:', error);
      res.status(500).json({ error: 'Failed to create post' });
    }
  },

  // Get posts (All students)
  async getPosts(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { limit = 20, cursor } = req.query;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const where: any = { status: { in: [PostStatus.ACTIVE, PostStatus.REPORTED] } };

      const posts = await prisma.ventPost.findMany({
        where,
        take: parseInt(limit as string),
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor as string } : undefined,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          content: true,
          isAnonymous: true,
          createdAt: true,
          status: true,
          userId: false // Never expose user IDs for privacy
        }
      });

      res.json(posts);
    } catch (error) {
      console.error('Get posts error:', error);
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  },

  // Get my posts
  async getMyPosts(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const posts = await prisma.ventPost.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      res.json(posts);
    } catch (error) {
      console.error('Get my posts error:', error);
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  },

  // Report post
  async reportPost(req: Request, res: Response) {
    try {
      const { postId } = req.params;
      const userId = req.user?.id;
      const { reason, details } = req.body;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!reason) return res.status(400).json({ error: 'Reason is required' });

      const existingReport = await prisma.ventReport.findFirst({ where: { postId, reportedBy: userId } });
      if (existingReport) return res.status(400).json({ error: 'You have already reported this post' });

      const report = await prisma.ventReport.create({ data: { postId, reportedBy: userId, reason, details } });

      const reportCount = await prisma.ventReport.count({ where: { postId, reviewed: false } });
      if (reportCount >= 3) {
        await prisma.ventPost.update({ where: { id: postId }, data: { status: PostStatus.REPORTED } });
      }

      res.status(201).json({ message: 'Report submitted successfully', report });
    } catch (error) {
      console.error('Report post error:', error);
      res.status(500).json({ error: 'Failed to report post' });
    }
  },

  // Delete my post
  async deleteMyPost(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const post = await prisma.ventPost.findUnique({ where: { id } });
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.userId !== userId) return res.status(403).json({ error: 'Access denied' });

      await prisma.ventPost.delete({ where: { id } });
      res.json({ message: 'Post deleted successfully' });
    } catch (error) {
      console.error('Delete post error:', error);
      res.status(500).json({ error: 'Failed to delete post' });
    }
  }
};
