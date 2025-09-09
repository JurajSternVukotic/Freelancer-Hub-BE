import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import prisma from '../config/database';
import { JWT_CONFIG } from '../config/jwt';
import { CustomError } from './errorHandler';
import { TokenPayload } from '../types/express';

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new CustomError('Access token is required', 401);
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new CustomError('Access token is required', 401);
    }

    const decoded = jwt.verify(token, JWT_CONFIG.ACCESS_TOKEN_SECRET) as TokenPayload;
    
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
        avatar: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true
      }
    });

    if (!user) {
      throw new CustomError('User not found or inactive', 401);
    }

    req.user = user as any;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new CustomError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new CustomError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

export const authorize = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new CustomError('Authentication required', 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new CustomError('Insufficient permissions', 403);
    }

    next();
  };
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, JWT_CONFIG.ACCESS_TOKEN_SECRET) as TokenPayload;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, isActive: true }
    });

    if (user) {
      req.user = user as any;
    }

    next();
  } catch (error) {
    next();
  }
};