import express from 'express';
import { protect } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { ENUM_ROLE } from '../../enums/userEnums';
import * as agencyUserController from './agencyUserController';

const router = express.Router();

router.post(
    '/',
    protect,
    authorize(ENUM_ROLE.ACCOUNT_MANAGERS, ENUM_ROLE.SUPERADMIN,
        ENUM_ROLE.HEAD_OFFICE,), // SUPERADMIN not in ENUM_ROLE? Let's check ENUM_ROLE again.
    agencyUserController.create
);

router.get(
    '/',
    protect,
    authorize(ENUM_ROLE.ACCOUNT_MANAGERS, ENUM_ROLE.AGENCY_USER, ENUM_ROLE.SUPERADMIN,
        ENUM_ROLE.HEAD_OFFICE,),
    agencyUserController.findAll
);

router.get(
    '/username/:username',
    protect,
    authorize(
        ENUM_ROLE.ACCOUNT_MANAGERS,
        ENUM_ROLE.AGENCY_USER,
        ENUM_ROLE.HEAD_OFFICE,
        ENUM_ROLE.USER,
        ENUM_ROLE.SUPERADMIN
    ),
    agencyUserController.findUserByUserName
);

router.get(
    '/:username',
    protect,
    authorize(ENUM_ROLE.ACCOUNT_MANAGERS, ENUM_ROLE.AGENCY_USER, ENUM_ROLE.SUPERADMIN),
    agencyUserController.findOne
);

router.patch(
    '/:username',
    protect,
    authorize(ENUM_ROLE.ACCOUNT_MANAGERS, ENUM_ROLE.SUPERADMIN),
    agencyUserController.update
);

router.delete(
    '/:username',
    protect,
    authorize(ENUM_ROLE.ACCOUNT_MANAGERS, ENUM_ROLE.SUPERADMIN),
    agencyUserController.remove
);

export default router;
