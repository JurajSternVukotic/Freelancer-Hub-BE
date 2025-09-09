import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { AuthenticatedRequest, ApiResponse } from '../types/express';
import { calculatePagination, getPaginationMeta } from '../utils/pagination';
import { paginationSchema, emailSchema } from '../utils/validation';

const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  company: z.string().optional(),
  hourlyRate: z.coerce.number().positive().optional(),
  avatar: z.string().url().optional()
});

export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        company: true,
        hourlyRate: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      throw new CustomError('User not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: user
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = updateUserSchema.parse(req.body);

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: validatedData,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        company: true,
        hourlyRate: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const search = req.query.search as string;

    const where: any = { isActive: true };
    
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } }
      ];
    }

    const total = await prisma.user.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = { createdAt: 'desc' };
    if (sort) {
      orderBy = { [sort]: order };
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        company: true,
        hourlyRate: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy,
      skip: pagination.skip,
      take: pagination.limit
    });

    const response: ApiResponse = {
      success: true,
      data: users,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};