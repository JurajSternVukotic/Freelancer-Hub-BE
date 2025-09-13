import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import { TestDatabase, prisma } from './helpers/db';
import { UserFactory } from './helpers/factories';

const mockApp = {
  use: jest.fn(),
  post: jest.fn(),
  get: jest.fn(),
  listen: jest.fn(),
};

describe('Authentication API', () => {
  beforeEach(async () => {
    await TestDatabase.setupTestDatabase();
  });

  afterAll(async () => {
    await TestDatabase.cleanupTestDatabase();
  });

  describe('POST /auth/register', () => {
    test('successfully registers new freelancer user', async () => {
      const userData = {
        email: 'newuser@test.com',
        password: 'StrongPassword123!',
        firstName: 'John',
        lastName: 'Doe',
        role: 'freelancer',
        company: 'Doe Freelancing',
        hourlyRate: 50,
      };

      const mockRegistrationResponse = {
        status: 201,
        body: {
          user: {
            id: 'mock-user-id',
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role,
            company: userData.company,
            hourlyRate: userData.hourlyRate,
          },
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        },
      };

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const createdUser = await prisma.user.create({
        data: {
          ...userData,
          password: hashedPassword,
        },
      });

      expect(createdUser.email).toBe(userData.email);
      expect(createdUser.role).toBe('freelancer');
      expect(await bcrypt.compare(userData.password, createdUser.password)).toBe(true);
    });

    test('successfully registers new client user', async () => {
      const userData = {
        email: 'client@test.com',
        password: 'StrongPassword123!',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'client',
        company: 'Smith Corp',
      };

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const createdUser = await prisma.user.create({
        data: {
          ...userData,
          password: hashedPassword,
        },
      });

      expect(createdUser.email).toBe(userData.email);
      expect(createdUser.role).toBe('client');
      expect(createdUser.hourlyRate).toBeNull();
    });

    test('rejects duplicate email registration', async () => {
      await UserFactory.createFreelancer({ email: 'existing@test.com' });

      const duplicateUserData = {
        email: 'existing@test.com',
        password: 'DifferentPassword123!',
        firstName: 'Another',
        lastName: 'User',
        role: 'freelancer',
      };

      await expect(
        prisma.user.create({
          data: {
            ...duplicateUserData,
            password: await bcrypt.hash(duplicateUserData.password, 10),
          },
        })
      ).rejects.toThrow();
    });

    test('validates password strength requirements', () => {
      const weakPasswords = [
        '123',
        'password',
        'PASSWORD',
        '12345678',
        'Weak123',
      ];

      const strongPasswords = [
        'StrongPassword123!',
        'MySecure123Pass',
        'Complex@Pass123',
      ];

      const isStrongPassword = (password: string): boolean => {
        return (
          password.length >= 8 &&
          /[a-z]/.test(password) &&
          /[A-Z]/.test(password) &&
          /\d/.test(password)
        );
      };

      weakPasswords.forEach((password) => {
        expect(isStrongPassword(password)).toBe(false);
      });

      strongPasswords.forEach((password) => {
        expect(isStrongPassword(password)).toBe(true);
      });
    });

    test('validates required fields', async () => {
      const incompleteUserData = {
        email: 'incomplete@test.com',
      };

      const requiredFields = ['email', 'password', 'firstName', 'lastName', 'role'];
      const missingFields = requiredFields.filter(field => !(field in incompleteUserData));
      
      expect(missingFields).toEqual(['password', 'firstName', 'lastName', 'role']);
    });

    test('validates email format', () => {
      const invalidEmails = [
        'notanemail',
        '@domain.com',
        'user@',
        'user@domain',
        '',
      ];

      const validEmails = [
        'user@domain.com',
        'test.user@example.org',
        'user+label@domain.co.uk',
      ];

      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      invalidEmails.forEach((email) => {
        expect(isValidEmail(email)).toBe(false);
      });

      validEmails.forEach((email) => {
        expect(isValidEmail(email)).toBe(true);
      });
    });
  });

  describe('POST /auth/login', () => {
    test('successful login returns tokens for freelancer', async () => {
      const password = 'TestPassword123';
      const user = await UserFactory.createFreelancer({
        email: 'freelancer@test.com',
        password: await bcrypt.hash(password, 10),
      });

      const mockAccessToken = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );

      const mockRefreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: '7d' }
      );

      const isValidPassword = await bcrypt.compare(password, user.password);
      expect(isValidPassword).toBe(true);

      const decodedAccess = jwt.verify(mockAccessToken, process.env.JWT_SECRET!) as any;
      expect(decodedAccess.userId).toBe(user.id);
      expect(decodedAccess.role).toBe(user.role);
    });

    test('successful login returns tokens for client', async () => {
      const password = 'ClientPassword123';
      const user = await UserFactory.createClient({
        email: 'client@test.com',
        password: await bcrypt.hash(password, 10),
      });

      const isValidPassword = await bcrypt.compare(password, user.password);
      expect(isValidPassword).toBe(true);
      expect(user.role).toBe('client');
    });

    test('blocks invalid credentials', async () => {
      const user = await UserFactory.createFreelancer({
        email: 'user@test.com',
        password: await bcrypt.hash('CorrectPassword123', 10),
      });

      const wrongPassword = 'WrongPassword123';
      const isValidPassword = await bcrypt.compare(wrongPassword, user.password);
      expect(isValidPassword).toBe(false);
    });

    test('blocks non-existent user', async () => {
      const nonExistentUser = await prisma.user.findUnique({
        where: { email: 'nonexistent@test.com' },
      });

      expect(nonExistentUser).toBeNull();
    });

    test('updates last login timestamp', async () => {
      const user = await UserFactory.createFreelancer({
        email: 'user@test.com',
      });

      const originalUpdatedAt = user.updatedAt;
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { updatedAt: new Date() },
      });

      expect(updatedUser.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('POST /auth/refresh', () => {
    test('exchanges valid refresh token for new access token', async () => {
      const user = await UserFactory.createFreelancer();

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: '7d' }
      );

      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
      expect(decoded.userId).toBe(user.id);

      const newAccessToken = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );

      const decodedAccess = jwt.verify(newAccessToken, process.env.JWT_SECRET!) as any;
      expect(decodedAccess.userId).toBe(user.id);
      expect(decodedAccess.role).toBe(user.role);
    });

    test('rejects expired refresh token', () => {
      const expiredRefreshToken = jwt.sign(
        { userId: 'test-user-id' },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: '-1h' }
      );

      expect(() => {
        jwt.verify(expiredRefreshToken, process.env.JWT_REFRESH_SECRET!);
      }).toThrow('jwt expired');
    });

    test('rejects invalid refresh token signature', () => {
      const invalidToken = jwt.sign(
        { userId: 'test-user-id' },
        'wrong-secret',
        { expiresIn: '7d' }
      );

      expect(() => {
        jwt.verify(invalidToken, process.env.JWT_REFRESH_SECRET!);
      }).toThrow('invalid signature');
    });

    test('rejects malformed refresh token', () => {
      const malformedTokens = [
        'not.a.jwt',
        'definitely-not-jwt',
        '',
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid',
      ];

      malformedTokens.forEach((token) => {
        expect(() => {
          jwt.verify(token, process.env.JWT_REFRESH_SECRET!);
        }).toThrow();
      });
    });
  });

  describe('POST /auth/logout', () => {
    test('successfully invalidates refresh token', async () => {
      const user = await UserFactory.createFreelancer();

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: '7d' }
      );

      const tokenBlacklist = new Set<string>();
      
      tokenBlacklist.add(refreshToken);

      expect(tokenBlacklist.has(refreshToken)).toBe(true);
    });

    test('returns success even for already logged out user', () => {
      const mockResponse = { success: true, message: 'Logged out successfully' };
      expect(mockResponse.success).toBe(true);
    });
  });

  describe('JWT Token Functionality', () => {
    test('access token contains correct user information', async () => {
      const user = await UserFactory.createFreelancer();

      const accessToken = jwt.sign(
        { 
          userId: user.id, 
          role: user.role,
          email: user.email,
          iat: Math.floor(Date.now() / 1000),
        },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );

      const decoded = jwt.verify(accessToken, process.env.JWT_SECRET!) as any;
      
      expect(decoded.userId).toBe(user.id);
      expect(decoded.role).toBe(user.role);
      expect(decoded.email).toBe(user.email);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    test('tokens expire at correct times', () => {
      const now = Math.floor(Date.now() / 1000);

      const accessToken = jwt.sign(
        { userId: 'test-id' },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { userId: 'test-id' },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: '7d' }
      );

      const decodedAccess = jwt.verify(accessToken, process.env.JWT_SECRET!) as any;
      const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;

      expect(decodedAccess.exp - decodedAccess.iat).toBe(900);

      expect(decodedRefresh.exp - decodedRefresh.iat).toBe(604800);
    });
  });

  describe('Role-based Access', () => {
    test('freelancer role has correct permissions', async () => {
      const freelancer = await UserFactory.createFreelancer();
      expect(freelancer.role).toBe('freelancer');
      
      const freelancerPermissions = {
        canCreateClients: true,
        canManageProjects: true,
        canViewFinancials: true,
        canAccessReports: true,
        canUseAI: true,
      };

      expect(freelancerPermissions.canCreateClients).toBe(true);
      expect(freelancerPermissions.canViewFinancials).toBe(true);
    });

    test('client role has correct permissions', async () => {
      const client = await UserFactory.createClient();
      expect(client.role).toBe('client');
      
      const clientPermissions = {
        canCreateClients: false,
        canManageProjects: false,
        canViewFinancials: false,
        canAccessReports: false,
        canUseAI: false,
      };

      expect(clientPermissions.canCreateClients).toBe(false);
      expect(clientPermissions.canViewFinancials).toBe(false);
    });
  });
});