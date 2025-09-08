import { Request } from 'express';
import { User, Client } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      client?: Client;
      timer?: {
        id: string;
        taskId: string;
        startTime: Date;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: User;
  params: any;
  query: any;
}

export interface ClientAuthenticatedRequest extends Request {
  client: Client;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface FilterParams extends PaginationParams {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}