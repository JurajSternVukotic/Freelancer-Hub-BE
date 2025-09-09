import { Router, Request, Response, NextFunction } from 'express';
import { createClient, getClients, getClient, updateClient, deleteClient, archiveClient, restoreClient, getClientProjects, getClientInvoices } from '../controllers/clientController';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/express';

const router = Router();

router.use(authenticate);

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  return getClients(req as AuthenticatedRequest, res, next);
});

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  return createClient(req as AuthenticatedRequest, res, next);
});

router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  return getClient(req as AuthenticatedRequest, res, next);
});

router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
  return updateClient(req as AuthenticatedRequest, res, next);
});

router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  return deleteClient(req as AuthenticatedRequest, res, next);
});

router.patch('/:id/archive', (req: Request, res: Response, next: NextFunction) => {
  return archiveClient(req as AuthenticatedRequest, res, next);
});

router.patch('/:id/restore', (req: Request, res: Response, next: NextFunction) => {
  return restoreClient(req as AuthenticatedRequest, res, next);
});

router.get('/:id/projects', (req: Request, res: Response, next: NextFunction) => {
  return getClientProjects(req as AuthenticatedRequest, res, next);
});

router.get('/:id/invoices', (req: Request, res: Response, next: NextFunction) => {
  return getClientInvoices(req as AuthenticatedRequest, res, next);
});

export default router;