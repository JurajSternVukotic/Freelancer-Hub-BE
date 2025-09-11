import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/express';
import { calculatePagination, getPaginationMeta } from '../utils/pagination';
import { paginationSchema, uuidSchema } from '../utils/validation';

const expenseSchema = z.object({
  projectId: uuidSchema,
  date: z.coerce.date(),
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().min(1),
  receipt: z.string().url().optional(),
  billable: z.boolean().default(true)
});

const proposalItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  rate: z.number().positive(),
  amount: z.number().positive()
});

const proposalSchema = z.object({
  clientId: uuidSchema,
  projectId: uuidSchema.optional(),
  title: z.string().min(1),
  validUntil: z.coerce.date(),
  notes: z.string().optional(),
  items: z.array(proposalItemSchema).min(1)
});

const retainerSchema = z.object({
  clientId: uuidSchema,
  monthlyHours: z.number().positive(),
  rate: z.number().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional()
});

export const getFinancialDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const projectId = req.query.projectId as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    

    const dateFilter: any = {};
    if (dateFrom || dateTo) {
      if (dateFrom && dateFrom.trim()) {
        const fromDate = new Date(dateFrom);
        if (isNaN(fromDate.getTime())) {
          throw new CustomError('Invalid dateFrom parameter', 400);
        }
        dateFilter.gte = fromDate;
      }
      if (dateTo && dateTo.trim()) {
        const toDate = new Date(dateTo);
        if (isNaN(toDate.getTime())) {
          throw new CustomError('Invalid dateTo parameter', 400);
        }
        dateFilter.lte = toDate;
      }
    }

    const projectFilter = projectId ? { projectId } : {};

    let expenses: any[] = [];
    let proposals: any[] = [];
    let retainers: any[] = [];
    let invoices: any[] = [];
    let timeEntries: any[] = [];

    try {
      expenses = await prisma.expense.findMany({
        where: {
          userId,
          deletedAt: null,
          ...projectFilter,
          ...(dateFrom || dateTo ? { date: dateFilter } : {})
        },
        take: 20,
        orderBy: { date: 'desc' },
        include: {
          project: {
            select: { id: true, name: true, client: { select: { company: true } } }
          }
        }
      });
    } catch (error) {}

    try {
      proposals = await prisma.proposal.findMany({
        where: {
          deletedAt: null,
          client: { userId },
          ...(projectId ? { projectId } : {}),
          ...(dateFrom || dateTo ? { createdAt: dateFilter } : {})
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, company: true } },
          project: { select: { id: true, name: true } },
          items: true
        }
      });
    } catch (error) {}

    try {
      retainers = await prisma.retainer.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          client: { userId },
          ...(dateFrom || dateTo ? { startDate: dateFilter } : {})
        },
        orderBy: { startDate: 'desc' },
        include: {
          client: { select: { id: true, company: true } }
        }
      });
    } catch (error) {}

    try {
      invoices = await prisma.invoice.findMany({
        where: {
          deletedAt: null,
          project: { ownerId: userId },
          ...(projectId ? { projectId } : {}),
          ...(dateFrom || dateTo ? { date: dateFilter } : {})
        },
        take: 20,
        orderBy: { date: 'desc' },
        include: {
          project: { select: { id: true, name: true, client: { select: { company: true } } } }
        }
      });
    } catch (error) {}

    try {
      timeEntries = await prisma.timeEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          billable: true,
          ...(projectId ? { task: { projectId } } : {}),
          ...(dateFrom || dateTo ? { startTime: dateFilter } : {})
        },
        select: { duration: true, task: { select: { project: { select: { id: true, name: true } } } } }
      });
    } catch (error) {}

    const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const totalProposals = proposals.reduce((sum, proposal) => sum + Number(proposal.total), 0);
    const totalRetainers = retainers.reduce((sum, retainer) => 
      sum + (Number(retainer.monthlyHours) * Number(retainer.rate)), 0);
    const totalInvoices = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const totalBillableHours = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0) / 3600;

    const expensesByCategory = expenses.reduce((acc: any, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + Number(expense.amount);
      return acc;
    }, {});

    const proposalsByStatus = proposals.reduce((acc: any, proposal) => {
      acc[proposal.status] = (acc[proposal.status] || 0) + 1;
      return acc;
    }, {});

    const dashboardData = {
      summary: {
        totalExpenses,
        totalProposals,
        totalRetainers,
        totalInvoices,
        totalBillableHours: Math.round(totalBillableHours * 100) / 100,
        netProfit: totalInvoices - totalExpenses
      },
      expenses: {
        recent: expenses,
        byCategory: expensesByCategory,
        total: totalExpenses
      },
      proposals: {
        recent: proposals,
        byStatus: proposalsByStatus,
        total: totalProposals
      },
      retainers: {
        active: retainers,
        total: totalRetainers
      },
      invoices: {
        recent: invoices,
        total: totalInvoices
      }
    };

    const response: ApiResponse = {
      success: true,
      data: dashboardData
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const createExpense = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = expenseSchema.parse(req.body);
    const userId = req.user!.id;

    const project = await prisma.project.findFirst({
      where: {
        id: validatedData.projectId,
        ownerId: userId,
        deletedAt: null
      }
    });

    if (!project) {
      throw new CustomError('Project not found or access denied', 404);
    }

    const expense = await prisma.expense.create({
      data: { ...validatedData, userId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: { select: { id: true, company: true } }
          }
        }
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

export const createProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = proposalSchema.parse(req.body);

    const client = await prisma.client.findFirst({
      where: {
        id: validatedData.clientId,
        userId: req.user!.id,
        deletedAt: null
      }
    });

    if (!client) {
      throw new CustomError('Client not found or access denied', 404);
    }

    const subtotal = validatedData.items.reduce((sum, item) => sum + item.amount, 0);
    const tax = subtotal * 0.25;
    const total = subtotal + tax;

    const proposal = await prisma.proposal.create({
      data: {
        ...validatedData,
        subtotal,
        tax,
        total,
        items: { create: validatedData.items }
      },
      include: {
        client: { select: { id: true, company: true, contactPerson: true } },
        project: { select: { id: true, name: true } },
        items: true
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Proposal created successfully',
      data: proposal
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const createRetainer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = retainerSchema.parse(req.body);

    const client = await prisma.client.findFirst({
      where: {
        id: validatedData.clientId,
        userId: req.user!.id,
        deletedAt: null
      }
    });

    if (!client) {
      throw new CustomError('Client not found or access denied', 404);
    }

    const retainer = await prisma.retainer.create({
      data: validatedData,
      include: {
        client: { select: { id: true, company: true, contactPerson: true } }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Retainer created successfully',
      data: retainer
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const deleteFinancialItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, id } = req.params;
    uuidSchema.parse(id);

    let model: any;
    let whereClause: any = { id, deletedAt: null };

    switch (type) {
      case 'expenses':
        model = prisma.expense;
        whereClause.userId = req.user!.id;
        break;
      case 'proposals':
        model = prisma.proposal;
        whereClause.client = { userId: req.user!.id };
        break;
      case 'retainers':
        model = prisma.retainer;
        whereClause.client = { userId: req.user!.id };
        break;
      default:
        throw new CustomError('Invalid financial item type', 400);
    }

    const item = await model.findFirst({ where: whereClause });
    
    if (!item) {
      throw new CustomError(`${type.slice(0, -1)} not found`, 404);
    }

    await model.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    const response: ApiResponse = {
      success: true,
      message: `${type.slice(0, -1)} deleted successfully`
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};