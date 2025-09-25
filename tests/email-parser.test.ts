import { EmailParser } from '../src/email-processors/email-parser';
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

describe('EmailParser', () => {
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

  describe('parseEmail', () => {
    it('should parse gastos comunes email correctly', async () => {
      const result = await EmailParser.parseEmail(mockGastosComunesEmail, mockGastosComunesRule);

      expect(result.emailId).toBe('gmail_1');
      expect(result.ruleName).toBe('gastos_comunes');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.extractionMethod).toBe('regex-pattern');

      // Check extracted fields
      expect(result.extractedFields.monto).toBe('45000');
      expect(result.extractedFields.vencimiento).toBe('2025-02-15');
      expect(result.extractedFields.periodo).toBe('enero');
      expect(result.extractedFields.tipo).toBe('gastos_comunes');
    });

    it('should parse facturas servicios email correctly', async () => {
      const result = await EmailParser.parseEmail(mockFacturaServiciosEmail, mockFacturasRule);

      expect(result.emailId).toBe('icloud_2');
      expect(result.ruleName).toBe('facturas_servicios');
      expect(result.confidence).toBeGreaterThan(0);

      // Check extracted fields
      expect(result.extractedFields.empresa).toBe('Enel');
      expect(result.extractedFields.monto).toBe('23500');
      expect(result.extractedFields.vencimiento).toBe('2025-02-28');
      expect(result.extractedFields.tipo).toBe('factura_servicios');
    });

    it('should parse Amazon delivery email correctly', async () => {
      const result = await EmailParser.parseEmail(mockAmazonEmail, mockAmazonRule);

      expect(result.emailId).toBe('gmail_3');
      expect(result.ruleName).toBe('entregas_amazon');
      expect(result.confidence).toBeGreaterThan(0);

      // Check extracted fields
      expect(result.extractedFields.tracking).toContain('TRK123456789');
      expect(result.extractedFields.fechaEntrega).toBe('2025-02-25');
      expect(result.extractedFields.proveedor).toBe('Amazon');
      expect(result.extractedFields.tipo).toBe('entrega');
    });

    it('should use generic parsing for unknown rules', async () => {
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

      const result = await EmailParser.parseEmail(mockGastosComunesEmail, unknownRule);

      expect(result.ruleName).toBe('unknown_rule');
      expect(result.extractionMethod).toBe('generic-pattern');
      expect(result.extractedFields.tipo).toBe('generic');
      expect(result.extractedFields.sender).toBe(mockGastosComunesEmail.from);
      expect(result.extractedFields.subject).toBe(mockGastosComunesEmail.subject);
    });

    it('should handle emails with no extractable data', async () => {
      const emptyEmail: EmailData = {
        id: 'test_1',
        from: 'test@example.com',
        subject: 'Empty email',
        body: 'This email has no relevant data.',
        date: new Date(),
        provider: 'gmail',
        processed: false,
        matchedRules: ['gastos_comunes']
      };

      const result = await EmailParser.parseEmail(emptyEmail, mockGastosComunesRule);

      expect(result.confidence).toBe(25); // Only tipo field extracted
      expect(result.extractedFields.monto).toBeNull();
      expect(result.extractedFields.vencimiento).toBeNull();
      expect(result.extractedFields.periodo).toBeNull();
      expect(result.extractedFields.tipo).toBe('gastos_comunes');
    });
  });

  describe('parseEmails', () => {
    it('should parse multiple emails with matched rules', async () => {
      const emails = [mockGastosComunesEmail, mockFacturaServiciosEmail, mockAmazonEmail];
      const results = await EmailParser.parseEmails(emails);

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

      const results = await EmailParser.parseEmails([emailWithoutRules]);

      expect(results).toHaveLength(0);
    });

    it('should handle parsing errors gracefully', async () => {
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

      const results = await EmailParser.parseEmails([badEmail]);

      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBe(0); // Error fallback
    });
  });

  describe('getParsingStats', () => {
    it('should provide accurate parsing statistics', async () => {
      const emails = [mockGastosComunesEmail, mockFacturaServiciosEmail, mockAmazonEmail];
      const extractedData = await EmailParser.parseEmails(emails);

      const stats = EmailParser.getParsingStats(extractedData);

      expect(stats.totalParsed).toBe(3);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.byRule['gastos_comunes']).toBe(1);
      expect(stats.byRule['facturas_servicios']).toBe(1);
      expect(stats.byRule['entregas_amazon']).toBe(1);
      expect(stats.byMethod['regex-pattern']).toBe(3);
    });

    it('should handle empty input', () => {
      const stats = EmailParser.getParsingStats([]);

      expect(stats.totalParsed).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.byMethod).toEqual({});
      expect(stats.byRule).toEqual({});
      expect(stats.highConfidence).toBe(0);
      expect(stats.lowConfidence).toBe(0);
    });
  });

  describe('pattern extraction', () => {
    it('should extract Chilean peso amounts correctly', async () => {
      const email: EmailData = {
        ...mockGastosComunesEmail,
        body: 'Monto: $123.456 pesos chilenos'
      };

      const result = await EmailParser.parseEmail(email, mockGastosComunesRule);
      expect(result.extractedFields.monto).toBe('123456');
    });

    it('should extract dates in different formats', async () => {
      const email: EmailData = {
        ...mockGastosComunesEmail,
        body: 'Vence el 15 de marzo de 2025'
      };

      const result = await EmailParser.parseEmail(email, mockGastosComunesRule);
      expect(result.extractedFields.vencimiento).toBe('2025-03-15');
    });

    it('should extract company names from email addresses', async () => {
      const email: EmailData = {
        ...mockFacturaServiciosEmail,
        from: 'billing@movistar.cl'
      };

      const result = await EmailParser.parseEmail(email, mockFacturasRule);
      expect(result.extractedFields.empresa).toBe('Movistar');
    });

    it('should extract tracking numbers', async () => {
      const email: EmailData = {
        ...mockAmazonEmail,
        body: 'Tracking ABC123XYZ789'
      };

      const result = await EmailParser.parseEmail(email, mockAmazonRule);
      expect(result.extractedFields.tracking).toBe('ABC123XYZ789');
    });
  });

  describe('confidence calculation', () => {
    it('should calculate high confidence for complete data', async () => {
      const result = await EmailParser.parseEmail(mockGastosComunesEmail, mockGastosComunesRule);
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('should calculate low confidence for incomplete data', async () => {
      const incompleteEmail: EmailData = {
        ...mockGastosComunesEmail,
        body: 'Some random text without extractable data'
      };

      const result = await EmailParser.parseEmail(incompleteEmail, mockGastosComunesRule);
      expect(result.confidence).toBeLessThan(75);
    });

    it('should set generic parsing confidence to 50 or 0', async () => {
      const genericRule: EmailRule = {
        name: 'generic_rule',
        status: 'active',
        providers: ['gmail'],
        prompt: 'Generic rule',
        reminderTemplate: {
          titleTemplate: 'Generic reminder',
          listName: 'Generic',
          priority: 'normal' as const,
          daysBeforeReminder: 1,
          timeOfDay: '12:00'
        }
      };

      const result = await EmailParser.parseEmail(mockGastosComunesEmail, genericRule);
      expect([0, 50]).toContain(result.confidence);
    });
  });

  describe('error handling', () => {
    it('should throw error when parsing fails', async () => {
      // Mock a scenario where parsing would fail
      const malformedEmail = null as any;

      await expect(
        EmailParser.parseEmail(malformedEmail, mockGastosComunesRule)
      ).rejects.toThrow('Email parsing failed');
    });
  });
});