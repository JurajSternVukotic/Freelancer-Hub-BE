import { Router } from 'express';
import { createProject, getProjects, getProject, updateProject, deleteProject, getProjectTasks, getProjectTimeEntries, getProjectExpenses, createProjectExpense, updateProjectExpense, deleteProjectExpense, getProjectInvoices, getProjectStats, getAvailableProjectRequests, acceptProjectRequest, convertRequestToProject } from '../controllers/projectController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getProjects);

router.post('/', authenticate, createProject);

router.get('/requests', authenticate, getAvailableProjectRequests);

router.post('/requests/:id/accept', authenticate, acceptProjectRequest);

router.post('/requests/:id/convert', authenticate, convertRequestToProject);

router.get('/:id', getProject);

router.put('/:id', updateProject);

router.delete('/:id', deleteProject);

router.get('/:id/tasks', getProjectTasks);

router.get('/:id/time-entries', getProjectTimeEntries);

router.get('/:id/expenses', authenticate, getProjectExpenses);

router.post('/:id/expenses', authenticate, createProjectExpense);

router.put('/:id/expenses/:expenseId', authenticate, updateProjectExpense);

router.delete('/:id/expenses/:expenseId', authenticate, deleteProjectExpense);

router.get('/:id/invoices', getProjectInvoices);

router.get('/:id/stats', getProjectStats);

export default router;