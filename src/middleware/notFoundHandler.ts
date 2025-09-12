import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/express';

export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const response: ApiResponse = {
    success: false,
    message: `Route ${req.originalUrl} not found`
  };

  res.status(404).json(response);
};