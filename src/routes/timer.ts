import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { startTimer, stopTimer, getCurrentTimer } from '../controllers/timerController';

const router = Router();

router.use(authenticate);

router.post('/start', startTimer);
router.post('/stop', stopTimer);
router.get('/current', getCurrentTimer);

export default router;