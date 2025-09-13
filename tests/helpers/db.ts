import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

export class TestDatabase {
  static async setupTestDatabase(): Promise<void> {
    await this.resetDatabase();
    
    try {
      execSync('npx prisma migrate deploy', { 
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL } 
      });
    } catch (error) {
      console.warn('Migration failed, continuing with test setup');
    }
  }

  static async resetDatabase(): Promise<void> {
    const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    for (const { tablename } of tablenames) {
      if (tablename !== '_prisma_migrations') {
        try {
          await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
        } catch (error) {
          console.log(`Could not truncate ${tablename}, it might not exist yet`);
        }
      }
    }
  }

  static async cleanupTestDatabase(): Promise<void> {
    await this.resetDatabase();
    await prisma.$disconnect();
  }

  static async seedTestData(): Promise<{
    freelancer: any;
    client: any;
    project: any;
    task: any;
  }> {
    const freelancer = await prisma.user.create({
      data: {
        email: 'freelancer@test.com',
        password: '$2b$10$K7L/8Y8BmZrVXLe2.6uJqOFXXRAz/kOiP7WT7A7Q.pD2qJQ4zrN7S',
        firstName: 'John',
        lastName: 'Doe',
        role: 'freelancer',
        company: 'Doe Freelancing',
        hourlyRate: 50.0,
      },
    });

    const clientUser = await prisma.user.create({
      data: {
        email: 'client@test.com',
        password: '$2b$10$K7L/8Y8BmZrVXLe2.6uJqOFXXRAz/kOiP7WT7A7Q.pD2qJQ4zrN7S',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'client',
        company: 'Smith Corp',
      },
    });

    const client = await prisma.client.create({
      data: {
        company: 'Test Client Company',
        contactPerson: 'Jane Smith',
        email: 'client@test.com',
        phone: '+385 1 234 5678',
        address: 'Ilica 1',
        city: 'Zagreb',
        country: 'Croatia',
        oib: '12345678901',
        notes: 'Test client for integration tests',
        userId: freelancer.id,
      },
    });

    const service = await prisma.service.create({
      data: {
        name: 'Web Development',
        description: 'Full-stack web development services',
        defaultRate: 50.0,
        userId: freelancer.id,
      },
    });

    const project = await prisma.project.create({
      data: {
        clientId: client.id,
        name: 'Test Website Project',
        status: 'active',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-03-31'),
        budget: 5000.0,
        description: 'A test project for integration tests',
        userId: freelancer.id,
      },
    });

    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Setup Homepage',
        description: 'Create and style the homepage',
        status: 'todo',
        priority: 'medium',
        position: 0,
        dueDate: new Date('2025-01-15'),
        estimatedHours: 8.0,
      },
    });

    return { freelancer, client, project, task };
  }
}

export { prisma };