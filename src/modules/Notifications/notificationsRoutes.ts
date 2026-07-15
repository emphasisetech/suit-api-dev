import express from 'express';
import * as notificationsController from './notificationsController';
// import { protect } from '../../middleware/authMiddleware'; // Assuming we have auth middleware

const router = express.Router();

// Routes would likely need authentication, e.g., router.use(protect);
router.post('/', notificationsController.create);
router.get('/', notificationsController.findAll);
router.patch('/', notificationsController.updateMany);

export default router;
