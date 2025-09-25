import { EventEmitter } from 'events';
import { EmailData, EmailRule, Configuration, ProcessingLog, ProcessingResult } from '../types';
import { ObsidianReader } from '../obsidian/obsidian-reader';
import { EmailFilter } from '../email-processors/email-filter';
import { ClaudeProcessor } from '../ai-engine/claude-processor';
import { AppleReminders } from '../reminders/apple-reminders';
import { GmailClient } from '../email-providers/gmail-client';
import { iCloudClient } from '../email-providers/icloud-client';
import { createLogger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger('email-daemon');

export interface DaemonConfig {
  intervalMinutes: number;
  maxEmailsPerScan: number;
  retryAttempts: number;
  stateFilePath: string;
  enableGmail: boolean;
  enableIcloud: boolean;
}

export interface DaemonState {
  lastProcessedTimestamp: Date;
  processedEmailIds: Set<string>;
  totalEmailsProcessed: number;
  totalRemindersCreated: number;
  lastErrorTimestamp?: Date;
  lastErrorMessage?: string;
}

export interface ProcessingQueueItem {
  email: EmailData;
  rules: EmailRule[];
  attempts: number;
  lastAttemptTime?: Date;
  error?: string;
}

export class EmailDaemon extends EventEmitter {
  private config: DaemonConfig;
  private configuration: Configuration;
  private state: DaemonState;
  private _isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;
  private processingQueue: ProcessingQueueItem[] = [];
  private isProcessing: boolean = false;

  // Component instances
  private obsidianReader: ObsidianReader;
  private claudeProcessor: ClaudeProcessor;
  private appleReminders: AppleReminders;
  private gmailClient?: GmailClient;
  private icloudClient?: iCloudClient;

  constructor(configuration: Configuration, daemonConfig?: Partial<DaemonConfig>) {
    super();

    this.configuration = configuration;

    this.config = {
      intervalMinutes: configuration.daemon.intervalMinutes,
      maxEmailsPerScan: configuration.daemon.maxEmailsPerScan,
      retryAttempts: configuration.daemon.retryAttempts,
      stateFilePath: path.join(configuration.obsidianVaultPath, '.email-daemon-state.json'),
      enableGmail: !!configuration.gmail,
      enableIcloud: !!configuration.icloud,
      ...daemonConfig
    };

    this.state = {
      lastProcessedTimestamp: new Date(0), // Start from epoch
      processedEmailIds: new Set<string>(),
      totalEmailsProcessed: 0,
      totalRemindersCreated: 0
    };

    // Initialize components
    this.obsidianReader = new ObsidianReader(configuration.obsidianVaultPath);

    this.claudeProcessor = new ClaudeProcessor({
      model: 'claude-3-sonnet-20240229',
      maxTokens: 1000,
      temperature: 0.1
    });

    this.appleReminders = new AppleReminders({
      defaultList: configuration.appleReminders.defaultList,
      timezone: configuration.appleReminders.timezone
    });

    // Initialize email clients if configured
    if (this.config.enableGmail && configuration.gmail) {
      this.gmailClient = new GmailClient(
        configuration.gmail.credentialsPath,
        configuration.gmail.tokenPath
      );
    }

    if (this.config.enableIcloud && configuration.icloud) {
      this.icloudClient = new iCloudClient({
        email: configuration.icloud.username,
        password: configuration.icloud.appSpecificPassword,
        host: configuration.icloud.server,
        port: configuration.icloud.port
      });
    }

    logger.info('Email daemon initialized', {
      intervalMinutes: this.config.intervalMinutes,
      maxEmailsPerScan: this.config.maxEmailsPerScan,
      enableGmail: this.config.enableGmail,
      enableIcloud: this.config.enableIcloud
    });
  }

  public async start(): Promise<void> {
    if (this._isRunning) {
      logger.warn('Daemon is already running');
      return;
    }

    logger.info('Starting email daemon...');

    try {
      // Load state from persistence
      await this.loadState();

      // Initialize email clients
      await this.initializeEmailClients();

      // Test Apple Reminders access
      await this.testAppleRemindersAccess();

      // Start processing loop
      this._isRunning = true;
      await this.processEmailsOnce(); // Initial run

      // Schedule recurring processing
      this.intervalId = setInterval(async () => {
        if (!this.isProcessing) {
          await this.processEmailsOnce();
        } else {
          logger.debug('Skipping scheduled run - processing already in progress');
        }
      }, this.config.intervalMinutes * 60 * 1000);

      logger.info(`Email daemon started with ${this.config.intervalMinutes}-minute intervals`);
      this.emit('started');

    } catch (error) {
      logger.error('Failed to start daemon:', error);
      this._isRunning = false;
      this.emit('error', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this._isRunning) {
      logger.warn('Daemon is not running');
      return;
    }

    logger.info('Stopping email daemon...');

    this._isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Wait for current processing to complete
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Save state
    await this.saveState();

    logger.info('Email daemon stopped');
    this.emit('stopped');
  }

  private async initializeEmailClients(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    if (this.gmailClient) {
      initPromises.push(
        this.gmailClient.initialize()
          .then(() => {
            logger.info('Gmail client initialized');
          })
          .catch((error: any) => {
            logger.error('Failed to initialize Gmail client:', error);
            this.gmailClient = undefined;
          })
      );
    }

    if (this.icloudClient) {
      initPromises.push(
        this.icloudClient.initialize()
          .then(() => {
            logger.info('iCloud client connected');
          })
          .catch((error: any) => {
            logger.error('Failed to connect iCloud client:', error);
            this.icloudClient = undefined;
          })
      );
    }

    await Promise.all(initPromises);

    if (!this.gmailClient && !this.icloudClient) {
      throw new Error('No email clients available - check configuration');
    }
  }

  private async testAppleRemindersAccess(): Promise<void> {
    const accessResult = await this.appleReminders.testAccess();

    if (!accessResult.success) {
      logger.error('Apple Reminders access test failed:', accessResult.error);
      throw new Error(`Apple Reminders not accessible: ${accessResult.error}`);
    }

    logger.info('Apple Reminders access confirmed');
  }

  private async processEmailsOnce(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      logger.info('Starting email processing cycle...');

      // Load current rules from Obsidian
      const rules = await this.obsidianReader.loadRules();
      logger.info(`Loaded ${rules.length} rules from Obsidian`);

      // Fetch new emails from all providers
      const allEmails = await this.fetchNewEmails();
      logger.info(`Fetched ${allEmails.length} new emails`);

      if (allEmails.length === 0) {
        logger.info('No new emails to process');
        return;
      }

      // Filter emails using rules
      const filteredEmails = EmailFilter.filterEmails(allEmails, rules);
      const matchedEmails = filteredEmails.filter((email: EmailData) => email.matchedRules && email.matchedRules.length > 0);

      logger.info(`${matchedEmails.length} emails matched rules`);

      // Add matched emails to processing queue
      for (const email of matchedEmails) {
        if (!this.state.processedEmailIds.has(email.id)) {
          this.addToQueue(email, rules);
        }
      }

      // Process the queue
      await this.processQueue();

      // Update last processed timestamp
      this.state.lastProcessedTimestamp = new Date();

      const processingTime = Date.now() - startTime;
      logger.info(`Email processing cycle completed in ${processingTime}ms`);

      this.emit('processingComplete', {
        emailsProcessed: matchedEmails.length,
        processingTime,
        queueSize: this.processingQueue.length
      });

    } catch (error) {
      logger.error('Error during email processing cycle:', error);
      this.state.lastErrorTimestamp = new Date();
      this.state.lastErrorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('processingError', error);
    } finally {
      this.isProcessing = false;
      await this.saveState();
    }
  }

  private async fetchNewEmails(): Promise<EmailData[]> {
    const fetchPromises: Promise<EmailData[]>[] = [];

    if (this.gmailClient?.isReady()) {
      fetchPromises.push(
        this.gmailClient.getEmails({
          maxResults: Math.floor(this.config.maxEmailsPerScan / 2)
        }).catch((error: any) => {
          logger.error('Failed to fetch Gmail emails:', error);
          return [];
        })
      );
    }

    if (this.icloudClient?.isReady()) {
      fetchPromises.push(
        this.icloudClient.getEmails({
          limit: Math.floor(this.config.maxEmailsPerScan / 2)
        }).catch((error: any) => {
          logger.error('Failed to fetch iCloud emails:', error);
          return [];
        })
      );
    }

    const emailArrays = await Promise.all(fetchPromises);
    const allEmails = emailArrays.flat();

    // Filter out emails we've already processed
    return allEmails.filter(email =>
      !this.state.processedEmailIds.has(email.id) &&
      email.date > this.state.lastProcessedTimestamp
    );
  }

  private addToQueue(email: EmailData, rules: EmailRule[]): void {
    const queueItem: ProcessingQueueItem = {
      email,
      rules,
      attempts: 0
    };

    this.processingQueue.push(queueItem);
    logger.debug(`Added email ${email.id} to processing queue`);
  }

  private async processQueue(): Promise<void> {
    logger.info(`Processing queue with ${this.processingQueue.length} items`);

    const itemsToProcess = [...this.processingQueue];
    this.processingQueue = [];

    for (const item of itemsToProcess) {
      try {
        await this.processQueueItem(item);
        this.state.processedEmailIds.add(item.email.id);
        this.state.totalEmailsProcessed++;

      } catch (error) {
        logger.error(`Failed to process email ${item.email.id}:`, error);

        item.attempts++;
        item.lastAttemptTime = new Date();
        item.error = error instanceof Error ? error.message : 'Unknown error';

        // Retry logic
        if (item.attempts < this.config.retryAttempts) {
          logger.info(`Retrying email ${item.email.id} (attempt ${item.attempts + 1}/${this.config.retryAttempts})`);
          this.processingQueue.push(item);
        } else {
          logger.error(`Max retry attempts reached for email ${item.email.id}`);
          this.emit('processingFailed', {
            emailId: item.email.id,
            error: item.error,
            attempts: item.attempts
          });
        }
      }
    }
  }

  private async processQueueItem(item: ProcessingQueueItem): Promise<void> {
    const { email, rules } = item;

    logger.info(`Processing email: ${email.id} from ${email.from}`);

    // Process with AI to extract data
    const processingResults = await this.claudeProcessor.processMultipleEmails([email], rules);

    for (const result of processingResults) {
      if (result.confidence < 25) {
        logger.warn(`Low confidence (${result.confidence}%) for email ${email.id}, skipping reminder creation`);
        continue;
      }

      // Find the rule template
      const rule = rules.find(r => r.name === result.ruleName);
      if (!rule) {
        logger.warn(`Rule not found: ${result.ruleName}`);
        continue;
      }

      // Create reminder from extracted data
      const reminderResult = await this.appleReminders.createReminderFromExtractedData(
        result.extractedFields,
        rule.reminderTemplate,
        email.id
      );

      if (reminderResult.success) {
        logger.info(`Created reminder: ${reminderResult.reminderId} for email ${email.id}`);
        this.state.totalRemindersCreated++;

        this.emit('reminderCreated', {
          emailId: email.id,
          reminderId: reminderResult.reminderId,
          ruleName: result.ruleName,
          confidence: result.confidence
        });
      } else {
        logger.error(`Failed to create reminder for email ${email.id}:`, reminderResult.error);
        throw new Error(reminderResult.error);
      }
    }
  }

  private async loadState(): Promise<void> {
    try {
      const stateData = await fs.readFile(this.config.stateFilePath, 'utf-8');
      const savedState = JSON.parse(stateData);

      this.state = {
        lastProcessedTimestamp: new Date(savedState.lastProcessedTimestamp),
        processedEmailIds: new Set(savedState.processedEmailIds || []),
        totalEmailsProcessed: savedState.totalEmailsProcessed || 0,
        totalRemindersCreated: savedState.totalRemindersCreated || 0,
        lastErrorTimestamp: savedState.lastErrorTimestamp ? new Date(savedState.lastErrorTimestamp) : undefined,
        lastErrorMessage: savedState.lastErrorMessage
      };

      logger.info('Daemon state loaded from persistence', {
        lastProcessedTimestamp: this.state.lastProcessedTimestamp,
        processedEmailsCount: this.state.processedEmailIds.size,
        totalEmailsProcessed: this.state.totalEmailsProcessed,
        totalRemindersCreated: this.state.totalRemindersCreated
      });

    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        logger.info('No previous state found, starting fresh');
      } else {
        logger.warn('Failed to load daemon state:', error);
      }
    }
  }

  private async saveState(): Promise<void> {
    try {
      const stateToSave = {
        lastProcessedTimestamp: this.state.lastProcessedTimestamp.toISOString(),
        processedEmailIds: Array.from(this.state.processedEmailIds),
        totalEmailsProcessed: this.state.totalEmailsProcessed,
        totalRemindersCreated: this.state.totalRemindersCreated,
        lastErrorTimestamp: this.state.lastErrorTimestamp?.toISOString(),
        lastErrorMessage: this.state.lastErrorMessage
      };

      await fs.writeFile(this.config.stateFilePath, JSON.stringify(stateToSave, null, 2));
      logger.debug('Daemon state saved to persistence');

    } catch (error) {
      logger.error('Failed to save daemon state:', error);
    }
  }

  public getState(): DaemonState {
    return {
      ...this.state,
      processedEmailIds: new Set(this.state.processedEmailIds)
    };
  }

  public getConfig(): DaemonConfig {
    return { ...this.config };
  }

  public isRunning(): boolean {
    return this._isRunning;
  }

  public getQueueSize(): number {
    return this.processingQueue.length;
  }

  public async forceProcessing(): Promise<void> {
    if (!this._isRunning) {
      throw new Error('Daemon is not running');
    }

    logger.info('Force processing requested');
    await this.processEmailsOnce();
  }

  public updateConfig(newConfig: Partial<DaemonConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart interval if running and interval changed
    if (this._isRunning && newConfig.intervalMinutes && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(async () => {
        if (!this.isProcessing) {
          await this.processEmailsOnce();
        }
      }, this.config.intervalMinutes * 60 * 1000);

      logger.info(`Daemon interval updated to ${this.config.intervalMinutes} minutes`);
    }
  }

  public getStats(): {
    uptime: number;
    totalEmailsProcessed: number;
    totalRemindersCreated: number;
    queueSize: number;
    lastProcessedTimestamp: Date;
    isProcessing: boolean;
    lastError?: { timestamp: Date; message: string };
  } {
    return {
      uptime: this._isRunning ? Date.now() - this.state.lastProcessedTimestamp.getTime() : 0,
      totalEmailsProcessed: this.state.totalEmailsProcessed,
      totalRemindersCreated: this.state.totalRemindersCreated,
      queueSize: this.processingQueue.length,
      lastProcessedTimestamp: this.state.lastProcessedTimestamp,
      isProcessing: this.isProcessing,
      lastError: this.state.lastErrorTimestamp && this.state.lastErrorMessage ? {
        timestamp: this.state.lastErrorTimestamp,
        message: this.state.lastErrorMessage
      } : undefined
    };
  }
}