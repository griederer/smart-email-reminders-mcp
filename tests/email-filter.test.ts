import { EmailFilter } from '../src/email-processors/email-filter';
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

describe('EmailFilter', () => {
  const mockEmails: EmailData[] = [
    {
      id: 'gmail_1',
      from: 'gastos@edificio.cl',
      subject: 'Gasto común enero 2025',
      body: 'El gasto común de $45.000 vence el 15 de febrero',
      date: new Date('2025-01-20'),
      provider: 'gmail',
      processed: false,
      matchedRules: []
    },
    {
      id: 'icloud_2',
      from: 'facturacion@enel.cl',
      subject: 'Factura eléctrica febrero',
      body: 'Su factura de $23.500 vence el 28 de febrero',
      date: new Date('2025-02-05'),
      provider: 'icloud',
      processed: false,
      matchedRules: []
    },
    {
      id: 'gmail_3',
      from: 'orders@amazon.com',
      subject: 'Tu pedido ha sido enviado',
      body: 'Tu pedido llegará el 25 de febrero. Número de tracking: ABC123456',
      date: new Date('2025-02-20'),
      provider: 'gmail',
      processed: false,
      matchedRules: []
    },
    {
      id: 'gmail_4',
      from: 'newsletter@example.com',
      subject: 'Weekly Newsletter',
      body: 'This is a newsletter with no relevant content',
      date: new Date('2025-02-21'),
      provider: 'gmail',
      processed: false,
      matchedRules: []
    }
  ];

  const mockRules: EmailRule[] = [
    {
      name: 'gastos_comunes',
      status: 'active',
      providers: ['gmail', 'icloud'],
      fromContains: ['gastos', 'edificio'],
      subjectContains: ['gasto común', 'cuota'],
      bodyContains: ['gasto', 'vence'],
      prompt: 'Extract building fees info',
      reminderTemplate: {
        titleTemplate: 'Pagar gastos comunes ${monto}',
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
    },
    {
      name: 'paused_rule',
      status: 'paused',
      providers: ['gmail'],
      fromContains: ['test'],
      prompt: 'This rule is paused',
      reminderTemplate: {
        titleTemplate: 'Test reminder',
        listName: 'Test',
        priority: 'normal' as const,
        daysBeforeReminder: 1,
        timeOfDay: '12:00'
      }
    }
  ];

  describe('filterEmails', () => {
    it('should return empty array when no emails provided', () => {
      const result = EmailFilter.filterEmails([], mockRules);
      expect(result).toEqual([]);
    });

    it('should return unchanged emails when no rules provided', () => {
      const result = EmailFilter.filterEmails(mockEmails, []);
      expect(result).toEqual(mockEmails);
    });

    it('should match building fees email correctly', () => {
      const activeRules = mockRules.filter(r => r.status === 'active');
      const result = EmailFilter.filterEmails([mockEmails[0]], activeRules);

      expect(result).toHaveLength(1);
      expect(result[0].matchedRules).toContain('gastos_comunes');
      expect(result[0].processed).toBe(false);
    });

    it('should match utility bill email correctly', () => {
      const activeRules = mockRules.filter(r => r.status === 'active');
      const result = EmailFilter.filterEmails([mockEmails[1]], activeRules);

      expect(result).toHaveLength(1);
      expect(result[0].matchedRules).toEqual(['facturas_servicios']);
    });

    it('should match Amazon delivery email correctly', () => {
      const activeRules = mockRules.filter(r => r.status === 'active');
      const result = EmailFilter.filterEmails([mockEmails[2]], activeRules);

      expect(result).toHaveLength(1);
      expect(result[0].matchedRules).toEqual(['entregas_amazon']);
    });

    it('should not match newsletter email', () => {
      const activeRules = mockRules.filter(r => r.status === 'active');
      const result = EmailFilter.filterEmails([mockEmails[3]], activeRules);

      expect(result).toHaveLength(1);
      expect(result[0].matchedRules).toEqual([]);
    });

    it('should filter all emails and return correct matches', () => {
      const activeRules = mockRules.filter(r => r.status === 'active');
      const result = EmailFilter.filterEmails(mockEmails, activeRules);

      expect(result).toHaveLength(4);

      const emailsWithMatches = result.filter(e => e.matchedRules.length > 0);
      expect(emailsWithMatches).toHaveLength(3); // gastos, factura, amazon

      const emailsWithoutMatches = result.filter(e => e.matchedRules.length === 0);
      expect(emailsWithoutMatches).toHaveLength(1); // newsletter
    });

    it('should not match emails from wrong provider', () => {
      // Create a rule that only matches iCloud but test with Gmail email
      const iCloudOnlyRule: EmailRule = {
        ...mockRules[1],
        providers: ['icloud'] // But the email is from gmail
      };

      const result = EmailFilter.filterEmails([mockEmails[0]], [iCloudOnlyRule]); // gmail email

      expect(result).toHaveLength(1);
      expect(result[0].matchedRules).toEqual([]); // Should not match
    });
  });

  describe('getMatchDetails', () => {
    it('should provide detailed match information', () => {
      const email = mockEmails[0]; // gastos comunes email
      const rule = mockRules[0]; // gastos comunes rule

      const details = EmailFilter.getMatchDetails(email, rule);

      expect(details.matches).toBe(true);
      expect(details.details.provider).toBe(true);
      expect(details.details.sender).toBe(true);
      expect(details.details.subject).toBe(true);
      expect(details.details.body).toBe(true);
    });

    it('should show failed match details', () => {
      const email = mockEmails[3]; // newsletter email
      const rule = mockRules[0]; // gastos comunes rule

      const details = EmailFilter.getMatchDetails(email, rule);

      expect(details.matches).toBe(false);
      expect(details.details.provider).toBe(true); // gmail is allowed
      expect(details.details.sender).toBe(false); // sender doesn't match
      expect(details.details.subject).toBe(false); // subject doesn't match
      expect(details.details.body).toBe(false); // body doesn't match
    });
  });

  describe('filterEmailsByRule', () => {
    it('should filter emails by specific rule name', () => {
      const result = EmailFilter.filterEmailsByRule(mockEmails, mockRules, 'gastos_comunes');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('gmail_1');
      expect(result[0].matchedRules).toEqual(['gastos_comunes']);
    });

    it('should return empty array for non-existent rule', () => {
      const result = EmailFilter.filterEmailsByRule(mockEmails, mockRules, 'non_existent');

      expect(result).toEqual([]);
    });

    it('should return empty array when no emails match the rule', () => {
      const result = EmailFilter.filterEmailsByRule([mockEmails[3]], mockRules, 'gastos_comunes');

      expect(result).toEqual([]);
    });
  });

  describe('getFilterStats', () => {
    it('should provide accurate filtering statistics', () => {
      const activeRules = mockRules.filter(r => r.status === 'active');
      const stats = EmailFilter.getFilterStats(mockEmails, activeRules);

      expect(stats.totalEmails).toBe(4);
      expect(stats.totalRules).toBe(3);
      expect(stats.emailsWithMatches).toBe(3);
      expect(stats.emailsWithoutMatches).toBe(1);

      expect(stats.ruleMatchCounts['gastos_comunes']).toBe(1);
      expect(stats.ruleMatchCounts['facturas_servicios']).toBe(1);
      expect(stats.ruleMatchCounts['entregas_amazon']).toBe(1);
    });

    it('should handle empty inputs', () => {
      const stats = EmailFilter.getFilterStats([], []);

      expect(stats.totalEmails).toBe(0);
      expect(stats.totalRules).toBe(0);
      expect(stats.emailsWithMatches).toBe(0);
      expect(stats.emailsWithoutMatches).toBe(0);
      expect(stats.ruleMatchCounts).toEqual({});
    });
  });

  describe('provider matching', () => {
    it('should be case insensitive', () => {
      const email: EmailData = {
        ...mockEmails[0],
        provider: 'GMAIL' as any
      };

      const rule = mockRules[0]; // allows gmail and icloud
      const result = EmailFilter.filterEmails([email], [rule]);

      expect(result[0].matchedRules).toContain('gastos_comunes');
    });
  });

  describe('sender matching', () => {
    it('should match fromContains case insensitively', () => {
      const email: EmailData = {
        ...mockEmails[0],
        from: 'GASTOS@EDIFICIO.CL'
      };

      const rule = mockRules[0];
      const result = EmailFilter.filterEmails([email], [rule]);

      expect(result[0].matchedRules).toContain('gastos_comunes');
    });

    it('should match fromDomains correctly', () => {
      const email: EmailData = {
        ...mockEmails[1],
        from: 'billing@enel.cl'
      };

      const rule = mockRules[1]; // matches enel.cl domain
      const result = EmailFilter.filterEmails([email], [rule]);

      expect(result[0].matchedRules).toContain('facturas_servicios');
    });

    it('should extract domain from complex email formats', () => {
      const email: EmailData = {
        ...mockEmails[1],
        from: 'Facturación Enel <billing@enel.cl>'
      };

      const rule = mockRules[1];
      const result = EmailFilter.filterEmails([email], [rule]);

      expect(result[0].matchedRules).toContain('facturas_servicios');
    });
  });

  describe('subject and body matching', () => {
    it('should match subject contains case insensitively', () => {
      const email: EmailData = {
        ...mockEmails[0],
        subject: 'GASTO COMÚN ENERO 2025'
      };

      const rule = mockRules[0];
      const result = EmailFilter.filterEmails([email], [rule]);

      expect(result[0].matchedRules).toContain('gastos_comunes');
    });

    it('should match partial subject terms', () => {
      const email: EmailData = {
        ...mockEmails[0],
        subject: 'Cuota mensual enero'
      };

      const rule = mockRules[0]; // matches 'cuota'
      const result = EmailFilter.filterEmails([email], [rule]);

      expect(result[0].matchedRules).toContain('gastos_comunes');
    });

    it('should handle emails without subject', () => {
      const email: EmailData = {
        ...mockEmails[0],
        subject: ''
      };

      const rule = mockRules[0];
      const result = EmailFilter.filterEmails([email], [rule]);

      expect(result[0].matchedRules).toEqual([]); // Should not match
    });

    it('should handle emails without body', () => {
      const email: EmailData = {
        ...mockEmails[0],
        body: ''
      };

      const ruleWithBodyContains: EmailRule = {
        ...mockRules[0],
        bodyContains: ['gasto']
      };

      const result = EmailFilter.filterEmails([email], [ruleWithBodyContains]);

      expect(result[0].matchedRules).toEqual([]); // Should not match
    });
  });
});