// ===== routes/counselor.routes.ts =====
import { Router } from 'express';
import { counselorProfileController } from '../controllers/counselor/profile.controller';
import { counselorAppointmentController } from '../controllers/counselor/appointment.controller';
import { counselorStudentController } from '../controllers/counselor/student.controller';
import { counselorExcuseController } from '../controllers/counselor/digitalExcuse.controller';
import { emergencyResponseController } from '../controllers/counselor/emergencyResponse.controller';
import { counselorNotificationController } from '../controllers/counselor/notification.controller';
import { sessionNoteController } from '../controllers/counselor/sessionNotes.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { counselorUpload } from '../configs/multer';

export const counselorRouter = Router();

// Apply authentication to all routes
counselorRouter.use(authenticate, requireRole('COUNSELOR', 'ADMIN'));

// ===== COUNSELOR PROFILE ROUTES =====
counselorRouter.get('/profile', counselorProfileController.getMyProfile);
counselorRouter.post('/profile', counselorUpload.single('profile'), counselorProfileController.createMyProfile);
counselorRouter.patch('/profile', counselorUpload.single('profile'), counselorProfileController.updateMyProfile);

// ===== APPOINTMENT MANAGEMENT =====
counselorRouter.get('/appointments', counselorAppointmentController.getMyAppointments);
counselorRouter.get('/appointments/:id', counselorAppointmentController.getAppointmentById);
counselorRouter.patch('/appointments/:id/confirm', counselorAppointmentController.confirmAppointment);
counselorRouter.patch('/appointments/:id/complete', counselorAppointmentController.completeAppointment);
counselorRouter.patch('/appointments/:id/no-show', counselorAppointmentController.markNoShow);
counselorRouter.patch('/appointments/:id/cancel', counselorAppointmentController.cancelAppointment);
counselorRouter.patch('/appointments/:id', counselorAppointmentController.updateAppointment);

// ===== STUDENT MANAGEMENT =====
counselorRouter.get('/students', counselorStudentController.getMyStudents);
counselorRouter.get('/students/:id', counselorStudentController.getStudentById);
counselorRouter.get('/students/:id/appointments', counselorStudentController.getStudentAppointments);
counselorRouter.get('/students/:id/moods', counselorStudentController.getStudentMoods);
counselorRouter.get('/students/:id/moods/stats', counselorStudentController.getStudentMoodStats);

// ===== DASHBOARD & ANALYTICS =====
counselorRouter.get('/dashboard/stats', counselorAppointmentController.getDashboardStats);
counselorRouter.get('/dashboard/upcoming', counselorAppointmentController.getUpcomingAppointments);

// ===== DIGITAL EXCUSES (Counselor) =====
counselorRouter.post('/excuses', counselorExcuseController.generateExcuse);
counselorRouter.get('/excuses', counselorExcuseController.getIssuedExcuses);
counselorRouter.patch('/excuses/:id/revoke', counselorExcuseController.revokeExcuse);

// ===== EMERGENCY RESPONSE =====
counselorRouter.get('/emergencies', emergencyResponseController.getActiveEmergencies);
counselorRouter.patch('/emergencies/:id/respond', emergencyResponseController.respondToEmergency);
counselorRouter.patch('/emergencies/:id/resolve', emergencyResponseController.resolveEmergency);

// ===== NOTIFICATIONS =====
counselorRouter.get('/notifications', counselorNotificationController.getMyNotifications);
counselorRouter.patch('/notifications/:id/read', counselorNotificationController.markAsRead);
counselorRouter.patch('/notifications/read-all', counselorNotificationController.markAllAsRead);
counselorRouter.get('/notifications/unread-count', counselorNotificationController.getUnreadCount);

// ===== SESSION NOTES =====
counselorRouter.post('/notes', sessionNoteController.create);
counselorRouter.get('/notes', sessionNoteController.getMyNotes);
counselorRouter.get('/notes/:id', sessionNoteController.getNoteById);
counselorRouter.patch('/notes/:id', sessionNoteController.update);
counselorRouter.delete('/notes/:id', sessionNoteController.delete);