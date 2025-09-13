import { faker } from 'faker';
import { prisma } from './db';
import bcrypt from 'bcryptjs';

export class UserFactory {
  static async createFreelancer(overrides: any = {}) {
    const password = await bcrypt.hash('password123', 10);
    
    return prisma.user.create({
      data: {
        email: faker.internet.email(),
        password,
        firstName: faker.name.firstName(),
        lastName: faker.name.lastName(),
        role: 'freelancer',
        company: faker.company.companyName(),
        hourlyRate: parseFloat(faker.commerce.price(25, 150)),
        avatar: faker.internet.avatar(),
        ...overrides,
      },
    });
  }

  static async createClient(overrides: any = {}) {
    const password = await bcrypt.hash('password123', 10);
    
    return prisma.user.create({
      data: {
        email: faker.internet.email(),
        password,
        firstName: faker.name.firstName(),
        lastName: faker.name.lastName(),
        role: 'client',
        company: faker.company.companyName(),
        ...overrides,
      },
    });
  }
}

export class ClientFactory {
  static async create(userId: string, overrides: any = {}) {
    return prisma.client.create({
      data: {
        company: faker.company.companyName(),
        contactPerson: faker.name.findName(),
        email: faker.internet.email(),
        phone: faker.phone.phoneNumber(),
        address: faker.address.streetAddress(),
        city: faker.helpers.arrayElement(['Zagreb', 'Split', 'Rijeka', 'Osijek']),
        country: 'Croatia',
        oib: faker.random.numeric(11),
        notes: faker.lorem.paragraph(),
        userId,
        ...overrides,
      },
    });
  }
}

export class ServiceFactory {
  static async create(userId: string, overrides: any = {}) {
    return prisma.service.create({
      data: {
        name: faker.helpers.arrayElement([
          'Web Development',
          'Mobile Development',
          'UI/UX Design',
          'Digital Marketing',
          'Consulting',
        ]),
        description: faker.lorem.sentence(),
        defaultRate: parseFloat(faker.commerce.price(30, 120)),
        userId,
        ...overrides,
      },
    });
  }
}

export class ProjectFactory {
  static async create(clientId: string, userId: string, overrides: any = {}) {
    const startDate = faker.date.future();
    const endDate = new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);

    return prisma.project.create({
      data: {
        clientId,
        name: faker.helpers.arrayElement([
          'E-commerce Website',
          'Company Website',
          'Mobile App',
          'Dashboard Application',
          'API Development',
        ]),
        status: faker.helpers.arrayElement(['planning', 'active', 'on-hold', 'completed']),
        startDate,
        endDate,
        budget: parseFloat(faker.commerce.price(1000, 50000)),
        description: faker.lorem.paragraph(),
        userId,
        ...overrides,
      },
    });
  }
}

export class TaskFactory {
  static async create(projectId: string, overrides: any = {}) {
    return prisma.task.create({
      data: {
        projectId,
        title: faker.helpers.arrayElement([
          'Setup project structure',
          'Design homepage',
          'Implement authentication',
          'Create API endpoints',
          'Write unit tests',
          'Deploy to production',
        ]),
        description: faker.lorem.paragraph(),
        status: faker.helpers.arrayElement(['todo', 'in-progress', 'review', 'done']),
        priority: faker.helpers.arrayElement(['low', 'medium', 'high', 'urgent']),
        position: faker.random.numeric(1),
        dueDate: faker.date.future(),
        estimatedHours: parseFloat(faker.random.numeric(1)) * 2 + 1,
        ...overrides,
      },
    });
  }

  static async createMultiple(projectId: string, count: number = 5) {
    const tasks = [];
    for (let i = 0; i < count; i++) {
      const task = await this.create(projectId, { position: i });
      tasks.push(task);
    }
    return tasks;
  }
}

export class TimeEntryFactory {
  static async create(taskId: string, userId: string, overrides: any = {}) {
    const startTime = faker.date.past();
    const duration = faker.random.numeric(1) * 60;
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    return prisma.timeEntry.create({
      data: {
        taskId,
        userId,
        startTime,
        endTime,
        duration,
        description: faker.lorem.sentence(),
        billable: faker.datatype.boolean(),
        approved: faker.datatype.boolean(),
        ...overrides,
      },
    });
  }

  static async createMultiple(taskId: string, userId: string, count: number = 3) {
    const entries = [];
    for (let i = 0; i < count; i++) {
      const entry = await this.create(taskId, userId);
      entries.push(entry);
    }
    return entries;
  }
}

export class ExpenseFactory {
  static async create(projectId: string, userId: string, overrides: any = {}) {
    return prisma.expense.create({
      data: {
        projectId,
        userId,
        date: faker.date.past(),
        amount: parseFloat(faker.commerce.price(10, 500)),
        category: faker.helpers.arrayElement([
          'Software',
          'Hardware',
          'Travel',
          'Materials',
          'Subcontractor',
          'Other',
        ]),
        description: faker.lorem.sentence(),
        receipt: faker.internet.url(),
        billable: faker.datatype.boolean(),
        ...overrides,
      },
    });
  }
}

export class InvoiceFactory {
  static async create(clientId: string, projectId: string, overrides: any = {}) {
    const date = faker.date.past();
    const dueDate = new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000);

    return prisma.invoice.create({
      data: {
        clientId,
        projectId,
        number: `2025-${faker.random.numeric(4).padStart(4, '0')}`,
        date,
        dueDate,
        status: faker.helpers.arrayElement(['draft', 'sent', 'paid', 'overdue']),
        total: parseFloat(faker.commerce.price(500, 10000)),
        ...overrides,
      },
    });
  }
}

export class InvoiceItemFactory {
  static async create(invoiceId: string, overrides: any = {}) {
    const quantity = faker.random.numeric(1);
    const rate = parseFloat(faker.commerce.price(30, 150));
    const amount = quantity * rate;

    return prisma.invoiceItem.create({
      data: {
        invoiceId,
        description: faker.helpers.arrayElement([
          'Frontend Development',
          'Backend Development',
          'UI/UX Design',
          'Project Management',
          'Testing & QA',
        ]),
        quantity: parseFloat(quantity),
        rate,
        amount,
        ...overrides,
      },
    });
  }
}

export class ProposalFactory {
  static async create(clientId: string, projectId: string, overrides: any = {}) {
    return prisma.proposal.create({
      data: {
        clientId,
        projectId,
        validUntil: faker.date.future(),
        status: faker.helpers.arrayElement(['draft', 'sent', 'accepted', 'rejected']),
        total: parseFloat(faker.commerce.price(1000, 25000)),
        ...overrides,
      },
    });
  }
}

export class ProposalItemFactory {
  static async create(proposalId: string, overrides: any = {}) {
    const quantity = faker.random.numeric(1);
    const rate = parseFloat(faker.commerce.price(30, 150));
    const amount = quantity * rate;

    return prisma.proposalItem.create({
      data: {
        proposalId,
        description: faker.helpers.arrayElement([
          'Initial consultation',
          'Design mockups',
          'Development phase',
          'Testing & deployment',
          'Training & support',
        ]),
        quantity: parseFloat(quantity),
        rate,
        amount,
        ...overrides,
      },
    });
  }
}

export class RetainerFactory {
  static async create(clientId: string, overrides: any = {}) {
    const startDate = faker.date.past();
    const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);

    return prisma.retainer.create({
      data: {
        clientId,
        monthlyHours: faker.helpers.arrayElement([20, 40, 60, 80]),
        rate: parseFloat(faker.commerce.price(40, 100)),
        startDate,
        endDate,
        ...overrides,
      },
    });
  }
}