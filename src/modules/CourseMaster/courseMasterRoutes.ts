import express from 'express';
import { create, findAll, getById, update, deleteCourse, changeStatus } from './courseMasterController';
import { validate } from '../../middleware/validate';
import { createCourseMasterSchema, updateCourseMasterSchema } from './courseMasterValidation';

const router = express.Router();

router.post('/', validate(createCourseMasterSchema), create);
router.get('/', findAll);
router.get('/:id', getById);
router.patch('/:id', validate(updateCourseMasterSchema), update);
router.put('/:id', validate(updateCourseMasterSchema), update);
router.delete('/:id', deleteCourse);
router.patch('/status/:id', changeStatus);

export default router;
