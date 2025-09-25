import { ClaudeProcessor } from '../src/ai-engine/claude-processor';
import { EmailData, EmailRule } from '../src/types/index';

// Mock logger
jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('ClaudeProcessor', () => {
  let processor: ClaudeProcessor;

  const mockGastosComunesEmail: EmailData = {
    id: 'gmail_1',
    from: 'gastos@edificio.cl',
    subject: 'Gasto común enero 2025',
    body: 'Estimado propietario, el gasto común del mes de enero es de $45.000 pesos. El plazo para pagar vence el 15 de febrero de 2025.',
    date: new Date('2025-01-20'),
    provider: 'gmail',
    processed: false,
    matchedRules: ['gastos_comunes']
  };

  const mockFacturaServiciosEmail: EmailData = {
    id: 'icloud_2',
    from: 'facturacion@enel.cl',
    subject: 'Factura eléctrica febrero',
    body: 'Su factura de electricidad tiene un monto total de $23.500. La fecha de vencimiento es el 28 de febrero de 2025.',
    date: new Date('2025-02-05'),
    provider: 'icloud',
    processed: false,
    matchedRules: ['facturas_servicios']
  };

  const mockAmazonEmail: EmailData = {
    id: 'gmail_3',
    from: 'orders@amazon.com',
    subject: 'Tu pedido ha sido enviado',
    body: 'Tu pedido de Auriculares Bluetooth llegará el 25 de febrero. Número de tracking TRK123456789.',
    date: new Date('2025-02-20'),
    provider: 'gmail',
    processed: false,
    matchedRules: ['entregas_amazon']
  };

  const mockGastosComunesRule: EmailRule = {
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
  };

  const mockFacturasRule: EmailRule = {
    name: 'facturas_servicios',
    status: 'active',
    providers: ['gmail'],
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
  };

  const mockAmazonRule: EmailRule = {
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
  };

  beforeEach(() => {
    processor = new ClaudeProcessor({
      model: 'claude-3-sonnet-20240229',
      maxTokens: 1000,
      temperature: 0.1
    });
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultProcessor = new ClaudeProcessor();
      expect(defaultProcessor).toBeInstanceOf(ClaudeProcessor);
    });

    it('should initialize with custom configuration', () => {
      const customProcessor = new ClaudeProcessor({
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229',
        maxTokens: 2000,
        temperature: 0.5
      });
      expect(customProcessor).toBeInstanceOf(ClaudeProcessor);
    });

    it('should initialize default prompt templates', () => {
      const gastosComunesTemplate = processor.getPromptTemplate('gastos_comunes');
      expect(gastosComunesTemplate).toBeDefined();
      expect(gastosComunesTemplate?.system).toContain('gastos comunes');
      expect(gastosComunesTemplate?.variables).toContain('from');
      expect(gastosComunesTemplate?.variables).toContain('subject');
      expect(gastosComunesTemplate?.variables).toContain('body');
    });
  });

  describe('template management', () => {
    it('should set custom prompt template', () => {
      const customTemplate = {
        system: 'Custom system prompt',
        user: 'Custom user prompt with {{from}} and {{subject}}',
        variables: ['from', 'subject']
      };

      processor.setPromptTemplate('custom_rule', customTemplate);
      const retrieved = processor.getPromptTemplate('custom_rule');

      expect(retrieved).toEqual(customTemplate);
    });

    it('should return generic template for unknown rules', () => {
      const template = processor.getPromptTemplate('unknown_rule');
      expect(template).toBeDefined();
      expect(template?.system).toContain('información útil');
    });

    it('should have templates for all supported rule types', () => {
      const supportedRules = ['gastos_comunes', 'facturas_servicios', 'entregas_amazon', 'generic'];

      for (const ruleName of supportedRules) {
        const template = processor.getPromptTemplate(ruleName);
        expect(template).toBeDefined();
        expect(template?.system).toBeTruthy();
        expect(template?.user).toBeTruthy();
        expect(template?.variables).toContain('from');
        expect(template?.variables).toContain('subject');
        expect(template?.variables).toContain('body');
      }
    });
  });

  describe('email processing', () => {
    it('should process gastos comunes email correctly', async () => {
      const result = await processor.processEmail(mockGastosComunesEmail, mockGastosComunesRule);

      expect(result.emailId).toBe('gmail_1');
      expect(result.ruleName).toBe('gastos_comunes');
      expect(result.extractionMethod).toBe('ai-claude');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);

      // Check extracted fields
      expect(result.extractedFields.monto).toBe('45000');
      expect(result.extractedFields.vencimiento).toBe('2025-02-15');
      expect(result.extractedFields.periodo).toBe('enero');
      expect(result.extractedFields.tipo).toBe('gastos_comunes');
    });

    it('should process facturas servicios email correctly', async () => {
      const result = await processor.processEmail(mockFacturaServiciosEmail, mockFacturasRule);

      expect(result.emailId).toBe('icloud_2');
      expect(result.ruleName).toBe('facturas_servicios');
      expect(result.extractionMethod).toBe('ai-claude');
      expect(result.confidence).toBeGreaterThan(0);

      // Check extracted fields
      expect(result.extractedFields.empresa).toBe('Enel');
      expect(result.extractedFields.monto).toBe('23500');
      expect(result.extractedFields.vencimiento).toBe('2025-02-28');
      expect(result.extractedFields.tipo).toBe('factura_servicios');
      expect(result.extractedFields.servicio).toBe('electricidad');
    });

    it('should process Amazon delivery email correctly', async () => {
      const result = await processor.processEmail(mockAmazonEmail, mockAmazonRule);

      expect(result.emailId).toBe('gmail_3');
      expect(result.ruleName).toBe('entregas_amazon');
      expect(result.extractionMethod).toBe('ai-claude');
      expect(result.confidence).toBeGreaterThan(0);

      // Check extracted fields
      expect(result.extractedFields.tracking).toBe('TRK123456789');
      expect(result.extractedFields.fechaEntrega).toBe('2025-02-25');
      expect(result.extractedFields.proveedor).toBe('Amazon');
      expect(result.extractedFields.tipo).toBe('entrega');
    });

    it('should handle unknown rule with generic processing', async () => {
      const unknownRule: EmailRule = {
        name: 'unknown_rule',
        status: 'active',
        providers: ['gmail'],
        prompt: 'Unknown rule',
        reminderTemplate: {
          titleTemplate: 'Unknown reminder',
          listName: 'Unknown',
          priority: 'normal' as const,
          daysBeforeReminder: 1,
          timeOfDay: '12:00'
        }
      };

      const result = await processor.processEmail(mockGastosComunesEmail, unknownRule);

      expect(result.ruleName).toBe('unknown_rule');
      expect(result.extractionMethod).toBe('ai-claude');
      expect(result.extractedFields.tipo).toBe('generic');
      expect(result.extractedFields.sender).toBe(mockGastosComunesEmail.from);
      expect(result.extractedFields.subject).toBe(mockGastosComunesEmail.subject);
    });

    it('should handle processing errors gracefully', async () => {
      // Create a processor that will throw an error
      const errorProcessor = new ClaudeProcessor();

      // Override the mockClaudeCall method to throw an error
      const originalMethod = (errorProcessor as any).mockClaudeCall;
      (errorProcessor as any).mockClaudeCall = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await errorProcessor.processEmail(mockGastosComunesEmail, mockGastosComunesRule);

      expect(result.error).toBe('API Error');
      expect(result.extractionMethod).toBe('ai-claude-fallback');
      expect(result.confidence).toBe(0);
      expect(result.extractedFields.tipo).toBe('gastos_comunes');
      expect(result.extractedFields.sender).toBe(mockGastosComunesEmail.from);
      expect(result.extractedFields.error).toContain('AI processing failed');
    });
  });

  describe('batch processing', () => {
    it('should process multiple emails with different rules', async () => {
      const emails = [mockGastosComunesEmail, mockFacturaServiciosEmail, mockAmazonEmail];
      const rules = [mockGastosComunesRule, mockFacturasRule, mockAmazonRule];

      const results = await processor.processMultipleEmails(emails, rules);

      expect(results).toHaveLength(3);
      expect(results[0].ruleName).toBe('gastos_comunes');
      expect(results[1].ruleName).toBe('facturas_servicios');
      expect(results[2].ruleName).toBe('entregas_amazon');
    });

    it('should skip emails without matched rules', async () => {
      const emailWithoutRules: EmailData = {
        ...mockGastosComunesEmail,
        matchedRules: []
      };

      const results = await processor.processMultipleEmails([emailWithoutRules], [mockGastosComunesRule]);

      expect(results).toHaveLength(0);
    });

    it('should skip emails with unknown rules', async () => {
      const emailWithUnknownRule: EmailData = {
        ...mockGastosComunesEmail,
        matchedRules: ['nonexistent_rule']
      };

      const results = await processor.processMultipleEmails([emailWithUnknownRule], [mockGastosComunesRule]);

      expect(results).toHaveLength(0);
    });

    it('should continue processing other emails if one fails', async () => {
      // Create an email that would cause processing to fail
      const badEmail: EmailData = {
        id: 'bad_email',
        from: '',
        subject: '',
        body: '',
        date: new Date(),
        provider: 'gmail',
        processed: false,
        matchedRules: ['gastos_comunes']
      };

      const emails = [badEmail, mockFacturaServiciosEmail];
      const rules = [mockGastosComunesRule, mockFacturasRule];

      const results = await processor.processMultipleEmails(emails, rules);

      // Should process both emails, even if one has errors
      expect(results).toHaveLength(2);
      expect(results[0].emailId).toBe('bad_email');
      expect(results[1].emailId).toBe('icloud_2');
    });
  });

  describe('confidence calculation', () => {
    it('should calculate high confidence for complete gastos comunes data', async () => {
      const result = await processor.processEmail(mockGastosComunesEmail, mockGastosComunesRule);
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('should calculate high confidence for complete facturas data', async () => {
      const result = await processor.processEmail(mockFacturaServiciosEmail, mockFacturasRule);
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('should calculate high confidence for complete delivery data', async () => {
      const result = await processor.processEmail(mockAmazonEmail, mockAmazonRule);
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('should calculate lower confidence for incomplete data', async () => {
      const incompleteEmail: EmailData = {
        ...mockGastosComunesEmail,
        body: 'Some text without relevant information'
      };

      const result = await processor.processEmail(incompleteEmail, mockGastosComunesRule);
      expect(result.confidence).toBeLessThan(75);
    });

    it('should handle zero confidence for error cases', async () => {
      const errorProcessor = new ClaudeProcessor();
      (errorProcessor as any).mockClaudeCall = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await errorProcessor.processEmail(mockGastosComunesEmail, mockGastosComunesRule);
      expect(result.confidence).toBe(0);
    });
  });

  describe('processing statistics', () => {
    it('should provide accurate processing statistics', async () => {
      const emails = [mockGastosComunesEmail, mockFacturaServiciosEmail, mockAmazonEmail];
      const rules = [mockGastosComunesRule, mockFacturasRule, mockAmazonRule];

      const results = await processor.processMultipleEmails(emails, rules);
      const stats = processor.getProcessingStats(results);

      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(3);
      expect(stats.failed).toBe(0);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.averageProcessingTime).toBeGreaterThan(0);
      expect(stats.byRule['gastos_comunes']).toBe(1);
      expect(stats.byRule['facturas_servicios']).toBe(1);
      expect(stats.byRule['entregas_amazon']).toBe(1);
    });

    it('should handle empty results gracefully', () => {
      const stats = processor.getProcessingStats([]);

      expect(stats.total).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.averageProcessingTime).toBe(0);
      expect(stats.byRule).toEqual({});
    });

    it('should correctly count successful vs failed results', async () => {
      // Create a mix of successful and failed results
      const errorProcessor = new ClaudeProcessor();
      (errorProcessor as any).mockClaudeCall = jest.fn()
        .mockResolvedValueOnce({ tipo: 'success' })
        .mockRejectedValueOnce(new Error('API Error'));

      const emails = [mockGastosComunesEmail, mockFacturaServiciosEmail];
      const rules = [mockGastosComunesRule, mockFacturasRule];

      const results = await errorProcessor.processMultipleEmails(emails, rules);
      const stats = errorProcessor.getProcessingStats(results);

      expect(stats.total).toBe(2);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  describe('prompt template variables', () => {
    it('should correctly substitute all template variables', () => {
      const template = 'From: {{from}}, Subject: {{subject}}, Body: {{body}}, Date: {{date}}, Provider: {{provider}}';
      const variables = {
        from: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body',
        date: '2025-01-01',
        provider: 'gmail'
      };

      const result = (processor as any).substituteVariables(template, variables);

      expect(result).toBe('From: test@example.com, Subject: Test Subject, Body: Test Body, Date: 2025-01-01, Provider: gmail');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'From: {{from}}, Missing: {{missing}}';
      const variables = { from: 'test@example.com' };

      const result = (processor as any).substituteVariables(template, variables);

      expect(result).toBe('From: test@example.com, Missing: ');
    });

    it('should handle multiple occurrences of the same variable', () => {
      const template = '{{from}} sent from {{from}}';
      const variables = { from: 'test@example.com' };

      const result = (processor as any).substituteVariables(template, variables);

      expect(result).toBe('test@example.com sent from test@example.com');
    });
  });
});