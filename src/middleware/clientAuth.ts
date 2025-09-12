import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { CustomError } from './errorHandler';
import { ClientAuthenticatedRequest } from '../types/express';

interface ClientTokenPayload {
  clientId: string;
  email: string;
  type: string;
  iat: number;
  exp: number;
}

/**
 * Middleware to authenticate client requests
 */
export const authenticateClient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new CustomError('Access token is required', 401);
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as ClientTokenPayload;
    
    if (decoded.type !== 'client') {
      throw new CustomError('Invalid token type', 401);
    }

    const client = await prisma.client.findUnique({
      where: {
        id: decoded.clientId,
        email: decoded.email,
        canLogin: true,
        isActive: true,
        deletedAt: null
      }
    });

    if (!client) {
      throw new CustomError('Client not found or access denied', 401);
    }

    req.client = client;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new CustomError('Invalid token', 401));
    } else {
      next(error);
    }
  }
};