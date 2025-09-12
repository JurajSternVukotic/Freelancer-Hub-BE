import express, { Request, Response, NextFunction } from 'express';
import {
  createProjectRequest,
  getProjectRequests,
  getProjectRequest,
  getClientInvoices,
  getClientInvoice,
  markInvoiceAsPaid,
  getClientInvoicePdf,
  getClientDashboard
} from '../controllers/clientPortalController';
import { generateProjectDescription } from '../controllers/aiController';
import { authenticateClient } from '../middleware/clientAuth';
import { ClientAuthenticatedRequest } from '../types/express';

const router = express.Router();

router.use(authenticateClient);

router.post('/project-requests', (req: Request, res: Response, next: NextFunction) => {
  return createProjectRequest(req as ClientAuthenticatedRequest, res, next);
});
router.get('/project-requests', (req: Request, res: Response, next: NextFunction) => {
  return getProjectRequests(req as ClientAuthenticatedRequest, res, next);
});
router.get('/project-requests/:id', (req: Request, res: Response, next: NextFunction) => {
  return getProjectRequest(req as ClientAuthenticatedRequest, res, next);
});

router.get('/invoices', (req: Request, res: Response, next: NextFunction) => {
  return getClientInvoices(req as ClientAuthenticatedRequest, res, next);
});
router.get('/invoices/:id', (req: Request, res: Response, next: NextFunction) => {
  return getClientInvoice(req as ClientAuthenticatedRequest, res, next);
});
router.post('/invoices/:id/pay', (req: Request, res: Response, next: NextFunction) => {
  return markInvoiceAsPaid(req as ClientAuthenticatedRequest, res, next);
});
router.get('/invoices/:id/pdf', (req: Request, res: Response, next: NextFunction) => {
  return getClientInvoicePdf(req as ClientAuthenticatedRequest, res, next);
});

router.get('/dashboard', (req: Request, res: Response, next: NextFunction) => {
  return getClientDashboard(req as ClientAuthenticatedRequest, res, next);
});

router.post('/ai/generate-description', (req: Request, res: Response, next: NextFunction) => {
  return generateProjectDescription(req, res, next);
});

export default router;