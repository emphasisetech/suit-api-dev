import express from 'express';
import {
    createStudent,
    getStudents,
    getStudentById,
    updateStudent,
    uploadStudentImage,
    // deleteStudent, // Used for direct delete if needed
    addPayment,
    updatePayment,
    deletePayment,
    createCourse,
    updateCourse,
    deleteCourse,
    updateCourseStatus,
    changeStatus,
    importDealersInDatabase,
    updatePendingFeesByClient,
    calculatePendingFee,
    getPayments,
    getPaymentReceipt,
    getCertificate,
    sendEmailVerification,
    verifyEmail,
    requestResultOtp,
    verifyResultOtp
    ,requestStudentPortalOtp, verifyStudentPortalOtp, getStudentPortalData, loginStudentPortal, submitStudentOnlineTest
} from './studentController';
import { protect } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { ENUM_ROLE } from '../../enums/userEnums';
import { validate } from '../../middleware/validate';
import { 
    createStudentSchema, 
    updateStudentSchema, 
    addPaymentSchema, 
    createCourseSchema 
} from './studentValidation';

const router = express.Router();

router.post('/portal/request-otp', requestStudentPortalOtp);
router.post('/portal/verify-otp', verifyStudentPortalOtp);
router.post('/portal/login', loginStudentPortal);
router.get('/portal/data', getStudentPortalData);
router.post('/portal/online-test/:assignmentId/submit', submitStudentOnlineTest);

// Main CRUD
router.get('/all-payments', getPayments);
router.get('/payment-receipt/:paymentId', getPaymentReceipt);
router.get('/certificate/:studentId/:courseId', getCertificate);
router.get('/verify-email', verifyEmail);
router.post('/results/request-otp', requestResultOtp);
router.post('/results/verify-otp', verifyResultOtp);
router.post('/', validate(createStudentSchema), createStudent);
router.get('/', getStudents);
router.post('/:id/send-email-verification', protect, sendEmailVerification);
router.post('/:id/image', protect, uploadStudentImage);
router.get('/:id', getStudentById);
router.patch('/:id', validate(updateStudentSchema), updateStudent);
router.put('/:id', validate(updateStudentSchema), updateStudent);

// Payments
router.post('/payments', validate(addPaymentSchema), addPayment);
router.patch('/payments/:paymentId', updatePayment);
router.put('/payments/:paymentId', updatePayment);
router.patch('/payment-delete/:paymentId', protect, authorize(ENUM_ROLE.SUPERADMIN, ENUM_ROLE.ACCOUNT_MANAGERS, ENUM_ROLE.HEAD_OFFICE), deletePayment);

// Courses
router.post('/courses', validate(createCourseSchema), createCourse);
router.patch('/courses/:courseId', updateCourse);
router.put('/courses/:courseId', updateCourse);
router.patch('/course-delete/:courseId', deleteCourse);
router.patch('/course-change-status/:courseId', updateCourseStatus);

// Status & Bulk
router.patch('/status/:id', changeStatus);
router.patch('/import-products', importDealersInDatabase);

// Fees
router.post('/update-pending-fee/client/:client', updatePendingFeesByClient);
router.post('/:id/calculate-pending-fee', calculatePendingFee);

export default router;
