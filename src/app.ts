import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import clientRoutes from './routes/clients';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import timerRoutes from './routes/timer';
import timeEntryRoutes from './routes/timeEntries';
import invoiceRoutes from './routes/invoices';
import expenseRoutes from './routes/expenses';
import financialRoutes from './routes/financial';
import proposalRoutes from './routes/proposals';
import retainerRoutes from './routes/retainers';
import reportRoutes from './routes/reports';

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/clients', clientRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/timer', timerRoutes);
app.use('/api/v1/time-entries', timeEntryRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/financial', financialRoutes);
app.use('/api/v1/proposals', proposalRoutes);
app.use('/api/v1/retainers', retainerRoutes);
app.use('/api/v1/reports', reportRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.use(errorHandler);

export default app;