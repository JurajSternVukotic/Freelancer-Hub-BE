import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TaskStatus, TaskPriority } from '@prisma/client';
import prisma from '../config/database';
import { TaskService, ReorderTaskData } from '../services/taskService';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/express';
import { calculatePagination, getPaginationMeta } from '../utils/pagination';
import { paginationSchema, uuidSchema, positiveDecimalSchema } from '../utils/validation';

const createTaskSchema = z.object({
  projectId: uuidSchema,
  title: z.string().min(1, { message: 'Task title is required' }),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.TODO),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  dueDate: z.coerce.date().optional(),
  estimatedHours: positiveDecimalSchema.optional()
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: z.coerce.date().optional(),
  estimatedHours: positiveDecimalSchema.optional()
});

const reorderTasksSchema = z.object({
  tasks: z.array(z.object({
    id: uuidSchema,
    status: z.nativeEnum(TaskStatus),
    position: z.number().min(0)
  }))
});

export const getTasks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const projectId = req.query.projectId as string;
    const statusParam = req.query.status;
    const priority = req.query.priority as TaskPriority;

    const where: any = {
      deletedAt: null,
      project: {
        ownerId: req.user!.id,
        deletedAt: null
      }
    };

    if (projectId) {
      where.projectId = projectId;
    }

    if (statusParam) {
      if (Array.isArray(statusParam)) {
        where.status = { in: statusParam as TaskStatus[] };
      } else {
        where.status = statusParam as TaskStatus;
      }
    }

    if (priority) {
      where.priority = priority;
    }

    const total = await prisma.task.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = [{ position: 'asc' }, { createdAt: 'desc' }];
    if (sort) {
      orderBy = { [sort]: order };
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                company: true
              }
            }
          }
        },
        _count: {
          select: {
            timeEntries: { where: { deletedAt: null } }
          }
        }
      }
    });


    const response: ApiResponse = {
      success: true,
      data: tasks,
      pagination: getPaginationMeta(pagination)
    };

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('ETag', `"tasks-${Date.now()}"`);
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const createTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createTaskSchema.parse(req.body);

    const project = await prisma.project.findFirst({
      where: {
        id: validatedData.projectId,
        ownerId: req.user!.id,
        deletedAt: null
      }
    });

    if (!project) {
      throw new CustomError('Project not found or access denied', 404);
    }

    const position = await TaskService.getNextPosition(validatedData.projectId, validatedData.status);

    const task = await prisma.task.create({
      data: {
        ...validatedData,
        position
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                company: true
              }
            }
          }
        },
        _count: {
          select: {
            timeEntries: { where: { deletedAt: null } }
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Task created successfully',
      data: task
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const task = await prisma.task.findFirst({
      where: {
        id,
        deletedAt: null,
        project: {
          ownerId: req.user!.id,
          deletedAt: null
        }
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                company: true
              }
            }
          }
        },
        timeEntries: {
          where: { deletedAt: null },
          orderBy: { startTime: 'desc' },
          take: 10
        }
      }
    });

    if (!task) {
      throw new CustomError('Task not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: task
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const validatedData = updateTaskSchema.parse(req.body);

    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        deletedAt: null,
        project: {
          ownerId: req.user!.id,
          deletedAt: null
        }
      }
    });

    if (!existingTask) {
      throw new CustomError('Task not found', 404);
    }

    let updateData: any = { ...validatedData };

    if (validatedData.status && validatedData.status !== existingTask.status) {
      updateData.position = await TaskService.getNextPosition(existingTask.projectId, validatedData.status);
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                company: true
              }
            }
          }
        },
        _count: {
          select: {
            timeEntries: { where: { deletedAt: null } }
          }
        }
      }
    });

    if (validatedData.status && validatedData.status !== existingTask.status) {
      await TaskService.normalizePositions(existingTask.projectId, existingTask.status);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Task updated successfully',
      data: updatedTask
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const deleteTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const task = await prisma.task.findFirst({
      where: {
        id,
        deletedAt: null,
        project: {
          ownerId: req.user!.id,
          deletedAt: null
        }
      }
    });

    if (!task) {
      throw new CustomError('Task not found', 404);
    }

    const activeTimeEntries = await prisma.timeEntry.count({
      where: {
        taskId: id,
        endTime: null,
        deletedAt: null
      }
    });

    if (activeTimeEntries > 0) {
      throw new CustomError('Cannot delete task with active time tracking', 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.updateMany({
        where: {
          taskId: id,
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });

      await tx.task.update({
        where: { id },
        data: { deletedAt: new Date() }
      });
    });

    await TaskService.normalizePositions(task.projectId, task.status);

    const response: ApiResponse = {
      success: true,
      message: 'Task deleted successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const reorderTasks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tasks } = reorderTasksSchema.parse(req.body);

    const updatedTasks = await TaskService.reorderTasks(req.user!.id, tasks);

    const response: ApiResponse = {
      success: true,
      message: 'Tasks reordered successfully',
      data: {
        updatedTasks
      }
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};