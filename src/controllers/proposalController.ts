import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { CustomError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/express';
import { calculatePagination, getPaginationMeta } from '../utils/pagination';
import { paginationSchema, uuidSchema } from '../utils/validation';

const proposalItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  rate: z.number().positive(),
  amount: z.number().positive()
});

const createProposalSchema = z.object({
  clientId: uuidSchema,
  projectId: uuidSchema.optional(),
  title: z.string().min(1),
  validUntil: z.coerce.date(),
  notes: z.string().optional(),
  items: z.array(proposalItemSchema).min(1)
});

const updateProposalSchema = z.object({
  clientId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  title: z.string().min(1).optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().optional(),
  items: z.array(proposalItemSchema).optional()
});

export const getProposals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, sort, order } = paginationSchema.parse(req.query);
    const clientId = req.query.clientId as string;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const where: any = {
      deletedAt: null,
      client: {
        userId: req.user!.id
      }
    };

    if (clientId) {
      where.clientId = clientId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }

    const total = await prisma.proposal.count({ where });
    
    const pagination = calculatePagination({ page, limit }, total);

    let orderBy: any = { createdAt: 'desc' };
    if (sort) {
      if (sort.startsWith('-')) {
        const field = sort.substring(1);
        orderBy = { [field]: 'desc' };
      } else {
        orderBy = { [sort]: order };
      }
    }

    const proposals = await prisma.proposal.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        client: {
          select: {
            id: true,
            company: true,
            contactPerson: true
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

    const response: ApiResponse = {
      success: true,
      data: proposals,
      pagination: getPaginationMeta(pagination)
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const createProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createProposalSchema.parse(req.body);

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

    if (validatedData.projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: validatedData.projectId,
          ownerId: req.user!.id,
          deletedAt: null
        }
      });

      if (!project) {
        throw new CustomError('Project not found or access denied', 404);
      }
    }

    const subtotal = validatedData.items.reduce((sum, item) => sum + item.amount, 0);
    const tax = subtotal * 0.25;
    const total = subtotal + tax;

    const proposal = await prisma.proposal.create({
      data: {
        clientId: validatedData.clientId,
        projectId: validatedData.projectId,
        title: validatedData.title,
        validUntil: validatedData.validUntil,
        notes: validatedData.notes,
        subtotal,
        tax,
        total,
        items: {
          create: validatedData.items
        }
      },
      include: {
        client: {
          select: {
            id: true,
            company: true,
            contactPerson: true
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

export const getProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        deletedAt: null,
        client: {
          userId: req.user!.id
        }
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
        project: {
          select: {
            id: true,
            name: true
          }
        },
        items: true
      }
    });

    if (!proposal) {
      throw new CustomError('Proposal not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: proposal
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const updateProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);
    const validatedData = updateProposalSchema.parse(req.body);

    const existingProposal = await prisma.proposal.findFirst({
      where: {
        id,
        deletedAt: null,
        client: {
          userId: req.user!.id
        }
      }
    });

    if (!existingProposal) {
      throw new CustomError('Proposal not found', 404);
    }

    if (existingProposal.status === 'ACCEPTED') {
      throw new CustomError('Cannot update accepted proposals', 400);
    }

    let updateData: any = { ...validatedData };

    if (validatedData.items) {
      const subtotal = validatedData.items.reduce((sum, item) => sum + item.amount, 0);
      const tax = subtotal * 0.25;
      const total = subtotal + tax;

      updateData = {
        ...updateData,
        subtotal,
        tax,
        total
      };

      await prisma.proposalItem.deleteMany({
        where: { proposalId: id }
      });
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        ...updateData,
        ...(validatedData.items && {
          items: {
            create: validatedData.items
          }
        })
      },
      include: {
        client: {
          select: {
            id: true,
            company: true,
            contactPerson: true
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

    const response: ApiResponse = {
      success: true,
      message: 'Proposal updated successfully',
      data: updatedProposal
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const deleteProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        deletedAt: null,
        client: {
          userId: req.user!.id
        }
      }
    });

    if (!proposal) {
      throw new CustomError('Proposal not found', 404);
    }

    if (proposal.status === 'ACCEPTED') {
      throw new CustomError('Cannot delete accepted proposals', 400);
    }

    await prisma.proposal.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Proposal deleted successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

export const acceptProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    uuidSchema.parse(id);

    const proposal = await prisma.proposal.findFirst({
      where: {
        id,
        deletedAt: null,
        status: 'SENT',
        validUntil: {
          gte: new Date()
        }
      }
    });

    if (!proposal) {
      throw new CustomError('Proposal not found or expired', 404);
    }

    const acceptedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date()
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Proposal accepted successfully',
      data: acceptedProposal
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};