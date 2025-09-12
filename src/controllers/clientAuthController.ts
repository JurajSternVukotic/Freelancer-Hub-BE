import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/express';

const clientRegisterSchema = z.object({
  company: z.string().min(1, 'Company name is required'),
  contactPerson: z.string().min(1, 'Contact person is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default('Hrvatska'),
  oib: z.string().optional()
});

const clientLoginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required')
});

/**
 * Client registration - allows clients to register for portal access
 * POST /client-auth/register
 */
export const registerClient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = clientRegisterSchema.parse(req.body);
    
    const existingClient = await prisma.client.findUnique({
      where: { email: validatedData.email }
    });
    
    if (existingClient) {
      throw new CustomError('Client with this email already exists', 400);
    }
    
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);
    
    const client = await prisma.client.create({
      data: {
        ...validatedData,
        password: hashedPassword,
        canLogin: true
      },
      select: {
        id: true,
        company: true,
        contactPerson: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        country: true,
        canLogin: true,
        createdAt: true
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Client registered successfully. Please wait for freelancer assignment.',
      data: client
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Client login
 * POST /client-auth/login
 */
export const loginClient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = clientLoginSchema.parse(req.body);
    
    const client = await prisma.client.findUnique({
      where: { 
        email,
        canLogin: true,
        isActive: true,
        deletedAt: null
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true
          }
        }
      }
    });
    
    if (!client || !client.password) {
      throw new CustomError('Invalid email or password', 401);
    }
    
    const isValidPassword = await bcrypt.compare(password, client.password);
    if (!isValidPassword) {
      throw new CustomError('Invalid email or password', 401);
    }
    
    const token = jwt.sign(
      { 
        clientId: client.id,
        email: client.email,
        type: 'client'
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
    
    const response: ApiResponse = {
      success: true,
      message: 'Login successful',
      data: {
        client: {
          id: client.id,
          company: client.company,
          contactPerson: client.contactPerson,
          email: client.email,
          phone: client.phone,
          assignedFreelancer: client.user
        },
        token
      }
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get client profile
 * GET /client-auth/profile
 */
export const getClientProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.client!.id;
    
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true
          }
        },
        projects: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            status: true,
            priority: true,
            startDate: true,
            endDate: true,
            description: true
          }
        },
        invoices: {
          where: { deletedAt: null },
          select: {
            id: true,
            number: true,
            total: true,
            status: true,
            date: true,
            dueDate: true
          },
          orderBy: { date: 'desc' },
          take: 10
        }
      }
    });
    
    if (!client) {
      throw new CustomError('Client not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: client
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};