import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/express';
import { calculatePagination, getPaginationMeta } from '../utils/pagination';
import { paginationSchema, uuidSchema, positiveDecimalSchema } from '../utils/validation';

const createTimeEntrySchema = z.object({
  taskId: uuidSchema,
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  description: z.string().optional(),
  billable: z.boolean().default(true)
}).refine((data) => {
  return data.endTime > data.startTime;
}, {
  message: 'End time must be after start time',
  path: ['endTime']
});

const updateTimeEntrySchema = z.object({
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  description: z.string().optional(),
  billable: z.boolean().optional()
}).refine((data) => {
  if (data.startTime && data.endTime && data.endTime <= data.startTime) {
    return false;
  }
  return true;
}, {
  message: 'End time must be after start time',
  path: ['endTime']
});

export const getTimeEntries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const taskId = req.query.taskId as string;
    const projectId = req.query.projectId as string;
    const billable = req.query.billable === 'true' ? true : req.query.billable === 'false' ? false : undefined;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;

    const where: any = {
      userId: req.user!.id,
      deletedAt: null
    };

    if (taskId) {
      where.taskId = taskId;
    }

    if (projectId) {
      where.task = {
        projectId,
        deletedAt: null
      };
    }

    if (billable !== undefined) {
      where.billable = billable;
    }

    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) {
        where.startTime.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.startTime.lte = new Date(dateTo);
      }
    }

    const total = await prisma.timeEntry.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = { startTime: 'desc' };
    if (sort) {
      if (sort.startsWith('-')) {
        const field = sort.substring(1);
        orderBy = { [field]: 'desc' };
      } else {
        orderBy = { [sort]: order };
      }
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        task: {
          select: {
            id: true,
            title: true,
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
            }
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      data: timeEntries,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const createTimeEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createTimeEntrySchema.parse(req.body);
    const userId = req.user!.id;

    const task = await prisma.task.findFirst({
      where: {
        id: validatedData.taskId,
        deletedAt: null,
        project: {
          ownerId: userId,
          deletedAt: null
        }
      }
    });

    if (!task) {
      throw new CustomError('Task not found or access denied', 404);
    }

    const duration = Math.round((validatedData.endTime.getTime() - validatedData.startTime.getTime()) / 1000);

    if (duration <= 0) {
      throw new CustomError('Duration must be greater than 0', 400);
    }

    const timeEntry = await prisma.timeEntry.create({
      data: {
        ...validatedData,
        userId,
        duration
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
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
            }
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Time entry created successfully',
      data: timeEntry
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getTimeEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const timeEntry = await prisma.timeEntry.findFirst({
      where: {
        id,
        userId: req.user!.id,
        deletedAt: null
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
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
            }
          }
        }
      }
    });

    if (!timeEntry) {
      throw new CustomError('Time entry not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: timeEntry
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const updateTimeEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const validatedData = updateTimeEntrySchema.parse(req.body);

    const existingTimeEntry = await prisma.timeEntry.findFirst({
      where: {
        id,
        userId: req.user!.id,
        deletedAt: null
      }
    });

    if (!existingTimeEntry) {
      throw new CustomError('Time entry not found', 404);
    }

    if (!existingTimeEntry.endTime) {
      throw new CustomError('Cannot update a running timer. Stop the timer first.', 400);
    }

    let updateData: any = { ...validatedData };

    if (validatedData.startTime || validatedData.endTime) {
      const startTime = validatedData.startTime || existingTimeEntry.startTime;
      const endTime = validatedData.endTime || existingTimeEntry.endTime!;
      
      updateData.duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
      
      if (updateData.duration <= 0) {
        throw new CustomError('Duration must be greater than 0', 400);
      }
    }

    const updatedTimeEntry = await prisma.timeEntry.update({
      where: { id },
      data: updateData,
      include: {
        task: {
          select: {
            id: true,
            title: true,
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
            }
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Time entry updated successfully',
      data: updatedTimeEntry
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const deleteTimeEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const timeEntry = await prisma.timeEntry.findFirst({
      where: {
        id,
        userId: req.user!.id,
        deletedAt: null
      }
    });

    if (!timeEntry) {
      throw new CustomError('Time entry not found', 404);
    }

    if (!timeEntry.endTime) {
      throw new CustomError('Cannot delete a running timer. Stop the timer first.', 400);
    }

    await prisma.timeEntry.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Time entry deleted successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};