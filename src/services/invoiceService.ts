import { Prisma, Invoice, InvoiceItem, InvoiceStatus } from '@prisma/client';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';

export interface GenerateInvoiceData {
  projectId: string;
  startDate: Date;
  endDate: Date;
  dueDate?: Date;
  notes?: string;
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
  client: {
    id: string;
    company: string;
    contactPerson: string;
    email: string;
    oib?: string;
    address?: string;
    city?: string;
    country?: string;
  };
  project?: {
    id: string;
    name: string;
  };
}

export class InvoiceService {
  static async generateInvoiceNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const yearPrefix = currentYear.toString();
    
    const lastInvoice = await prisma.invoice.findFirst({
      where: {
        number: {
          startsWith: yearPrefix + '-'
        }
      },
      orderBy: {
        number: 'desc'
      }
    });

    let nextNumber = 1;
    if (lastInvoice) {
      const lastNumberPart = lastInvoice.number.split('-')[1];
      nextNumber = parseInt(lastNumberPart, 10) + 1;
    }

    return `${yearPrefix}-${nextNumber.toString().padStart(4, '0')}`;
  }

  static async generateFromProject(userId: string, data: GenerateInvoiceData): Promise<InvoiceWithItems> {
    return await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id: data.projectId,
          ownerId: userId,
          deletedAt: null
        },
        include: {
          client: true,
          owner: true
        }
      });

      if (!project) {
        throw new CustomError('Project not found or access denied', 404);
      }

      const timeEntries = await tx.timeEntry.findMany({
        where: {
          userId: userId,
          billable: true,
          approved: true,
          deletedAt: null,
          startTime: {
            gte: data.startDate,
            lte: data.endDate
          },
          task: {
            projectId: data.projectId,
            deletedAt: null
          }
        },
        include: {
          task: {
            select: {
              title: true
            }
          }
        }
      });

      const expenses = await tx.expense.findMany({
        where: {
          projectId: data.projectId,
          userId: userId,
          billable: true,
          deletedAt: null,
          date: {
            gte: data.startDate,
            lte: data.endDate
          }
        }
      });

      if (timeEntries.length === 0 && expenses.length === 0) {
        throw new CustomError('No billable time entries or expenses found for the specified period', 400);
      }

      const invoiceNumber = await this.generateInvoiceNumber();

      const dueDate = data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const invoice = await tx.invoice.create({
        data: {
          clientId: project.clientId,
          userId: userId,
          projectId: data.projectId,
          number: invoiceNumber,
          date: new Date(),
          dueDate,
          status: InvoiceStatus.DRAFT,
          notes: data.notes,
          subtotal: new Prisma.Decimal(0),
          tax: new Prisma.Decimal(0),
          total: new Prisma.Decimal(0)
        }
      });

      const invoiceItems: Prisma.InvoiceItemCreateManyInput[] = [];
      let subtotal = new Prisma.Decimal(0);

      const timeEntryGroups = timeEntries.reduce((acc, entry) => {
        const taskTitle = entry.task.title;
        if (!acc[taskTitle]) {
          acc[taskTitle] = {
            totalMinutes: 0,
            hourlyRate: project.owner.hourlyRate || new Prisma.Decimal(50)
          };
        }
        acc[taskTitle].totalMinutes += entry.duration || 0;
        return acc;
      }, {} as Record<string, { totalMinutes: number; hourlyRate: Prisma.Decimal }>);

      Object.entries(timeEntryGroups).forEach(([taskTitle, data]) => {
        const hours = new Prisma.Decimal(data.totalMinutes / 60);
        const amount = hours.mul(data.hourlyRate);
        
        invoiceItems.push({
          invoiceId: invoice.id,
          description: `Rad na zadatku: ${taskTitle}`,
          quantity: hours,
          rate: data.hourlyRate,
          amount: amount
        });

        subtotal = subtotal.add(amount);
      });

      expenses.forEach(expense => {
        invoiceItems.push({
          invoiceId: invoice.id,
          description: `${expense.category}: ${expense.description}`,
          quantity: new Prisma.Decimal(1),
          rate: expense.amount,
          amount: expense.amount
        });

        subtotal = subtotal.add(expense.amount);
      });

      await tx.invoiceItem.createMany({
        data: invoiceItems
      });

      const tax = subtotal.mul(new Prisma.Decimal(0.25));
      const total = subtotal.add(tax);

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal,
          tax,
          total
        },
        include: {
          client: true,
          project: {
            select: {
              id: true,
              name: true
            }
          },
          items: true
        }
      });

      return updatedInvoice as InvoiceWithItems;
    });
  }

  static async getInvoiceById(userId: string, invoiceId: string): Promise<InvoiceWithItems | null> {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        deletedAt: null,
        OR: [
          {
            project: {
              ownerId: userId,
              deletedAt: null
            }
          },
          {
            project: null
          }
        ]
      },
      include: {
        client: true,
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

    return invoice as InvoiceWithItems | null;
  }

  static async getInvoices(
    userId: string,
    filters: {
      status?: InvoiceStatus;
      clientId?: string;
      projectId?: string;
    } = {},
    pagination: {
      skip: number;
      take: number;
    }
  ): Promise<{ invoices: InvoiceWithItems[]; total: number }> {
    const where: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      userId: userId
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          client: true,
          project: {
            select: {
              id: true,
              name: true
            }
          },
          items: true
        },
        orderBy: {
          date: 'desc'
        },
        skip: pagination.skip,
        take: pagination.take
      }),
      prisma.invoice.count({ where })
    ]);

    return {
      invoices: invoices as InvoiceWithItems[],
      total
    };
  }

  static async updateInvoiceStatus(
    userId: string, 
    invoiceId: string, 
    status: InvoiceStatus
  ): Promise<InvoiceWithItems> {
    const existingInvoice = await this.getInvoiceById(userId, invoiceId);
    if (!existingInvoice) {
      throw new CustomError('Invoice not found or access denied', 404);
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status },
      include: {
        client: true,
        project: {
          select: {
            id: true,
            name: true
          }
        },
        items: true
      }
    });

    return updatedInvoice as InvoiceWithItems;
  }

  static async createManualInvoice(
    userId: string,
    data: {
      clientId: string;
      projectId?: string;
      number: string;
      dueDate: Date;
      notes?: string;
      items: Array<{
        description: string;
        quantity: number;
        rate: number;
        amount?: number;
        taxRate?: number;
        taxAmount?: number;
      }>;
      status?: InvoiceStatus;
      taxRate?: number;
      discount?: number;
      subtotal?: number;
      taxAmount?: number;
      total?: number;
      currency?: string;
      paymentTerms?: string;
      issueDate?: Date;
    }
  ): Promise<InvoiceWithItems> {
    const subtotal = data.subtotal ?? data.items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    const taxAmount = data.taxAmount ?? (data.taxRate ? subtotal * (data.taxRate / 100) : 0);
    const total = data.total ?? (subtotal + taxAmount - (data.discount || 0));

    const invoice = await prisma.invoice.create({
      data: {
        clientId: data.clientId,
        userId: userId,
        projectId: data.projectId || null,
        number: data.number,
        date: data.issueDate || new Date(),
        dueDate: data.dueDate,
        status: data.status || InvoiceStatus.DRAFT,
        subtotal,
        tax: taxAmount,
        total,
        notes: data.notes,
        items: {
          create: data.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.quantity * item.rate
          }))
        }
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

    return invoice as InvoiceWithItems;
  }
}