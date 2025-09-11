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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.use(errorHandler);

export default app;