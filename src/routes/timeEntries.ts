import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { 
  getTimeEntries, 
  createTimeEntry, 
  getTimeEntry, 
  updateTimeEntry, 
  deleteTimeEntry 
} from '../controllers/timeEntryController';

const router = Router();

router.use(authenticate);

router.get('/', getTimeEntries);
router.post('/', createTimeEntry);
router.get('/:id', getTimeEntry);
router.put('/:id', updateTimeEntry);
router.delete('/:id', deleteTimeEntry);

export default router;