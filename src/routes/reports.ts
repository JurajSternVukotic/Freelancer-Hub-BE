import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getRevenueData,
  getReportStats,
  getTimeStats,
  getClientStats,
  getProjectStats,
  getProfitabilityReport,
  getUtilizationReport,
} from '../controllers/reportController';

const router = Router();

router.use(authenticate);

router.get('/revenue', getRevenueData);
router.get('/stats', getReportStats);
router.get('/time', getTimeStats);
router.get('/clients', getClientStats);
router.get('/projects', getProjectStats);
router.get('/profitability', getProfitabilityReport);
router.get('/utilization', getUtilizationReport);

export default router;