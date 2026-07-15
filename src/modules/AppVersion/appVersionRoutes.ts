import express from 'express';
import {
    checkAppVersion,
    downloadAppRelease,
    getAppVersionAdmin,
    updateAppForceUpdate,
    uploadAppApk,
} from './appVersionController';
import { protect } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { ENUM_ROLE } from '../../enums/userEnums';

const router = express.Router();

router.get('/check', checkAppVersion);
router.get('/download/:platform', downloadAppRelease);
router.get('/admin', protect, authorize(ENUM_ROLE.SUPERADMIN), getAppVersionAdmin);
router.post('/upload-apk', protect, authorize(ENUM_ROLE.SUPERADMIN), uploadAppApk);
router.patch('/force-update', protect, authorize(ENUM_ROLE.SUPERADMIN), updateAppForceUpdate);

export default router;
