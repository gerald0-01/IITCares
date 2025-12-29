import { Router } from 'express';
import { studentAppointmentController } from '../controllers/student/appointment.controller';
import { studentProfileController } from '../controllers/student/profile.controller';
import { studentMoodController } from '../controllers/student/mood.controller';
import { studentMenstrualController } from '../controllers/student/menstrual.controller';
import { journalController } from '../controllers/student/journal.controller';
import { ventingWallController } from '../controllers/student/ventingWall.controller';
import { emergencyController } from '../controllers/student/emergency.controller';
import { digitalExcuseController } from '../controllers/student/digitalExcuse.controller';
import { monthlySummaryController } from '../controllers/student/monthlySummary.controller';
import { notificationController } from '../controllers/student/notification.controller';
import { resourceController } from '../controllers/student/resource.controller';
import { streakController } from '../controllers/student/streak.controller';
import { authenticate } from '../middleware/auth.middleware';
import { femaleOnly } from '../middleware/femaleOnly.middleware';
import { requireRole } from '../middleware/role.middleware';
import { studentUpload } from '../configs/multer';

const studentRouter = Router();

// Apply authentication to all studentRouter
studentRouter.use(authenticate, requireRole('STUDENT', 'ADMIN'));

// ===== STUDENT PROFILE studentRouter =====
studentRouter.get('/profile', studentProfileController.getMyProfile);
studentRouter.post('/profile', studentUpload.single('profile'), studentProfileController.createMyProfile);
studentRouter.patch('/profile', studentUpload.single('profile'), studentProfileController.updateMyProfile);

// ===== STUDENT APPOINTMENTS =====
studentRouter.post('/appointments', studentAppointmentController.bookAppointment);
studentRouter.get('/appointments', studentAppointmentController.getMyAppointments);
studentRouter.get('/appointments/:id', studentAppointmentController.getAppointmentById);
studentRouter.patch('/appointments/:id/cancel', studentAppointmentController.cancelAppointment);

// ===== AVAILABLE COUNSELORS & SLOTS =====
studentRouter.get('/counselors', studentAppointmentController.getAvailableCounselors);
studentRouter.get('/counselors/:counselorId/slots', studentAppointmentController.getAvailableSlots);

// ===== MOOD TRACKING (CALENDAR-BASED) =====
studentRouter.post('/moods', studentMoodController.upsertMood); // Create or update for a date
studentRouter.get('/moods/month', studentMoodController.getMoodsByMonth); // Get month view for calendar
studentRouter.get('/moods/range', studentMoodController.getMoodsByDateRange); // Get date range
studentRouter.get('/moods/stats', studentMoodController.getMoodStats); // Get statistics
studentRouter.get('/moods/streak', studentMoodController.getMoodStreak); // Get tracking streak
studentRouter.get('/moods/:date', studentMoodController.getMoodByDate); // Get specific date (YYYY-MM-DD)
studentRouter.delete('/moods/:date', studentMoodController.deleteMoodByDate); // Delete by date

// ===== MENSTRUAL CYCLE (FEMALE ONLY) =====
studentRouter.use('/menstrual-cycles', femaleOnly);

studentRouter.post('/menstrual-cycles', studentMenstrualController.startCycle);
studentRouter.get('/menstrual-cycles', studentMenstrualController.getMyCycles);
studentRouter.get('/menstrual-cycles/active', studentMenstrualController.getActiveCycle);
studentRouter.get('/menstrual-cycles/stats', studentMenstrualController.getMyStats);
studentRouter.get('/menstrual-cycles/:id', studentMenstrualController.getCycleById);
studentRouter.patch('/menstrual-cycles/:id/end', studentMenstrualController.endCycle);
studentRouter.delete('/menstrual-cycles/:id', studentMenstrualController.deleteCycle);

// Daily logs and symptoms
studentRouter.post('/menstrual-cycles/:cycleId/logs', studentMenstrualController.addDailyLog);
studentRouter.post('/menstrual-cycles/:cycleId/symptoms', studentMenstrualController.addSymptom);

// ===== JOURNALS =====
studentRouter.post('/journals', journalController.create);
studentRouter.get('/journals', journalController.getMyJournals);
studentRouter.get('/journals/stats', journalController.getStats);
studentRouter.get('/journals/:id', journalController.getById);
studentRouter.patch('/journals/:id', journalController.update);
studentRouter.delete('/journals/:id', journalController.delete);

// ===== VENTING WALL =====
studentRouter.post('/vent/posts', ventingWallController.createPost);
studentRouter.get('/vent/posts', ventingWallController.getPosts);
studentRouter.get('/vent/posts/mine', ventingWallController.getMyPosts);
studentRouter.post('/vent/posts/:postId/report', ventingWallController.reportPost);
studentRouter.delete('/vent/posts/:id', ventingWallController.deleteMyPost);

// ===== EMERGENCY =====
studentRouter.post('/emergencies', emergencyController.createAlert);
studentRouter.get('/emergencies', emergencyController.getMyAlerts);

// ===== DIGITAL EXCUSES =====
studentRouter.get('/excuses', digitalExcuseController.getMyExcuses);
studentRouter.get('/excuses/:id', digitalExcuseController.getExcuseById);

// ===== MONTHLY SUMMARIES =====
studentRouter.get('/monthly-summaries', monthlySummaryController.getMySummary);
studentRouter.get('/monthly-summaries/all', monthlySummaryController.getAllMySummaries);

// ===== NOTIFICATIONS =====
studentRouter.get('/notifications', notificationController.getMyNotifications);
studentRouter.patch('/notifications/:id/read', notificationController.markAsRead);
studentRouter.patch('/notifications/read-all', notificationController.markAllAsRead);
studentRouter.delete('/notifications/:id', notificationController.delete);
studentRouter.get('/notifications/unread-count', notificationController.getUnreadCount);

// ===== RESOURCES =====
studentRouter.get('/resources', resourceController.getAll);
studentRouter.get('/resources/offline', resourceController.getOfflineResources);
studentRouter.get('/resources/:id', resourceController.getById);

// ===== STREAKS & TASKS =====
studentRouter.get('/streak', streakController.getMyStreak);
studentRouter.get('/tasks', streakController.getTaskCompletions);
studentRouter.post('/streak/check-in', streakController.checkIn);

export default studentRouter;