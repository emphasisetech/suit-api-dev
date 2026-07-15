import express from 'express';
import {
    create,
    findAll,
    findStudentAttendance,
    getStudentsForCheckInCheckOut,
    markAttendance,
    getAttendanceStatusList,
    removeCheckout,
    removeAttendanceSession
} from './attendanceController';

const router = express.Router();

router.post('/', create);
router.post('/all', findAll); // Using POST to allow body payload for userId or generic findAll
router.get('/student/:studentId', findStudentAttendance);
router.get('/check-in-out-list', getStudentsForCheckInCheckOut);
router.post('/mark-attendance', markAttendance);
router.patch('/student/:studentId/remove-checkout', removeCheckout);
router.patch('/student/:studentId/remove-session', removeAttendanceSession);
router.get('/status-list', getAttendanceStatusList);

export default router;
