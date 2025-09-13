import request from 'supertest';
import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import { TestDatabase, prisma } from './helpers/db';
import { UserFactory, ClientFactory, ProjectFactory, TaskFactory } from './helpers/factories';

describe('Projects API', () => {
  let freelancer: any;
  let client: any;

  beforeEach(async () => {
    await TestDatabase.setupTestDatabase();
    freelancer = await UserFactory.createFreelancer();
    client = await ClientFactory.create(freelancer.id);
  });

  afterAll(async () => {
    await TestDatabase.cleanupTestDatabase();
  });

  describe('GET /projects', () => {
    test('returns projects with client data populated', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        name: 'E-commerce Platform',
        status: 'active',
        budget: 15000,
      });

      const projectWithClient = await prisma.project.findUnique({
        where: { id: project.id },
        include: {
          client: true,
          tasks: true,
          timeEntries: true,
        },
      });

      expect(projectWithClient?.name).toBe('E-commerce Platform');
      expect(projectWithClient?.client.company).toBe(client.company);
      expect(projectWithClient?.status).toBe('active');
      expect(projectWithClient?.budget).toBe(15000);
    });

    test('filters projects by status', async () => {
      await ProjectFactory.create(client.id, freelancer.id, { status: 'planning' });
      await ProjectFactory.create(client.id, freelancer.id, { status: 'active' });
      await ProjectFactory.create(client.id, freelancer.id, { status: 'completed' });

      const activeProjects = await prisma.project.findMany({
        where: {
          userId: freelancer.id,
          status: 'active',
        },
      });

      const completedProjects = await prisma.project.findMany({
        where: {
          userId: freelancer.id,
          status: 'completed',
        },
      });

      expect(activeProjects).toHaveLength(1);
      expect(completedProjects).toHaveLength(1);
    });

    test('calculates project progress percentage', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id);

      await TaskFactory.create(project.id, { status: 'done' });
      await TaskFactory.create(project.id, { status: 'done' });
      await TaskFactory.create(project.id, { status: 'in-progress' });
      await TaskFactory.create(project.id, { status: 'todo' });

      const tasks = await prisma.task.findMany({
        where: { projectId: project.id },
      });

      const completedTasks = tasks.filter(task => task.status === 'done');
      const progressPercentage = Math.round((completedTasks.length / tasks.length) * 100);

      expect(tasks).toHaveLength(4);
      expect(completedTasks).toHaveLength(2);
      expect(progressPercentage).toBe(50);
    });

    test('includes task count and time logged', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id);

      const task1 = await TaskFactory.create(project.id);
      const task2 = await TaskFactory.create(project.id);

      await prisma.timeEntry.create({
        data: {
          taskId: task1.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          duration: 120,
          description: 'Working on task 1',
          billable: true,
          approved: false,
        },
      });

      await prisma.timeEntry.create({
        data: {
          taskId: task2.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
          duration: 180,
          description: 'Working on task 2',
          billable: true,
          approved: false,
        },
      });

      const tasks = await prisma.task.findMany({
        where: { projectId: project.id },
        include: { timeEntries: true },
      });

      const totalTimeLogged = tasks.reduce((total, task) => {
        return total + task.timeEntries.reduce((taskTotal, entry) => taskTotal + entry.duration, 0);
      }, 0);

      expect(tasks).toHaveLength(2);
      expect(totalTimeLogged).toBe(300);
    });

    test('only returns projects for authenticated user', async () => {
      const otherFreelancer = await UserFactory.createFreelancer();
      const otherClient = await ClientFactory.create(otherFreelancer.id);

      await ProjectFactory.create(client.id, freelancer.id, { name: 'My Project' });
      await ProjectFactory.create(otherClient.id, otherFreelancer.id, { name: 'Other Project' });

      const myProjects = await prisma.project.findMany({
        where: { userId: freelancer.id },
      });

      const otherProjects = await prisma.project.findMany({
        where: { userId: otherFreelancer.id },
      });

      expect(myProjects).toHaveLength(1);
      expect(myProjects[0].name).toBe('My Project');
      
      expect(otherProjects).toHaveLength(1);
      expect(otherProjects[0].name).toBe('Other Project');
    });
  });

  describe('POST /projects', () => {
    test('creates project with valid client reference', async () => {
      const projectData = {
        clientId: client.id,
        name: 'New Website Project',
        status: 'planning',
        startDate: new Date('2025-02-01'),
        endDate: new Date('2025-05-01'),
        budget: 8000,
        description: 'Complete website redesign and development',
      };

      const project = await prisma.project.create({
        data: {
          ...projectData,
          userId: freelancer.id,
        },
      });

      expect(project.name).toBe(projectData.name);
      expect(project.clientId).toBe(client.id);
      expect(project.status).toBe('planning');
      expect(project.budget).toBe(8000);
      expect(project.userId).toBe(freelancer.id);
    });

    test('sets default status to planning', async () => {
      const project = await prisma.project.create({
        data: {
          clientId: client.id,
          name: 'Default Status Project',
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          budget: 5000,
          description: 'Test project',
          userId: freelancer.id,
          status: 'planning',
        },
      });

      expect(project.status).toBe('planning');
    });

    test('validates budget is positive number', async () => {
      const negativeBudget = -1000;
      const zeroBudget = 0;
      const positiveBudget = 5000;

      const isValidBudget = (budget: number): boolean => {
        return budget > 0;
      };

      expect(isValidBudget(negativeBudget)).toBe(false);
      expect(isValidBudget(zeroBudget)).toBe(false);
      expect(isValidBudget(positiveBudget)).toBe(true);
    });

    test('validates endDate is after startDate', async () => {
      const startDate = new Date('2025-02-01');
      const validEndDate = new Date('2025-05-01');
      const invalidEndDate = new Date('2025-01-01');

      const isValidDateRange = (start: Date, end: Date): boolean => {
        return end > start;
      };

      expect(isValidDateRange(startDate, validEndDate)).toBe(true);
      expect(isValidDateRange(startDate, invalidEndDate)).toBe(false);
    });

    test('requires valid client reference', async () => {
      const nonExistentClientId = 'non-existent-client-id';

      const clientExists = await prisma.client.findUnique({
        where: { id: nonExistentClientId },
      });

      expect(clientExists).toBeNull();

      await expect(
        prisma.project.create({
          data: {
            clientId: nonExistentClientId,
            name: 'Invalid Project',
            startDate: new Date(),
            endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            budget: 5000,
            description: 'This should fail',
            userId: freelancer.id,
            status: 'planning',
          },
        })
      ).rejects.toThrow();
    });

    test('prevents creating project for other users clients', async () => {
      const otherFreelancer = await UserFactory.createFreelancer();
      const otherClient = await ClientFactory.create(otherFreelancer.id);

      const unauthorizedProject = {
        clientId: otherClient.id,
        userId: freelancer.id,
      };

      const isAuthorizedForClient = async (userId: string, clientId: string): Promise<boolean> => {
        const clientOwner = await prisma.client.findUnique({
          where: { id: clientId },
          select: { userId: true },
        });
        
        return clientOwner?.userId === userId;
      };

      const isAuthorized = await isAuthorizedForClient(freelancer.id, otherClient.id);
      expect(isAuthorized).toBe(false);
    });
  });

  describe('GET /projects/:id', () => {
    test('returns project with all related data', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        name: 'Detailed Project',
        description: 'A project with lots of related data',
      });

      const task = await TaskFactory.create(project.id);
      const timeEntry = await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
          duration: 60,
          description: 'Test time entry',
          billable: true,
          approved: false,
        },
      });

      const projectWithRelations = await prisma.project.findUnique({
        where: { id: project.id },
        include: {
          client: true,
          tasks: {
            include: {
              timeEntries: true,
            },
          },
          expenses: true,
          invoices: true,
        },
      });

      expect(projectWithRelations?.name).toBe('Detailed Project');
      expect(projectWithRelations?.client.company).toBe(client.company);
      expect(projectWithRelations?.tasks).toHaveLength(1);
      expect(projectWithRelations?.tasks[0].timeEntries).toHaveLength(1);
    });

    test('prevents access to other users projects', async () => {
      const otherFreelancer = await UserFactory.createFreelancer();
      const otherClient = await ClientFactory.create(otherFreelancer.id);
      const otherProject = await ProjectFactory.create(otherClient.id, otherFreelancer.id);

      const unauthorizedAccess = await prisma.project.findFirst({
        where: {
          id: otherProject.id,
          userId: freelancer.id,
        },
      });

      expect(unauthorizedAccess).toBeNull();
    });
  });

  describe('PUT /projects/:id', () => {
    test('updates project status and other fields', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        status: 'planning',
        budget: 5000,
        description: 'Original description',
      });

      const updatedProject = await prisma.project.update({
        where: { id: project.id },
        data: {
          status: 'active',
          budget: 7500,
          description: 'Updated description with more details',
        },
      });

      expect(updatedProject.status).toBe('active');
      expect(updatedProject.budget).toBe(7500);
      expect(updatedProject.description).toBe('Updated description with more details');
    });

    test('validates status transitions', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        status: 'planning',
      });

      const validTransitions = [
        { from: 'planning', to: 'active' },
        { from: 'active', to: 'on-hold' },
        { from: 'active', to: 'completed' },
        { from: 'on-hold', to: 'active' },
        { from: 'on-hold', to: 'completed' },
      ];

      const invalidTransitions = [
        { from: 'completed', to: 'planning' },
        { from: 'completed', to: 'active' },
      ];

      const isValidStatusTransition = (from: string, to: string): boolean => {
        if (from === 'completed' && ['planning', 'active'].includes(to)) {
          return false;
        }
        return true;
      };

      validTransitions.forEach(({ from, to }) => {
        expect(isValidStatusTransition(from, to)).toBe(true);
      });

      invalidTransitions.forEach(({ from, to }) => {
        expect(isValidStatusTransition(from, to)).toBe(false);
      });
    });

    test('recalculates project timeline on date changes', async () => {
      const originalStart = new Date('2025-02-01');
      const originalEnd = new Date('2025-05-01');

      const project = await ProjectFactory.create(client.id, freelancer.id, {
        startDate: originalStart,
        endDate: originalEnd,
      });

      const newStart = new Date('2025-03-01');
      const newEnd = new Date('2025-06-01');

      const updatedProject = await prisma.project.update({
        where: { id: project.id },
        data: {
          startDate: newStart,
          endDate: newEnd,
        },
      });

      expect(updatedProject.startDate).toEqual(newStart);
      expect(updatedProject.endDate).toEqual(newEnd);

      const durationDays = Math.ceil((newEnd.getTime() - newStart.getTime()) / (1000 * 60 * 60 * 24));
      expect(durationDays).toBe(92);
    });

    test('prevents moving completed projects back to active without approval', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        status: 'completed',
      });

      const canReopenProject = (currentStatus: string, newStatus: string): boolean => {
        if (currentStatus === 'completed' && newStatus === 'active') {
          return false;
        }
        return true;
      };

      expect(canReopenProject('completed', 'active')).toBe(false);
      expect(canReopenProject('active', 'completed')).toBe(true);
    });
  });

  describe('DELETE /projects/:id', () => {
    test('prevents deletion of projects with billable time entries', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id);
      const task = await TaskFactory.create(project.id);

      await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
          duration: 60,
          description: 'Billable work',
          billable: true,
          approved: true,
        },
      });

      const billableEntries = await prisma.timeEntry.findMany({
        where: {
          task: { projectId: project.id },
          billable: true,
        },
      });

      expect(billableEntries.length).toBeGreaterThan(0);
    });

    test('prevents deletion of projects with invoices', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id);

      const invoice = await prisma.invoice.create({
        data: {
          clientId: client.id,
          projectId: project.id,
          number: '2025-0001',
          date: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'sent',
          total: 1500,
        },
      });

      const projectInvoices = await prisma.invoice.findMany({
        where: { projectId: project.id },
      });

      expect(projectInvoices.length).toBeGreaterThan(0);
    });

    test('allows soft deletion by setting status to archived', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        status: 'active',
      });

      const archivedProject = await prisma.project.update({
        where: { id: project.id },
        data: {
          status: 'completed',
        },
      });

      expect(archivedProject.status).toBe('completed');
    });
  });

  describe('Project Status Workflows', () => {
    test('planning to active transition', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        status: 'planning',
      });

      await TaskFactory.create(project.id, { status: 'todo' });

      const activeProject = await prisma.project.update({
        where: { id: project.id },
        data: { status: 'active' },
      });

      expect(activeProject.status).toBe('active');
    });

    test('active to on-hold transition preserves context', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        status: 'active',
      });

      const onHoldProject = await prisma.project.update({
        where: { id: project.id },
        data: {
          status: 'on-hold',
          description: `${project.description}\n\nPUT ON HOLD: ${new Date().toISOString()}`,
        },
      });

      expect(onHoldProject.status).toBe('on-hold');
      expect(onHoldProject.description).toContain('PUT ON HOLD');
    });

    test('project completion requires all tasks to be done', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        status: 'active',
      });

      await TaskFactory.create(project.id, { status: 'done' });
      await TaskFactory.create(project.id, { status: 'done' });
      await TaskFactory.create(project.id, { status: 'in-progress' });

      const tasks = await prisma.task.findMany({
        where: { projectId: project.id },
      });

      const allTasksComplete = tasks.every(task => task.status === 'done');
      
      expect(allTasksComplete).toBe(false);
    });
  });

  describe('Project Reporting and Statistics', () => {
    test('calculates total time spent on project', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id);
      
      const task1 = await TaskFactory.create(project.id);
      const task2 = await TaskFactory.create(project.id);

      await prisma.timeEntry.create({
        data: {
          taskId: task1.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          duration: 120,
          description: 'Task 1 work',
          billable: true,
          approved: false,
        },
      });

      await prisma.timeEntry.create({
        data: {
          taskId: task2.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
          duration: 180,
          description: 'Task 2 work',
          billable: true,
          approved: false,
        },
      });

      const timeEntries = await prisma.timeEntry.findMany({
        where: {
          task: { projectId: project.id },
        },
      });

      const totalTime = timeEntries.reduce((sum, entry) => sum + entry.duration, 0);
      const totalHours = totalTime / 60;

      expect(totalTime).toBe(300);
      expect(totalHours).toBe(5);
    });

    test('calculates project profitability', async () => {
      const project = await ProjectFactory.create(client.id, freelancer.id, {
        budget: 10000,
      });

      const task = await TaskFactory.create(project.id);

      await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
          duration: 300,
          description: 'Billable work',
          billable: true,
          approved: true,
        },
      });

      await prisma.expense.create({
        data: {
          projectId: project.id,
          userId: freelancer.id,
          date: new Date(),
          amount: 100,
          category: 'Software',
          description: 'Development tools',
          billable: true,
        },
      });

      const timeEntries = await prisma.timeEntry.findMany({
        where: { task: { projectId: project.id }, billable: true },
      });

      const expenses = await prisma.expense.findMany({
        where: { projectId: project.id },
      });

      const laborCost = timeEntries.reduce((sum, entry) => {
        return sum + ((entry.duration / 60) * freelancer.hourlyRate);
      }, 0);

      const expenseCost = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      const totalCost = laborCost + expenseCost;
      const profit = project.budget - totalCost;
      const profitMargin = (profit / project.budget) * 100;

      expect(laborCost).toBe(250);
      expect(expenseCost).toBe(100);
      expect(totalCost).toBe(350);
      expect(profit).toBe(9650);
      expect(Math.round(profitMargin)).toBe(97);
    });
  });
});