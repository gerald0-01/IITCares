import { Router } from 'express';
import { adminStudentController } from '../controllers/admin/student.controller';
import { adminCounselorController } from '../controllers/admin/counselor.controller';
import { adminAppointmentController } from '../controllers/admin/appointment.controller';
import { adminDepartmentController } from '../controllers/admin/department.controller';
import { adminAnalyticsController } from '../controllers/admin/analytics.controller';
import { reportManagementController } from '../controllers/admin/reportManagement.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

export const adminRouter = Router();

// Apply authentication and admin-only middleware to all routes
adminRouter.use(authenticate);
adminRouter.use(requireRole('ADMIN'));

// ===== STUDENT MANAGEMENT =====
adminRouter.get('/students', adminStudentController.getAllStudents);
adminRouter.get('/students/:id', adminStudentController.getStudentById);
adminRouter.post('/students', adminStudentController.createStudent);
adminRouter.patch('/students/:id', adminStudentController.updateStudent);
adminRouter.delete('/students/:id', adminStudentController.deleteStudent);

// ===== COUNSELOR MANAGEMENT =====
adminRouter.get('/counselors', adminCounselorController.getAllCounselors);
adminRouter.get('/counselors/:id', adminCounselorController.getCounselorById);
adminRouter.post('/counselors', adminCounselorController.createCounselor);
adminRouter.patch('/counselors/:id', adminCounselorController.updateCounselor);
adminRouter.delete('/counselors/:id', adminCounselorController.deleteCounselor);

// ===== APPOINTMENT MANAGEMENT =====
adminRouter.get('/appointments', adminAppointmentController.getAllAppointments);
adminRouter.get('/appointments/:id', adminAppointmentController.getAppointmentById);
adminRouter.patch('/appointments/:id', adminAppointmentController.updateAppointment);
adminRouter.delete('/appointments/:id', adminAppointmentController.deleteAppointment);

// ===== DEPARTMENT MANAGEMENT =====
adminRouter.get('/departments', adminDepartmentController.getAllDepartments);
adminRouter.get('/departments/:id', adminDepartmentController.getDepartmentById);
adminRouter.post('/departments', adminDepartmentController.createDepartment);
adminRouter.patch('/departments/:id', adminDepartmentController.updateDepartment);
adminRouter.delete('/departments/:id', adminDepartmentController.deleteDepartment);

// ===== ANALYTICS & REPORTS =====
adminRouter.get('/analytics/overview', adminAnalyticsController.getSystemOverview);
adminRouter.get('/analytics/appointments', adminAnalyticsController.getAppointmentAnalytics);
adminRouter.get('/analytics/students', adminAnalyticsController.getStudentAnalytics);
adminRouter.get('/analytics/mood-trends', adminAnalyticsController.getMoodTrends);

// ===== REPORT MANAGEMENT =====
adminRouter.get('/reports', reportManagementController.getReportedPosts);
adminRouter.patch('/reports/:id/review', reportManagementController.reviewReport);

export default adminRouter;