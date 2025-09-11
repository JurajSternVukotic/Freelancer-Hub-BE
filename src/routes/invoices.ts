import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getInvoices,
  generateInvoice,
  createInvoice,
  getInvoice,
  updateInvoiceStatus,
  getInvoicePdf
} from '../controllers/invoiceController';

const router = Router();

router.use(authenticate);

router.get('/', getInvoices);
router.post('/', createInvoice);
router.post('/generate', generateInvoice);
router.get('/:id', getInvoice);
router.put('/:id/status', updateInvoiceStatus);
router.get('/:id/pdf', getInvoicePdf);

export default router;