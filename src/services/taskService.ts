import { PrismaClient, TaskStatus, Task } from '@prisma/client';
import { CustomError } from '../middleware/errorHandler';
import prisma from '../config/database';

export interface ReorderTaskData {
  id: string;
  status: TaskStatus;
  position: number;
}

export class TaskService {
  static async reorderTasks(userId: string, tasks: ReorderTaskData[]): Promise<Task[]> {
    const taskIds = tasks.map(t => t.id);
    
    const existingTasks = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
        deletedAt: null,
        project: {
          ownerId: userId,
          deletedAt: null
        }
      }
    });

    if (existingTasks.length !== taskIds.length) {
      throw new CustomError('Some tasks not found or access denied', 404);
    }

    const tasksByStatus = tasks.reduce((acc, task) => {
      if (!acc[task.status]) {
        acc[task.status] = [];
      }
      acc[task.status].push(task);
      return acc;
    }, {} as Record<TaskStatus, ReorderTaskData[]>);

    Object.values(tasksByStatus).forEach(statusTasks => {
      statusTasks
        .sort((a, b) => a.position - b.position)
        .forEach((task, index) => {
          task.position = index;
        });
    });

    const updatedTasks = await prisma.$transaction(
      tasks.map(task =>
        prisma.task.update({
          where: { id: task.id },
          data: {
            status: task.status,
            position: task.position
          },
          include: {
            project: {
              select: {
                id: true,
                name: true
              }
            },
            _count: {
              select: {
                timeEntries: { where: { deletedAt: null } }
              }
            }
          }
        })
      )
    );

    return updatedTasks;
  }

  static async getNextPosition(projectId: string, status: TaskStatus): Promise<number> {
    const maxPosition = await prisma.task.aggregate({
      _max: {
        position: true
      },
      where: {
        projectId,
        status,
        deletedAt: null
      }
    });

    return (maxPosition._max.position || 0) + 1;
  }

  static async normalizePositions(projectId: string, status: TaskStatus): Promise<void> {
    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        status,
        deletedAt: null
      },
      orderBy: {
        position: 'asc'
      }
    });

    await prisma.$transaction(
      tasks.map((task, index) =>
        prisma.task.update({
          where: { id: task.id },
          data: { position: index }
        })
      )
    );
  }
}