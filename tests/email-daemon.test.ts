// Mock logger
jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

// Mock fs/promises
const mockFs = {
  readFile: jest.fn(),
  writeFile: jest.fn()
};

jest.mock('fs/promises', () => mockFs);

// Mock components
const mockObsidianReader = {
  loadRules: jest.fn()
};

const mockEmailFilter = {
  filterEmails: jest.fn()
};

const mockClaudeProcessor = {
  processMultipleEmails: jest.fn()
};

const mockAppleReminders = {
  testAccess: jest.fn(),
  createReminderFromExtractedData: jest.fn()
};

const mockGmailClient = {
  initialize: jest.fn(),
  isReady: jest.fn(),
  getEmails: jest.fn()
};

const mockIcloudClient = {
  initialize: jest.fn(),
  isReady: jest.fn(),
  getEmails: jest.fn()
};

jest.mock('../src/obsidian/obsidian-reader', () => ({
  ObsidianReader: jest.fn(() => mockObsidianReader)
}));

jest.mock('../src/email-processors/email-filter', () => ({
  EmailFilter: {
    filterEmails: jest.fn()
  }
}));

jest.mock('../src/ai-engine/claude-processor', () => ({
  ClaudeProcessor: jest.fn(() => mockClaudeProcessor)
}));

jest.mock('../src/reminders/apple-reminders', () => ({
  AppleReminders: jest.fn(() => mockAppleReminders)
}));

jest.mock('../src/email-providers/gmail-client', () => ({
  GmailClient: jest.fn(() => mockGmailClient)
}));

jest.mock('../src/email-providers/icloud-client', () => ({
  iCloudClient: jest.fn(() => mockIcloudClient)
}));

import { EmailDaemon } from '../src/daemon/email-daemon';
import { Configuration, EmailData, EmailRule } from '../src/types';

