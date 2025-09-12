import { Router } from 'express';
import { 
  registerClient, 
  loginClient, 
  getClientProfile 
} from '../controllers/clientAuthController';
import { authenticateClient } from '../middleware/clientAuth';

const router = Router();

router.post('/register', registerClient);
router.post('/login', loginClient);

router.use(authenticateClient);
router.get('/profile', getClientProfile);

export default router;