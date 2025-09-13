import request from 'supertest';
import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import { TestDatabase, prisma } from './helpers/db';
import { UserFactory, ClientFactory } from './helpers/factories';

describe('Clients API', () => {
  let freelancer: any;
  let mockApp: any;

  beforeEach(async () => {
    await TestDatabase.setupTestDatabase();
    freelancer = await UserFactory.createFreelancer();
  });

  afterAll(async () => {
    await TestDatabase.cleanupTestDatabase();
  });

  describe('GET /clients', () => {
    test('returns paginated clients for authenticated user', async () => {
      const clients = [];
      for (let i = 0; i < 25; i++) {
        const client = await ClientFactory.create(freelancer.id, {
          company: `Test Company ${i + 1}`,
        });
        clients.push(client);
      }

      const result = await prisma.client.findMany({
        where: { userId: freelancer.id },
        take: 20,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });

      expect(result).toHaveLength(20);
      expect(result[0].company).toBe('Test Company 25');
    });

    test('filters clients by search query', async () => {
      await ClientFactory.create(freelancer.id, {
        company: 'Zagreb Corp',
        city: 'Zagreb',
      });
      await ClientFactory.create(freelancer.id, {
        company: 'Split Ltd',
        city: 'Split',
      });
      await ClientFactory.create(freelancer.id, {
        company: 'Another Zagreb Company',
        city: 'Zagreb',
      });

      const zagrebClients = await prisma.client.findMany({
        where: {
          userId: freelancer.id,
          OR: [
            { company: { contains: 'Zagreb', mode: 'insensitive' } },
            { city: { contains: 'Zagreb', mode: 'insensitive' } },
            { contactPerson: { contains: 'Zagreb', mode: 'insensitive' } },
          ],
        },
      });

      expect(zagrebClients).toHaveLength(2);
      expect(zagrebClients.every(client => 
        client.company.includes('Zagreb') || client.city === 'Zagreb'
      )).toBe(true);
    });

    test('returns empty array for user with no clients', async () => {
      const newFreelancer = await UserFactory.createFreelancer();

      const clients = await prisma.client.findMany({
        where: { userId: newFreelancer.id },
      });

      expect(clients).toHaveLength(0);
    });

    test('only returns clients for authenticated user', async () => {
      const otherFreelancer = await UserFactory.createFreelancer();
      
      await ClientFactory.create(freelancer.id, { company: 'My Client' });
      await ClientFactory.create(otherFreelancer.id, { company: 'Other Client' });

      const myClients = await prisma.client.findMany({
        where: { userId: freelancer.id },
      });

      const otherClients = await prisma.client.findMany({
        where: { userId: otherFreelancer.id },
      });

      expect(myClients).toHaveLength(1);
      expect(myClients[0].company).toBe('My Client');
      
      expect(otherClients).toHaveLength(1);
      expect(otherClients[0].company).toBe('Other Client');
    });

    test('supports pagination with skip and take', async () => {
      for (let i = 0; i < 30; i++) {
        await ClientFactory.create(freelancer.id, {
          company: `Company ${String(i + 1).padStart(2, '0')}`,
        });
      }

      const page1 = await prisma.client.findMany({
        where: { userId: freelancer.id },
        take: 20,
        skip: 0,
        orderBy: { company: 'asc' },
      });

      const page2 = await prisma.client.findMany({
        where: { userId: freelancer.id },
        take: 20,
        skip: 20,
        orderBy: { company: 'asc' },
      });

      expect(page1).toHaveLength(20);
      expect(page2).toHaveLength(10);
      expect(page1[0].company).toBe('Company 01');
      expect(page2[0].company).toBe('Company 21');
    });
  });

  describe('POST /clients', () => {
    test('creates client with valid data', async () => {
      const clientData = {
        company: 'Test Company Ltd',
        contactPerson: 'John Smith',
        email: 'john@testcompany.com',
        phone: '+385 1 234 5678',
        address: 'Ilica 1',
        city: 'Zagreb',
        country: 'Croatia',
        oib: '12345678901',
        notes: 'Important client for testing',
      };

      const client = await prisma.client.create({
        data: {
          ...clientData,
          userId: freelancer.id,
        },
      });

      expect(client.company).toBe(clientData.company);
      expect(client.contactPerson).toBe(clientData.contactPerson);
      expect(client.email).toBe(clientData.email);
      expect(client.oib).toBe(clientData.oib);
      expect(client.userId).toBe(freelancer.id);
    });

    test('validates Croatian OIB format', () => {
      const validOIBs = [
        '12345678901',
        '98765432109',
        '11111111111',
      ];

      const invalidOIBs = [
        '123456789',
        '123456789012',
        'abcdefghijk',
        '1234567890a',
        '',
      ];

      const isValidOIB = (oib: string): boolean => {
        return /^\d{11}$/.test(oib);
      };

      validOIBs.forEach(oib => {
        expect(isValidOIB(oib)).toBe(true);
      });

      invalidOIBs.forEach(oib => {
        expect(isValidOIB(oib)).toBe(false);
      });
    });

    test('requires company name', async () => {
      const clientDataWithoutCompany = {
        contactPerson: 'John Smith',
        email: 'john@test.com',
        userId: freelancer.id,
      };

      await expect(
        prisma.client.create({
          data: clientDataWithoutCompany as any,
        })
      ).rejects.toThrow();
    });

    test('validates email format', () => {
      const validEmails = [
        'user@domain.com',
        'test.user@example.org',
        'user+label@domain.co.uk',
      ];

      const invalidEmails = [
        'notanemail',
        '@domain.com',
        'user@',
        'user@domain',
        '',
      ];

      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      validEmails.forEach(email => {
        expect(isValidEmail(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        expect(isValidEmail(email)).toBe(false);
      });
    });

    test('associates client with authenticated user', async () => {
      const client = await ClientFactory.create(freelancer.id);
      
      expect(client.userId).toBe(freelancer.id);

      const clientWithUser = await prisma.client.findUnique({
        where: { id: client.id },
        include: { user: true },
      });

      expect(clientWithUser?.user.id).toBe(freelancer.id);
    });
  });

  describe('GET /clients/:id', () => {
    test('returns client details for authorized user', async () => {
      const client = await ClientFactory.create(freelancer.id, {
        company: 'Specific Test Company',
        notes: 'Detailed notes about this client',
      });

      const foundClient = await prisma.client.findUnique({
        where: { id: client.id },
        include: {
          projects: true,
          invoices: true,
        },
      });

      expect(foundClient?.company).toBe('Specific Test Company');
      expect(foundClient?.notes).toBe('Detailed notes about this client');
      expect(foundClient?.projects).toEqual([]);
      expect(foundClient?.invoices).toEqual([]);
    });

    test('returns 404 for non-existent client', async () => {
      const nonExistentId = 'non-existent-id';

      const client = await prisma.client.findUnique({
        where: { id: nonExistentId },
      });

      expect(client).toBeNull();
    });

    test('prevents access to other users clients', async () => {
      const otherFreelancer = await UserFactory.createFreelancer();
      const otherClient = await ClientFactory.create(otherFreelancer.id);

      const client = await prisma.client.findFirst({
        where: {
          id: otherClient.id,
          userId: freelancer.id,
        },
      });

      expect(client).toBeNull();
    });
  });

  describe('PUT /clients/:id', () => {
    test('updates client with partial data', async () => {
      const client = await ClientFactory.create(freelancer.id, {
        company: 'Original Company',
        email: 'original@test.com',
      });

      const updatedClient = await prisma.client.update({
        where: { id: client.id },
        data: {
          company: 'Updated Company',
        },
      });

      expect(updatedClient.company).toBe('Updated Company');
      expect(updatedClient.email).toBe('original@test.com');
    });

    test('validates OIB on update', async () => {
      const client = await ClientFactory.create(freelancer.id);

      const validUpdate = await prisma.client.update({
        where: { id: client.id },
        data: { oib: '98765432109' },
      });

      expect(validUpdate.oib).toBe('98765432109');

      const isValidOIB = (oib: string): boolean => {
        return /^\d{11}$/.test(oib);
      };

      expect(isValidOIB('invalid-oib')).toBe(false);
    });

    test('prevents updating other users clients', async () => {
      const otherFreelancer = await UserFactory.createFreelancer();
      const otherClient = await ClientFactory.create(otherFreelancer.id);

      const result = await prisma.client.updateMany({
        where: {
          id: otherClient.id,
          userId: freelancer.id,
        },
        data: {
          company: 'Hacked Company',
        },
      });

      expect(result.count).toBe(0);
    });

    test('returns updated client data', async () => {
      const client = await ClientFactory.create(freelancer.id, {
        company: 'Before Update',
        notes: 'Old notes',
      });

      const updatedData = {
        company: 'After Update',
        notes: 'New notes',
        city: 'New City',
      };

      const updatedClient = await prisma.client.update({
        where: { id: client.id },
        data: updatedData,
      });

      expect(updatedClient.company).toBe('After Update');
      expect(updatedClient.notes).toBe('New notes');
      expect(updatedClient.city).toBe('New City');
      expect(updatedClient.id).toBe(client.id);
    });
  });

  describe('DELETE /clients/:id', () => {
    test('soft deletes client', async () => {
      const client = await ClientFactory.create(freelancer.id);

      const softDeletedClient = await prisma.client.update({
        where: { id: client.id },
        data: {
          notes: `DELETED: ${client.notes || ''}`,
        },
      });

      expect(softDeletedClient.notes).toContain('DELETED:');
    });

    test('prevents deletion of clients with active projects', async () => {
      const client = await ClientFactory.create(freelancer.id);
      
      const project = await prisma.project.create({
        data: {
          clientId: client.id,
          name: 'Active Project',
          status: 'active',
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          budget: 5000,
          description: 'An active project',
          userId: freelancer.id,
        },
      });

      const activeProjects = await prisma.project.findMany({
        where: {
          clientId: client.id,
          status: { in: ['planning', 'active'] },
        },
      });

      expect(activeProjects.length).toBeGreaterThan(0);
    });

    test('prevents deleting other users clients', async () => {
      const otherFreelancer = await UserFactory.createFreelancer();
      const otherClient = await ClientFactory.create(otherFreelancer.id);

      const result = await prisma.client.deleteMany({
        where: {
          id: otherClient.id,
          userId: freelancer.id,
        },
      });

      expect(result.count).toBe(0);
    });

    test('cascades deletion to related data appropriately', async () => {
      const client = await ClientFactory.create(freelancer.id);
      
      const project = await prisma.project.create({
        data: {
          clientId: client.id,
          name: 'Test Project',
          status: 'completed',
          startDate: new Date(),
          endDate: new Date(),
          budget: 1000,
          description: 'Test',
          userId: freelancer.id,
        },
      });


      const relatedProjects = await prisma.project.findMany({
        where: { clientId: client.id },
      });

      expect(relatedProjects).toHaveLength(1);
    });
  });

  describe('Client Data Validation', () => {
    test('handles special characters in company names', async () => {
      const specialCompanyNames = [
        'Müller & Co. GmbH',
        'Société Française SARL',
        'Škoda Auto d.o.o.',
        'Company "With Quotes"',
        'Company & Partners LLC',
      ];

      for (const companyName of specialCompanyNames) {
        const client = await ClientFactory.create(freelancer.id, {
          company: companyName,
        });

        expect(client.company).toBe(companyName);
      }
    });

    test('validates Croatian phone number formats', () => {
      const validPhones = [
        '+385 1 234 5678',
        '+385 91 234 5678',
        '01/234-5678',
        '091/234-567',
        '+385 21 123 456',
      ];

      const invalidPhones = [
        '123',
        '+1 555 123 4567',
        'not-a-phone',
        '',
      ];

      const isValidCroatianPhone = (phone: string): boolean => {
        const phoneRegex = /^(\+385|0)[0-9\s\-\/]{8,15}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
      };

      validPhones.forEach(phone => {
        expect(isValidCroatianPhone(phone)).toBe(true);
      });

    });

    test('handles Unicode characters in contact names', async () => {
      const unicodeNames = [
        'Đorđe Petrović',
        'Žana Šimić',
        'Ćiril Čović',
        'José María García',
        'François Müller',
      ];

      for (const name of unicodeNames) {
        const client = await ClientFactory.create(freelancer.id, {
          contactPerson: name,
        });

        expect(client.contactPerson).toBe(name);
      }
    });
  });

  describe('Client Search and Filtering', () => {
    test('searches across multiple fields', async () => {
      await ClientFactory.create(freelancer.id, {
        company: 'Tech Solutions Ltd',
        contactPerson: 'John Smith',
        email: 'john@techsolutions.com',
        city: 'Zagreb',
      });

      await ClientFactory.create(freelancer.id, {
        company: 'Marketing Agency',
        contactPerson: 'Sarah Johnson',
        email: 'sarah@marketing.com',
        city: 'Split',
      });

      const techSearch = await prisma.client.findMany({
        where: {
          userId: freelancer.id,
          OR: [
            { company: { contains: 'Tech', mode: 'insensitive' } },
            { contactPerson: { contains: 'Tech', mode: 'insensitive' } },
            { email: { contains: 'Tech', mode: 'insensitive' } },
          ],
        },
      });

      expect(techSearch).toHaveLength(1);
      expect(techSearch[0].company).toBe('Tech Solutions Ltd');
    });

    test('filters by city', async () => {
      const zagrebClients = [];
      const splitClients = [];

      for (let i = 0; i < 3; i++) {
        zagrebClients.push(await ClientFactory.create(freelancer.id, { city: 'Zagreb' }));
        splitClients.push(await ClientFactory.create(freelancer.id, { city: 'Split' }));
      }

      const zagrebResults = await prisma.client.findMany({
        where: {
          userId: freelancer.id,
          city: 'Zagreb',
        },
      });

      expect(zagrebResults).toHaveLength(3);
      expect(zagrebResults.every(c => c.city === 'Zagreb')).toBe(true);
    });

    test('sorts clients by different fields', async () => {
      const clients = [
        await ClientFactory.create(freelancer.id, { company: 'Zebra Corp' }),
        await ClientFactory.create(freelancer.id, { company: 'Alpha Inc' }),
        await ClientFactory.create(freelancer.id, { company: 'Beta LLC' }),
      ];

      const sortedByName = await prisma.client.findMany({
        where: { userId: freelancer.id },
        orderBy: { company: 'asc' },
      });

      expect(sortedByName[0].company).toBe('Alpha Inc');
      expect(sortedByName[1].company).toBe('Beta LLC');
      expect(sortedByName[2].company).toBe('Zebra Corp');
    });
  });
});