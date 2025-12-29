import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import redisClient from '../../lib/redis/redisClient';

export const monthlySummaryController = {
  // Get my monthly summary with Redis caching
  async getMySummary(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { year, month } = req.query;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!year || !month) return res.status(400).json({ error: 'Year and month are required' });

      const cacheKey = `monthlySummary:${userId}:${year}:${month}`;

      // Try to fetch from Redis first
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      // Fetch from DB
      let summary = await prisma.monthlySummary.findUnique({
        where: {
          userId_year_month: {
            userId,
            year: parseInt(year as string),
            month: parseInt(month as string)
          }
        }
      });

      // Generate if doesn't exist
      if (!summary) {
        summary = await generateMonthlySummary(userId, parseInt(year as string), parseInt(month as string));
      }

      // Cache in Redis for 24 hours
      await redisClient.set(cacheKey, JSON.stringify(summary), { EX: 60 * 60 * 24 });

      res.json(summary);
    } catch (error) {
      console.error('Get summary error:', error);
      res.status(500).json({ error: 'Failed to fetch monthly summary' });
    }
  },

  // Get all my summaries
  async getAllMySummaries(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const cacheKey = `allMonthlySummaries:${userId}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const summaries = await prisma.monthlySummary.findMany({
        where: { userId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }]
      });

      await redisClient.set(cacheKey, JSON.stringify(summaries), { EX: 60 * 60 }); // 1 hour

      res.json(summaries);
    } catch (error) {
      console.error('Get summaries error:', error);
      res.status(500).json({ error: 'Failed to fetch summaries' });
    }
  }
};

// ------------------- Helper functions -------------------
async function generateMonthlySummary(userId: string, year: number, month: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const [moodEntries, journalEntries, appointments, taskCompletions, streak] = await Promise.all([
    prisma.moodEntry.findMany({ where: { userId, date: { gte: startDate, lte: endDate } } }),
    prisma.journalEntry.findMany({ where: { userId, date: { gte: startDate, lte: endDate } } }),
    prisma.appointment.findMany({ where: { userId, startTime: { gte: startDate, lte: endDate } } }),
    prisma.taskCompletion.findMany({ where: { userId, date: { gte: startDate, lte: endDate } } }),
    prisma.userStreak.findUnique({ where: { userId } })
  ]);

  const avgMoodIntensity = moodEntries.length > 0
    ? moodEntries.reduce((sum, e) => sum + e.intensity, 0) / moodEntries.length
    : null;

  const moodDistribution: Record<string, number> = {};
  moodEntries.forEach(entry => {
    entry.moods.forEach(mood => {
      moodDistribution[mood] = (moodDistribution[mood] || 0) + 1;
    });
  });

  const dominantMood = Object.entries(moodDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const completedAppointments = appointments.filter(a => a.status === 'COMPLETED').length;
  const pointsEarned = taskCompletions.reduce((sum, t) => sum + t.points, 0);

  const insights = generateInsights({
    totalMoodEntries: moodEntries.length,
    avgMoodIntensity,
    dominantMood,
    totalJournalEntries: journalEntries.length,
    completedAppointments,
    currentStreak: streak?.currentStreak || 0
  });

  const summary = await prisma.monthlySummary.create({
    data: {
      userId,
      year,
      month,
      totalMoodEntries: moodEntries.length,
      averageMoodIntensity: avgMoodIntensity,
      dominantMood,
      totalJournalEntries: journalEntries.length,
      totalAppointments: appointments.length,
      completedAppointments,
      checkInDays: new Set(taskCompletions.map(t => t.date.toDateString())).size,
      currentStreak: streak?.currentStreak || 0,
      pointsEarned,
      resourcesViewed: 0,
      insights,
      recommendations: generateRecommendations(insights)
    }
  });

  return summary;
}

function generateInsights(data: any): string {
  const insights = [];
  if (data.totalMoodEntries > 20) insights.push('Great job tracking your mood consistently this month!');
  if (data.avgMoodIntensity && data.avgMoodIntensity >= 7) insights.push('Your average mood was positive this month.');
  else if (data.avgMoodIntensity && data.avgMoodIntensity < 5) insights.push('Your mood has been lower this month. Consider talking to a counselor.');
  if (data.totalJournalEntries > 15) insights.push('Regular journaling shows great self-reflection.');
  if (data.currentStreak >= 7) insights.push(`Amazing ${data.currentStreak}-day streak! Keep it up!`);
  return insights.join(' ');
}

function generateRecommendations(insights: string): string {
  if (insights.includes('lower')) return 'Consider scheduling a counseling session and practicing self-care activities.';
  if (insights.includes('positive')) return 'Keep up the great work! Continue your healthy habits.';
  return 'Stay consistent with your mental health check-ins.';
}
