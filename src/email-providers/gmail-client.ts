import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { EmailData, EmailDataSchema } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GmailClient');

interface GmailCredentials {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export class GmailClient {
  private gmail: any;
  private oauth2Client: any;
  private credentialsPath: string;
  private tokenPath: string;
  private isAuthenticated = false;

  constructor(credentialsPath?: string, tokenPath?: string) {
    this.credentialsPath = credentialsPath || path.join(process.cwd(), 'config', 'gmail-credentials.json');
    this.tokenPath = tokenPath || path.join(process.cwd(), 'config', 'gmail-token.json');
  }

  async initialize(): Promise<void> {
    try {
      // Load credentials
      const credentials = await this.loadCredentials();

      // Setup OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret,
        credentials.redirect_uris[0]
      );

      // Load existing token if available
      try {
        const token = await this.loadToken();
        this.oauth2Client.setCredentials(token);
        this.isAuthenticated = true;
        logger.info('Gmail client initialized with existing token');
      } catch (error) {
        logger.warn('No valid token found, authentication required');
        this.isAuthenticated = false;
      }

      // Initialize Gmail API
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    } catch (error) {
      logger.error('Failed to initialize Gmail client:', error);
      throw new Error(`Gmail client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async loadCredentials(): Promise<GmailCredentials> {
    try {
      const content = await fs.readFile(this.credentialsPath, 'utf-8');
      const credentials = JSON.parse(content);

      // Handle both direct credentials and "installed" wrapper format
      if (credentials.installed) {
        return credentials.installed;
      }
      return credentials;
    } catch (error) {
      throw new Error(`Failed to load Gmail credentials from ${this.credentialsPath}: ${error}`);
    }
  }

  private async loadToken(): Promise<TokenData> {
    try {
      const content = await fs.readFile(this.tokenPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load Gmail token from ${this.tokenPath}: ${error}`);
    }
  }

  async saveToken(token: TokenData): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
      await fs.writeFile(this.tokenPath, JSON.stringify(token, null, 2));
      logger.info('Gmail token saved successfully');
    } catch (error) {
      logger.error('Failed to save Gmail token:', error);
      throw error;
    }
  }

  getAuthUrl(): string {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized. Call initialize() first.');
    }

    const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Force consent screen to get refresh token
    });
  }

  async authenticate(code: string): Promise<void> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      await this.saveToken(tokens);
      this.isAuthenticated = true;

      logger.info('Gmail authentication successful');
    } catch (error) {
      logger.error('Gmail authentication failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshTokenIfNeeded(): Promise<void> {
    if (!this.oauth2Client.credentials.expiry_date) {
      return; // No expiry date, assume token is valid
    }

    const now = Date.now();
    const expiryTime = this.oauth2Client.credentials.expiry_date;

    // Refresh if token expires in the next 5 minutes
    if (now > expiryTime - 5 * 60 * 1000) {
      try {
        logger.info('Refreshing Gmail access token...');
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        this.oauth2Client.setCredentials(credentials);

        if (credentials) {
          await this.saveToken(credentials);
        }

        logger.info('Gmail token refreshed successfully');
      } catch (error) {
        logger.error('Failed to refresh Gmail token:', error);
        this.isAuthenticated = false;
        throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  async getEmails(options: {
    query?: string;
    maxResults?: number;
    includeSpamTrash?: boolean;
    labelIds?: string[];
  } = {}): Promise<EmailData[]> {
    if (!this.isAuthenticated) {
      throw new Error('Gmail client not authenticated. Call authenticate() first.');
    }

    try {
      await this.refreshTokenIfNeeded();

      const {
        query = '',
        maxResults = 10,
        includeSpamTrash = false,
        labelIds = ['INBOX']
      } = options;

      logger.debug(`Fetching Gmail emails with query: "${query}", max: ${maxResults}`);

      // List messages
      const listResponse = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
        includeSpamTrash,
        labelIds
      });

      const messages = listResponse.data.messages || [];
      logger.debug(`Found ${messages.length} Gmail messages`);

      // Fetch full message details
      const emails: EmailData[] = [];
      for (const message of messages) {
        try {
          const fullMessage = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });

          const emailData = this.parseGmailMessage(fullMessage.data);
          emails.push(emailData);
        } catch (error) {
          logger.warn(`Failed to fetch Gmail message ${message.id}:`, error);
        }
      }

      logger.info(`Successfully fetched ${emails.length} Gmail emails`);
      return emails;

    } catch (error) {
      logger.error('Failed to fetch Gmail emails:', error);
      throw new Error(`Failed to fetch emails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseGmailMessage(message: any): EmailData {
    const headers = message.payload.headers || [];

    // Extract headers
    const getHeader = (name: string) => {
      const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    const from = getHeader('From');
    const subject = getHeader('Subject');
    const date = new Date(getHeader('Date') || message.internalDate);

    // Extract email body
    let body = '';
    const extractTextFromPayload = (payload: any): string => {
      if (payload.body && payload.body.data) {
        // Decode base64url
        return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
      }

      if (payload.parts) {
        let text = '';
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
            text += extractTextFromPayload(part);
          }
        }
        return text;
      }

      return '';
    };

    body = extractTextFromPayload(message.payload);

    // Clean up HTML if necessary
    if (body.includes('<html>') || body.includes('<HTML>')) {
      // Simple HTML tag removal - could be enhanced with a proper HTML parser
      body = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const emailData = {
      id: message.id,
      from,
      subject,
      body,
      date,
      provider: 'gmail' as const,
      processed: false,
      matchedRules: []
    };

    return EmailDataSchema.parse(emailData);
  }

  async searchEmails(query: string, maxResults = 10): Promise<EmailData[]> {
    return this.getEmails({ query, maxResults });
  }

  async getEmailById(messageId: string): Promise<EmailData | null> {
    if (!this.isAuthenticated) {
      throw new Error('Gmail client not authenticated');
    }

    try {
      await this.refreshTokenIfNeeded();

      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      return this.parseGmailMessage(response.data);
    } catch (error) {
      logger.error(`Failed to fetch Gmail message ${messageId}:`, error);
      return null;
    }
  }

  isReady(): boolean {
    return this.isAuthenticated && !!this.gmail;
  }

  getStatus() {
    return {
      authenticated: this.isAuthenticated,
      credentialsPath: this.credentialsPath,
      tokenPath: this.tokenPath,
      hasCredentials: false, // Will be set after checking file
      hasToken: false // Will be set after checking file
    };
  }

  async checkConfiguration() {
    const status = this.getStatus();

    try {
      await fs.access(this.credentialsPath);
      status.hasCredentials = true;
    } catch {
      status.hasCredentials = false;
    }

    try {
      await fs.access(this.tokenPath);
      status.hasToken = true;
    } catch {
      status.hasToken = false;
    }

    return status;
  }
}