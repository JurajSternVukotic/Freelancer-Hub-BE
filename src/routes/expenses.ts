import { Router } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', (req, res) => res.redirect(301, '/api/v1/financial/dashboard'));
router.post('/', (req, res) => res.redirect(307, '/api/v1/financial/expenses'));
router.get('/:id', (req, res) => res.redirect(301, '/api/v1/financial/dashboard'));
router.put('/:id', (req, res) => res.status(501).json({ success: false, message: 'Use consolidated financial dashboard' }));
router.delete('/:id', (req, res) => res.redirect(307, `/api/v1/financial/expenses/${req.params.id}`));

export default router;