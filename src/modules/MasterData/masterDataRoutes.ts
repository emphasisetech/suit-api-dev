import express from 'express';
import { findAll } from './masterDataController';

const router = express.Router();

router.get('/', findAll);

export default router;
