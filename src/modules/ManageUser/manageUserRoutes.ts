import express from 'express';
import * as manageUserController from './manageUserController';
import { protect } from '../../middleware/auth';

const router = express.Router();
router.use(protect);

// Routes
// Generic routes
router.post('/', manageUserController.create);
router.get('/', manageUserController.findAll);

// Import route
router.post('/import-users', manageUserController.importUsers);

// Routes with parameters
router.get('/:username', manageUserController.findOne);
router.patch('/:username', manageUserController.update);
router.delete('/:username', manageUserController.remove);

// Profile pic routes
router.patch('/profile/:username', manageUserController.updateProfilePic);
router.delete('/profile/:username', manageUserController.removeProfilePic);

export default router;
