import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { 
  getFinancialDashboard,
  createExpense,
  createProposal,
  createRetainer,
  deleteFinancialItem
} from '../controllers/financialController';

const router = Router();

router.use(authenticate);

router.get('/dashboard', getFinancialDashboard);

router.post('/expenses', createExpense);
router.post('/proposals', createProposal);
router.post('/retainers', createRetainer);

router.delete('/:type/:id', deleteFinancialItem);

export default router;