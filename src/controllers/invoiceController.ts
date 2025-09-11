import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { InvoiceStatus } from '@prisma/client';
import { InvoiceService, GenerateInvoiceData } from '../services/invoiceService';
import { PdfService } from '../services/pdfService';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/express';
import { calculatePagination, getPaginationMeta } from '../utils/pagination';
import { paginationSchema, uuidSchema } from '../utils/validation';

const generateInvoiceSchema = z.object({
  projectId: uuidSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional()
});

const createInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  number: z.string().min(1),
  date: z.string().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  dueDate: z.union([z.string().min(1), z.coerce.date()]),
  status: z.nativeEnum(InvoiceStatus).optional(),
  subtotal: z.number().min(0),
  taxRate: z.number().min(0).max(100).optional(),
  tax: z.number().min(0),
  discount: z.number().min(0).optional(),
  total: z.number().min(0),
  currency: z.string().default('EUR'),
  notes: z.string().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  paymentTerms: z.string().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  items: z.array(z.object({
    description: z.string().min(1, "Description is required"),
    quantity: z.number().positive("Quantity must be greater than 0"),
    rate: z.number().min(0, "Rate must be 0 or greater"),
    amount: z.number().optional(),
    taxRate: z.number().optional(),
    taxAmount: z.number().optional()
  })).min(1, "At least one item is required")
});

const updateInvoiceStatusSchema = z.object({
  status: z.nativeEnum(InvoiceStatus)
});

export const getInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const statusParam = req.query.status as string;
    const clientId = req.query.clientId as string;
    const projectId = req.query.projectId as string;

    const filters: any = {};
    
    if (statusParam) {
      const statusMap: Record<string, InvoiceStatus> = {
        'draft': InvoiceStatus.DRAFT,
        'sent': InvoiceStatus.SENT,
        'paid': InvoiceStatus.PAID,
        'overdue': InvoiceStatus.OVERDUE
      };
      const status = statusMap[statusParam.toLowerCase()];
      if (status) {
        filters.status = status;
      }
    }
    
    if (clientId) filters.clientId = clientId;
    if (projectId) filters.projectId = projectId;

    const skip = (page - 1) * limit;
    
    const result = await InvoiceService.getInvoices(
      req.user!.id,
      filters,
      { skip, take: limit }
    );

    const pagination = calculatePagination({ page, limit }, result.total);

    const response: ApiResponse = {
      success: true,
      data: result.invoices,
      pagination: getPaginationMeta({
        ...pagination,
        total: result.total
      })
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const generateInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = generateInvoiceSchema.parse(req.body);

    if (validatedData.startDate >= validatedData.endDate) {
      throw new CustomError('Start date must be before end date', 400);
    }

    const generateData: GenerateInvoiceData = {
      projectId: validatedData.projectId,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
      dueDate: validatedData.dueDate,
      notes: validatedData.notes
    };

    const invoice = await InvoiceService.generateFromProject(req.user!.id, generateData);

    const response: ApiResponse = {
      success: true,
      message: 'Invoice generated successfully',
      data: invoice
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const createInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createInvoiceSchema.parse(req.body);
    const userId = req.user!.id;

    const invoiceNumber = validatedData.number || await InvoiceService.generateInvoiceNumber();

    const dueDate = typeof validatedData.dueDate === 'string' ? new Date(validatedData.dueDate) : validatedData.dueDate;
    const date = validatedData.date ? new Date(validatedData.date) : undefined;

    const invoice = await InvoiceService.createManualInvoice(userId, {
      clientId: validatedData.clientId,
      projectId: validatedData.projectId,
      number: invoiceNumber,
      dueDate: dueDate,
      notes: validatedData.notes,
      items: validatedData.items,
      status: validatedData.status,
      taxRate: validatedData.taxRate,
      discount: validatedData.discount,
      subtotal: validatedData.subtotal,
      taxAmount: validatedData.tax,
      total: validatedData.total,
      currency: validatedData.currency,
      paymentTerms: validatedData.paymentTerms,
      issueDate: date
    });

    const response: ApiResponse = {
      success: true,
      data: invoice
    };

    res.status(201).json(response);
  } catch (error: any) {
    next(error);
  }
};

export const getInvoice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const invoice = await InvoiceService.getInvoiceById(req.user!.id, id);

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

export const updateInvoiceStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const { status } = updateInvoiceStatusSchema.parse(req.body);

    const invoice = await InvoiceService.updateInvoiceStatus(req.user!.id, id, status);

    const response: ApiResponse = {
      success: true,
      message: 'Invoice status updated successfully',
      data: invoice
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const getInvoicePdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const invoice = await InvoiceService.getInvoiceById(req.user!.id, id);

    if (!invoice) {
      throw new CustomError('Invoice not found', 404);
    }

    const pdfBuffer = await PdfService.generateInvoicePdf(invoice);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="racun-${invoice.number}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};