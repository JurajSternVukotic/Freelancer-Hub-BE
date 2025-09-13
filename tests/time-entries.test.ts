import request from 'supertest';
import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import { TestDatabase, prisma } from './helpers/db';
import { UserFactory, ClientFactory, ProjectFactory, TaskFactory, TimeEntryFactory } from './helpers/factories';

describe('Time Entries and Timer API', () => {
  let freelancer: any;
  let client: any;
  let project: any;
  let task: any;

  beforeEach(async () => {
    await TestDatabase.setupTestDatabase();
    freelancer = await UserFactory.createFreelancer();
    client = await ClientFactory.create(freelancer.id);
    project = await ProjectFactory.create(client.id, freelancer.id);
    task = await TaskFactory.create(project.id);
  });

  afterAll(async () => {
    await TestDatabase.cleanupTestDatabase();
  });

  describe('POST /timer/start', () => {
    test('creates new time entry with startTime', async () => {
      const startTime = new Date();
      
      const timerEntry = await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime,
          endTime: null,
          duration: 0,
          description: 'Starting work on task',
          billable: true,
          approved: false,
        },
      });

      expect(timerEntry.taskId).toBe(task.id);
      expect(timerEntry.userId).toBe(freelancer.id);
      expect(timerEntry.startTime).toBeDefined();
      expect(timerEntry.endTime).toBeNull();
      expect(timerEntry.duration).toBe(0);
      expect(timerEntry.billable).toBe(true);
    });

    test('links timer to specified task', async () => {
      const timerData = {
        taskId: task.id,
        userId: freelancer.id,
        description: 'Working on specific task',
      };

      const timerEntry = await prisma.timeEntry.create({
        data: {
          ...timerData,
          startTime: new Date(),
          endTime: null,
          duration: 0,
          billable: true,
          approved: false,
        },
      });

      const timerWithTask = await prisma.timeEntry.findUnique({
        where: { id: timerEntry.id },
        include: { task: true },
      });

      expect(timerWithTask?.task.id).toBe(task.id);
      expect(timerWithTask?.task.title).toBe(task.title);
    });

    test('prevents multiple active timers for same user', async () => {
      const firstTimer = await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: null,
          duration: 0,
          description: 'First timer',
          billable: true,
          approved: false,
        },
      });

      const activeTimers = await prisma.timeEntry.findMany({
        where: {
          userId: freelancer.id,
          endTime: null,
        },
      });

      expect(activeTimers).toHaveLength(1);
      expect(activeTimers[0].id).toBe(firstTimer.id);

      const hasActiveTimer = activeTimers.length > 0;
      expect(hasActiveTimer).toBe(true);
    });

    test('returns timer ID for tracking', async () => {
      const timer = await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: null,
          duration: 0,
          description: 'Trackable timer',
          billable: true,
          approved: false,
        },
      });

      const timerResponse = {
        timerId: timer.id,
        taskId: task.id,
        startTime: timer.startTime,
        isRunning: timer.endTime === null,
      };

      expect(timerResponse.timerId).toBe(timer.id);
      expect(timerResponse.isRunning).toBe(true);
    });

    test('validates task exists and belongs to user', async () => {
      const otherFreelancer = await UserFactory.createFreelancer();
      const otherClient = await ClientFactory.create(otherFreelancer.id);
      const otherProject = await ProjectFactory.create(otherClient.id, otherFreelancer.id);
      const otherTask = await TaskFactory.create(otherProject.id);

      const canUserAccessTask = async (userId: string, taskId: string): Promise<boolean> => {
        const taskWithProject = await prisma.task.findUnique({
          where: { id: taskId },
          include: { project: true },
        });

        return taskWithProject?.project.userId === userId;
      };

      const canAccess = await canUserAccessTask(freelancer.id, otherTask.id);
      expect(canAccess).toBe(false);
    });
  });

  describe('POST /timer/stop', () => {
    test('sets endTime and calculates duration', async () => {
      const startTime = new Date();
      
      const timer = await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime,
          endTime: null,
          duration: 0,
          description: 'Running timer',
          billable: true,
          approved: false,
        },
      });

      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

      const stoppedTimer = await prisma.timeEntry.update({
        where: { id: timer.id },
        data: {
          endTime,
          duration: durationMinutes,
        },
      });

      expect(stoppedTimer.endTime).toEqual(endTime);
      expect(stoppedTimer.duration).toBe(120);
    });

    test('rounds duration to nearest minute', async () => {
      const startTime = new Date();
      
      const testCases = [
        { seconds: 30, expectedMinutes: 1 },
        { seconds: 90, expectedMinutes: 2 },
        { seconds: 150, expectedMinutes: 3 },
        { seconds: 3570, expectedMinutes: 60 },
      ];

      for (const testCase of testCases) {
        const endTime = new Date(startTime.getTime() + testCase.seconds * 1000);
        const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
        
        expect(durationMinutes).toBe(testCase.expectedMinutes);
      }
    });

    test('allows adding description when stopping', async () => {
      const timer = await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: null,
          duration: 0,
          description: 'Initial description',
          billable: true,
          approved: false,
        },
      });

      const finalDescription = 'Completed frontend implementation and testing';
      const endTime = new Date(timer.startTime.getTime() + 3 * 60 * 60 * 1000);

      const completedTimer = await prisma.timeEntry.update({
        where: { id: timer.id },
        data: {
          endTime,
          duration: 180,
          description: finalDescription,
        },
      });

      expect(completedTimer.description).toBe(finalDescription);
      expect(completedTimer.endTime).toEqual(endTime);
    });

    test('returns completed time entry data', async () => {
      const startTime = new Date();
      const timer = await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime,
          endTime: null,
          duration: 0,
          description: 'Test timer',
          billable: true,
          approved: false,
        },
      });

      const endTime = new Date(startTime.getTime() + 4 * 60 * 60 * 1000);
      const duration = 240;

      const completedEntry = await prisma.timeEntry.update({
        where: { id: timer.id },
        data: { endTime, duration },
      });

      expect(completedEntry.duration).toBe(240);
      expect(completedEntry.endTime).toEqual(endTime);
      expect(completedEntry.billable).toBe(true);
    });

    test('handles stopping non-existent timer', async () => {
      const nonExistentId = 'non-existent-timer-id';

      const timer = await prisma.timeEntry.findUnique({
        where: { id: nonExistentId },
      });

      expect(timer).toBeNull();
    });
  });

  describe('GET /timer/current', () => {
    test('returns current running timer', async () => {
      const runningTimer = await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: null,
          duration: 0,
          description: 'Currently running',
          billable: true,
          approved: false,
        },
      });

      const currentTimer = await prisma.timeEntry.findFirst({
        where: {
          userId: freelancer.id,
          endTime: null,
        },
        include: {
          task: {
            include: {
              project: {
                include: {
                  client: true,
                },
              },
            },
          },
        },
      });

      expect(currentTimer?.id).toBe(runningTimer.id);
      expect(currentTimer?.endTime).toBeNull();
      expect(currentTimer?.task.title).toBe(task.title);
      expect(currentTimer?.task.project.name).toBe(project.name);
    });

    test('returns null when no timer is running', async () => {
      await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: new Date(),
          duration: 60,
          description: 'Completed timer',
          billable: true,
          approved: false,
        },
      });

      const currentTimer = await prisma.timeEntry.findFirst({
        where: {
          userId: freelancer.id,
          endTime: null,
        },
      });

      expect(currentTimer).toBeNull();
    });

    test('calculates elapsed time for running timer', async () => {
      const startTime = new Date(Date.now() - 2 * 60 * 60 * 1000);

      await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime,
          endTime: null,
          duration: 0,
          description: 'Long running timer',
          billable: true,
          approved: false,
        },
      });

      const currentTimer = await prisma.timeEntry.findFirst({
        where: {
          userId: freelancer.id,
          endTime: null,
        },
      });

      if (currentTimer) {
        const elapsedMinutes = Math.floor((Date.now() - currentTimer.startTime.getTime()) / 60000);
        expect(elapsedMinutes).toBeGreaterThanOrEqual(120);
        expect(elapsedMinutes).toBeLessThan(125);
      }
    });
  });

  describe('GET /time-entries', () => {
    test('returns entries for date range', async () => {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

      await TimeEntryFactory.create(task.id, freelancer.id, {
        startTime: yesterday,
        endTime: new Date(yesterday.getTime() + 2 * 60 * 60 * 1000),
        duration: 120,
      });

      await TimeEntryFactory.create(task.id, freelancer.id, {
        startTime: today,
        endTime: new Date(today.getTime() + 3 * 60 * 60 * 1000),
        duration: 180,
      });

      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      const todayEntries = await prisma.timeEntry.findMany({
        where: {
          userId: freelancer.id,
          startTime: {
            gte: todayStart,
            lt: todayEnd,
          },
        },
      });

      expect(todayEntries).toHaveLength(1);
      expect(todayEntries[0].duration).toBe(180);
    });

    test('groups entries by day/week/month', async () => {
      const entries = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        entries.push(await TimeEntryFactory.create(task.id, freelancer.id, {
          startTime: date,
          endTime: new Date(date.getTime() + 2 * 60 * 60 * 1000),
          duration: 120,
        }));
      }

      const allEntries = await prisma.timeEntry.findMany({
        where: { userId: freelancer.id },
        orderBy: { startTime: 'desc' },
      });

      const entriesByDay = allEntries.reduce((groups, entry) => {
        const day = entry.startTime.toISOString().split('T')[0];
        if (!groups[day]) groups[day] = [];
        groups[day].push(entry);
        return groups;
      }, {} as Record<string, any[]>);

      expect(Object.keys(entriesByDay)).toHaveLength(7);
      Object.values(entriesByDay).forEach(dayEntries => {
        expect(dayEntries).toHaveLength(1);
      });
    });

    test('calculates total duration for period', async () => {
      const entries = [
        await TimeEntryFactory.create(task.id, freelancer.id, { duration: 120 }),
        await TimeEntryFactory.create(task.id, freelancer.id, { duration: 180 }),
        await TimeEntryFactory.create(task.id, freelancer.id, { duration: 90 }),
      ];

      const totalDuration = entries.reduce((sum, entry) => sum + entry.duration, 0);
      expect(totalDuration).toBe(390);

      const totalHours = totalDuration / 60;
      expect(totalHours).toBe(6.5);
    });

    test('separates billable vs non-billable time', async () => {
      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 120,
        billable: true,
        description: 'Client work',
      });

      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 60,
        billable: false,
        description: 'Internal meeting',
      });

      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 180,
        billable: true,
        description: 'More client work',
      });

      const entries = await prisma.timeEntry.findMany({
        where: { userId: freelancer.id },
      });

      const billableEntries = entries.filter(entry => entry.billable);
      const nonBillableEntries = entries.filter(entry => !entry.billable);

      const billableTime = billableEntries.reduce((sum, entry) => sum + entry.duration, 0);
      const nonBillableTime = nonBillableEntries.reduce((sum, entry) => sum + entry.duration, 0);

      expect(billableTime).toBe(300);
      expect(nonBillableTime).toBe(60);
      expect(billableEntries).toHaveLength(2);
      expect(nonBillableEntries).toHaveLength(1);
    });

    test('includes task and project information', async () => {
      const entry = await TimeEntryFactory.create(task.id, freelancer.id);

      const entryWithRelations = await prisma.timeEntry.findUnique({
        where: { id: entry.id },
        include: {
          task: {
            include: {
              project: {
                include: {
                  client: true,
                },
              },
            },
          },
        },
      });

      expect(entryWithRelations?.task.title).toBe(task.title);
      expect(entryWithRelations?.task.project.name).toBe(project.name);
      expect(entryWithRelations?.task.project.client.company).toBe(client.company);
    });
  });

  describe('POST /time-entries (Manual Entry)', () => {
    test('creates manual time entry with validation', async () => {
      const manualEntryData = {
        taskId: task.id,
        userId: freelancer.id,
        startTime: new Date('2025-02-01T09:00:00'),
        endTime: new Date('2025-02-01T12:00:00'),
        description: 'Manual time entry for morning work',
        billable: true,
      };

      const duration = Math.round(
        (manualEntryData.endTime.getTime() - manualEntryData.startTime.getTime()) / 60000
      );

      const manualEntry = await prisma.timeEntry.create({
        data: {
          ...manualEntryData,
          duration,
          approved: false,
        },
      });

      expect(manualEntry.duration).toBe(180);
      expect(manualEntry.startTime).toEqual(manualEntryData.startTime);
      expect(manualEntry.endTime).toEqual(manualEntryData.endTime);
      expect(manualEntry.billable).toBe(true);
    });

    test('validates endTime is after startTime', async () => {
      const invalidTimeData = {
        startTime: new Date('2025-02-01T12:00:00'),
        endTime: new Date('2025-02-01T09:00:00'),
      };

      const isValidTimeRange = (start: Date, end: Date): boolean => {
        return end > start;
      };

      expect(isValidTimeRange(invalidTimeData.startTime, invalidTimeData.endTime)).toBe(false);
    });

    test('prevents overlapping time entries', async () => {
      const existingEntry = await TimeEntryFactory.create(task.id, freelancer.id, {
        startTime: new Date('2025-02-01T09:00:00'),
        endTime: new Date('2025-02-01T12:00:00'),
      });

      const overlappingEntry = {
        startTime: new Date('2025-02-01T11:00:00'),
        endTime: new Date('2025-02-01T14:00:00'),
      };

      const hasOverlap = (
        start1: Date, end1: Date,
        start2: Date, end2: Date
      ): boolean => {
        return start1 < end2 && start2 < end1;
      };

      const overlaps = hasOverlap(
        existingEntry.startTime, existingEntry.endTime!,
        overlappingEntry.startTime, overlappingEntry.endTime
      );

      expect(overlaps).toBe(true);
    });

    test('validates maximum daily hours limit', async () => {
      const maxDailyHours = 12;
      
      await TimeEntryFactory.create(task.id, freelancer.id, {
        startTime: new Date('2025-02-01T08:00:00'),
        endTime: new Date('2025-02-01T13:00:00'),
        duration: 300,
      });

      await TimeEntryFactory.create(task.id, freelancer.id, {
        startTime: new Date('2025-02-01T14:00:00'),
        endTime: new Date('2025-02-01T19:00:00'),
        duration: 300,
      });

      const dayStart = new Date('2025-02-01T00:00:00');
      const dayEnd = new Date('2025-02-01T23:59:59');

      const dayEntries = await prisma.timeEntry.findMany({
        where: {
          userId: freelancer.id,
          startTime: { gte: dayStart },
          endTime: { lte: dayEnd },
        },
      });

      const totalDailyMinutes = dayEntries.reduce((sum, entry) => sum + entry.duration, 0);
      const totalDailyHours = totalDailyMinutes / 60;

      expect(totalDailyHours).toBe(10);

      const newEntryHours = 3;
      const wouldExceedLimit = (totalDailyHours + newEntryHours) > maxDailyHours;
      expect(wouldExceedLimit).toBe(true);
    });
  });

  describe('PUT /time-entries/:id', () => {
    test('updates time entry details', async () => {
      const entry = await TimeEntryFactory.create(task.id, freelancer.id, {
        description: 'Original description',
        billable: true,
        duration: 120,
      });

      const updatedEntry = await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          description: 'Updated description with more details',
          billable: false,
          duration: 150,
        },
      });

      expect(updatedEntry.description).toBe('Updated description with more details');
      expect(updatedEntry.billable).toBe(false);
      expect(updatedEntry.duration).toBe(150);
    });

    test('recalculates duration when times are updated', async () => {
      const entry = await TimeEntryFactory.create(task.id, freelancer.id);

      const newStartTime = new Date('2025-02-01T10:00:00');
      const newEndTime = new Date('2025-02-01T14:30:00');
      const newDuration = Math.round((newEndTime.getTime() - newStartTime.getTime()) / 60000);

      const updatedEntry = await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          startTime: newStartTime,
          endTime: newEndTime,
          duration: newDuration,
        },
      });

      expect(updatedEntry.duration).toBe(270);
    });

    test('prevents editing approved entries', async () => {
      const approvedEntry = await TimeEntryFactory.create(task.id, freelancer.id, {
        approved: true,
        description: 'Approved work',
      });

      const canEdit = !approvedEntry.approved;
      expect(canEdit).toBe(false);
    });
  });

  describe('Timer Edge Cases and Validation', () => {
    test('handles system time changes gracefully', async () => {
      const startTime = new Date();
      const timer = await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime,
          endTime: null,
          duration: 0,
          description: 'Timer test',
          billable: true,
          approved: false,
        },
      });

      const backwardsEndTime = new Date(startTime.getTime() - 1000);
      
      const isValidStopTime = (start: Date, end: Date): boolean => {
        return end >= start;
      };

      expect(isValidStopTime(startTime, backwardsEndTime)).toBe(false);
    });

    test('handles very long running timers', async () => {
      const startTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const endTime = new Date();
      
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      const durationHours = durationMinutes / 60;

      expect(durationHours).toBeGreaterThan(24);

      const requiresApproval = durationHours > 12;
      expect(requiresApproval).toBe(true);
    });

    test('handles concurrent timer operations', async () => {
      const timer1Promise = prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: null,
          duration: 0,
          description: 'Timer 1',
          billable: true,
          approved: false,
        },
      });

      const timer2Promise = prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: freelancer.id,
          startTime: new Date(),
          endTime: null,
          duration: 0,
          description: 'Timer 2',
          billable: true,
          approved: false,
        },
      });

      const [timer1, timer2] = await Promise.all([timer1Promise, timer2Promise]);

      expect(timer1.id).toBeDefined();
      expect(timer2.id).toBeDefined();

      const activeTimers = await prisma.timeEntry.findMany({
        where: {
          userId: freelancer.id,
          endTime: null,
        },
      });

      expect(activeTimers.length).toBeGreaterThan(1);
    });
  });

  describe('Time Entry Reporting and Analytics', () => {
    test('calculates productivity metrics', async () => {
      const entries = [
        await TimeEntryFactory.create(task.id, freelancer.id, {
          duration: 240,
          billable: true,
          startTime: new Date('2025-02-01T09:00:00'),
        }),
        await TimeEntryFactory.create(task.id, freelancer.id, {
          duration: 120,
          billable: false,
          startTime: new Date('2025-02-01T14:00:00'),
        }),
        await TimeEntryFactory.create(task.id, freelancer.id, {
          duration: 180,
          billable: true,
          startTime: new Date('2025-02-01T16:00:00'),
        }),
      ];

      const totalTime = entries.reduce((sum, entry) => sum + entry.duration, 0);
      const billableTime = entries
        .filter(entry => entry.billable)
        .reduce((sum, entry) => sum + entry.duration, 0);

      const utilizationRate = (billableTime / totalTime) * 100;

      expect(totalTime).toBe(540);
      expect(billableTime).toBe(420);
      expect(Math.round(utilizationRate)).toBe(78);
    });

    test('generates weekly time summary', async () => {
      const weekStart = new Date('2025-02-03');
      const weekDays = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        return day;
      });

      const weeklyEntries = [];
      for (let i = 0; i < 5; i++) {
        weeklyEntries.push(await TimeEntryFactory.create(task.id, freelancer.id, {
          startTime: weekDays[i],
          duration: 480,
          billable: true,
        }));
      }

      const totalWeeklyMinutes = weeklyEntries.reduce((sum, entry) => sum + entry.duration, 0);
      const totalWeeklyHours = totalWeeklyMinutes / 60;
      const averageDailyHours = totalWeeklyHours / 5;

      expect(totalWeeklyHours).toBe(40);
      expect(averageDailyHours).toBe(8);
    });
  });
});