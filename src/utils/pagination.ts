import { PaginationParams } from '../types/express';

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  pages: number;
  skip: number;
}

export const calculatePagination = (
  params: PaginationParams,
  total: number
): PaginationResult => {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 10));
  const pages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    total,
    pages,
    skip
  };
};

export const getPaginationMeta = (pagination: PaginationResult) => {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total: pagination.total,
    pages: pagination.pages
  };
};