import { GmailClient } from '../src/email-providers/gmail-client';
import { iCloudClient } from '../src/email-providers/icloud-client';
import { EmailFilter } from '../src/email-processors/email-filter';
import { EmailParser } from '../src/email-processors/email-parser';
import { EmailData, EmailRule } from '../src/types/index';

// Mock dependencies
jest.mock('../src/email-providers/gmail-client');
jest.mock('../src/email-providers/icloud-client');
jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('Email Integration Tests', () => {
  let mockGmailClient: jest.Mocked<GmailClient>;
  let mockiCloudClient: jest.Mocked<iCloudClient>;

  const mockEmailRules: EmailRule[] = [
    {
      name: 'gastos_comunes',
      status: 'active',
      providers: ['gmail', 'icloud'],
      fromContains: ['gastos', 'edificio'],
      subjectContains: ['gasto común', 'cuota'],
      prompt: 'Extract building fees info',
      reminderTemplate: {
        titleTemplate: 'Pagar gastos comunes ${monto} - ${periodo}',
        listName: 'Facturas',
        priority: 'normal' as const,
        daysBeforeReminder: 3,
        timeOfDay: '09:00'
      }
    },
    {
      name: 'facturas_servicios',
      status: 'active',
      providers: ['gmail', 'icloud'],
      fromDomains: ['enel.cl', 'movistar.cl'],
      subjectContains: ['factura'],
      prompt: 'Extract utility bill info',
      reminderTemplate: {
        titleTemplate: 'Pagar ${empresa} - $${monto}',
        listName: 'Servicios',
        priority: 'high' as const,
        daysBeforeReminder: 5,
        timeOfDay: '10:00'
      }
    },
    {
      name: 'entregas_amazon',
      status: 'active',
      providers: ['gmail', 'icloud'],
      fromDomains: ['amazon.com'],
      subjectContains: ['pedido', 'enviado'],
      prompt: 'Extract delivery info',
      reminderTemplate: {
        titleTemplate: 'Recibir pedido Amazon',
        listName: 'Entregas',
        priority: 'low' as const,
        daysBeforeReminder: 1,
        timeOfDay: '14:00'
      }
    }
  ];

  // Sample emails that would come from real providers
  const mockGmailEmails: EmailData[] = [
    {
      id: 'gmail_1',
      from: 'gastos@edificio.cl',
      subject: 'Gasto común enero 2025',
      body: 'Estimado propietario, el gasto común del mes de enero es de $45.000 pesos. El plazo para pagar vence el 15 de febrero de 2025.',
      date: new Date('2025-01-20'),
      provider: 'gmail',
      processed: false,
      matchedRules: []
    },
    {
      id: 'gmail_2',
      from: 'orders@amazon.com',
      subject: 'Tu pedido ha sido enviado',
      body: 'Tu pedido de Auriculares Bluetooth llegará el 25 de febrero. Número de tracking: TRK123456789.',
      date: new Date('2025-02-20'),
      provider: 'gmail',
      processed: false,
      matchedRules: []
    }
  ];

  const mockiCloudEmails: EmailData[] = [
    {
      id: 'icloud_1',
      from: 'facturacion@enel.cl',
      subject: 'Factura eléctrica febrero',
      body: 'Su factura de electricidad tiene un monto total de $23.500. La fecha de vencimiento es el 28 de febrero de 2025.',
      date: new Date('2025-02-05'),
      provider: 'icloud',
      processed: false,
      matchedRules: []
    },
    {
      id: 'icloud_2',
      from: 'newsletter@example.com',
      subject: 'Weekly Newsletter',
      body: 'This is a newsletter with no relevant content for bill reminders.',
      date: new Date('2025-02-21'),
      provider: 'icloud',
      processed: false,
      matchedRules: []
    }
  ];

  beforeEach(() => {
    // Create mocked instances
    mockGmailClient = new GmailClient() as jest.Mocked<GmailClient>;
    mockiCloudClient = new iCloudClient({
      email: 'test@icloud.com',
      password: 'app-password'
    }) as jest.Mocked<iCloudClient>;

    // Setup mocks
    mockGmailClient.initialize = jest.fn().mockResolvedValue(undefined);
    mockGmailClient.getEmails = jest.fn().mockResolvedValue(mockGmailEmails);
    mockGmailClient.isReady = jest.fn().mockReturnValue(true);

    mockiCloudClient.initialize = jest.fn().mockResolvedValue(undefined);
    mockiCloudClient.getEmails = jest.fn().mockResolvedValue(mockiCloudEmails);
    mockiCloudClient.disconnect = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Email Processing Workflow', () => {
    it('should fetch, filter, and parse emails from both providers', async () => {
      // Step 1: Initialize both clients
      await mockGmailClient.initialize();
      await mockiCloudClient.initialize();

      expect(mockGmailClient.initialize).toHaveBeenCalled();
      expect(mockiCloudClient.initialize).toHaveBeenCalled();

      // Step 2: Fetch emails from both providers
      const gmailEmails = await mockGmailClient.getEmails({ maxResults: 10 });
      const icloudEmails = await mockiCloudClient.getEmails({ limit: 10 });

      expect(gmailEmails).toHaveLength(2);
      expect(icloudEmails).toHaveLength(2);

      // Step 3: Combine emails from both providers
      const allEmails = [...gmailEmails, ...icloudEmails];
      expect(allEmails).toHaveLength(4);

      // Step 4: Apply email filters
      const filteredEmails = EmailFilter.filterEmails(allEmails, mockEmailRules);

      // Check that matching emails have rules assigned
      const emailsWithMatches = filteredEmails.filter(e => e.matchedRules.length > 0);
      expect(emailsWithMatches).toHaveLength(3); // gastos, amazon, enel

      // Verify specific matches
      const gastosEmail = filteredEmails.find(e => e.id === 'gmail_1');
      expect(gastosEmail?.matchedRules).toContain('gastos_comunes');

      const amazonEmail = filteredEmails.find(e => e.id === 'gmail_2');
      expect(amazonEmail?.matchedRules).toContain('entregas_amazon');

      const enelEmail = filteredEmails.find(e => e.id === 'icloud_1');
      expect(enelEmail?.matchedRules).toContain('facturas_servicios');

      const newsletterEmail = filteredEmails.find(e => e.id === 'icloud_2');
      expect(newsletterEmail?.matchedRules).toHaveLength(0);

      // Step 5: Parse matched emails
      const parsedResults = await EmailParser.parseEmails(emailsWithMatches);
      expect(parsedResults).toHaveLength(3);

      // Verify parsed data structure
      for (const result of parsedResults) {
        expect(result).toHaveProperty('emailId');
        expect(result).toHaveProperty('ruleName');
        expect(result).toHaveProperty('extractedFields');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('extractionMethod');
        expect(result.confidence).toBeGreaterThan(0);
      }

      // Step 6: Verify specific extracted data
      const gastosResult = parsedResults.find(r => r.ruleName === 'gastos_comunes');
      expect(gastosResult?.extractedFields.monto).toBe('45000');
      expect(gastosResult?.extractedFields.vencimiento).toBe('2025-02-15');
      expect(gastosResult?.extractedFields.periodo).toBe('enero');

      const enelResult = parsedResults.find(r => r.ruleName === 'facturas_servicios');
      expect(enelResult?.extractedFields.empresa).toBe('Enel');
      expect(enelResult?.extractedFields.monto).toBe('23500');
      expect(enelResult?.extractedFields.vencimiento).toBe('2025-02-28');

      const amazonResult = parsedResults.find(r => r.ruleName === 'entregas_amazon');
      expect(amazonResult?.extractedFields.tracking).toBe('TRK123456789');
      expect(amazonResult?.extractedFields.fechaEntrega).toBe('2025-02-25');
      expect(amazonResult?.extractedFields.proveedor).toBe('Amazon');

      // Step 7: Get processing statistics
      const filterStats = EmailFilter.getFilterStats(allEmails, mockEmailRules);
      expect(filterStats.totalEmails).toBe(4);
      expect(filterStats.emailsWithMatches).toBe(3);
      expect(filterStats.emailsWithoutMatches).toBe(1);

      const parsingStats = EmailParser.getParsingStats(parsedResults);
      expect(parsingStats.totalParsed).toBe(3);
      expect(parsingStats.averageConfidence).toBeGreaterThan(0);

      // Step 8: Clean up connections
      await mockiCloudClient.disconnect();
      expect(mockiCloudClient.disconnect).toHaveBeenCalled();
    });

    it('should handle provider connection failures gracefully', async () => {
      // Mock Gmail connection failure
      mockGmailClient.initialize = jest.fn().mockRejectedValue(new Error('Gmail connection failed'));
      mockGmailClient.isReady = jest.fn().mockReturnValue(false);

      // Gmail should fail but iCloud should work
      await expect(mockGmailClient.initialize()).rejects.toThrow('Gmail connection failed');
      expect(mockGmailClient.isReady()).toBe(false);

      // iCloud should still work
      await mockiCloudClient.initialize();

      const icloudEmails = await mockiCloudClient.getEmails({ limit: 10 });
      expect(icloudEmails).toHaveLength(2);
    });

    it('should process emails even with partial data', async () => {
      // Create emails with missing or incomplete data
      const incompleteEmails: EmailData[] = [
        {
          id: 'incomplete_1',
          from: 'gastos@edificio.cl',
          subject: 'Gasto común sin detalles',
          body: 'Email sin información específica de monto o fecha.',
          date: new Date('2025-01-20'),
          provider: 'gmail',
          processed: false,
          matchedRules: []
        }
      ];

      mockGmailClient.getEmails = jest.fn().mockResolvedValue(incompleteEmails);

      await mockGmailClient.initialize();
      const emails = await mockGmailClient.getEmails();
      const filteredEmails = EmailFilter.filterEmails(emails, mockEmailRules);

      expect(filteredEmails[0].matchedRules).toContain('gastos_comunes');

      const parsedResults = await EmailParser.parseEmails(filteredEmails);
      expect(parsedResults).toHaveLength(1);

      // Should have low confidence but still process
      expect(parsedResults[0].confidence).toBeLessThan(75);
      expect(parsedResults[0].extractedFields.tipo).toBe('gastos_comunes');
    });

    it('should handle mixed provider scenarios', async () => {
      // Test scenario where Gmail has bills and iCloud has deliveries
      const mixedGmailEmails: EmailData[] = [
        {
          id: 'gmail_bill',
          from: 'billing@enel.cl',
          subject: 'Factura de luz',
          body: 'Su cuenta de electricidad de $15.000 vence el 20 de marzo de 2025.',
          date: new Date('2025-03-01'),
          provider: 'gmail',
          processed: false,
          matchedRules: []
        }
      ];

      const mixediCloudEmails: EmailData[] = [
        {
          id: 'icloud_delivery',
          from: 'shipping@amazon.com',
          subject: 'Pedido enviado',
          body: 'Su pedido llegará el 5 de marzo. Tracking: AMZ987654321',
          date: new Date('2025-03-02'),
          provider: 'icloud',
          processed: false,
          matchedRules: []
        }
      ];

      mockGmailClient.getEmails = jest.fn().mockResolvedValue(mixedGmailEmails);
      mockiCloudClient.getEmails = jest.fn().mockResolvedValue(mixediCloudEmails);

      // Process workflow
      await mockGmailClient.initialize();
      await mockiCloudClient.initialize();

      const gmailEmails = await mockGmailClient.getEmails();
      const icloudEmails = await mockiCloudClient.getEmails();
      const allEmails = [...gmailEmails, ...icloudEmails];

      const filteredEmails = EmailFilter.filterEmails(allEmails, mockEmailRules);
      const parsedResults = await EmailParser.parseEmails(filteredEmails);

      // Verify cross-provider processing works
      expect(parsedResults).toHaveLength(2);

      const billResult = parsedResults.find(r => r.emailId === 'gmail_bill');
      expect(billResult?.ruleName).toBe('facturas_servicios');
      expect(billResult?.extractedFields.empresa).toBe('Enel');

      const deliveryResult = parsedResults.find(r => r.emailId === 'icloud_delivery');
      expect(deliveryResult?.ruleName).toBe('entregas_amazon');
      expect(deliveryResult?.extractedFields.tracking).toBe('AMZ987654321');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty email responses', async () => {
      mockGmailClient.getEmails = jest.fn().mockResolvedValue([]);
      mockiCloudClient.getEmails = jest.fn().mockResolvedValue([]);

      await mockGmailClient.initialize();
      await mockiCloudClient.initialize();

      const gmailEmails = await mockGmailClient.getEmails();
      const icloudEmails = await mockiCloudClient.getEmails();
      const allEmails = [...gmailEmails, ...icloudEmails];

      expect(allEmails).toHaveLength(0);

      const filteredEmails = EmailFilter.filterEmails(allEmails, mockEmailRules);
      expect(filteredEmails).toHaveLength(0);

      const parsedResults = await EmailParser.parseEmails(filteredEmails);
      expect(parsedResults).toHaveLength(0);
    });

    it('should handle malformed email data', async () => {
      const malformedEmails: EmailData[] = [
        {
          id: 'malformed_1',
          from: '',
          subject: '',
          body: '',
          date: new Date(),
          provider: 'gmail',
          processed: false,
          matchedRules: []
        }
      ];

      mockGmailClient.getEmails = jest.fn().mockResolvedValue(malformedEmails);

      await mockGmailClient.initialize();
      const emails = await mockGmailClient.getEmails();
      const filteredEmails = EmailFilter.filterEmails(emails, mockEmailRules);

      // Should not match any rules due to empty content
      expect(filteredEmails[0].matchedRules).toHaveLength(0);
    });

    it('should handle network timeout scenarios', async () => {
      // Simulate network timeout
      mockGmailClient.getEmails = jest.fn().mockRejectedValue(new Error('Network timeout'));

      await mockGmailClient.initialize();

      await expect(mockGmailClient.getEmails()).rejects.toThrow('Network timeout');

      // iCloud should still work independently
      await mockiCloudClient.initialize();
      const icloudEmails = await mockiCloudClient.getEmails();
      expect(icloudEmails).toHaveLength(2);
    });
  });

  describe('Performance and Scale Tests', () => {
    it('should handle large email batches efficiently', async () => {
      // Create a large batch of emails
      const largeEmailBatch: EmailData[] = Array.from({ length: 100 }, (_, i) => ({
        id: `bulk_${i}`,
        from: i % 3 === 0 ? 'gastos@edificio.cl' : i % 3 === 1 ? 'billing@enel.cl' : 'newsletter@spam.com',
        subject: i % 3 === 0 ? `Gasto común ${i}` : i % 3 === 1 ? `Factura ${i}` : `Newsletter ${i}`,
        body: i % 3 === 0 ? `Monto $${1000 + i} vence el 15 de marzo` :
              i % 3 === 1 ? `Factura por $${500 + i} vence el 20 de marzo` :
              'Contenido irrelevante',
        date: new Date(`2025-02-${String(i % 28 + 1).padStart(2, '0')}`),
        provider: i % 2 === 0 ? 'gmail' : 'icloud',
        processed: false,
        matchedRules: []
      }));

      mockGmailClient.getEmails = jest.fn().mockResolvedValue(largeEmailBatch.filter(e => e.provider === 'gmail'));
      mockiCloudClient.getEmails = jest.fn().mockResolvedValue(largeEmailBatch.filter(e => e.provider === 'icloud'));

      const startTime = Date.now();

      // Process large batch
      await mockGmailClient.initialize();
      await mockiCloudClient.initialize();

      const gmailEmails = await mockGmailClient.getEmails();
      const icloudEmails = await mockiCloudClient.getEmails();
      const allEmails = [...gmailEmails, ...icloudEmails];

      const filteredEmails = EmailFilter.filterEmails(allEmails, mockEmailRules);
      const emailsWithMatches = filteredEmails.filter(e => e.matchedRules.length > 0);
      const parsedResults = await EmailParser.parseEmails(emailsWithMatches);

      const processingTime = Date.now() - startTime;

      // Verify results
      expect(allEmails).toHaveLength(100);
      expect(emailsWithMatches.length).toBeGreaterThan(60); // About 2/3 should match
      expect(parsedResults.length).toEqual(emailsWithMatches.length);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});