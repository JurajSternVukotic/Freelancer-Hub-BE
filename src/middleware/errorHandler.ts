import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiResponse } from '../types/express';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  statusCode: number;
  status: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error = { ...err };
  error.message = err.message;

  if (process.env.NODE_ENV === 'development') {
    console.error('Error Stack:', err.stack);
  }
  console.error('Error:', err);

  if (err.name === 'ValidationError') {
    const message = 'Validation Error';
    error = new CustomError(message, 400);
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    const message = 'Invalid data provided';
    error = new CustomError(message, 400);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        const message = `Duplicate field value: ${err.meta?.target}. Please use another value.`;
        error = new CustomError(message, 400);
        break;
      case 'P2025':
        error = new CustomError('Record not found', 404);
        break;
      case 'P2003':
        error = new CustomError('Invalid reference provided', 400);
        break;
      default:
        error = new CustomError('Database operation failed', 400);
    }
  }

  if (err instanceof ZodError) {
    const message = 'Validation failed';
    const errors = err.errors.map(error => `${error.path.join('.')}: ${error.message}`);
    const response: ApiResponse = {
      success: false,
      message,
      errors
    };
    res.status(400).json(response);
    return;
  }

  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please log in again!';
    error = new CustomError(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Your token has expired! Please log in again.';
    error = new CustomError(message, 401);
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Something went wrong!';

  const response: ApiResponse = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  res.status(statusCode).json(response);
};