describe('EmailDaemon', () => {
  let daemon: EmailDaemon;
  let mockConfiguration: Configuration;

  const mockEmail: EmailData = {
    id: 'test-email-1',
    from: 'test@example.com',
    subject: 'Test Email',
    body: 'Test email body',
    date: new Date('2025-01-20'),
    provider: 'gmail',
    processed: false,
    matchedRules: ['test_rule']
  };

  const mockRule: EmailRule = {
    name: 'test_rule',
    status: 'active',
    providers: ['gmail'],
    subjectContains: ['test'],
    prompt: 'Test rule',
    reminderTemplate: {
      titleTemplate: 'Test reminder',
      listName: 'Test',
      priority: 'normal',
      daysBeforeReminder: 3,
      timeOfDay: '09:00'
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockConfiguration = {
      obsidianVaultPath: '/test/vault',
      rulesFilePath: 'rules.md',
      gmail: {
        credentialsPath: '/test/creds.json',
        tokenPath: '/test/token.json'
      },
      icloud: {
        username: 'test@icloud.com',
        appSpecificPassword: 'test-password',
        server: 'imap.mail.me.com',
        port: 993
      },
      daemon: {
        intervalMinutes: 30,
        maxEmailsPerScan: 50,
        retryAttempts: 3
      },
      appleReminders: {
        defaultList: 'Facturas',
        timezone: 'America/Santiago'
      }
    };

    // Setup default mocks
    mockFs.readFile.mockRejectedValue({ code: 'ENOENT' }); // No state file initially
    mockFs.writeFile.mockResolvedValue(undefined);

    mockObsidianReader.loadRules.mockResolvedValue([mockRule]);

    // Setup EmailFilter static mock
    (require('../src/email-processors/email-filter').EmailFilter.filterEmails as jest.Mock)
      .mockReturnValue([mockEmail]);
    mockClaudeProcessor.processMultipleEmails.mockResolvedValue([{
      emailId: 'test-email-1',
      ruleName: 'test_rule',
      extractedFields: { tipo: 'test', monto: '1000' },
      confidence: 85,
      extractionMethod: 'ai-claude',
      timestamp: new Date()
    }]);

    mockAppleReminders.testAccess.mockResolvedValue({ success: true });
    mockAppleReminders.createReminderFromExtractedData.mockResolvedValue({
      success: true,
      reminderId: 'reminder-123'
    });

    mockGmailClient.initialize.mockResolvedValue(undefined);
    mockGmailClient.isReady.mockReturnValue(true);
    mockGmailClient.getEmails.mockResolvedValue([mockEmail]);

    mockIcloudClient.initialize.mockResolvedValue(undefined);
    mockIcloudClient.isReady.mockReturnValue(true);
    mockIcloudClient.getEmails.mockResolvedValue([]);

    daemon = new EmailDaemon(mockConfiguration);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(daemon).toBeInstanceOf(EmailDaemon);
      expect(daemon.isRunning()).toBe(false);
      expect(daemon.getQueueSize()).toBe(0);
    });

    it('should initialize with custom daemon config', () => {
      const customDaemon = new EmailDaemon(mockConfiguration, {
        intervalMinutes: 60,
        maxEmailsPerScan: 100
      });

      const config = customDaemon.getConfig();
      expect(config.intervalMinutes).toBe(60);
      expect(config.maxEmailsPerScan).toBe(100);
    });

    it('should disable email providers based on configuration', () => {
      const configWithoutProviders: Configuration = {
        ...mockConfiguration,
        gmail: undefined,
        icloud: undefined
      };

      const daemonWithoutProviders = new EmailDaemon(configWithoutProviders);
      const config = daemonWithoutProviders.getConfig();

      expect(config.enableGmail).toBe(false);
      expect(config.enableIcloud).toBe(false);
    });
  });

  describe('start and stop', () => {
    it('should start daemon successfully', async () => {
      const startedSpy = jest.fn();
      daemon.on('started', startedSpy);

      await daemon.start();

      expect(daemon.isRunning()).toBe(true);
      expect(mockGmailClient.initialize).toHaveBeenCalled();
      expect(mockIcloudClient.initialize).toHaveBeenCalled();
      expect(mockAppleReminders.testAccess).toHaveBeenCalled();
      expect(startedSpy).toHaveBeenCalled();
    });

    it('should stop daemon successfully', async () => {
      const stoppedSpy = jest.fn();
      daemon.on('stopped', stoppedSpy);

      await daemon.start();
      await daemon.stop();

      expect(daemon.isRunning()).toBe(false);
      expect(mockFs.writeFile).toHaveBeenCalled(); // State saved
      expect(stoppedSpy).toHaveBeenCalled();
    });

    it('should handle start failure when email clients unavailable', async () => {
      mockGmailClient.initialize.mockRejectedValue(new Error('Gmail init failed'));
      mockIcloudClient.initialize.mockRejectedValue(new Error('iCloud connect failed'));

      await expect(daemon.start()).rejects.toThrow('No email clients available');
      expect(daemon.isRunning()).toBe(false);
    });

    it('should handle start failure when Apple Reminders inaccessible', async () => {
      mockAppleReminders.testAccess.mockResolvedValue({
        success: false,
        error: 'Permission denied'
      });

      await expect(daemon.start()).rejects.toThrow('Apple Reminders not accessible');
    });

    it('should not start if already running', async () => {
      await daemon.start();

      // Try to start again
      await daemon.start();

      expect(daemon.isRunning()).toBe(true);
      // Should not initialize clients again
      expect(mockGmailClient.initialize).toHaveBeenCalledTimes(1);
    });

    it('should not stop if not running', async () => {
      await daemon.stop();

      expect(daemon.isRunning()).toBe(false);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('email processing cycle', () => {
    beforeEach(async () => {
      await daemon.start();
    });

    afterEach(async () => {
      await daemon.stop();
    });

    it('should process emails and create reminders', async () => {
      const processingCompleteSpy = jest.fn();
      const reminderCreatedSpy = jest.fn();

      daemon.on('processingComplete', processingCompleteSpy);
      daemon.on('reminderCreated', reminderCreatedSpy);

      await daemon.forceProcessing();

      expect(mockObsidianReader.loadRules).toHaveBeenCalled();
      expect(mockGmailClient.getEmails).toHaveBeenCalled();
      expect(mockEmailFilter.filterEmails).toHaveBeenCalledWith([mockEmail], [mockRule]);
      expect(mockClaudeProcessor.processMultipleEmails).toHaveBeenCalled();
      expect(mockAppleReminders.createReminderFromExtractedData).toHaveBeenCalled();

      expect(processingCompleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          emailsProcessed: 1,
          processingTime: expect.any(Number),
          queueSize: 0
        })
      );

      expect(reminderCreatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          emailId: 'test-email-1',
          reminderId: 'reminder-123',
          ruleName: 'test_rule',
          confidence: 85
        })
      );
    });

    it('should skip emails with low confidence', async () => {
      mockClaudeProcessor.processMultipleEmails.mockResolvedValue([{
        emailId: 'test-email-1',
        ruleName: 'test_rule',
        extractedFields: { tipo: 'test' },
        confidence: 20, // Low confidence
        extractionMethod: 'ai-claude',
        timestamp: new Date()
      }]);

      await daemon.forceProcessing();

      expect(mockAppleReminders.createReminderFromExtractedData).not.toHaveBeenCalled();
    });

    it('should handle processing errors with retry logic', async () => {
      mockAppleReminders.createReminderFromExtractedData
        .mockRejectedValueOnce(new Error('Reminder creation failed'))
        .mockResolvedValueOnce({ success: true, reminderId: 'reminder-retry-123' });

      const processingFailedSpy = jest.fn();
      daemon.on('processingFailed', processingFailedSpy);

      // First processing attempt will fail and add to retry queue
      await daemon.forceProcessing();

      expect(daemon.getQueueSize()).toBe(1); // Item in retry queue

      // Second processing attempt should succeed
      await daemon.forceProcessing();

      expect(daemon.getQueueSize()).toBe(0); // Queue cleared
      expect(processingFailedSpy).not.toHaveBeenCalled(); // No final failure
    });

    it('should emit processingFailed after max retry attempts', async () => {
      mockAppleReminders.createReminderFromExtractedData.mockRejectedValue(
        new Error('Persistent reminder creation failure')
      );

      const processingFailedSpy = jest.fn();
      daemon.on('processingFailed', processingFailedSpy);

      // Process multiple times to exceed retry attempts
      await daemon.forceProcessing();
      await daemon.forceProcessing();
      await daemon.forceProcessing();
      await daemon.forceProcessing(); // Should exceed retry limit

      expect(processingFailedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          emailId: 'test-email-1',
          error: 'Persistent reminder creation failure',
          attempts: 3
        })
      );
    });

    it('should not process already processed emails', async () => {
      // First processing
      await daemon.forceProcessing();

      // Mock same email returned again
      mockGmailClient.getEmails.mockResolvedValue([mockEmail]);

      // Second processing
      await daemon.forceProcessing();

      // Should only process once
      expect(mockClaudeProcessor.processMultipleEmails).toHaveBeenCalledTimes(1);
    });

    it('should handle no new emails gracefully', async () => {
      mockGmailClient.getEmails.mockResolvedValue([]);
      mockIcloudClient.getEmails.mockResolvedValue([]);

      const processingCompleteSpy = jest.fn();
      daemon.on('processingComplete', processingCompleteSpy);

      await daemon.forceProcessing();

      expect(processingCompleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          emailsProcessed: 0
        })
      );
    });
  });

  describe('state persistence', () => {
    it('should load existing state on start', async () => {
      const savedState = {
        lastProcessedTimestamp: '2025-01-15T10:00:00.000Z',
        processedEmailIds: ['email-1', 'email-2'],
        totalEmailsProcessed: 5,
        totalRemindersCreated: 3
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(savedState));

      await daemon.start();
      const state = daemon.getState();

      expect(state.lastProcessedTimestamp).toEqual(new Date('2025-01-15T10:00:00.000Z'));
      expect(state.processedEmailIds.has('email-1')).toBe(true);
      expect(state.processedEmailIds.has('email-2')).toBe(true);
      expect(state.totalEmailsProcessed).toBe(5);
      expect(state.totalRemindersCreated).toBe(3);

      await daemon.stop();
    });

    it('should save state on stop', async () => {
      await daemon.start();
      await daemon.forceProcessing(); // Process some emails
      await daemon.stop();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.email-daemon-state.json'),
        expect.stringContaining('"totalEmailsProcessed":1')
      );
    });

    it('should handle state file corruption gracefully', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      await daemon.start();
      const state = daemon.getState();

      // Should start with default state
      expect(state.totalEmailsProcessed).toBe(0);
      expect(state.processedEmailIds.size).toBe(0);

      await daemon.stop();
    });
  });

  describe('configuration management', () => {
    it('should update daemon configuration', () => {
      daemon.updateConfig({
        intervalMinutes: 60,
        maxEmailsPerScan: 100
      });

      const config = daemon.getConfig();
      expect(config.intervalMinutes).toBe(60);
      expect(config.maxEmailsPerScan).toBe(100);
    });

    it('should restart interval when interval minutes changed', async () => {
      await daemon.start();

      const spy = jest.spyOn(global, 'setInterval');
      daemon.updateConfig({ intervalMinutes: 60 });

      expect(spy).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000);

      await daemon.stop();
    });
  });

  describe('statistics and monitoring', () => {
    beforeEach(async () => {
      await daemon.start();
    });

    afterEach(async () => {
      await daemon.stop();
    });

    it('should provide accurate statistics', async () => {
      await daemon.forceProcessing();

      const stats = daemon.getStats();

      expect(stats.totalEmailsProcessed).toBe(1);
      expect(stats.totalRemindersCreated).toBe(1);
      expect(stats.queueSize).toBe(0);
      expect(stats.isProcessing).toBe(false);
      expect(stats.lastProcessedTimestamp).toBeInstanceOf(Date);
    });

    it('should track processing errors in stats', async () => {
      mockClaudeProcessor.processMultipleEmails.mockRejectedValue(new Error('Processing failed'));

      await daemon.forceProcessing();

      const stats = daemon.getStats();
      expect(stats.lastError).toEqual({
        timestamp: expect.any(Date),
        message: 'Processing failed'
      });
    });
  });

  describe('interval processing', () => {
    it('should process emails at scheduled intervals', async () => {
      const processingCompleteSpy = jest.fn();
      daemon.on('processingComplete', processingCompleteSpy);

      await daemon.start();

      // Advance time by interval
      jest.advanceTimersByTime(30 * 60 * 1000); // 30 minutes
      await jest.runAllTimersAsync();

      expect(processingCompleteSpy).toHaveBeenCalledTimes(2); // Initial + interval

      await daemon.stop();
    });

    it('should skip interval processing if already processing', async () => {
      // Make processing take a long time
      mockClaudeProcessor.processMultipleEmails.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 5000))
      );

      await daemon.start();

      // Start processing and immediately trigger interval
      daemon.forceProcessing(); // Start long processing
      jest.advanceTimersByTime(30 * 60 * 1000); // Trigger interval

      // Should only process once
      expect(mockObsidianReader.loadRules).toHaveBeenCalledTimes(2); // Initial + forced

      await daemon.stop();
    });
  });

  describe('error handling', () => {
    it('should handle email client failures gracefully', async () => {
      await daemon.start();

      mockGmailClient.getEmails.mockRejectedValue(new Error('Gmail API error'));
      mockIcloudClient.getEmails.mockRejectedValue(new Error('iCloud IMAP error'));

      const processingErrorSpy = jest.fn();
      daemon.on('processingError', processingErrorSpy);

      await daemon.forceProcessing();

      // Should continue processing despite client errors
      expect(mockObsidianReader.loadRules).toHaveBeenCalled();

      await daemon.stop();
    });

    it('should throw error when forcing processing on stopped daemon', async () => {
      expect(daemon.isRunning()).toBe(false);

      await expect(daemon.forceProcessing()).rejects.toThrow('Daemon is not running');
    });
  });
});