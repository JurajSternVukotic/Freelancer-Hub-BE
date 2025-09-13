import { Router } from 'express';
import { createProject, getProjects, getProject, updateProject, deleteProject, getProjectTasks, getProjectTimeEntries, getProjectExpenses, createProjectExpense, updateProjectExpense, deleteProjectExpense, getProjectInvoices, getProjectStats, getAvailableProjectRequests, acceptProjectRequest, convertRequestToProject } from '../controllers/projectController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getProjects);

router.post('/', authenticate, createProject);

router.get('/requests', authenticate, getAvailableProjectRequests);

router.post('/requests/:id/accept', authenticate, acceptProjectRequest);

router.post('/requests/:id/convert', authenticate, convertRequestToProject);

router.get('/:id', authenticate, getProject);

router.put('/:id', authenticate, updateProject);

router.delete('/:id', authenticate, deleteProject);

router.get('/:id/tasks', authenticate, getProjectTasks);

router.get('/:id/time-entries', authenticate, getProjectTimeEntries);

router.get('/:id/expenses', authenticate, getProjectExpenses);

router.post('/:id/expenses', authenticate, createProjectExpense);

router.put('/:id/expenses/:expenseId', authenticate, updateProjectExpense);

router.delete('/:id/expenses/:expenseId', authenticate, deleteProjectExpense);

router.get('/:id/invoices', authenticate, getProjectInvoices);

router.get('/:id/stats', authenticate, getProjectStats);

export default router;