import express from 'express';
import {
  createDemoRequest,
  deleteNewsletterSubscription,
  getDemoRequests,
  getNewsletterSubscriptions,
  updateNewsletterSubscriptionStatus,
  updateDemoRequestStatus,
  subscribeNewsletter
} from './inquiryController';
import { protect } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { ENUM_ROLE } from '../../enums/userEnums';

const router = express.Router();

// Public routes
router.post('/demo', createDemoRequest);
router.post('/newsletter', subscribeNewsletter);

// Protected routes (Superadmin only)
router.get('/demo', protect, authorize(ENUM_ROLE.SUPERADMIN), getDemoRequests);
router.patch('/demo/:id/status', protect, authorize(ENUM_ROLE.SUPERADMIN), updateDemoRequestStatus);
router.get('/newsletter', protect, authorize(ENUM_ROLE.SUPERADMIN), getNewsletterSubscriptions);
router.patch('/newsletter/:id/status', protect, authorize(ENUM_ROLE.SUPERADMIN), updateNewsletterSubscriptionStatus);
router.delete('/newsletter/:id', protect, authorize(ENUM_ROLE.SUPERADMIN), deleteNewsletterSubscription);

export default router;
