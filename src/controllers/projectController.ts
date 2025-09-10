import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ProjectStatus, ProjectPriority } from '@prisma/client';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse, AuthenticatedRequest } from '../types/express';
import { calculatePagination, getPaginationMeta } from '../utils/pagination';
import { paginationSchema, uuidSchema, positiveDecimalSchema } from '../utils/validation';

const createProjectSchema = z.object({
  clientId: uuidSchema,
  name: z.string().min(1, { message: 'Project name is required' }),
  description: z.string().optional(),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.PLANNING),
  priority: z.nativeEnum(ProjectPriority).default(ProjectPriority.MEDIUM),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  budget: positiveDecimalSchema.optional()
}).refine((data) => {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return false;
  }
  return true;
}, {
  message: 'End date must be after start date',
  path: ['endDate']
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  priority: z.nativeEnum(ProjectPriority).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  budget: positiveDecimalSchema.optional()
});

export const createProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createProjectSchema.parse(req.body);

    const client = await prisma.client.findFirst({
      where: { 
        id: validatedData.clientId,
        deletedAt: null
      }
    });

    if (!client) {
      throw new CustomError('Client not found', 404);
    }

    const project = await prisma.project.create({
      data: {
        ...validatedData,
        ownerId: req.user!.id
      },
      include: {
        client: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Project created successfully',
      data: project
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getProjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const search = req.query.search as string;
    const statusParam = req.query.status as string;
    const priorityParam = req.query.priority as string;
    const clientId = req.query.clientId as string;

    const where: any = { 
      deletedAt: null,
      ownerId: req.user!.id
    };
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { client: { company: { contains: search, mode: 'insensitive' } } }
      ];
    }

    if (statusParam) {
      const statusMapping: { [key: string]: ProjectStatus } = {
        'planning': ProjectStatus.PLANNING,
        'active': ProjectStatus.ACTIVE,
        'on_hold': ProjectStatus.ON_HOLD,
        'completed': ProjectStatus.COMPLETED
      };
      
      const mappedStatus = statusMapping[statusParam.toLowerCase()];
      if (mappedStatus) {
        where.status = mappedStatus;
      }
    }

    // Convert frontend priority (lowercase) to backend enum (uppercase)  
    if (priorityParam) {
      const priorityMapping: { [key: string]: ProjectPriority } = {
        'low': ProjectPriority.LOW,
        'medium': ProjectPriority.MEDIUM,
        'high': ProjectPriority.HIGH,
        'urgent': ProjectPriority.URGENT
      };
      
      const mappedPriority = priorityMapping[priorityParam.toLowerCase()];
      if (mappedPriority) {
        where.priority = mappedPriority;
      }
    }

    if (clientId) {
      where.clientId = clientId;
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
      status: project.status.toLowerCase(),
      priority: project.priority.toLowerCase()
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

export const getProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    

    const project = await prisma.project.findFirst({
      where: { 
        id,
        deletedAt: null
      },
      include: {
        client: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            hourlyRate: true
          }
        },
        tasks: {
          where: { deletedAt: null },
          orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
          include: {
            _count: {
              select: {
                timeEntries: { where: { deletedAt: null } }
              }
            }
          }
        },
        expenses: {
          where: { deletedAt: null },
          orderBy: { date: 'desc' },
          take: 10 // Recent expenses
        },
        invoices: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 5 // Recent invoices
        }
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: project
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const validatedData = updateProjectSchema.parse(req.body);

    const existingProject = await prisma.project.findFirst({
      where: { 
        id, 
        deletedAt: null,
        ownerId: req.user!.id
      }
    });

    if (!existingProject) {
      throw new CustomError('Project not found', 404);
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: validatedData,
      include: {
        client: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Project updated successfully',
      data: updatedProject
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const project = await prisma.project.findFirst({
      where: { 
        id, 
        deletedAt: null,
        ownerId: req.user!.id
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    const activeTimeEntries = await prisma.timeEntry.count({
      where: {
        task: {
          projectId: id,
          deletedAt: null
        },
        endTime: null,
        deletedAt: null
      }
    });

    if (activeTimeEntries > 0) {
      throw new CustomError('Cannot delete project with active time tracking', 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { 
          projectId: id,
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });

      await tx.project.update({
        where: { id },
        data: { deletedAt: new Date() }
      });
    });

    const response: ApiResponse = {
      success: true,
      message: 'Project deleted successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getProjectTasks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const statusParam = req.query.status as string;
    const priorityParam = req.query.priority as string;
    const search = req.query.search as string;

    const project = await prisma.project.findFirst({
      where: { 
        id,
        deletedAt: null,
        ownerId: req.user!.id
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    const where: any = { 
      projectId: id,
      deletedAt: null
    };
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (statusParam) {
      const statusMapping: { [key: string]: any } = {
        'todo': 'TODO',
        'in_progress': 'IN_PROGRESS',
        'review': 'REVIEW',
        'done': 'DONE'
      };
      
      const mappedStatus = statusMapping[statusParam.toLowerCase()];
      if (mappedStatus) {
        where.status = mappedStatus;
      }
    }

    if (priorityParam) {
      const priorityMapping: { [key: string]: any } = {
        'low': 'LOW',
        'medium': 'MEDIUM',
        'high': 'HIGH',
        'urgent': 'URGENT'
      };
      
      const mappedPriority = priorityMapping[priorityParam.toLowerCase()];
      if (mappedPriority) {
        where.priority = mappedPriority;
      }
    }

    const total = await prisma.task.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    // Build order by - default to position for kanban ordering
    let orderBy: any = [{ position: 'asc' }, { createdAt: 'desc' }];
    if (sort) {
      orderBy = { [sort]: order };
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                company: true,
                contactPerson: true
              }
            }
          }
        },
        _count: {
          select: {
            timeEntries: { where: { deletedAt: null } }
          }
        }
      }
    });

    // Transform task data to match frontend expectations
    const transformedTasks = tasks.map(task => ({
      ...task,
      status: task.status.toLowerCase(),
      priority: task.priority.toLowerCase()
    }));

    const response: ApiResponse = {
      success: true,
      data: transformedTasks,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getProjectTimeEntries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const billable = req.query.billable === 'true' ? true : req.query.billable === 'false' ? false : undefined;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const search = req.query.search as string;

    const project = await prisma.project.findFirst({
      where: { 
        id,
        deletedAt: null,
        ownerId: req.user!.id
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    const where: any = { 
      task: {
        projectId: id,
        deletedAt: null
      },
      deletedAt: null
    };
    
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { task: { title: { contains: search, mode: 'insensitive' } } }
      ];
    }

    if (billable !== undefined) {
      where.billable = billable;
    }

    if (dateFrom) {
      where.startTime = { ...where.startTime, gte: new Date(dateFrom) };
    }

    if (dateTo) {
      where.startTime = { ...where.startTime, lte: new Date(dateTo) };
    }

    const total = await prisma.timeEntry.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = { startTime: 'desc' };
    if (sort) {
      orderBy = { [sort]: order };
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      data: timeEntries,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getProjectExpenses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const categoryParam = req.query.category as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const search = req.query.search as string;

    const project = await prisma.project.findFirst({
      where: { 
        id,
        deletedAt: null,
        ownerId: req.user!.id
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    const where: any = { 
      projectId: id,
      deletedAt: null
    };
    
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (categoryParam) {
      where.category = { contains: categoryParam, mode: 'insensitive' };
    }

    if (dateFrom) {
      where.date = { ...where.date, gte: new Date(dateFrom) };
    }

    if (dateTo) {
      where.date = { ...where.date, lte: new Date(dateTo) };
    }

    const total = await prisma.expense.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = { date: 'desc' };
    if (sort) {
      orderBy = { [sort]: order };
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                company: true,
                contactPerson: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      data: expenses,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getProjectInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const statusParam = req.query.status as string;
    const search = req.query.search as string;

    const project = await prisma.project.findFirst({
      where: { 
        id,
        deletedAt: null,
        ownerId: req.user!.id
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    const where: any = { 
      projectId: id,
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

    // Transform invoice data to match frontend expectations
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

export const getProjectStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const project = await prisma.project.findFirst({
      where: { 
        id,
        deletedAt: null,
        ownerId: req.user!.id
      },
      include: {
        client: {
          select: {
            id: true,
            company: true,
            contactPerson: true
          }
        }
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    // Get task statistics
    const taskStats = await prisma.task.groupBy({
      by: ['status'],
      where: {
        projectId: id,
        deletedAt: null
      },
      _count: {
        id: true
      }
    });

    // Get time tracking statistics
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        task: {
          projectId: id,
          deletedAt: null
        },
        deletedAt: null,
        endTime: { not: null }
      },
      select: {
        duration: true,
        billable: true
      }
    });

    const totalHours = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0) / 3600; // Convert seconds to hours
    const billableHours = timeEntries.filter(entry => entry.billable).reduce((sum, entry) => sum + (entry.duration || 0), 0) / 3600;
    
    // Get expense statistics
    const expenseStats = await prisma.expense.aggregate({
      where: {
        projectId: id,
        deletedAt: null
      },
      _sum: {
        amount: true
      },
      _count: {
        id: true
      }
    });

    // Get invoice statistics
    const invoiceStats = await prisma.invoice.aggregate({
      where: {
        projectId: id,
        deletedAt: null
      },
      _sum: {
        total: true
      },
      _count: {
        id: true
      }
    });

    const invoiceStatusStats = await prisma.invoice.groupBy({
      by: ['status'],
      where: {
        projectId: id,
        deletedAt: null
      },
      _count: {
        id: true
      },
      _sum: {
        total: true
      }
    });

    // Transform task status to match frontend expectations
    const transformedTaskStats = taskStats.map(stat => ({
      status: stat.status.toLowerCase(),
      count: stat._count.id
    }));

    const transformedInvoiceStatusStats = invoiceStatusStats.map(stat => ({
      status: stat.status.toLowerCase(),
      count: stat._count.id,
      total: stat._sum.total
    }));

    const stats = {
      project: {
        ...project,
        status: project.status.toLowerCase()
      },
      tasks: {
        byStatus: transformedTaskStats,
        total: transformedTaskStats.reduce((sum, stat) => sum + stat.count, 0)
      },
      timeTracking: {
        totalHours: Number(totalHours.toFixed(2)),
        billableHours: Number(billableHours.toFixed(2)),
        nonBillableHours: Number((totalHours - billableHours).toFixed(2))
      },
      expenses: {
        total: expenseStats._sum.amount || 0,
        count: expenseStats._count.id
      },
      invoices: {
        total: invoiceStats._sum.total || 0,
        count: invoiceStats._count.id,
        byStatus: transformedInvoiceStatusStats
      },
      budget: {
        allocated: project.budget || 0,
        spent: (expenseStats._sum.amount || 0),
        remaining: project.budget ? Number((project.budget.toNumber() - (expenseStats._sum.amount?.toNumber() || 0)).toFixed(2)) : null
      }
    };

    const response: ApiResponse = {
      success: true,
      data: stats
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all available project requests for freelancers
 * GET /projects/requests
 */
export const getAvailableProjectRequests = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const priority = req.query.priority as string;
    
    const { offset } = calculatePagination(page, limit);

    const where: any = {
      OR: [
        { assignedTo: null }, // Unassigned requests
        { assignedTo: userId } // Assigned to current user
      ]
    };

    if (status) {
      where.status = status.toUpperCase();
    }

    if (priority) {
      where.priority = priority.toUpperCase();
    }

    const [requests, total] = await Promise.all([
      prisma.projectRequest.findMany({
        where,
        include: {
          client: {
            select: {
              id: true,
              company: true,
              contactPerson: true,
              email: true,
              phone: true
            }
          },
          assignedFreelancer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true
            }
          }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ],
        skip: offset,
        take: limit
      }),
      prisma.projectRequest.count({ where })
    ]);

    const response: ApiResponse = {
      success: true,
      data: {
        requests,
        pagination: getPaginationMeta(page, limit, total)
      }
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Accept a project request and assign to freelancer
 * POST /projects/requests/:id/accept
 */
export const acceptProjectRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const requestId = req.params.id;
    const { freelancerResponse, quotedAmount } = req.body;

    // Validate input
    if (!requestId) {
      throw new CustomError('Request ID is required', 400);
    }

    // Find the project request
    const projectRequest = await prisma.projectRequest.findFirst({
      where: {
        id: requestId,
        status: { in: ['PENDING', 'ASSIGNED'] }
      },
      include: {
        client: true
      }
    });

    if (!projectRequest) {
      throw new CustomError('Project request not found or already processed', 404);
    }

    // Update the project request
    const updatedRequest = await prisma.projectRequest.update({
      where: { id: requestId },
      data: {
        assignedTo: userId,
        status: 'ASSIGNED',
        freelancerResponse: freelancerResponse || null,
        quotedAmount: quotedAmount ? parseFloat(quotedAmount) : null,
        updatedAt: new Date()
      },
      include: {
        client: {
          select: {
            id: true,
            company: true,
            contactPerson: true,
            email: true
          }
        },
        assignedFreelancer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Project request accepted successfully',
      data: updatedRequest
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Convert accepted project request to actual project
 * POST /projects/requests/:id/convert
 */
export const convertRequestToProject = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const requestId = req.params.id;

    // Find the project request
    const projectRequest = await prisma.projectRequest.findFirst({
      where: {
        id: requestId,
        assignedTo: userId,
        status: 'ASSIGNED',
        projectId: null // Not already converted
      },
      include: {
        client: true
      }
    });

    if (!projectRequest) {
      throw new CustomError('Project request not found, not assigned to you, or already converted', 404);
    }

    // Create the project
    const project = await prisma.project.create({
      data: {
        clientId: projectRequest.clientId,
        ownerId: userId,
        name: projectRequest.title,
        description: projectRequest.description,
        status: ProjectStatus.PLANNING,
        priority: projectRequest.priority as ProjectPriority,
        startDate: new Date(),
        endDate: projectRequest.deadline,
        budget: projectRequest.quotedAmount,
        isActive: true
      },
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
            company: true
          }
        }
      }
    });

    // Assign the freelancer to the client so the client appears in the freelancer's client list
    await prisma.client.update({
      where: { id: projectRequest.clientId },
      data: {
        userId: userId // Link the client to the freelancer
      }
    });

    // Update the project request to mark it as converted
    await prisma.projectRequest.update({
      where: { id: requestId },
      data: {
        projectId: project.id,
        status: 'COMPLETED',
        updatedAt: new Date()
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Project request converted to project successfully',
      data: {
        project,
        requestId
      }
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

// Expense validation schemas
const createExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: positiveDecimalSchema,
  category: z.string().min(1, 'Category is required'),
  date: z.coerce.date(),
  billable: z.boolean().default(true),
  receipt: z.string().optional()
});

const updateExpenseSchema = z.object({
  description: z.string().min(1).optional(),
  amount: positiveDecimalSchema.optional(),
  category: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  billable: z.boolean().optional(),
  receipt: z.string().optional()
});

/**
 * Create expense for project
 * POST /api/v1/projects/:id/expenses
 */
export const createProjectExpense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const validatedData = createExpenseSchema.parse(req.body);

    const project = await prisma.project.findFirst({
      where: { 
        id,
        deletedAt: null,
        ownerId: req.user!.id
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    const expense = await prisma.expense.create({
      data: {
        ...validatedData,
        projectId: id,
        userId: req.user!.id
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Expense created successfully',
      data: expense
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Update expense
 * PUT /api/v1/projects/:id/expenses/:expenseId
 */
export const updateProjectExpense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, expenseId } = req.params;
    uuidSchema.parse(id);
    uuidSchema.parse(expenseId);
    const validatedData = updateExpenseSchema.parse(req.body);

    const project = await prisma.project.findFirst({
      where: { 
        id,
        deletedAt: null,
        ownerId: req.user!.id
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    // Check if expense exists and belongs to this project and user
    const existingExpense = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        projectId: id,
        userId: req.user!.id,
        deletedAt: null
      }
    });

    if (!existingExpense) {
      throw new CustomError('Expense not found', 404);
    }

    const expense = await prisma.expense.update({
      where: { id: expenseId },
      data: validatedData
    });

    const response: ApiResponse = {
      success: true,
      message: 'Expense updated successfully',
      data: expense
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete expense
 * DELETE /api/v1/projects/:id/expenses/:expenseId
 */
export const deleteProjectExpense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, expenseId } = req.params;
    uuidSchema.parse(id);
    uuidSchema.parse(expenseId);

    const project = await prisma.project.findFirst({
      where: { 
        id,
        deletedAt: null,
        ownerId: req.user!.id
      }
    });

    if (!project) {
      throw new CustomError('Project not found', 404);
    }

    // Check if expense exists and belongs to this project and user
    const existingExpense = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        projectId: id,
        userId: req.user!.id,
        deletedAt: null
      }
    });

    if (!existingExpense) {
      throw new CustomError('Expense not found', 404);
    }

    // Soft delete
    await prisma.expense.update({
      where: { id: expenseId },
      data: { deletedAt: new Date() }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Expense deleted successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};