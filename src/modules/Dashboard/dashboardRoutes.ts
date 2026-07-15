import express from 'express';
import { getDashboardTiles, getDashboardTileDetails, getBirthdays } from './dashboardController';

const router = express.Router();

router.get('/', getDashboardTiles);
router.get('/tile-details', getDashboardTileDetails);
router.get('/birthdays', getBirthdays);

export default router;
