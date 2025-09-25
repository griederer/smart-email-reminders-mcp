// Mock logger
jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

// Mock child_process exec
const mockExecAsync = jest.fn();

jest.mock('child_process', () => ({
  exec: jest.fn()
}));

jest.mock('util', () => ({
  promisify: jest.fn(() => mockExecAsync)
}));

import { AppleReminders } from '../src/reminders/apple-reminders';

describe('AppleReminders', () => {
  let appleReminders: AppleReminders;

  beforeEach(() => {
    jest.clearAllMocks();
    appleReminders = new AppleReminders({
      defaultList: 'Facturas',
      timezone: 'America/Santiago'
    });

    // Default successful response
    mockExecAsync.mockResolvedValue({ stdout: 'success', stderr: '' });
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultReminders = new AppleReminders();
      const config = defaultReminders.getConfig();

      expect(config.defaultList).toBe('Facturas');
      expect(config.timezone).toBe('America/Santiago');
    });

    it('should initialize with custom configuration', () => {
      const customReminders = new AppleReminders({
        defaultList: 'Custom List',
        timezone: 'UTC'
      });

      const config = customReminders.getConfig();
      expect(config.defaultList).toBe('Custom List');
      expect(config.timezone).toBe('UTC');
    });
  });

  describe('createReminder', () => {
    it('should create basic reminder successfully', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'reminder-id-123', stderr: '' });

      const result = await appleReminders.createReminder({
        title: 'Test Reminder'
      });

      expect(result.success).toBe(true);
      expect(result.reminderId).toBe('reminder-id-123');
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('osascript -e')
      );
    });

    it('should create reminder with all options', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'reminder-id-456', stderr: '' });

      const dueDate = new Date('2025-02-15T10:00:00');

      const result = await appleReminders.createReminder({
        title: 'Pay Bills',
        dueDate,
        listName: 'Custom List',
        notes: 'Important bill payment',
        priority: 'high'
      });

      expect(result.success).toBe(true);
      expect(result.reminderId).toBe('reminder-id-456');

      const executedCommand = mockExecAsync.mock.calls[0][0] as string;
      expect(executedCommand).toContain('Pay Bills');
      expect(executedCommand).toContain('Custom List');
      expect(executedCommand).toContain('Important bill payment');
      expect(executedCommand).toContain('priority of newReminder to 9'); // high priority
    });

    it('should handle empty title error', async () => {
      const result = await appleReminders.createReminder({
        title: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Reminder title cannot be empty');
      expect(mockExecAsync).not.toHaveBeenCalled();
    });

    it('should handle AppleScript permission error', async () => {
      mockExecAsync.mockRejectedValue(new Error('not allowed assistive access'));

      const result = await appleReminders.createReminder({
        title: 'Test Reminder'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('AppleScript permission denied');
    });

    it('should handle general AppleScript errors', async () => {
      mockExecAsync.mockRejectedValue(new Error('AppleScript error'));

      const result = await appleReminders.createReminder({
        title: 'Test Reminder'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('AppleScript error');
    });

    it('should use default list when not specified', async () => {
      await appleReminders.createReminder({
        title: 'Test Reminder'
      });

      const executedCommand = mockExecAsync.mock.calls[0][0] as string;
      expect(executedCommand).toContain('Facturas'); // default list
    });

    it('should handle stderr warnings gracefully', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: 'reminder-id-789',
        stderr: 'some warning message'
      });

      const result = await appleReminders.createReminder({
        title: 'Test Reminder'
      });

      expect(result.success).toBe(true);
      expect(result.reminderId).toBe('reminder-id-789');
    });
  });

  describe('priority handling', () => {
    it('should set correct priority values', async () => {
      // Test low priority
      await appleReminders.createReminder({
        title: 'Low Priority',
        priority: 'low'
      });

      let executedCommand = mockExecAsync.mock.calls[0][0] as string;
      expect(executedCommand).toContain('priority of newReminder to 1');

      // Test normal priority
      await appleReminders.createReminder({
        title: 'Normal Priority',
        priority: 'normal'
      });

      executedCommand = mockExecAsync.mock.calls[1][0] as string;
      expect(executedCommand).toContain('priority of newReminder to 5');

      // Test high priority
      await appleReminders.createReminder({
        title: 'High Priority',
        priority: 'high'
      });

      executedCommand = mockExecAsync.mock.calls[2][0] as string;
      expect(executedCommand).toContain('priority of newReminder to 9');
    });
  });

  describe('list management', () => {
    it('should check if list exists', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'true', stderr: '' });

      const exists = await appleReminders.listExists('Test List');

      expect(exists).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('list "Test List"')
      );
    });

    it('should return false when list does not exist', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'false', stderr: '' });

      const exists = await appleReminders.listExists('Nonexistent List');

      expect(exists).toBe(false);
    });

    it('should create new list', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'success', stderr: '' });

      const created = await appleReminders.createList('New List');

      expect(created).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('make new list with properties {name:"New List"}')
      );
    });

    it('should handle list creation errors', async () => {
      mockExecAsync.mockRejectedValue(new Error('List creation failed'));

      const created = await appleReminders.createList('Bad List');

      expect(created).toBe(false);
    });

    it('should get all lists', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'List1, List2, List3', stderr: '' });

      const lists = await appleReminders.getLists();

      expect(lists).toEqual(['List1', 'List2', 'List3']);
    });

    it('should handle empty lists result', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      const lists = await appleReminders.getLists();

      expect(lists).toEqual([]);
    });
  });

  describe('access testing', () => {
    it('should test successful access', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '3', stderr: '' });

      const result = await appleReminders.testAccess();

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect permission errors during access test', async () => {
      mockExecAsync.mockRejectedValue(new Error('not authorized'));

      const result = await appleReminders.testAccess();

      expect(result.success).toBe(false);
      expect(result.error).toContain('AppleScript permission denied');
    });
  });

  describe('createReminderFromExtractedData', () => {
    it('should create reminder from gastos comunes data', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'reminder-id-gastos', stderr: '' });

      const extractedData = {
        monto: '45000',
        vencimiento: '2025-02-15',
        periodo: 'enero',
        tipo: 'gastos_comunes'
      };

      const template = {
        titleTemplate: 'Pagar gastos comunes ${monto} - ${periodo}',
        listName: 'Facturas',
        priority: 'normal' as const,
        daysBeforeReminder: 3,
        timeOfDay: '09:00'
      };

      const result = await appleReminders.createReminderFromExtractedData(
        extractedData,
        template,
        'email-123'
      );

      expect(result.success).toBe(true);
      expect(result.reminderId).toBe('reminder-id-gastos');

      const executedCommand = mockExecAsync.mock.calls[0][0] as string;
      expect(executedCommand).toContain('Pagar gastos comunes 45000 - enero');
      expect(executedCommand).toContain('Monto: $45000');
      expect(executedCommand).toContain('Fuente: Email email-123');
    });

    it('should create reminder from utility bill data', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'reminder-id-bill', stderr: '' });

      const extractedData = {
        empresa: 'Enel',
        monto: '23500',
        vencimiento: '2025-02-28',
        tipo: 'factura_servicios'
      };

      const template = {
        titleTemplate: 'Pagar ${empresa} - $${monto}',
        listName: 'Servicios',
        priority: 'high' as const,
        daysBeforeReminder: 5,
        timeOfDay: '10:00'
      };

      const result = await appleReminders.createReminderFromExtractedData(
        extractedData,
        template,
        'email-456'
      );

      expect(result.success).toBe(true);

      const executedCommand = mockExecAsync.mock.calls[0][0] as string;
      expect(executedCommand).toContain('Pagar Enel - $23500');
      expect(executedCommand).toContain('Empresa: Enel');
      expect(executedCommand).toContain('list "Servicios"');
    });

    it('should handle missing template variables gracefully', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'reminder-id-incomplete', stderr: '' });

      const extractedData = {
        monto: '45000'
        // missing other fields
      };

      const template = {
        titleTemplate: 'Pagar ${empresa} - $${monto} - ${periodo}',
        listName: 'Test',
        priority: 'normal' as const,
        daysBeforeReminder: 3,
        timeOfDay: '09:00'
      };

      const result = await appleReminders.createReminderFromExtractedData(
        extractedData,
        template,
        'email-incomplete'
      );

      expect(result.success).toBe(true);

      const executedCommand = mockExecAsync.mock.calls[0][0] as string;
      expect(executedCommand).toContain('Pagar - $45000 -'); // missing variables removed
    });
  });

  describe('reminder deletion', () => {
    it('should delete reminder successfully', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'success', stderr: '' });

      const deleted = await appleReminders.deleteReminder('reminder-123');

      expect(deleted).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('delete reminder id "reminder-123"')
      );
    });

    it('should handle deletion errors', async () => {
      mockExecAsync.mockRejectedValue(new Error('Reminder not found'));

      const deleted = await appleReminders.deleteReminder('bad-id');

      expect(deleted).toBe(false);
    });
  });

  describe('configuration management', () => {
    it('should get current configuration', () => {
      const config = appleReminders.getConfig();

      expect(config).toEqual({
        defaultList: 'Facturas',
        timezone: 'America/Santiago'
      });
    });

    it('should update configuration', () => {
      appleReminders.updateConfig({
        defaultList: 'New Default'
      });

      const config = appleReminders.getConfig();
      expect(config.defaultList).toBe('New Default');
      expect(config.timezone).toBe('America/Santiago'); // unchanged
    });
  });

  describe('string escaping', () => {
    it('should escape special characters in strings', async () => {
      await appleReminders.createReminder({
        title: 'Test "quotes" and \\backslashes',
        notes: 'Line 1\nLine 2\tTabbed'
      });

      const executedCommand = mockExecAsync.mock.calls[0][0] as string;
      expect(executedCommand).toContain('\\"quotes\\"');
      expect(executedCommand).toContain('\\\\backslashes');
      expect(executedCommand).toContain('\\n');
      expect(executedCommand).toContain('\\t');
    });
  });

  describe('date formatting', () => {
    it('should format dates for AppleScript correctly', async () => {
      const testDate = new Date('2025-02-15T14:30:00');

      await appleReminders.createReminder({
        title: 'Test Date',
        dueDate: testDate
      });

      const executedCommand = mockExecAsync.mock.calls[0][0] as string;
      expect(executedCommand).toContain('due date of newReminder');
      expect(executedCommand).toContain('February 15, 2025');
    });
  });
});