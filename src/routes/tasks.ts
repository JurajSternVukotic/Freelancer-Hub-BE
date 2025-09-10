import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getTasks,
  createTask,
  getTask,
  updateTask,
  deleteTask,
  reorderTasks
} from '../controllers/taskController';

const router = Router();

router.use(authenticate);

router.get('/', getTasks);
router.post('/', createTask);
router.post('/reorder', reorderTasks);
router.get('/:id', getTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);

export default router;