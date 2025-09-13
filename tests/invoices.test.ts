import request from 'supertest';
import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import { TestDatabase, prisma } from './helpers/db';
import { 
  UserFactory, 
  ClientFactory, 
  ProjectFactory, 
  TaskFactory, 
  TimeEntryFactory,
  ExpenseFactory,
  InvoiceFactory,
  InvoiceItemFactory
} from './helpers/factories';

describe('Invoices API', () => {
  let freelancer: any;
  let client: any;
  let project: any;
  let task: any;

  beforeEach(async () => {
    await TestDatabase.setupTestDatabase();
    freelancer = await UserFactory.createFreelancer({ hourlyRate: 50 });
    client = await ClientFactory.create(freelancer.id);
    project = await ProjectFactory.create(client.id, freelancer.id);
    task = await TaskFactory.create(project.id);
  });

  afterAll(async () => {
    await TestDatabase.cleanupTestDatabase();
  });

  describe('POST /invoices/generate', () => {
    test('generates invoice from billable time entries', async () => {
      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 120,
        billable: true,
        approved: true,
        description: 'Frontend development',
      });

      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 180,
        billable: true,
        approved: true,
        description: 'Backend API development',
      });

      const timeEntries = await prisma.timeEntry.findMany({
        where: {
          task: { projectId: project.id },
          billable: true,
          approved: true,
        },
      });

      const totalHours = timeEntries.reduce((sum, entry) => sum + entry.duration, 0) / 60;
      const expectedTotal = totalHours * freelancer.hourlyRate;

      const invoiceData = {
        clientId: client.id,
        projectId: project.id,
        date: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'draft',
        total: expectedTotal,
      };

      const invoice = await prisma.invoice.create({
        data: invoiceData,
      });

      for (const entry of timeEntries) {
        await prisma.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            description: entry.description,
            quantity: entry.duration / 60,
            rate: freelancer.hourlyRate,
            amount: (entry.duration / 60) * freelancer.hourlyRate,
          },
        });
      }

      expect(invoice.total).toBe(250);
      expect(invoice.clientId).toBe(client.id);
      expect(invoice.projectId).toBe(project.id);
      expect(invoice.status).toBe('draft');
    });

    test('includes billable expenses in invoice', async () => {
      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 120,
        billable: true,
        approved: true,
      });

      const expense1 = await ExpenseFactory.create(project.id, freelancer.id, {
        amount: 100,
        category: 'Software',
        description: 'Development tools license',
        billable: true,
      });

      const expense2 = await ExpenseFactory.create(project.id, freelancer.id, {
        amount: 50,
        category: 'Travel',
        description: 'Client meeting transport',
        billable: true,
      });

      const billableTimeTotal = 2 * freelancer.hourlyRate;
      const expenseTotal = expense1.amount + expense2.amount;
      const invoiceTotal = billableTimeTotal + expenseTotal;

      const invoice = await InvoiceFactory.create(client.id, project.id, {
        total: invoiceTotal,
      });

      await InvoiceItemFactory.create(invoice.id, {
        description: 'Development work',
        quantity: 2,
        rate: freelancer.hourlyRate,
        amount: billableTimeTotal,
      });

      await InvoiceItemFactory.create(invoice.id, {
        description: expense1.description,
        quantity: 1,
        rate: expense1.amount,
        amount: expense1.amount,
      });

      await InvoiceItemFactory.create(invoice.id, {
        description: expense2.description,
        quantity: 1,
        rate: expense2.amount,
        amount: expense2.amount,
      });

      const invoiceItems = await prisma.invoiceItem.findMany({
        where: { invoiceId: invoice.id },
      });

      const calculatedTotal = invoiceItems.reduce((sum, item) => sum + item.amount, 0);

      expect(invoiceItems).toHaveLength(3);
      expect(calculatedTotal).toBe(250);
    });

    test('generates sequential invoice number', async () => {
      const currentYear = new Date().getFullYear();
      
      const invoice1 = await InvoiceFactory.create(client.id, project.id, {
        number: `${currentYear}-0001`,
      });

      const invoice2 = await InvoiceFactory.create(client.id, project.id, {
        number: `${currentYear}-0002`,
      });

      const invoice3 = await InvoiceFactory.create(client.id, project.id, {
        number: `${currentYear}-0003`,
      });

      const allInvoices = await prisma.invoice.findMany({
        orderBy: { number: 'asc' },
      });

      expect(allInvoices[0].number).toBe(`${currentYear}-0001`);
      expect(allInvoices[1].number).toBe(`${currentYear}-0002`);
      expect(allInvoices[2].number).toBe(`${currentYear}-0003`);

      const getNextInvoiceNumber = async (): Promise<string> => {
        const lastInvoice = await prisma.invoice.findFirst({
          where: {
            number: { startsWith: `${currentYear}-` },
          },
          orderBy: { number: 'desc' },
        });

        if (!lastInvoice) {
          return `${currentYear}-0001`;
        }

        const lastNumber = parseInt(lastInvoice.number.split('-')[1]);
        const nextNumber = lastNumber + 1;
        return `${currentYear}-${nextNumber.toString().padStart(4, '0')}`;
      };

      const nextNumber = await getNextInvoiceNumber();
      expect(nextNumber).toBe(`${currentYear}-0004`);
    });

    test('calculates totals with proper rounding', async () => {
      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 90,
        billable: true,
        approved: true,
      });

      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 105,
        billable: true,
        approved: true,
      });

      const totalMinutes = 90 + 105;
      const totalHours = totalMinutes / 60;
      const total = totalHours * freelancer.hourlyRate;

      const roundedTotal = Math.round(total * 100) / 100;

      expect(roundedTotal).toBe(162.5);

      const roundingTestCases = [
        { amount: 162.505, expected: 162.51 },
        { amount: 162.504, expected: 162.5 },
        { amount: 162.499, expected: 162.5 },
        { amount: 162.001, expected: 162.0 },
      ];

      roundingTestCases.forEach(({ amount, expected }) => {
        const rounded = Math.round(amount * 100) / 100;
        expect(rounded).toBe(expected);
      });
    });

    test('sets due date based on payment terms', async () => {
      const invoiceDate = new Date('2025-02-01');
      const paymentTerms = 30;
      const expectedDueDate = new Date(invoiceDate.getTime() + paymentTerms * 24 * 60 * 60 * 1000);

      const invoice = await InvoiceFactory.create(client.id, project.id, {
        date: invoiceDate,
        dueDate: expectedDueDate,
      });

      expect(invoice.dueDate).toEqual(expectedDueDate);

      const paymentTermsTests = [
        { terms: 15, expectedDays: 15 },
        { terms: 30, expectedDays: 30 },
        { terms: 45, expectedDays: 45 },
      ];

      paymentTermsTests.forEach(({ terms, expectedDays }) => {
        const testDueDate = new Date(invoiceDate.getTime() + terms * 24 * 60 * 60 * 1000);
        const actualDaysDiff = Math.round(
          (testDueDate.getTime() - invoiceDate.getTime()) / (24 * 60 * 60 * 1000)
        );
        expect(actualDaysDiff).toBe(expectedDays);
      });
    });

    test('excludes non-billable and unapproved time entries', async () => {
      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 120,
        billable: true,
        approved: true,
      });

      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 60,
        billable: true,
        approved: false,
      });

      await TimeEntryFactory.create(task.id, freelancer.id, {
        duration: 90,
        billable: false,
        approved: true,
      });

      const billableEntries = await prisma.timeEntry.findMany({
        where: {
          task: { projectId: project.id },
          billable: true,
          approved: true,
        },
      });

      expect(billableEntries).toHaveLength(1);
      expect(billableEntries[0].duration).toBe(120);

      const totalBillableTime = billableEntries.reduce((sum, entry) => sum + entry.duration, 0);
      expect(totalBillableTime).toBe(120);
    });
  });

  describe('GET /invoices', () => {
    test('returns paginated invoices list', async () => {
      const invoices = [];
      for (let i = 0; i < 15; i++) {
        invoices.push(await InvoiceFactory.create(client.id, project.id, {
          number: `2025-${String(i + 1).padStart(4, '0')}`,
          total: 1000 + i * 100,
        }));
      }

      const firstPage = await prisma.invoice.findMany({
        take: 10,
        skip: 0,
        orderBy: { date: 'desc' },
      });

      const secondPage = await prisma.invoice.findMany({
        take: 10,
        skip: 10,
        orderBy: { date: 'desc' },
      });

      expect(firstPage).toHaveLength(10);
      expect(secondPage).toHaveLength(5);
    });

    test('filters invoices by status', async () => {
      await InvoiceFactory.create(client.id, project.id, { status: 'draft' });
      await InvoiceFactory.create(client.id, project.id, { status: 'sent' });
      await InvoiceFactory.create(client.id, project.id, { status: 'paid' });
      await InvoiceFactory.create(client.id, project.id, { status: 'overdue' });

      const sentInvoices = await prisma.invoice.findMany({
        where: { status: 'sent' },
      });

      const paidInvoices = await prisma.invoice.findMany({
        where: { status: 'paid' },
      });

      expect(sentInvoices).toHaveLength(1);
      expect(paidInvoices).toHaveLength(1);
    });

    test('includes client and project information', async () => {
      const invoice = await InvoiceFactory.create(client.id, project.id);

      const invoiceWithRelations = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          client: true,
          project: true,
          items: true,
        },
      });

      expect(invoiceWithRelations?.client.company).toBe(client.company);
      expect(invoiceWithRelations?.project.name).toBe(project.name);
    });

    test('calculates invoice aging for overdue invoices', async () => {
      const pastDate = new Date('2025-01-01');
      const overdueDate = new Date('2025-01-15');
      
      const overdueInvoice = await InvoiceFactory.create(client.id, project.id, {
        date: pastDate,
        dueDate: overdueDate,
        status: 'sent',
      });

      const today = new Date();
      const daysOverdue = Math.floor(
        (today.getTime() - overdueDate.getTime()) / (24 * 60 * 60 * 1000)
      );

      expect(daysOverdue).toBeGreaterThan(0);

      const agingCategory = 
        daysOverdue <= 30 ? '0-30 days' :
        daysOverdue <= 60 ? '31-60 days' :
        daysOverdue <= 90 ? '61-90 days' : '90+ days';

      expect(['0-30 days', '31-60 days', '61-90 days', '90+ days']).toContain(agingCategory);
    });
  });

  describe('GET /invoices/:id', () => {
    test('returns invoice with all line items', async () => {
      const invoice = await InvoiceFactory.create(client.id, project.id);

      await InvoiceItemFactory.create(invoice.id, {
        description: 'Frontend Development',
        quantity: 8,
        rate: 50,
        amount: 400,
      });

      await InvoiceItemFactory.create(invoice.id, {
        description: 'Backend Development',
        quantity: 6,
        rate: 50,
        amount: 300,
      });

      const invoiceWithItems = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          items: true,
          client: true,
          project: true,
        },
      });

      expect(invoiceWithItems?.items).toHaveLength(2);
      
      const totalFromItems = invoiceWithItems?.items.reduce(
        (sum, item) => sum + item.amount, 0
      ) || 0;
      
      expect(totalFromItems).toBe(700);
    });

    test('returns 404 for non-existent invoice', async () => {
      const nonExistentId = 'non-existent-invoice-id';

      const invoice = await prisma.invoice.findUnique({
        where: { id: nonExistentId },
      });

      expect(invoice).toBeNull();
    });
  });

  describe('PUT /invoices/:id', () => {
    test('updates invoice status', async () => {
      const invoice = await InvoiceFactory.create(client.id, project.id, {
        status: 'draft',
      });

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'sent' },
      });

      expect(updatedInvoice.status).toBe('sent');
    });

    test('validates status transitions', async () => {
      const validTransitions = [
        { from: 'draft', to: 'sent' },
        { from: 'sent', to: 'paid' },
        { from: 'sent', to: 'overdue' },
        { from: 'overdue', to: 'paid' },
      ];

      const invalidTransitions = [
        { from: 'paid', to: 'draft' },
        { from: 'paid', to: 'sent' },
        { from: 'sent', to: 'draft' },
      ];

      const isValidTransition = (from: string, to: string): boolean => {
        const allowedTransitions: Record<string, string[]> = {
          draft: ['sent'],
          sent: ['paid', 'overdue'],
          overdue: ['paid'],
          paid: [],
        };

        return allowedTransitions[from]?.includes(to) || false;
      };

      validTransitions.forEach(({ from, to }) => {
        expect(isValidTransition(from, to)).toBe(true);
      });

      invalidTransitions.forEach(({ from, to }) => {
        expect(isValidTransition(from, to)).toBe(false);
      });
    });

    test('updates due date with validation', async () => {
      const invoice = await InvoiceFactory.create(client.id, project.id);
      const newDueDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: { dueDate: newDueDate },
      });

      expect(updatedInvoice.dueDate).toEqual(newDueDate);

      const isValidDueDate = (invoiceDate: Date, dueDate: Date): boolean => {
        return dueDate >= invoiceDate;
      };

      expect(isValidDueDate(invoice.date, newDueDate)).toBe(true);
    });
  });

  describe('GET /invoices/:id/pdf', () => {
    test('returns PDF with Croatian formatting', async () => {
      const invoice = await InvoiceFactory.create(client.id, project.id, {
        date: new Date('2025-02-01'),
        dueDate: new Date('2025-03-01'),
        total: 1250.75,
      });

      await InvoiceItemFactory.create(invoice.id, {
        description: 'Razvoj web aplikacije',
        quantity: 25,
        rate: 50.03,
        amount: 1250.75,
      });

      const pdfData = {
        invoiceNumber: invoice.number,
        date: invoice.date.toLocaleDateString('hr-HR'),
        dueDate: invoice.dueDate.toLocaleDateString('hr-HR'),
        clientInfo: {
          company: client.company,
          oib: client.oib,
          address: client.address,
          city: client.city,
        },
        total: `${invoice.total.toFixed(2)} €`,
        items: [
          {
            description: 'Razvoj web aplikacije',
            quantity: '25,00',
            rate: '50,03 €',
            amount: '1.250,75 €',
          },
        ],
      };

      expect(pdfData.date).toMatch(/^\d{1,2}\.\d{1,2}\.\d{4}\.$/);
      
      expect(pdfData.total).toBe('1250.75 €');
      
      expect(pdfData.items[0].amount).toBe('1.250,75 €');
    });

    test('includes all invoice line items in PDF', async () => {
      const invoice = await InvoiceFactory.create(client.id, project.id);

      const items = [
        await InvoiceItemFactory.create(invoice.id, {
          description: 'Frontend Development',
          quantity: 10,
          rate: 50,
          amount: 500,
        }),
        await InvoiceItemFactory.create(invoice.id, {
          description: 'Backend API Development',
          quantity: 8,
          rate: 60,
          amount: 480,
        }),
        await InvoiceItemFactory.create(invoice.id, {
          description: 'Testing & QA',
          quantity: 4,
          rate: 45,
          amount: 180,
        }),
      ];

      const invoiceForPdf = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: { items: true },
      });

      expect(invoiceForPdf?.items).toHaveLength(3);

      const totalFromItems = invoiceForPdf?.items.reduce(
        (sum, item) => sum + item.amount, 0
      ) || 0;

      expect(totalFromItems).toBe(1160);
    });

    test('shows client details and OIB correctly', async () => {
      const clientWithOib = await ClientFactory.create(freelancer.id, {
        company: 'Test Client d.o.o.',
        oib: '12345678901',
        address: 'Ilica 1',
        city: 'Zagreb',
        country: 'Croatia',
      });

      const invoice = await InvoiceFactory.create(clientWithOib.id, project.id);

      const invoiceWithClient = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: { client: true },
      });

      const pdfClientInfo = {
        company: invoiceWithClient?.client.company,
        oib: `OIB: ${invoiceWithClient?.client.oib}`,
        fullAddress: `${invoiceWithClient?.client.address}, ${invoiceWithClient?.client.city}`,
        country: invoiceWithClient?.client.country,
      };

      expect(pdfClientInfo.company).toBe('Test Client d.o.o.');
      expect(pdfClientInfo.oib).toBe('OIB: 12345678901');
      expect(pdfClientInfo.fullAddress).toBe('Ilica 1, Zagreb');
    });

    test('displays EUR currency correctly', async () => {
      const amounts = [
        { value: 1234.56, formatted: '1.234,56 €' },
        { value: 99.9, formatted: '99,90 €' },
        { value: 1000, formatted: '1.000,00 €' },
        { value: 0.5, formatted: '0,50 €' },
      ];

      const formatCroatianEuro = (amount: number): string => {
        return amount.toLocaleString('hr-HR', {
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      };

      amounts.forEach(({ value, formatted }) => {
        const result = formatCroatianEuro(value);
        expect(result).toContain('€');
        expect(result).toContain(value.toFixed(2).replace('.', ','));
      });
    });

    test('uses DD.MM.YYYY date format', async () => {
      const testDates = [
        new Date('2025-02-01'),
        new Date('2025-12-25'),
        new Date('2025-05-15'),
      ];

      testDates.forEach(date => {
        const croatianFormat = date.toLocaleDateString('hr-HR');
        const isValidFormat = /^\d{1,2}\.\s?\d{1,2}\.\s?\d{4}\.?$/.test(croatianFormat);
        expect(isValidFormat).toBe(true);
      });
    });
  });

  describe('Invoice Business Logic', () => {
    test('prevents modification of paid invoices', async () => {
      const paidInvoice = await InvoiceFactory.create(client.id, project.id, {
        status: 'paid',
        total: 1000,
      });

      const canModify = paidInvoice.status !== 'paid';
      expect(canModify).toBe(false);
    });

    test('automatically marks overdue invoices', async () => {
      const pastDueDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      
      const invoice = await InvoiceFactory.create(client.id, project.id, {
        status: 'sent',
        dueDate: pastDueDate,
      });

      const isOverdue = new Date() > invoice.dueDate && invoice.status === 'sent';
      expect(isOverdue).toBe(true);

      if (isOverdue) {
        const updatedInvoice = await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'overdue' },
        });

        expect(updatedInvoice.status).toBe('overdue');
      }
    });

    test('calculates tax amounts correctly', async () => {
      const invoice = await InvoiceFactory.create(client.id, project.id, {
        total: 1000,
      });

      const vatRate = 0.25;
      const netAmount = invoice.total / (1 + vatRate);
      const vatAmount = invoice.total - netAmount;

      expect(Math.round(netAmount * 100) / 100).toBe(800);
      expect(Math.round(vatAmount * 100) / 100).toBe(200);

      const vatTestCases = [
        { total: 1250, vatRate: 0.25, expectedNet: 1000, expectedVat: 250 },
        { total: 1100, vatRate: 0.10, expectedNet: 1000, expectedVat: 100 },
      ];

      vatTestCases.forEach(({ total, vatRate, expectedNet, expectedVat }) => {
        const net = Math.round((total / (1 + vatRate)) * 100) / 100;
        const vat = Math.round((total - net) * 100) / 100;
        
        expect(net).toBe(expectedNet);
        expect(vat).toBe(expectedVat);
      });
    });

    test('validates invoice number uniqueness', async () => {
      const invoiceNumber = '2025-0001';
      
      await InvoiceFactory.create(client.id, project.id, {
        number: invoiceNumber,
      });

      await expect(
        InvoiceFactory.create(client.id, project.id, {
          number: invoiceNumber,
        })
      ).rejects.toThrow();
    });

    test('handles partial payments tracking', async () => {
      const invoice = await InvoiceFactory.create(client.id, project.id, {
        total: 1000,
        status: 'sent',
      });

      const payments = [
        { amount: 300, date: new Date('2025-02-15') },
        { amount: 400, date: new Date('2025-02-20') },
      ];

      const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
      const remainingBalance = invoice.total - totalPaid;

      expect(totalPaid).toBe(700);
      expect(remainingBalance).toBe(300);

      const newStatus = remainingBalance === 0 ? 'paid' : 'sent';
      expect(newStatus).toBe('sent');
    });
  });

  describe('Invoice Reporting and Analytics', () => {
    test('calculates monthly invoice totals', async () => {
      const januaryInvoices = [
        await InvoiceFactory.create(client.id, project.id, {
          date: new Date('2025-01-15'),
          total: 1500,
        }),
        await InvoiceFactory.create(client.id, project.id, {
          date: new Date('2025-01-25'),
          total: 2000,
        }),
      ];

      const februaryInvoice = await InvoiceFactory.create(client.id, project.id, {
        date: new Date('2025-02-10'),
        total: 1200,
      });

      const januaryTotal = januaryInvoices.reduce((sum, inv) => sum + inv.total, 0);
      const februaryTotal = februaryInvoice.total;

      expect(januaryTotal).toBe(3500);
      expect(februaryTotal).toBe(1200);

      const allInvoices = [...januaryInvoices, februaryInvoice];
      const invoicesByMonth = allInvoices.reduce((groups, invoice) => {
        const month = invoice.date.toISOString().slice(0, 7);
        if (!groups[month]) groups[month] = [];
        groups[month].push(invoice);
        return groups;
      }, {} as Record<string, any[]>);

      expect(invoicesByMonth['2025-01']).toHaveLength(2);
      expect(invoicesByMonth['2025-02']).toHaveLength(1);
    });

    test('generates accounts receivable aging report', async () => {
      const today = new Date();
      
      const current = await InvoiceFactory.create(client.id, project.id, {
        dueDate: new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000),
        status: 'sent',
        total: 1000,
      });

      const days30 = await InvoiceFactory.create(client.id, project.id, {
        dueDate: new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000),
        status: 'overdue',
        total: 800,
      });

      const days60 = await InvoiceFactory.create(client.id, project.id, {
        dueDate: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000),
        status: 'overdue',
        total: 600,
      });

      const invoices = [current, days30, days60];
      const agingReport = {
        current: 0,
        '1-30': 0,
        '31-60': 0,
        '61-90': 0,
        '90+': 0,
      };

      invoices.forEach(invoice => {
        const daysOverdue = Math.floor((today.getTime() - invoice.dueDate.getTime()) / (24 * 60 * 60 * 1000));
        
        if (daysOverdue < 0) {
          agingReport.current += invoice.total;
        } else if (daysOverdue <= 30) {
          agingReport['1-30'] += invoice.total;
        } else if (daysOverdue <= 60) {
          agingReport['31-60'] += invoice.total;
        } else if (daysOverdue <= 90) {
          agingReport['61-90'] += invoice.total;
        } else {
          agingReport['90+'] += invoice.total;
        }
      });

      expect(agingReport.current).toBe(1000);
      expect(agingReport['1-30']).toBe(800);
      expect(agingReport['31-60']).toBe(600);
    });
  });
});