import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/express';
import { calculatePagination, getPaginationMeta } from '../utils/pagination';
import { paginationSchema, uuidSchema } from '../utils/validation';

const createExpenseSchema = z.object({
  projectId: uuidSchema,
  date: z.coerce.date(),
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().min(1),
  receipt: z.string().url().optional(),
  billable: z.boolean().default(true)
});

const updateExpenseSchema = z.object({
  projectId: uuidSchema.optional(),
  date: z.coerce.date().optional(),
  amount: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  receipt: z.string().url().optional(),
  billable: z.boolean().optional()
});

export const getExpenses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const projectId = req.query.projectId as string;
    const category = req.query.category as string;
    const search = req.query.search as string;

    const where: any = {
      userId: req.user!.id,
      deletedAt: null
    };

    if (projectId) {
      where.projectId = projectId;
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } }
      ];
    }

    const total = await prisma.expense.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = { date: 'desc' };
    if (sort) {
      if (sort.startsWith('-')) {
        const field = sort.substring(1);
        orderBy = { [field]: 'desc' };
      } else {
        orderBy = { [sort]: order };
      }
    }

    const expenses = await prisma.expense.findMany({
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
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      data: expenses,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const createExpense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createExpenseSchema.parse(req.body);
    const userId = req.user!.id;

    const project = await prisma.project.findFirst({
      where: {
        id: validatedData.projectId,
        ownerId: userId,
        deletedAt: null
      }
    });

    if (!project) {
      throw new CustomError('Project not found or access denied', 404);
    }

    const expense = await prisma.expense.create({
      data: {
        ...validatedData,
        userId
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
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Expense created successfully',
      data: expense
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getExpense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const expense = await prisma.expense.findFirst({
      where: {
        id,
        userId: req.user!.id,
        deletedAt: null
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
        }
      }
    });

    if (!expense) {
      throw new CustomError('Expense not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: expense
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const updateExpense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const validatedData = updateExpenseSchema.parse(req.body);

    const existingExpense = await prisma.expense.findFirst({
      where: {
        id,
        userId: req.user!.id,
        deletedAt: null
      }
    });

    if (!existingExpense) {
      throw new CustomError('Expense not found', 404);
    }

    if (validatedData.projectId) {
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
    }

    const updatedExpense = await prisma.expense.update({
      where: { id },
      data: validatedData,
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
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Expense updated successfully',
      data: updatedExpense
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const deleteExpense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const expense = await prisma.expense.findFirst({
      where: {
        id,
        userId: req.user!.id,
        deletedAt: null
      }
    });

    if (!expense) {
      throw new CustomError('Expense not found', 404);
    }

    await prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Expense deleted successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};