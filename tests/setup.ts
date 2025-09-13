import { beforeAll, beforeEach, afterAll, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

jest.mock('openai');
jest.mock('puppeteer');

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';
  process.env.DATABASE_URL = 'postgresql:
  
  jest.setTimeout(30000);
});

beforeEach(async () => {
  jest.clearAllMocks();
});

afterEach(async () => {
  jest.resetModules();
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});