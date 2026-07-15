import express from 'express';
import * as importedSheetUsersController from './importedSheetUsersController';
import { protect } from '../../middleware/auth';

const router = express.Router();
router.use(protect);

router.post('/', importedSheetUsersController.create);
router.get('/', importedSheetUsersController.findAll);
router.get('/:sheet_id', importedSheetUsersController.downloadSheet);
router.delete('/:sheet_id', importedSheetUsersController.deleteSheet);

export default router;
