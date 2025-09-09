import { Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse, AuthenticatedRequest } from '../types/express';
import { calculatePagination, getPaginationMeta } from '../utils/pagination';
import { paginationSchema, oibSchema, uuidSchema } from '../utils/validation';

const createClientSchema = z.object({
  company: z.string().min(1, { message: 'Company name is required' }),
  contactPerson: z.string().min(1, { message: 'Contact person is required' }),
  email: z.string().email({ message: 'Please provide a valid email address' }),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default('Hrvatska'),
  oib: oibSchema,
  notes: z.string().optional(),
  status: z.string().optional().default('ACTIVE').transform(val => {
    if (!val) return 'ACTIVE';
    const normalized = val.toUpperCase();
    if (['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(normalized)) {
      return normalized as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    }
    throw new Error(`Invalid status: ${val}. Must be one of: ACTIVE, INACTIVE, ARCHIVED`);
  })
});

const updateClientSchema = createClientSchema.partial();

export const createClient = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log('Client creation request body:', JSON.stringify(req.body, null, 2));
    const validatedData = createClientSchema.parse(req.body);
    const userId = req.user?.id;

    const existingClient = await prisma.client.findFirst({
      where: { 
        email: validatedData.email,
        userId,
        deletedAt: null
      }
    });

    if (existingClient) {
      throw new CustomError('Client with this email already exists', 409);
    }

    if (validatedData.oib) {
      const existingOIB = await prisma.client.findFirst({
        where: { 
          oib: validatedData.oib,
          userId,
          deletedAt: null
        }
      });

      if (existingOIB) {
        throw new CustomError('Client with this OIB already exists', 409);
      }
    }

    if (!userId) {
      throw new CustomError('User authentication required', 401);
    }

    const client = await prisma.client.create({
      data: {
        ...validatedData,
        userId
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Client created successfully',
      data: client
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getClients = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const search = req.query.search as string;
    const status = req.query.status as string;
    const userId = req.user?.id;

    if (!userId) {
      throw new CustomError('User authentication required', 401);
    }

    const where: any = { 
      userId,
      deletedAt: null 
    };
    
    if (search) {
      where.OR = [
        { company: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    const total = await prisma.client.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = { createdAt: 'desc' };
    if (sort) {
      orderBy = { [sort]: order };
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        projects: {
          where: { deletedAt: null },
          select: { id: true, name: true, status: true }
        },
        _count: {
          select: {
            projects: { where: { deletedAt: null } },
            invoices: { where: { deletedAt: null } }
          }
        }
      }
    });

    const transformedClients = clients.map(client => ({
      ...client,
      name: client.contactPerson,
      status: client.status.toLowerCase()
    }));

    const response: ApiResponse = {
      success: true,
      data: transformedClients,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getClient = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }

    const client = await prisma.client.findFirst({
      where: { 
        id,
        userId,
        deletedAt: null
      },
      include: {
        projects: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' }
        },
        invoices: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        proposals: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!client) {
      throw new CustomError('Client not found', 404);
    }

    const transformedClient = {
      ...client,
      name: client.contactPerson,
      status: client.status.toLowerCase()
    };

    const response: ApiResponse = {
      success: true,
      data: transformedClient
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const updateClient = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = uuidSchema.parse(req.params.id);
    console.log('Client update request body:', JSON.stringify(req.body, null, 2));
    const validatedData = updateClientSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }

    const existingClient = await prisma.client.findFirst({
      where: { id, userId, deletedAt: null }
    });

    if (!existingClient) {
      throw new CustomError('Client not found', 404);
    }

    if (validatedData.email && validatedData.email !== existingClient.email) {
      const emailConflict = await prisma.client.findFirst({
        where: { 
          email: validatedData.email,
          userId,
          id: { not: id },
          deletedAt: null
        }
      });

      if (emailConflict) {
        throw new CustomError('Another client with this email already exists', 409);
      }
    }

    if (validatedData.oib && validatedData.oib !== existingClient.oib) {
      const oibConflict = await prisma.client.findFirst({
        where: { 
          oib: validatedData.oib,
          userId,
          id: { not: id },
          deletedAt: null
        }
      });

      if (oibConflict) {
        throw new CustomError('Another client with this OIB already exists', 409);
      }
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: validatedData
    });

    const response: ApiResponse = {
      success: true,
      message: 'Client updated successfully',
      data: updatedClient
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const deleteClient = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }

    const client = await prisma.client.findFirst({
      where: { id, userId, deletedAt: null }
    });

    if (!client) {
      throw new CustomError('Client not found', 404);
    }

    const activeProjects = await prisma.project.count({
      where: { 
        clientId: id,
        status: { in: ['PLANNING', 'ACTIVE'] },
        deletedAt: null
      }
    });

    if (activeProjects > 0) {
      throw new CustomError('Cannot delete client with active projects', 400);
    }

    await prisma.client.update({
      where: { id },
      data: { 
        deletedAt: new Date(),
        isActive: false
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Client deleted successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const archiveClient = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }
    
    const existingClient = await prisma.client.findFirst({
      where: { id, userId, deletedAt: null }
    });

    if (!existingClient) {
      throw new CustomError('Client not found', 404);
    }

    const archivedClient = await prisma.client.update({
      where: { id },
      data: { 
        status: 'ARCHIVED',
        isActive: false
      }
    });

    const transformedClient = {
      ...archivedClient,
      name: archivedClient.contactPerson,
      status: archivedClient.status.toLowerCase()
    };

    const response: ApiResponse = {
      success: true,
      message: 'Client archived successfully',
      data: transformedClient
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const restoreClient = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }
    
    const existingClient = await prisma.client.findFirst({
      where: { id, userId, deletedAt: null }
    });

    if (!existingClient) {
      throw new CustomError('Client not found', 404);
    }

    const restoredClient = await prisma.client.update({
      where: { id },
      data: { 
        status: 'ACTIVE',
        isActive: true
      }
    });

    const transformedClient = {
      ...restoredClient,
      name: restoredClient.contactPerson,
      status: restoredClient.status.toLowerCase()
    };

    const response: ApiResponse = {
      success: true,
      message: 'Client restored successfully',
      data: transformedClient
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getClientProjects = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const statusParam = req.query.status as string;
    const search = req.query.search as string;
    const userId = req.user?.id;
    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }

    const client = await prisma.client.findFirst({
      where: { 
        id,
        userId,
        deletedAt: null
      }
    });

    if (!client) {
      throw new CustomError('Client not found', 404);
    }

    const where: any = { 
      clientId: id,
      deletedAt: null
    };
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (statusParam) {
      const statusMapping: { [key: string]: any } = {
        'planning': 'PLANNING',
        'active': 'ACTIVE',
        'on_hold': 'ON_HOLD',
        'completed': 'COMPLETED'
      };
      
      const mappedStatus = statusMapping[statusParam.toLowerCase()];
      if (mappedStatus) {
        where.status = mappedStatus;
      }
    }

    const total = await prisma.project.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = { createdAt: 'desc' };
    if (sort) {
      orderBy = { [sort]: order };
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        client: {
          select: {
            id: true,
            company: true,
            contactPerson: true,
            email: true
          }
        },
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        _count: {
          select: {
            tasks: { where: { deletedAt: null } },
            expenses: { where: { deletedAt: null } },
            invoices: { where: { deletedAt: null } }
          }
        }
      }
    });

    const transformedProjects = projects.map(project => ({
      ...project,
      status: project.status.toLowerCase()
    }));

    const response: ApiResponse = {
      success: true,
      data: transformedProjects,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getClientInvoices = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const statusParam = req.query.status as string;
    const search = req.query.search as string;
    const userId = req.user?.id;
    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }

    const client = await prisma.client.findFirst({
      where: { 
        id,
        userId,
        deletedAt: null
      }
    });

    if (!client) {
      throw new CustomError('Client not found', 404);
    }

    const where: any = { 
      clientId: id,
      deletedAt: null
    };
    
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (statusParam) {
      const statusMapping: { [key: string]: any } = {
        'draft': 'DRAFT',
        'sent': 'SENT',
        'paid': 'PAID',
        'overdue': 'OVERDUE'
      };
      
      const mappedStatus = statusMapping[statusParam.toLowerCase()];
      if (mappedStatus) {
        where.status = mappedStatus;
      }
    }

    const total = await prisma.invoice.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = { createdAt: 'desc' };
    if (sort) {
      orderBy = { [sort]: order };
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        client: {
          select: {
            id: true,
            company: true,
            contactPerson: true,
            email: true
          }
        },
        project: {
          select: {
            id: true,
            name: true
          }
        },
        items: true
      }
    });

    const transformedInvoices = invoices.map(invoice => ({
      ...invoice,
      status: invoice.status.toLowerCase()
    }));

    const response: ApiResponse = {
      success: true,
      data: transformedInvoices,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};