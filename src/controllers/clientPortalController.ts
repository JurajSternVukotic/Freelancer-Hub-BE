import { Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse, ClientAuthenticatedRequest } from '../types/express';
import { PdfService } from '../services/pdfService';
import { uuidSchema } from '../utils/validation';

const projectRequestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  budgetRange: z.string().optional(),
  deadline: z.coerce.date().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM')
});

export const createProjectRequest = async (req: ClientAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.client!.id;
    const validatedData = projectRequestSchema.parse(req.body);

    const projectRequest = await prisma.projectRequest.create({
      data: {
        ...validatedData,
        clientId,
        status: 'PENDING'
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

    const response: ApiResponse = {
      success: true,
      message: 'Project request submitted successfully',
      data: projectRequest
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getProjectRequests = async (req: ClientAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.client!.id;

    const projectRequests = await prisma.projectRequest.findMany({
      where: { clientId },
      include: {
        assignedFreelancer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const response: ApiResponse = {
      success: true,
      data: projectRequests
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getProjectRequest = async (req: ClientAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.client!.id;
    const requestId = req.params.id;

    const projectRequest = await prisma.projectRequest.findFirst({
      where: { 
        id: requestId,
        clientId 
      },
      include: {
        assignedFreelancer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true
          }
        }
      }
    });

    if (!projectRequest) {
      throw new CustomError('Project request not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: projectRequest
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getClientInvoices = async (req: ClientAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.client!.id;
    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const where: any = {
      clientId,
      deletedAt: null
    };

    if (status) {
      where.status = status.toUpperCase();
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          items: {
            select: {
              id: true,
              description: true,
              quantity: true,
              rate: true,
              amount: true
            }
          }
        },
        orderBy: { date: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.invoice.count({ where })
    ]);

    const response: ApiResponse = {
      success: true,
      data: {
        invoices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getClientInvoice = async (req: ClientAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.client!.id;
    const invoiceId = req.params.id;

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clientId,
        deletedAt: null
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true
          }
        },
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            rate: true,
            amount: true
          }
        },
        client: {
          select: {
            id: true,
            company: true,
            contactPerson: true,
            email: true,
            address: true,
            city: true,
            country: true,
            oib: true
          }
        }
      }
    });

    if (!invoice) {
      throw new CustomError('Invoice not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: invoice
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const markInvoiceAsPaid = async (req: ClientAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.client!.id;
    const invoiceId = req.params.id;

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clientId,
        deletedAt: null
      }
    });

    if (!invoice) {
      throw new CustomError('Invoice not found', 404);
    }

    if (invoice.status === 'PAID') {
      throw new CustomError('Invoice is already marked as paid', 400);
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { 
        status: 'PAID',
        updatedAt: new Date()
      },
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Invoice marked as paid successfully',
      data: updatedInvoice
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getClientDashboard = async (req: ClientAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.client!.id;

    const [
      activeProjects,
      pendingRequests,
      recentInvoices,
      invoiceStats
    ] = await Promise.all([
      prisma.project.findMany({
        where: {
          clientId,
          status: 'ACTIVE',
          deletedAt: null
        },
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          startDate: true,
          endDate: true,
          description: true,
          owner: {
            select: {
              firstName: true,
              lastName: true,
              company: true
            }
          }
        },
        take: 5
      }),

      prisma.projectRequest.findMany({
        where: {
          clientId,
          status: { in: ['PENDING', 'ASSIGNED', 'QUOTED'] }
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true
        },
        take: 5
      }),

      prisma.invoice.findMany({
        where: {
          clientId,
          deletedAt: null
        },
        select: {
          id: true,
          number: true,
          total: true,
          status: true,
          date: true,
          dueDate: true
        },
        orderBy: { date: 'desc' },
        take: 5
      }),

      prisma.invoice.groupBy({
        by: ['status'],
        where: {
          clientId,
          deletedAt: null
        },
        _count: true,
        _sum: {
          total: true
        }
      })
    ]);

    const invoiceSummary = invoiceStats.reduce((acc, stat) => {
      acc[stat.status.toLowerCase()] = {
        count: stat._count,
        total: Number(stat._sum.total || 0)
      };
      return acc;
    }, {} as any);

    const dashboardData = {
      activeProjects,
      pendingRequests,
      recentInvoices,
      summary: {
        activeProjectsCount: activeProjects.length,
        pendingRequestsCount: pendingRequests.length,
        invoices: invoiceSummary
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

export const getClientInvoicePdf = async (req: ClientAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.client!.id;
    const { id } = req.params;
    
    console.log('PDF generation requested for invoice:', id, 'by client:', clientId);
    
    uuidSchema.parse(id);

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        clientId,
        deletedAt: null
      },
      include: {
        client: {
          select: {
            id: true,
            company: true,
            contactPerson: true,
            email: true,
            oib: true,
            address: true,
            city: true,
            country: true
          }
        },
        project: {
          select: {
            id: true,
            name: true
          }
        },
        items: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    if (!invoice) {
      throw new CustomError('Invoice not found', 404);
    }

    console.log('Found invoice for PDF generation:', {
      id: invoice.id,
      number: invoice.number,
      clientCompany: invoice.client.company,
      itemsCount: invoice.items.length
    });

    let pdfBuffer;
    try {
      pdfBuffer = await PdfService.generateInvoicePdf(invoice as any);
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
      throw new CustomError('Failed to generate PDF. Please try again later.', 500);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="racun-${invoice.number}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log('Sending PDF response for invoice:', invoice.number);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Client portal PDF endpoint error:', error);
    next(error);
  }
};