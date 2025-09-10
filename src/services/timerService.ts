import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';

export interface CreateTimerData {
  taskId: string;
  description?: string;
}

export class TimerService {
  static async startTimer(userId: string, data: CreateTimerData) {
    const activeTimer = await prisma.timeEntry.findFirst({
      where: {
        userId,
        endTime: null,
      },
    });

    if (activeTimer) {
      throw new CustomError('You already have an active timer running', 409);
    }

    const task = await prisma.task.findFirst({
      where: {
        id: data.taskId,
        project: {
          ownerId: userId,
        },
      },
    });

    if (!task) {
      throw new CustomError('Task not found or access denied', 404);
    }

    const timer = await prisma.timeEntry.create({
      data: {
        userId,
        taskId: data.taskId,
        description: data.description || '',
        startTime: new Date(),
        billable: true,
        duration: 0,
      },
      include: {
        task: {
          include: {
            project: true,
          },
        },
      },
    });

    return {
      id: timer.id,
      taskId: timer.taskId,
      userId: timer.userId,
      startTime: timer.startTime.toISOString(),
      description: timer.description,
      isRunning: true,
      task: {
        id: timer.task.id,
        title: timer.task.title,
        project: {
          id: timer.task.project.id,
          name: timer.task.project.name
        }
      }
    };
  }

  static async stopTimer(userId: string) {
    const activeTimer = await prisma.timeEntry.findFirst({
      where: {
        userId,
        endTime: null,
      },
    });

    if (!activeTimer) {
      throw new CustomError('No active timer found', 404);
    }

    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - activeTimer.startTime.getTime()) / 1000);

    const timer = await prisma.timeEntry.update({
      where: {
        id: activeTimer.id,
      },
      data: {
        endTime,
        duration,
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

    return timer;
  }

  static async getCurrentTimer(userId: string) {
    const activeTimer = await prisma.timeEntry.findFirst({
      where: {
        userId,
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

    if (activeTimer) {
        return {
        id: activeTimer.id,
        taskId: activeTimer.taskId,
        userId: activeTimer.userId,
        startTime: activeTimer.startTime.toISOString(),
        description: activeTimer.description,
        isRunning: true,
        task: {
          id: activeTimer.task.id,
          title: activeTimer.task.title,
          project: {
            id: activeTimer.task.project.id,
            name: activeTimer.task.project.name
          }
        }
      };
    }

    return null;
  }
}