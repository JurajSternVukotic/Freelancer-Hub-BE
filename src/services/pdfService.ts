import puppeteer from 'puppeteer';
import { InvoiceWithItems } from './invoiceService';

export class PdfService {
  static async generateInvoicePdf(invoice: InvoiceWithItems): Promise<Buffer> {
    console.log('Starting PDF generation for invoice:', invoice.id);
    
    let browser;
    try {
      const isDocker = process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV === 'true';
      
      browser = await puppeteer.launch({
        headless: true,
        executablePath: isDocker ? '/usr/bin/chromium-browser' : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      
      const htmlContent = this.generateInvoiceHtml(invoice);
      console.log('Generated HTML content length:', htmlContent.length);
      
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      console.log('HTML content loaded, generating PDF...');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        },
        timeout: 30000
      });

      console.log('PDF generated successfully, size:', pdfBuffer.length, 'bytes');
      return Buffer.from(pdfBuffer);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('Error closing browser:', closeError);
        }
      }
    }
  }

  private static generateInvoiceHtml(invoice: InvoiceWithItems): string {
    const formatDate = (date: Date) => {
      return new Date(date).toLocaleDateString('hr-HR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    };

    const formatCurrency = (amount: number | string) => {
      const num = typeof amount === 'string' ? parseFloat(amount) : amount;
      return new Intl.NumberFormat('hr-HR', {
        style: 'currency',
        currency: 'EUR'
      }).format(num);
    };

    const itemsHtml = invoice.items.map((item, index) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${index + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatCurrency(item.rate.toString())}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatCurrency(item.amount.toString())}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="hr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Račun ${invoice.number}</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
            font-size: 12px;
            line-height: 1.4;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #0066cc;
            padding-bottom: 20px;
        }
        .header h1 {
            color: #0066cc;
            font-size: 24px;
            margin: 0 0 10px 0;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        .company-info, .client-info {
            width: 45%;
        }
        .company-info h3, .client-info h3 {
            color: #0066cc;
            font-size: 14px;
            margin-bottom: 10px;
            border-bottom: 1px solid #0066cc;
            padding-bottom: 5px;
        }
        .info-row {
            margin-bottom: 5px;
        }
        .invoice-details {
            background-color: #f8f9fa;
            padding: 15px;
            border: 1px solid #ddd;
            margin-bottom: 30px;
        }
        .invoice-details table {
            width: 100%;
        }
        .invoice-details td {
            padding: 5px 0;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .items-table th {
            background-color: #0066cc;
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-weight: bold;
        }
        .items-table th:nth-child(1), .items-table th:nth-child(3) {
            text-align: center;
        }
        .items-table th:nth-child(4), .items-table th:nth-child(5) {
            text-align: right;
        }
        .totals {
            float: right;
            width: 300px;
            border: 2px solid #0066cc;
            background-color: #f8f9fa;
        }
        .totals table {
            width: 100%;
        }
        .totals td {
            padding: 10px 15px;
            border-bottom: 1px solid #ddd;
        }
        .totals .total-row {
            background-color: #0066cc;
            color: white;
            font-weight: bold;
        }
        .totals .total-row td {
            border-bottom: none;
        }
        .payment-info {
            clear: both;
            margin-top: 50px;
            padding: 20px;
            background-color: #f8f9fa;
            border-left: 4px solid #0066cc;
        }
        .notes {
            margin-top: 30px;
            padding: 15px;
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
        }
        .footer {
            text-align: center;
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>RAČUN</h1>
        <div style="font-size: 16px; color: #666;">Broj: <strong>${invoice.number}</strong></div>
    </div>

    <div class="invoice-info" style="display: flex; justify-content: space-between;">
        <div class="company-info">
            <h3>IZDAVATELJ</h3>
            <div class="info-row"><strong>FreelancerHub</strong></div>
            <div class="info-row">Freelancer usluge</div>
            <div class="info-row">Zagreb, Hrvatska</div>
            <div class="info-row">OIB: 12345678901</div>
        </div>

        <div class="client-info">
            <h3>KUPAC</h3>
            <div class="info-row"><strong>${invoice.client.company}</strong></div>
            <div class="info-row">${invoice.client.contactPerson}</div>
            ${invoice.client.address ? `<div class="info-row">${invoice.client.address}</div>` : ''}
            ${invoice.client.city ? `<div class="info-row">${invoice.client.city}, ${invoice.client.country || 'Hrvatska'}</div>` : ''}
            ${invoice.client.oib ? `<div class="info-row">OIB: ${invoice.client.oib}</div>` : ''}
        </div>
    </div>

    <div class="invoice-details">
        <table>
            <tr>
                <td style="width: 30%; font-weight: bold;">Datum računa:</td>
                <td>${formatDate(invoice.date)}</td>
                <td style="width: 30%; font-weight: bold;">Datum dospijeća:</td>
                <td>${formatDate(invoice.dueDate)}</td>
            </tr>
            ${invoice.project ? `
            <tr>
                <td style="font-weight: bold;">Projekt:</td>
                <td colspan="3">${invoice.project.name}</td>
            </tr>
            ` : ''}
        </table>
    </div>

    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 5%;">R.br.</th>
                <th style="width: 50%;">Opis usluge</th>
                <th style="width: 10%;">Količina</th>
                <th style="width: 15%;">Jedinična cijena</th>
                <th style="width: 20%;">Ukupno</th>
            </tr>
        </thead>
        <tbody>
            ${itemsHtml}
        </tbody>
    </table>

    <div class="totals">
        <table>
            <tr>
                <td style="font-weight: bold;">Ukupno bez PDV-a:</td>
                <td style="text-align: right;">${formatCurrency(invoice.subtotal.toString())}</td>
            </tr>
            <tr>
                <td style="font-weight: bold;">PDV (25%):</td>
                <td style="text-align: right;">${formatCurrency(invoice.tax.toString())}</td>
            </tr>
            <tr class="total-row">
                <td style="font-weight: bold;">UKUPNO ZA PLAĆANJE:</td>
                <td style="text-align: right; font-weight: bold;">${formatCurrency(invoice.total.toString())}</td>
            </tr>
        </table>
    </div>

    <div class="payment-info">
        <h4 style="margin-top: 0; color: #0066cc;">Način plaćanja:</h4>
        <div>Plaćanje virmanom na žiro račun u roku od 30 dana.</div>
        <div style="margin-top: 10px;">
            <strong>IBAN:</strong> HR1234567890123456789<br>
            <strong>Poziv na broj:</strong> ${invoice.number.replace('-', '')}<br>
            <strong>Model:</strong> HR01
        </div>
    </div>

    ${invoice.notes ? `
    <div class="notes">
        <h4 style="margin-top: 0; color: #856404;">Napomene:</h4>
        <div>${invoice.notes}</div>
    </div>
    ` : ''}

    <div class="footer">
        <div>Ovaj račun je generiran elektronički i važeći je bez potpisa.</div>
        <div>FreelancerHub - Sustav za upravljanje freelancer poslovima</div>
    </div>
</body>
</html>`;
  }
}