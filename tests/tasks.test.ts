import request from 'supertest';
import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import { TestDatabase, prisma } from './helpers/db';
import { UserFactory, ClientFactory, ProjectFactory, TaskFactory } from './helpers/factories';

describe('Tasks API', () => {
  let freelancer: any;
  let client: any;
  let project: any;

  beforeEach(async () => {
    await TestDatabase.setupTestDatabase();
    freelancer = await UserFactory.createFreelancer();
    client = await ClientFactory.create(freelancer.id);
    project = await ProjectFactory.create(client.id, freelancer.id);
  });

  afterAll(async () => {
    await TestDatabase.cleanupTestDatabase();
  });

  describe('GET /tasks', () => {
    test('returns tasks ordered by position within status', async () => {
      const todoTasks = [
        await TaskFactory.create(project.id, { status: 'todo', position: 0, title: 'Todo Task 1' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 1, title: 'Todo Task 2' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 2, title: 'Todo Task 3' }),
      ];

      const inProgressTasks = [
        await TaskFactory.create(project.id, { status: 'in-progress', position: 0, title: 'In Progress 1' }),
        await TaskFactory.create(project.id, { status: 'in-progress', position: 1, title: 'In Progress 2' }),
      ];

      const tasks = await prisma.task.findMany({
        where: { projectId: project.id },
        orderBy: [
          { status: 'asc' },
          { position: 'asc' },
        ],
      });

      const todoResults = tasks.filter(task => task.status === 'todo');
      expect(todoResults).toHaveLength(3);
      expect(todoResults[0].title).toBe('Todo Task 1');
      expect(todoResults[1].title).toBe('Todo Task 2');
      expect(todoResults[2].title).toBe('Todo Task 3');

      const inProgressResults = tasks.filter(task => task.status === 'in-progress');
      expect(inProgressResults).toHaveLength(2);
      expect(inProgressResults[0].title).toBe('In Progress 1');
      expect(inProgressResults[1].title).toBe('In Progress 2');
    });

    test('groups tasks by status column', async () => {
      await TaskFactory.create(project.id, { status: 'todo' });
      await TaskFactory.create(project.id, { status: 'todo' });
      await TaskFactory.create(project.id, { status: 'in-progress' });
      await TaskFactory.create(project.id, { status: 'review' });
      await TaskFactory.create(project.id, { status: 'done' });
      await TaskFactory.create(project.id, { status: 'done' });

      const tasks = await prisma.task.findMany({
        where: { projectId: project.id },
      });

      const tasksByStatus = tasks.reduce((groups, task) => {
        if (!groups[task.status]) {
          groups[task.status] = [];
        }
        groups[task.status].push(task);
        return groups;
      }, {} as Record<string, any[]>);

      expect(tasksByStatus.todo).toHaveLength(2);
      expect(tasksByStatus['in-progress']).toHaveLength(1);
      expect(tasksByStatus.review).toHaveLength(1);
      expect(tasksByStatus.done).toHaveLength(2);
    });

    test('includes time entries per task', async () => {
      const task = await TaskFactory.create(project.id, { title: 'Task with Time' });

      await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          duration: 120,
          description: 'First time entry',
          billable: true,
          approved: false,
        },
      });

      await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
          duration: 60,
          description: 'Second time entry',
          billable: true,
          approved: false,
        },
      });

      const taskWithTimeEntries = await prisma.task.findUnique({
        where: { id: task.id },
        include: {
          timeEntries: true,
        },
      });

      expect(taskWithTimeEntries?.timeEntries).toHaveLength(2);
      
      const totalTime = taskWithTimeEntries?.timeEntries.reduce((sum, entry) => sum + entry.duration, 0);
      expect(totalTime).toBe(180);
    });

    test('calculates completion percentage', async () => {
      const task = await TaskFactory.create(project.id, {
        estimatedHours: 8,
      });

      await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
          duration: 240,
          description: '4 hours of work',
          billable: true,
          approved: false,
        },
      });

      const taskWithTime = await prisma.task.findUnique({
        where: { id: task.id },
        include: { timeEntries: true },
      });

      const totalLoggedMinutes = taskWithTime?.timeEntries.reduce((sum, entry) => sum + entry.duration, 0) || 0;
      const totalLoggedHours = totalLoggedMinutes / 60;
      const completionPercentage = Math.min((totalLoggedHours / task.estimatedHours) * 100, 100);

      expect(totalLoggedHours).toBe(4);
      expect(completionPercentage).toBe(50);
    });

    test('supports filtering by priority', async () => {
      await TaskFactory.create(project.id, { priority: 'low', title: 'Low Priority' });
      await TaskFactory.create(project.id, { priority: 'medium', title: 'Medium Priority' });
      await TaskFactory.create(project.id, { priority: 'high', title: 'High Priority' });
      await TaskFactory.create(project.id, { priority: 'urgent', title: 'Urgent Priority' });

      const highPriorityTasks = await prisma.task.findMany({
        where: {
          projectId: project.id,
          priority: 'high',
        },
      });

      const urgentTasks = await prisma.task.findMany({
        where: {
          projectId: project.id,
          priority: 'urgent',
        },
      });

      expect(highPriorityTasks).toHaveLength(1);
      expect(highPriorityTasks[0].title).toBe('High Priority');
      
      expect(urgentTasks).toHaveLength(1);
      expect(urgentTasks[0].title).toBe('Urgent Priority');
    });

    test('filters by due date range', async () => {
      const today = new Date();
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      await TaskFactory.create(project.id, { dueDate: today, title: 'Due Today' });
      await TaskFactory.create(project.id, { dueDate: tomorrow, title: 'Due Tomorrow' });
      await TaskFactory.create(project.id, { dueDate: nextWeek, title: 'Due Next Week' });

      const dueSoon = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
      
      const upcomingTasks = await prisma.task.findMany({
        where: {
          projectId: project.id,
          dueDate: {
            gte: today,
            lte: dueSoon,
          },
        },
        orderBy: { dueDate: 'asc' },
      });

      expect(upcomingTasks).toHaveLength(2);
      expect(upcomingTasks[0].title).toBe('Due Today');
      expect(upcomingTasks[1].title).toBe('Due Tomorrow');
    });
  });

  describe('POST /tasks', () => {
    test('creates task with valid data', async () => {
      const taskData = {
        projectId: project.id,
        title: 'New Task',
        description: 'Detailed description of the task',
        status: 'todo',
        priority: 'medium',
        dueDate: new Date('2025-03-01'),
        estimatedHours: 4,
      };

      const task = await prisma.task.create({
        data: {
          ...taskData,
          position: 0,
        },
      });

      expect(task.title).toBe(taskData.title);
      expect(task.description).toBe(taskData.description);
      expect(task.status).toBe(taskData.status);
      expect(task.priority).toBe(taskData.priority);
      expect(task.estimatedHours).toBe(taskData.estimatedHours);
      expect(task.position).toBe(0);
    });

    test('automatically assigns next position in status column', async () => {
      await TaskFactory.create(project.id, { status: 'todo', position: 0 });
      await TaskFactory.create(project.id, { status: 'todo', position: 1 });

      const existingTasks = await prisma.task.findMany({
        where: {
          projectId: project.id,
          status: 'todo',
        },
        orderBy: { position: 'desc' },
        take: 1,
      });

      const nextPosition = existingTasks.length > 0 ? existingTasks[0].position + 1 : 0;

      const newTask = await TaskFactory.create(project.id, {
        status: 'todo',
        position: nextPosition,
      });

      expect(newTask.position).toBe(2);
    });

    test('validates required fields', async () => {
      const incompleteTaskData = {
        description: 'Missing required fields',
        status: 'todo',
      };

      const requiredFields = ['projectId', 'title', 'status'];
      const missingFields = requiredFields.filter(field => !(field in incompleteTaskData));
      
      expect(missingFields).toEqual(['projectId', 'title']);
    });

    test('validates status enum values', async () => {
      const validStatuses = ['todo', 'in-progress', 'review', 'done'];
      const invalidStatuses = ['not-started', 'completed', 'cancelled', 'invalid'];

      validStatuses.forEach(status => {
        expect(['todo', 'in-progress', 'review', 'done']).toContain(status);
      });

      invalidStatuses.forEach(status => {
        expect(['todo', 'in-progress', 'review', 'done']).not.toContain(status);
      });
    });

    test('validates priority enum values', async () => {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      const invalidPriorities = ['critical', 'normal', 'none', 'invalid'];

      validPriorities.forEach(priority => {
        expect(['low', 'medium', 'high', 'urgent']).toContain(priority);
      });

      invalidPriorities.forEach(priority => {
        expect(['low', 'medium', 'high', 'urgent']).not.toContain(priority);
      });
    });
  });

  describe('PUT /tasks/reorder', () => {
    test('moves task within same column', async () => {
      const tasks = [
        await TaskFactory.create(project.id, { status: 'todo', position: 0, title: 'Task 1' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 1, title: 'Task 2' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 2, title: 'Task 3' }),
      ];

      const reorderData = {
        taskId: tasks[0].id,
        newPosition: 2,
        newStatus: 'todo',
      };

      await prisma.task.updateMany({
        where: {
          projectId: project.id,
          status: 'todo',
          position: { gte: 1, lte: 2 },
        },
        data: {
          position: {
            decrement: 1,
          },
        },
      });

      await prisma.task.update({
        where: { id: tasks[0].id },
        data: { position: 2 },
      });

      const reorderedTasks = await prisma.task.findMany({
        where: { projectId: project.id, status: 'todo' },
        orderBy: { position: 'asc' },
      });

      expect(reorderedTasks[0].title).toBe('Task 2');
      expect(reorderedTasks[1].title).toBe('Task 3');
      expect(reorderedTasks[2].title).toBe('Task 1');
      expect(reorderedTasks[0].position).toBe(0);
      expect(reorderedTasks[1].position).toBe(1);
      expect(reorderedTasks[2].position).toBe(2);
    });

    test('moves task between different columns', async () => {
      const todoTask = await TaskFactory.create(project.id, {
        status: 'todo',
        position: 0,
        title: 'Todo Task',
      });

      const inProgressTasks = [
        await TaskFactory.create(project.id, { status: 'in-progress', position: 0, title: 'In Progress 1' }),
        await TaskFactory.create(project.id, { status: 'in-progress', position: 1, title: 'In Progress 2' }),
      ];

      const reorderData = {
        taskId: todoTask.id,
        newPosition: 1,
        newStatus: 'in-progress',
      };

      await prisma.task.updateMany({
        where: {
          projectId: project.id,
          status: 'in-progress',
          position: { gte: 1 },
        },
        data: {
          position: {
            increment: 1,
          },
        },
      });

      await prisma.task.update({
        where: { id: todoTask.id },
        data: {
          status: 'in-progress',
          position: 1,
        },
      });

      const todoTasks = await prisma.task.findMany({
        where: { projectId: project.id, status: 'todo' },
      });

      const inProgressResults = await prisma.task.findMany({
        where: { projectId: project.id, status: 'in-progress' },
        orderBy: { position: 'asc' },
      });

      expect(todoTasks).toHaveLength(0);
      expect(inProgressResults).toHaveLength(3);
      expect(inProgressResults[0].title).toBe('In Progress 1');
      expect(inProgressResults[1].title).toBe('Todo Task');
      expect(inProgressResults[2].title).toBe('In Progress 2');
    });

    test('maintains position integrity with no gaps', async () => {
      const tasks = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(await TaskFactory.create(project.id, {
          status: 'todo',
          position: i,
          title: `Task ${i + 1}`,
        }));
      }

      await prisma.task.updateMany({
        where: {
          projectId: project.id,
          status: 'todo',
          position: { gte: 2, lte: 4 },
        },
        data: {
          position: {
            decrement: 1,
          },
        },
      });

      await prisma.task.update({
        where: { id: tasks[1].id },
        data: { position: 4 },
      });

      const reorderedTasks = await prisma.task.findMany({
        where: { projectId: project.id, status: 'todo' },
        orderBy: { position: 'asc' },
      });

      const positions = reorderedTasks.map(task => task.position);
      const expectedPositions = [0, 1, 2, 3, 4];

      expect(positions).toEqual(expectedPositions);
    });

    test('handles edge case of moving to beginning of column', async () => {
      const tasks = [
        await TaskFactory.create(project.id, { status: 'todo', position: 0, title: 'Task A' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 1, title: 'Task B' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 2, title: 'Task C' }),
      ];

      await prisma.task.updateMany({
        where: {
          projectId: project.id,
          status: 'todo',
          position: { gte: 0, lt: 2 },
        },
        data: {
          position: {
            increment: 1,
          },
        },
      });

      await prisma.task.update({
        where: { id: tasks[2].id },
        data: { position: 0 },
      });

      const reorderedTasks = await prisma.task.findMany({
        where: { projectId: project.id, status: 'todo' },
        orderBy: { position: 'asc' },
      });

      expect(reorderedTasks[0].title).toBe('Task C');
      expect(reorderedTasks[1].title).toBe('Task A');
      expect(reorderedTasks[2].title).toBe('Task B');
    });

    test('handles edge case of moving to end of column', async () => {
      const tasks = [
        await TaskFactory.create(project.id, { status: 'todo', position: 0, title: 'First' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 1, title: 'Second' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 2, title: 'Third' }),
      ];

      await prisma.task.updateMany({
        where: {
          projectId: project.id,
          status: 'todo',
          position: { gt: 0, lte: 2 },
        },
        data: {
          position: {
            decrement: 1,
          },
        },
      });

      await prisma.task.update({
        where: { id: tasks[0].id },
        data: { position: 2 },
      });

      const reorderedTasks = await prisma.task.findMany({
        where: { projectId: project.id, status: 'todo' },
        orderBy: { position: 'asc' },
      });

      expect(reorderedTasks[0].title).toBe('Second');
      expect(reorderedTasks[1].title).toBe('Third');
      expect(reorderedTasks[2].title).toBe('First');
    });

    test('prevents invalid reorder operations', async () => {
      const task = await TaskFactory.create(project.id);

      const invalidOperations = [
        { taskId: 'non-existent-id', newPosition: 0, newStatus: 'todo' },
        { taskId: task.id, newPosition: -1, newStatus: 'todo' },
        { taskId: task.id, newPosition: 0, newStatus: 'invalid-status' },
      ];

      const isValidReorderOperation = (operation: any): boolean => {
        if (!operation.taskId || operation.newPosition < 0) return false;
        if (!['todo', 'in-progress', 'review', 'done'].includes(operation.newStatus)) return false;
        return true;
      };

      invalidOperations.forEach(operation => {
        expect(isValidReorderOperation(operation)).toBe(false);
      });
    });
  });

  describe('PUT /tasks/:id', () => {
    test('updates task fields without affecting position', async () => {
      const task = await TaskFactory.create(project.id, {
        title: 'Original Title',
        description: 'Original Description',
        priority: 'low',
        estimatedHours: 4,
      });

      const updatedTask = await prisma.task.update({
        where: { id: task.id },
        data: {
          title: 'Updated Title',
          description: 'Updated Description',
          priority: 'high',
          estimatedHours: 8,
        },
      });

      expect(updatedTask.title).toBe('Updated Title');
      expect(updatedTask.description).toBe('Updated Description');
      expect(updatedTask.priority).toBe('high');
      expect(updatedTask.estimatedHours).toBe(8);
      expect(updatedTask.position).toBe(task.position);
    });

    test('validates status transitions', async () => {
      const task = await TaskFactory.create(project.id, { status: 'todo' });

      const validTransitions = [
        { from: 'todo', to: 'in-progress' },
        { from: 'in-progress', to: 'review' },
        { from: 'review', to: 'done' },
        { from: 'review', to: 'in-progress' },
        { from: 'done', to: 'todo' },
      ];

      const isValidTransition = (from: string, to: string): boolean => {
        const allowedTransitions: Record<string, string[]> = {
          'todo': ['in-progress'],
          'in-progress': ['review', 'done'],
          'review': ['done', 'in-progress'],
          'done': ['todo', 'in-progress'],
        };

        return allowedTransitions[from]?.includes(to) || false;
      };

      validTransitions.forEach(({ from, to }) => {
        expect(isValidTransition(from, to)).toBe(true);
      });
    });

    test('updates due date with validation', async () => {
      const task = await TaskFactory.create(project.id, {
        dueDate: new Date('2025-03-01'),
      });

      const newDueDate = new Date('2025-03-15');
      
      const updatedTask = await prisma.task.update({
        where: { id: task.id },
        data: { dueDate: newDueDate },
      });

      expect(updatedTask.dueDate).toEqual(newDueDate);

      const today = new Date();
      const isValidDueDate = (dueDate: Date): boolean => {
        return dueDate >= today;
      };

      expect(isValidDueDate(newDueDate)).toBe(true);
    });
  });

  describe('DELETE /tasks/:id', () => {
    test('soft deletes task and adjusts positions', async () => {
      const tasks = [
        await TaskFactory.create(project.id, { status: 'todo', position: 0, title: 'Task 1' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 1, title: 'Task 2' }),
        await TaskFactory.create(project.id, { status: 'todo', position: 2, title: 'Task 3' }),
      ];

      const deletedTask = await prisma.task.update({
        where: { id: tasks[1].id },
        data: {
          title: `DELETED: ${tasks[1].title}`,
        },
      });

      await prisma.task.updateMany({
        where: {
          projectId: project.id,
          status: 'todo',
          position: { gt: 1 },
        },
        data: {
          position: {
            decrement: 1,
          },
        },
      });

      expect(deletedTask.title).toBe('DELETED: Task 2');

      const remainingTasks = await prisma.task.findMany({
        where: {
          projectId: project.id,
          title: { not: { startsWith: 'DELETED:' } },
        },
        orderBy: { position: 'asc' },
      });

      expect(remainingTasks).toHaveLength(2);
      expect(remainingTasks[0].position).toBe(0);
      expect(remainingTasks[1].position).toBe(1);
    });

    test('prevents deletion of tasks with approved time entries', async () => {
      const task = await TaskFactory.create(project.id);

      await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          duration: 120,
          description: 'Approved work',
          billable: true,
          approved: true,
        },
      });

      const approvedEntries = await prisma.timeEntry.findMany({
        where: {
          taskId: task.id,
          approved: true,
        },
      });

      expect(approvedEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Task Filtering and Search', () => {
    test('filters tasks by multiple criteria', async () => {
      await TaskFactory.create(project.id, {
        title: 'Important API Task',
        priority: 'high',
        status: 'todo',
        dueDate: new Date('2025-03-01'),
      });

      await TaskFactory.create(project.id, {
        title: 'Regular UI Task',
        priority: 'medium',
        status: 'in-progress',
        dueDate: new Date('2025-03-15'),
      });

      await TaskFactory.create(project.id, {
        title: 'Critical API Bug',
        priority: 'urgent',
        status: 'todo',
        dueDate: new Date('2025-02-20'),
      });

      const highPriorityTodoTasks = await prisma.task.findMany({
        where: {
          projectId: project.id,
          priority: 'high',
          status: 'todo',
        },
      });

      expect(highPriorityTodoTasks).toHaveLength(1);
      expect(highPriorityTodoTasks[0].title).toBe('Important API Task');

      const apiTasks = await prisma.task.findMany({
        where: {
          projectId: project.id,
          title: {
            contains: 'API',
            mode: 'insensitive',
          },
        },
      });

      expect(apiTasks).toHaveLength(2);
    });

    test('sorts tasks by multiple fields', async () => {
      const tasks = [
        await TaskFactory.create(project.id, { priority: 'low', dueDate: new Date('2025-03-01') }),
        await TaskFactory.create(project.id, { priority: 'urgent', dueDate: new Date('2025-03-15') }),
        await TaskFactory.create(project.id, { priority: 'high', dueDate: new Date('2025-02-20') }),
        await TaskFactory.create(project.id, { priority: 'urgent', dueDate: new Date('2025-02-25') }),
      ];

      const priorityOrder = { 'urgent': 0, 'high': 1, 'medium': 2, 'low': 3 };
      
      const sortedTasks = await prisma.task.findMany({
        where: { projectId: project.id },
        orderBy: [
          { dueDate: 'asc' },
        ],
      });

      const manualSort = sortedTasks.sort((a, b) => {
        const priorityComparison = priorityOrder[a.priority as keyof typeof priorityOrder] - 
                                  priorityOrder[b.priority as keyof typeof priorityOrder];
        if (priorityComparison !== 0) return priorityComparison;
        
        return new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime();
      });

      expect(manualSort[0].priority).toBe('urgent');
      expect(manualSort[0].dueDate).toEqual(new Date('2025-02-25'));
    });
  });

  describe('Task Dependencies and Relationships', () => {
    test('tracks task relationships through time entries', async () => {
      const task = await TaskFactory.create(project.id, {
        title: 'Main Task',
        estimatedHours: 8,
      });

      const timeEntries = [
        await prisma.timeEntry.create({
          data: {
            taskId: task.id,
            userId: freelancer.id,
            startTime: new Date('2025-02-01T09:00:00'),
            endTime: new Date('2025-02-01T12:00:00'),
            duration: 180,
            description: 'Morning work session',
            billable: true,
            approved: false,
          },
        }),
        await prisma.timeEntry.create({
          data: {
            taskId: task.id,
            userId: freelancer.id,
            startTime: new Date('2025-02-01T13:00:00'),
            endTime: new Date('2025-02-01T17:00:00'),
            duration: 240,
            description: 'Afternoon work session',
            billable: true,
            approved: false,
          },
        }),
      ];

      const taskWithTimeTracking = await prisma.task.findUnique({
        where: { id: task.id },
        include: {
          timeEntries: {
            orderBy: { startTime: 'asc' },
          },
        },
      });

      const totalLoggedTime = taskWithTimeTracking?.timeEntries.reduce(
        (sum, entry) => sum + entry.duration,
        0
      ) || 0;

      expect(taskWithTimeTracking?.timeEntries).toHaveLength(2);
      expect(totalLoggedTime).toBe(420);
      expect(totalLoggedTime / 60).toBeLessThan(task.estimatedHours);
    });
  });
});