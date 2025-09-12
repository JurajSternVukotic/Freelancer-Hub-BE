import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { format, subMonths, startOfMonth, endOfMonth, subYears, startOfYear, endOfYear } from 'date-fns';

const prisma = new PrismaClient();

export interface ReportFilter {
  startDate?: string;
  endDate?: string;
  clientId?: string;
  projectId?: string;
  period?: 'monthly' | 'yearly';
}

export interface RevenueData {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface ReportStats {
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  activeProjects: number;
  completedProjects: number;
  totalClients: number;
  billableHours: number;
  utilizationRate: number;
  pendingInvoices: number;
}

export interface ProjectProfitability {
  projectId: string;
  projectName: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  hours: number;
}

export interface ClientDistribution {
  clientId: string;
  clientName: string;
  revenue: number;
  percentage: number;
}

export interface UtilizationData {
  period: string;
  billableHours: number;
  totalHours: number;
  utilizationRate: number;
}

const parseFilters = (query: any): ReportFilter => {
  const filters: ReportFilter = {};
  
  if (query.startDate) filters.startDate = query.startDate;
  if (query.endDate) filters.endDate = query.endDate;
  if (query.clientId) filters.clientId = query.clientId;
  if (query.projectId) filters.projectId = query.projectId;
  if (query.period) filters.period = query.period;
  
  return filters;
};

const getDefaultDateRange = () => {
  const end = new Date();
  const start = subMonths(end, 12);
  return { start, end };
};

export const getRevenueData = async (req: Request, res: Response) => {
  try {
    console.log('GetRevenueData called')
    console.log('req.user:', req.user)
    
    if (!req.user) {
      console.error('req.user is null/undefined')
      return res.status(401).json({ success: false, message: 'User not authenticated' })
    }
    
    const userId = req.user.id
    console.log('Found userId:', userId)
    const filters = parseFilters(req.query);
    const { start, end } = filters.startDate && filters.endDate 
      ? { start: new Date(filters.startDate), end: new Date(filters.endDate) }
      : getDefaultDateRange();
    
    const period = filters.period || 'monthly';
    const isYearly = period === 'yearly';
    
    const periods: Date[] = [];
    let current = isYearly ? startOfYear(start) : startOfMonth(start);
    const endPeriod = isYearly ? startOfYear(end) : startOfMonth(end);
    
    while (current <= endPeriod) {
      periods.push(new Date(current));
      if (isYearly) {
        current = new Date(current.getFullYear() + 1, 0, 1);
      } else {
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }
    }
    
    const revenueData: RevenueData[] = await Promise.all(
      periods.map(async (period) => {
        const periodStart = isYearly ? startOfYear(period) : startOfMonth(period);
        const periodEnd = isYearly ? endOfYear(period) : endOfMonth(period);
        
        const invoiceRevenue = await prisma.invoice.aggregate({
          where: {
            status: 'PAID',
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
            deletedAt: null,
            userId: userId,
          },
          _sum: {
            total: true,
          },
        });
        
        const billableExpenses = await prisma.expense.aggregate({
          where: {
            userId: userId,
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
            billable: true,
            deletedAt: null,
          },
          _sum: {
            amount: true,
          },
        });
        
        const internalExpenses = await prisma.expense.aggregate({
          where: {
            userId: userId,
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
            billable: false,
            deletedAt: null,
          },
          _sum: {
            amount: true,
          },
        });
        
        const invoiceRevenueAmount = Number(invoiceRevenue._sum.total || 0);
        const billableExpenseAmount = Number(billableExpenses._sum.amount || 0);
        const internalExpenseAmount = Number(internalExpenses._sum.amount || 0);
        
        const revenueAmount = invoiceRevenueAmount + billableExpenseAmount;
        
        return {
          period: format(period, isYearly ? 'yyyy' : 'MMM yyyy'),
          revenue: revenueAmount,
          expenses: internalExpenseAmount,
          profit: revenueAmount - internalExpenseAmount,
        };
      })
    );
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json({
      success: true,
      data: revenueData,
    });
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue data',
    });
  }
};

