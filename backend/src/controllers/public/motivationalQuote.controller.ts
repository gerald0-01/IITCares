import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

export const motivationalQuoteController = {
  // Get random quote (with caching)
  async getRandomQuote(req: Request, res: Response) {
    try {
      const { category } = req.query;
      const cacheKey = category ? `quote:${category}` : `quote:all`;

      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const where: any = { isActive: true };
      if (category) where.category = category;

      const quotes = await prisma.motivationalQuote.findMany({ where });

      if (quotes.length === 0) {
        const defaultQuote = { quote: 'You are stronger than you think.', author: 'Anonymous' };
        await redisClient.set(cacheKey, JSON.stringify(defaultQuote), { EX: 60 * 5 }); // 5 min cache
        return res.json(defaultQuote);
      }

      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      await redisClient.set(cacheKey, JSON.stringify(randomQuote), { EX: 60 * 5 }); // 5 min cache

      res.json(randomQuote);
    } catch (error) {
      console.error('Get quote error:', error);
      res.status(500).json({ error: 'Failed to fetch quote' });
    }
  },

  // Get all quotes (Admin)
  async getAllQuotes(req: Request, res: Response) {
    try {
      const quotes = await prisma.motivationalQuote.findMany({
        orderBy: { createdAt: 'desc' }
      });
      res.json(quotes);
    } catch (error) {
      console.error('Get quotes error:', error);
      res.status(500).json({ error: 'Failed to fetch quotes' });
    }
  }
};
