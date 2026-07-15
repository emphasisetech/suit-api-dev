// import express from 'express';
// import * as applicationController from './applicationController';
// import { protect } from '../../middleware/auth';
// import { authorize } from '../../middleware/authorize';
// import { ENUM_ROLE } from '../../enums/userEnums';

// const router = express.Router();

// router.use(protect);

// router.post('/', authorize(ENUM_ROLE.SUPERADMIN, ENUM_ROLE.ACCOUNT_MANAGERS), applicationController.create);
// router.get('/', applicationController.findAll);
// router.get('/:id', applicationController.getById);
// router.patch('/:id', authorize(ENUM_ROLE.SUPERADMIN, ENUM_ROLE.ACCOUNT_MANAGERS), applicationController.update);
// router.delete('/:id', authorize(ENUM_ROLE.SUPERADMIN, ENUM_ROLE.ACCOUNT_MANAGERS), applicationController.deleteApplication);

// export default router;