export const getReportStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const filters = parseFilters(req.query);
    const { start, end } = filters.startDate && filters.endDate 
      ? { start: new Date(filters.startDate), end: new Date(filters.endDate) }
      : getDefaultDateRange();
    
    const dateFilter = {
      gte: start,
      lte: end,
    };
    
    const clientFilter = filters.clientId ? { clientId: filters.clientId } : {};
    
    const invoiceRevenue = await prisma.invoice.aggregate({
      where: {
        status: 'PAID',
        date: dateFilter,
        deletedAt: null,
        ...clientFilter,
        userId: userId,
      },
      _sum: {
        total: true,
      },
    });
    
    const pendingInvoicesCount = await prisma.invoice.count({
      where: {
        status: {
          in: ['DRAFT', 'SENT', 'OVERDUE']
        },
        deletedAt: null,
        userId: userId
      }
    });
    
    const billableExpenses = await prisma.expense.aggregate({
      where: {
        userId: userId,
        date: dateFilter,
        billable: true,
        deletedAt: null,
        ...(filters.clientId && {
          project: {
            clientId: filters.clientId,
          },
        }),
      },
      _sum: {
        amount: true,
      },
    });
    
    const internalExpenses = await prisma.expense.aggregate({
      where: {
        userId: userId,
        date: dateFilter,
        billable: false,
        deletedAt: null,
        ...(filters.clientId && {
          project: {
            clientId: filters.clientId,
          },
        }),
      },
      _sum: {
        amount: true,
      },
    });
    
    const projectStats = await prisma.project.groupBy({
      by: ['status'],
      where: {
        ownerId: userId,
        deletedAt: null,
        createdAt: dateFilter,
        ...clientFilter,
      },
      _count: {
        id: true,
      },
    });
    
    const activeProjects = projectStats.find(p => ['PLANNING', 'ACTIVE', 'ON_HOLD'].includes(p.status))?._count?.id || 0;
    const completedProjects = projectStats.find(p => p.status === 'COMPLETED')?._count?.id || 0;
    
    const clientCount = await prisma.client.count({
      where: {
        userId: userId,
        deletedAt: null,
      },
    });
    
    const timeStats = await prisma.timeEntry.aggregate({
      where: {
        userId: userId,
        startTime: dateFilter,
        deletedAt: null,
        duration: {
          not: null,
        },
        ...(filters.clientId && {
          task: {
            project: {
              clientId: filters.clientId,
            },
          },
        }),
        ...(filters.projectId && {
          task: {
            projectId: filters.projectId,
          },
        }),
      },
      _sum: {
        duration: true,
      },
    });
    
    const billableTimeStats = await prisma.timeEntry.aggregate({
      where: {
        userId: userId,
        startTime: dateFilter,
        deletedAt: null,
        billable: true,
        duration: {
          not: null,
        },
        ...(filters.clientId && {
          task: {
            project: {
              clientId: filters.clientId,
            },
          },
        }),
        ...(filters.projectId && {
          task: {
            projectId: filters.projectId,
          },
        }),
      },
      _sum: {
        duration: true,
      },
    });
    
    const totalMinutes = timeStats._sum.duration || 0;
    const billableMinutes = billableTimeStats._sum.duration || 0;
    const totalHours = totalMinutes / 60;
    const billableHours = billableMinutes / 60;
    const utilizationRate = totalMinutes > 0 ? (billableMinutes / totalMinutes) * 100 : 0;
    
    const invoiceRevenueAmount = Number(invoiceRevenue._sum.total || 0);
    const billableExpenseAmount = Number(billableExpenses._sum.amount || 0);
    const internalExpenseAmount = Number(internalExpenses._sum.amount || 0);
    
    const totalRevenue = invoiceRevenueAmount + billableExpenseAmount;
    const totalExpenses = internalExpenseAmount;
    
    const stats: ReportStats = {
      totalRevenue,
      totalExpenses,
      totalProfit: totalRevenue - totalExpenses,
      activeProjects,
      completedProjects,
      totalClients: clientCount,
      billableHours: Math.round(billableHours * 100) / 100,
      utilizationRate: Math.round(utilizationRate * 100) / 100,
      pendingInvoices: pendingInvoicesCount,
    };
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report statistics',
    });
  }
};

export const getTimeStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const filters = parseFilters(req.query);
    const { start, end } = filters.startDate && filters.endDate 
      ? { start: new Date(filters.startDate), end: new Date(filters.endDate) }
      : getDefaultDateRange();
    
    const periods: Date[] = [];
    let current = startOfMonth(start);
    const endPeriod = startOfMonth(end);
    
    while (current <= endPeriod) {
      periods.push(new Date(current));
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    
    const utilizationData: UtilizationData[] = await Promise.all(
      periods.map(async (period) => {
        const periodStart = startOfMonth(period);
        const periodEnd = endOfMonth(period);
        
        const whereClause = {
          userId: userId,
          startTime: {
            gte: periodStart,
            lte: periodEnd,
          },
          deletedAt: null,
          duration: {
            not: null,
          },
          ...(filters.projectId && {
            task: {
              projectId: filters.projectId,
            },
          }),
        };
        
        const totalTime = await prisma.timeEntry.aggregate({
          where: whereClause,
          _sum: {
            duration: true,
          },
        });
        
        const billableTime = await prisma.timeEntry.aggregate({
          where: {
            ...whereClause,
            billable: true,
          },
          _sum: {
            duration: true,
          },
        });
        
        const totalMinutes = totalTime._sum.duration || 0;
        const billableMinutes = billableTime._sum.duration || 0;
        const totalHours = totalMinutes / 60;
        const billableHours = billableMinutes / 60;
        const utilizationRate = totalMinutes > 0 ? (billableMinutes / totalMinutes) * 100 : 0;
        
        return {
          period: format(period, 'MMM yyyy'),
          billableHours: Math.round(billableHours * 100) / 100,
          totalHours: Math.round(totalHours * 100) / 100,
          utilizationRate: Math.round(utilizationRate * 100) / 100,
        };
      })
    );
    
    res.json({
      success: true,
      data: utilizationData,
    });
  } catch (error) {
    console.error('Error fetching time stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch time statistics',
    });
  }
};

