import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { generateAccessToken, generateRefreshToken, hashPassword, comparePassword, verifyRefreshToken } from '../utils/auth';
import { emailSchema, passwordSchema } from '../utils/validation';
import { ApiResponse } from '../types/express';

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1, { message: 'First name is required' }),
  lastName: z.string().min(1, { message: 'Last name is required' }),
  role: z.nativeEnum(UserRole),
  company: z.string().optional(),
  hourlyRate: z.coerce.number().positive().optional()
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Password is required' })
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, { message: 'Refresh token is required' })
});

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email }
    });

    if (existingUser) {
      throw new CustomError('User with this email already exists', 409);
    }

    const hashedPassword = await hashPassword(validatedData.password);

    const user = await prisma.user.create({
      data: {
        ...validatedData,
        password: hashedPassword
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        company: true,
        hourlyRate: true,
        avatar: true,
        createdAt: true
      }
    });

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const response: ApiResponse = {
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        tokens: {
          accessToken,
          refreshToken
        }
      }
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email, isActive: true }
    });

    if (!user) {
      throw new CustomError('Invalid email or password', 401);
    }

    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      throw new CustomError('Invalid email or password', 401);
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const { password: _, ...userWithoutPassword } = user;

    const response: ApiResponse = {
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        tokens: {
          accessToken,
          refreshToken
        }
      }
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);

    const decoded = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, isActive: true },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        company: true,
        hourlyRate: true,
        avatar: true
      }
    });

    if (!user) {
      throw new CustomError('User not found or inactive', 401);
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    const response: ApiResponse = {
      success: true,
      message: 'Tokens refreshed successfully',
      data: {
        user,
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken
        }
      }
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const response: ApiResponse = {
      success: true,
      message: 'Logged out successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};