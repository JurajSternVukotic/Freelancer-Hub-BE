import { Router } from 'express';
import { getMe, updateMe, getUsers } from '../controllers/userController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.get('/me', authenticate, getMe);

router.put('/me', authenticate, updateMe);

router.get('/', authenticate, authorize([UserRole.FREELANCER]), getUsers);

export default router;