export const getClientStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const filters = parseFilters(req.query);
    const { start, end } = filters.startDate && filters.endDate 
      ? { start: new Date(filters.startDate), end: new Date(filters.endDate) }
      : getDefaultDateRange();
    
    const clientRevenue = await prisma.invoice.groupBy({
      by: ['clientId'],
      where: {
        status: 'PAID',
        date: {
          gte: start,
          lte: end,
        },
        deletedAt: null,
        ...(filters.clientId && { clientId: filters.clientId }),
        userId: userId,
      },
      _sum: {
        total: true,
      },
    });
    
    const clients = await prisma.client.findMany({
      where: {
        id: {
          in: clientRevenue.map(cr => cr.clientId),
        },
        deletedAt: null,
      },
      select: {
        id: true,
        company: true,
      },
    });
    
    const totalRevenue = clientRevenue.reduce((sum, cr) => sum + Number(cr._sum.total || 0), 0);
    
    const clientStats: ClientDistribution[] = clientRevenue.map(cr => {
      const client = clients.find(c => c.id === cr.clientId);
      const revenue = Number(cr._sum.total || 0);
      
      return {
        clientId: cr.clientId,
        clientName: client?.company || 'Unknown Client',
        revenue,
        percentage: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 10000) / 100 : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);
    
    res.json({
      success: true,
      data: clientStats,
    });
  } catch (error) {
    console.error('Error fetching client stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client statistics',
    });
  }
};

export const getProjectStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const filters = parseFilters(req.query);
    const { start, end } = filters.startDate && filters.endDate 
      ? { start: new Date(filters.startDate), end: new Date(filters.endDate) }
      : getDefaultDateRange();
    
    const dateFilter = {
      gte: start,
      lte: end,
    };
    
    const projectWhere = {
      ownerId: userId,
      deletedAt: null,
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.projectId && { id: filters.projectId }),
    };
    
    const projects = await prisma.project.findMany({
      where: projectWhere,
      include: {
        invoices: {
          where: {
            status: 'PAID',
            deletedAt: null,
            userId: userId,
            date: dateFilter,
          },
        },
        expenses: {
          where: {
            deletedAt: null,
            date: dateFilter,
          },
        },
        tasks: {
          where: {
            deletedAt: null,
          },
          include: {
            timeEntries: {
              where: {
                deletedAt: null,
                duration: {
                  not: null,
                },
                startTime: dateFilter,
              },
            },
          },
        },
      },
    });
    
    const projectStats: ProjectProfitability[] = projects.map(project => {
      const invoiceRevenue = project.invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
      
        const billableExpenses = project.expenses.reduce((sum, expense) => 
        sum + (expense.billable ? Number(expense.amount) : 0), 0
      );
      
        const internalExpenses = project.expenses.reduce((sum, expense) => 
        sum + (!expense.billable ? Number(expense.amount) : 0), 0
      );
      
        const revenue = invoiceRevenue + billableExpenses;
      
      const expenses = internalExpenses;
      
      const totalMinutes = project.tasks.reduce((sum, task) => 
        sum + task.timeEntries.reduce((taskSum, entry) => taskSum + (entry.duration || 0), 0), 0
      );
      const hours = totalMinutes / 60;
      
      const profit = revenue - expenses;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      return {
        projectId: project.id,
        projectName: project.name,
        revenue,
        expenses,
        profit,
        margin: Math.round(margin * 100) / 100,
        hours: Math.round(hours * 100) / 100,
      };
    })
    .filter(project => {
      return project.revenue > 0 || project.expenses > 0 || project.hours > 0;
    })
    .sort((a, b) => b.profit - a.profit);
    
    res.json({
      success: true,
      data: projectStats,
    });
  } catch (error) {
    console.error('Error fetching project stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project statistics',
    });
  }
};

export const getProfitabilityReport = async (req: Request, res: Response) => {
  try {
    await getProjectStats(req, res);
  } catch (error) {
    console.error('Error fetching profitability report:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profitability report',
      });
    }
  }
};

export const getUtilizationReport = async (req: Request, res: Response) => {
  try {
    await getTimeStats(req, res);
  } catch (error) {
    console.error('Error fetching utilization report:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch utilization report',
      });
    }
  }
};