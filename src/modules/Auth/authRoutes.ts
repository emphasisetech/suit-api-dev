import express from 'express';
import { signup, login, register, requestRegisterOtp } from './authController';

const router = express.Router();

router.post('/signup', signup);
router.post('/register/request-otp', requestRegisterOtp);
router.post('/register', register);
router.post('/login', login);

export default router;
