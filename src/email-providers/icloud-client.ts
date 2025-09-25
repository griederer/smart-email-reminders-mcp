import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { EmailData, EmailDataSchema } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('iCloudClient');

interface iCloudConfig {
  email: string;
  password: string; // App-specific password
  host?: string;
  port?: number;
  tls?: boolean;
}

export class iCloudClient {
  private imap: Imap | null = null;
  private config: iCloudConfig;
  private isAuthenticated = false;
  private isConnected = false;

  constructor(config: iCloudConfig) {
    this.config = {
      host: 'imap.mail.me.com',
      port: 993,
      tls: true,
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      this.imap = new Imap({
        user: this.config.email,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        tlsOptions: {
          rejectUnauthorized: false
        },
        authTimeout: 10000,
        connTimeout: 10000
      });

      await this.connect();
      logger.info('iCloud IMAP client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize iCloud IMAP client:', error);
      throw new Error(`iCloud client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async connect(): Promise<void> {
    if (!this.imap) {
      throw new Error('IMAP client not initialized');
    }

    return new Promise((resolve, reject) => {
      this.imap!.once('ready', () => {
        this.isConnected = true;
        this.isAuthenticated = true;
        logger.info('iCloud IMAP connection established');
        resolve();
      });

      this.imap!.once('error', (error: Error) => {
        this.isConnected = false;
        this.isAuthenticated = false;
        logger.error('iCloud IMAP connection error:', error);
        reject(new Error(`IMAP connection failed: ${error.message}`));
      });

      this.imap!.once('end', () => {
        this.isConnected = false;
        logger.info('iCloud IMAP connection ended');
      });

      this.imap!.connect();
    });
  }

  private async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      logger.info('Reconnecting to iCloud IMAP...');
      await this.connect();
    }
  }

  async getEmails(options: {
    folder?: string;
    limit?: number;
    since?: Date;
    unseen?: boolean;
    search?: string[];
  } = {}): Promise<EmailData[]> {
    if (!this.isAuthenticated) {
      throw new Error('iCloud client not authenticated. Call initialize() first.');
    }

    const {
      folder = 'INBOX',
      limit = 10,
      since,
      unseen = false,
      search = []
    } = options;

    try {
      await this.ensureConnection();

      logger.debug(`Fetching iCloud emails from ${folder}, limit: ${limit}`);

      // Open mailbox
      await this.openBox(folder);

      // Build search criteria
      const searchCriteria: any[] = [];

      if (unseen) {
        searchCriteria.push('UNSEEN');
      }

      if (since) {
        searchCriteria.push(['SINCE', since]);
      }

      // Add custom search terms
      searchCriteria.push(...search);

      // If no criteria, get all messages
      if (searchCriteria.length === 0) {
        searchCriteria.push('ALL');
      }

      // Search for messages
      const uids = await this.searchMessages(searchCriteria);

      if (uids.length === 0) {
        logger.debug('No messages found matching criteria');
        return [];
      }

      // Limit results
      const limitedUids = uids.slice(-limit);
      logger.debug(`Found ${uids.length} messages, processing last ${limitedUids.length}`);

      // Fetch message details
      const emails = await this.fetchMessages(limitedUids);

      logger.info(`Successfully fetched ${emails.length} iCloud emails`);
      return emails;

    } catch (error) {
      logger.error('Failed to fetch iCloud emails:', error);
      throw new Error(`Failed to fetch emails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async openBox(folder: string): Promise<void> {
    if (!this.imap) {
      throw new Error('IMAP client not initialized');
    }

    return new Promise((resolve, reject) => {
      this.imap!.openBox(folder, true, (error, box) => {
        if (error) {
          logger.error(`Failed to open folder ${folder}:`, error);
          reject(new Error(`Failed to open folder: ${error.message}`));
        } else {
          logger.debug(`Opened folder ${folder}, ${box.messages.total} total messages`);
          resolve();
        }
      });
    });
  }

  private async searchMessages(criteria: any[]): Promise<number[]> {
    if (!this.imap) {
      throw new Error('IMAP client not initialized');
    }

    return new Promise((resolve, reject) => {
      this.imap!.search(criteria, (error, uids) => {
        if (error) {
          logger.error('IMAP search failed:', error);
          reject(new Error(`Search failed: ${error.message}`));
        } else {
          resolve(uids || []);
        }
      });
    });
  }

  private async fetchMessages(uids: number[]): Promise<EmailData[]> {
    if (!this.imap) {
      throw new Error('IMAP client not initialized');
    }

    return new Promise((resolve, reject) => {
      const emails: EmailData[] = [];
      const fetch = this.imap!.fetch(uids, {
        bodies: '',
        struct: true
      });

      fetch.on('message', (msg, seqno) => {
        let buffer = '';
        const uid = uids[seqno - 1];

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
        });

        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(buffer);
            const emailData = this.parseImapMessage(parsed, uid);
            emails.push(emailData);
          } catch (error) {
            logger.warn(`Failed to parse message ${uid}:`, error);
          }
        });
      });

      fetch.once('error', (error) => {
        logger.error('IMAP fetch error:', error);
        reject(new Error(`Fetch failed: ${error.message}`));
      });

      fetch.once('end', () => {
        logger.debug(`Parsed ${emails.length} messages successfully`);
        resolve(emails);
      });
    });
  }

  private parseImapMessage(parsed: any, uid: number): EmailData {
    // Extract basic fields
    const from = parsed.from?.text || parsed.from?.value?.[0]?.address || '';
    const subject = parsed.subject || '';
    const date = parsed.date ? new Date(parsed.date) : new Date();

    // Extract body content (prefer text over HTML)
    let body = '';
    if (parsed.text) {
      body = parsed.text;
    } else if (parsed.html) {
      // Simple HTML tag removal - could be enhanced
      body = parsed.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const emailData = {
      id: `icloud_${uid}`,
      from,
      subject,
      body,
      date,
      provider: 'icloud' as const,
      processed: false,
      matchedRules: []
    };

    return EmailDataSchema.parse(emailData);
  }

  async searchEmails(query: string, options: {
    folder?: string;
    limit?: number;
  } = {}): Promise<EmailData[]> {
    const { folder = 'INBOX', limit = 10 } = options;

    // Convert query to IMAP search criteria
    const searchCriteria: any[] = [];

    // Simple query parsing - can be enhanced
    if (query.includes('from:')) {
      const fromMatch = query.match(/from:(\S+)/);
      if (fromMatch) {
        searchCriteria.push(['FROM', fromMatch[1]]);
      }
    }

    if (query.includes('subject:')) {
      const subjectMatch = query.match(/subject:(.+?)(?:\s|$)/);
      if (subjectMatch) {
        searchCriteria.push(['SUBJECT', subjectMatch[1].trim()]);
      }
    }

    // If no specific criteria, search in subject and body
    if (searchCriteria.length === 0 && query.trim()) {
      searchCriteria.push(['OR', ['SUBJECT', query], ['BODY', query]]);
    }

    return this.getEmails({
      folder,
      limit,
      search: searchCriteria
    });
  }

  async getEmailById(messageId: string): Promise<EmailData | null> {
    // Extract UID from our custom ID format
    const uidMatch = messageId.match(/^icloud_(\d+)$/);
    if (!uidMatch) {
      logger.warn(`Invalid iCloud message ID format: ${messageId}`);
      return null;
    }

    const uid = parseInt(uidMatch[1], 10);

    try {
      await this.ensureConnection();
      await this.openBox('INBOX');

      const emails = await this.fetchMessages([uid]);
      return emails[0] || null;
    } catch (error) {
      logger.error(`Failed to fetch iCloud message ${messageId}:`, error);
      return null;
    }
  }

  isReady(): boolean {
    return this.isAuthenticated && this.isConnected;
  }

  getStatus() {
    return {
      authenticated: this.isAuthenticated,
      connected: this.isConnected,
      email: this.config.email,
      host: this.config.host,
      port: this.config.port
    };
  }

  async disconnect(): Promise<void> {
    if (this.imap && this.isConnected) {
      return new Promise((resolve) => {
        this.imap!.once('end', () => {
          this.isConnected = false;
          this.isAuthenticated = false;
          logger.info('iCloud IMAP connection closed');
          resolve();
        });

        this.imap!.end();
      });
    }
  }

  // Get list of available folders
  async getFolders(): Promise<string[]> {
    if (!this.imap || !this.isConnected) {
      throw new Error('Not connected to iCloud IMAP');
    }

    return new Promise((resolve, reject) => {
      this.imap!.getBoxes((error, boxes) => {
        if (error) {
          reject(new Error(`Failed to get folders: ${error.message}`));
        } else {
          const folderNames = this.extractFolderNames(boxes);
          resolve(folderNames);
        }
      });
    });
  }

  private extractFolderNames(boxes: any, prefix = ''): string[] {
    const folders: string[] = [];

    for (const [name, box] of Object.entries(boxes)) {
      const boxObj = box as any;
      const fullName = prefix ? `${prefix}${boxObj.delimiter}${name}` : name;
      folders.push(fullName);

      if (boxObj.children && Object.keys(boxObj.children).length > 0) {
        folders.push(...this.extractFolderNames(boxObj.children, fullName));
      }
    }

    return folders;
  }
}