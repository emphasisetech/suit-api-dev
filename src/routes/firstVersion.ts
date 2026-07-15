import express from 'express';
import authRoutes from '../modules/Auth/authRoutes';
import studentRoutes from '../modules/Student/studentRoutes';
import accountRoutes from '../modules/Account/accountRoutes';
import masterDataRoutes from '../modules/MasterData/masterDataRoutes';
import attendanceRoutes from '../modules/Attendance/attendanceRoutes';
import dashboardRoutes from '../modules/Dashboard/dashboardRoutes';
import agencyUserRoutes from '../modules/AgencyUser/agencyUserRoutes';
import manageUserRoutes from '../modules/ManageUser/manageUserRoutes';
import importedSheetUsersRoutes from '../modules/ImportedSheetUsers/importedSheetUsersRoutes';
import notificationsRoutes from '../modules/Notifications/notificationsRoutes';
import courseMasterRoutes from '../modules/CourseMaster/courseMasterRoutes';
// import applicationRoutes from '../modules/Application/applicationRoutes';
import employeeRoutes from '../modules/Employee/employeeRoutes';
import inquiryRoutes from '../modules/Inquiry/inquiryRoutes';
import membershipRoutes from '../modules/Membership/membershipRoutes';
import appVersionRoutes from '../modules/AppVersion/appVersionRoutes';
import helpSupportRoutes from '../modules/HelpSupport/helpSupportRoutes';
import deletedItemsRoutes from '../modules/DeletedItems/deletedItemsRoutes';
import { enforceOutletAccess } from '../middleware/outletAccess';
import parentRoutes from '../modules/Parent/parentRoutes';


const router = express.Router();

router.use('/auth', authRoutes);
router.use('/student', enforceOutletAccess, studentRoutes);
router.use('/accounts', accountRoutes);
router.use('/masters-data', enforceOutletAccess, masterDataRoutes);
router.use('/attendance', enforceOutletAccess, attendanceRoutes);
router.use('/dashboard-tiles', enforceOutletAccess, dashboardRoutes);
router.use('/agency-user', agencyUserRoutes);
router.use('/manageuser', manageUserRoutes);
router.use('/imported-users-sheet', importedSheetUsersRoutes);
router.use('/manage-notifications', notificationsRoutes);
router.use('/course-master', enforceOutletAccess, courseMasterRoutes);
// router.use('/applications', applicationRoutes);
router.use('/employee', enforceOutletAccess, employeeRoutes);
router.use('/inquiry', enforceOutletAccess, inquiryRoutes);
router.use('/membership', enforceOutletAccess, membershipRoutes);
router.use('/app-version', appVersionRoutes);
router.use('/help-support', helpSupportRoutes);
router.use('/deleted-items', deletedItemsRoutes);
router.use('/parent', parentRoutes);

export default router;
