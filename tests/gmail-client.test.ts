import { GmailClient } from '../src/email-providers/gmail-client';
import { google } from 'googleapis';
import fs from 'fs/promises';

// Mock dependencies
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn()
    },
    gmail: jest.fn()
  }
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn()
}));

jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('GmailClient', () => {
  let client: GmailClient;
  let mockOAuth2Client: any;
  let mockGmailAPI: any;

  const mockCredentials = {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    redirect_uris: ['http://localhost:3000/callback']
  };

  const mockToken = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    token_type: 'Bearer',
    expiry_date: Date.now() + 3600000 // 1 hour from now
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup OAuth2 mock
    mockOAuth2Client = {
      setCredentials: jest.fn(),
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      refreshAccessToken: jest.fn().mockResolvedValue({ credentials: mockToken }),
      credentials: mockToken
    };

    (google.auth.OAuth2 as unknown as jest.Mock).mockImplementation(() => mockOAuth2Client);

    // Setup Gmail API mock
    mockGmailAPI = {
      users: {
        messages: {
          list: jest.fn(),
          get: jest.fn()
        }
      }
    };

    (google.gmail as unknown as jest.Mock).mockImplementation(() => mockGmailAPI);

    // Setup fs mocks
    (fs.readFile as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('credentials')) {
        return Promise.resolve(JSON.stringify(mockCredentials));
      }
      if (path.includes('token')) {
        return Promise.resolve(JSON.stringify(mockToken));
      }
      return Promise.reject(new Error('File not found'));
    });

    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);

    client = new GmailClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default paths', () => {
      const testClient = new GmailClient();
      expect(testClient).toBeInstanceOf(GmailClient);
    });

    it('should use custom paths if provided', () => {
      const customClient = new GmailClient('/custom/creds.json', '/custom/token.json');
      expect(customClient).toBeInstanceOf(GmailClient);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully with valid credentials and token', async () => {
      await expect(client.initialize()).resolves.not.toThrow();

      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        mockCredentials.client_id,
        mockCredentials.client_secret,
        mockCredentials.redirect_uris[0]
      );
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(mockToken);
      expect(google.gmail).toHaveBeenCalledWith({ version: 'v1', auth: mockOAuth2Client });
    });

    it('should handle missing token gracefully', async () => {
      (fs.readFile as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('credentials')) {
          return Promise.resolve(JSON.stringify(mockCredentials));
        }
        if (path.includes('token')) {
          return Promise.reject(new Error('Token not found'));
        }
        return Promise.reject(new Error('File not found'));
      });

      await expect(client.initialize()).resolves.not.toThrow();
      expect(mockOAuth2Client.setCredentials).not.toHaveBeenCalled();
    });

    it('should throw error if credentials are missing', async () => {
      (fs.readFile as jest.Mock).mockImplementation(() => {
        return Promise.reject(new Error('Credentials not found'));
      });

      await expect(client.initialize()).rejects.toThrow('Gmail client initialization failed');
    });

    it('should handle installed credentials format', async () => {
      const installedCredentials = {
        installed: mockCredentials
      };

      (fs.readFile as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('credentials')) {
          return Promise.resolve(JSON.stringify(installedCredentials));
        }
        if (path.includes('token')) {
          return Promise.resolve(JSON.stringify(mockToken));
        }
        return Promise.reject(new Error('File not found'));
      });

      await expect(client.initialize()).resolves.not.toThrow();
      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        mockCredentials.client_id,
        mockCredentials.client_secret,
        mockCredentials.redirect_uris[0]
      );
    });
  });

  describe('authentication', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should generate auth URL', () => {
      const expectedUrl = 'https://accounts.google.com/oauth2/auth?test=url';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(expectedUrl);

      const authUrl = client.getAuthUrl();

      expect(authUrl).toBe(expectedUrl);
      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.readonly'],
        prompt: 'consent'
      });
    });

    it('should authenticate with authorization code', async () => {
      const authCode = 'test-auth-code';
      const newTokens = { ...mockToken, access_token: 'new-access-token' };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: newTokens });

      await expect(client.authenticate(authCode)).resolves.not.toThrow();

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith(authCode);
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(newTokens);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle authentication failure', async () => {
      const authCode = 'invalid-code';
      mockOAuth2Client.getToken.mockRejectedValue(new Error('Invalid code'));

      await expect(client.authenticate(authCode)).rejects.toThrow('Authentication failed');
    });
  });

  describe('token refresh', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should refresh token when expired', async () => {
      // Set token to expire soon
      mockOAuth2Client.credentials.expiry_date = Date.now() + 60000; // 1 minute
      const newCredentials = { ...mockToken, access_token: 'refreshed-token' };
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({ credentials: newCredentials });

      await expect(client.refreshTokenIfNeeded()).resolves.not.toThrow();

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(newCredentials);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should not refresh valid token', async () => {
      // Set token to expire in future
      mockOAuth2Client.credentials.expiry_date = Date.now() + 3600000; // 1 hour

      await expect(client.refreshTokenIfNeeded()).resolves.not.toThrow();

      expect(mockOAuth2Client.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('should handle refresh failure', async () => {
      mockOAuth2Client.credentials.expiry_date = Date.now() + 60000; // 1 minute
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(new Error('Refresh failed'));

      await expect(client.refreshTokenIfNeeded()).rejects.toThrow('Token refresh failed');
    });
  });

  describe('email fetching', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should fetch emails successfully', async () => {
      const mockMessages = [
        { id: 'msg1', threadId: 'thread1' },
        { id: 'msg2', threadId: 'thread2' }
      ];

      const mockFullMessage = {
        data: {
          id: 'msg1',
          payload: {
            headers: [
              { name: 'From', value: 'test@example.com' },
              { name: 'Subject', value: 'Test Email' },
              { name: 'Date', value: new Date().toISOString() }
            ],
            body: {
              data: Buffer.from('Test email body').toString('base64url')
            }
          },
          internalDate: Date.now().toString()
        }
      };

      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: { messages: mockMessages }
      });
      mockGmailAPI.users.messages.get.mockResolvedValue(mockFullMessage);

      const emails = await client.getEmails({ maxResults: 2 });

      expect(emails).toHaveLength(2);
      expect(emails[0]).toHaveProperty('id', 'msg1');
      expect(emails[0]).toHaveProperty('from', 'test@example.com');
      expect(emails[0]).toHaveProperty('subject', 'Test Email');
      expect(emails[0]).toHaveProperty('provider', 'gmail');
      expect(mockGmailAPI.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        q: '',
        maxResults: 2,
        includeSpamTrash: false,
        labelIds: ['INBOX']
      });
    });

    it('should throw error when not authenticated', async () => {
      const unauthenticatedClient = new GmailClient();
      // Don't initialize, so it remains unauthenticated

      await expect(unauthenticatedClient.getEmails()).rejects.toThrow('Gmail client not authenticated');
    });

    it('should handle API errors gracefully', async () => {
      mockGmailAPI.users.messages.list.mockRejectedValue(new Error('API Error'));

      await expect(client.getEmails()).rejects.toThrow('Failed to fetch emails');
    });

    it('should search emails with query', async () => {
      const query = 'subject:test';
      mockGmailAPI.users.messages.list.mockResolvedValue({ data: { messages: [] } });

      await client.searchEmails(query, 5);

      expect(mockGmailAPI.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        q: query,
        maxResults: 5,
        includeSpamTrash: false,
        labelIds: ['INBOX']
      });
    });
  });

  describe('status and configuration', () => {
    it('should check configuration files exist', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const config = await client.checkConfiguration();

      expect(config).toHaveProperty('hasCredentials', true);
      expect(config).toHaveProperty('hasToken', true);
      expect(config).toHaveProperty('authenticated', false);
    });

    it('should handle missing configuration files', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('File not found'));

      const config = await client.checkConfiguration();

      expect(config).toHaveProperty('hasCredentials', false);
      expect(config).toHaveProperty('hasToken', false);
    });

    it('should report ready status correctly', async () => {
      await client.initialize();
      expect(client.isReady()).toBe(true);
    });

    it('should report not ready when not initialized', () => {
      const newClient = new GmailClient();
      expect(newClient.isReady()).toBe(false);
    });
  });

  describe('email parsing', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should parse multipart emails correctly', async () => {
      const multipartMessage = {
        data: {
          id: 'multipart1',
          payload: {
            headers: [
              { name: 'From', value: 'sender@example.com' },
              { name: 'Subject', value: 'Multipart Email' },
              { name: 'Date', value: new Date().toISOString() }
            ],
            parts: [
              {
                mimeType: 'text/plain',
                body: {
                  data: Buffer.from('Plain text content').toString('base64url')
                }
              },
              {
                mimeType: 'text/html',
                body: {
                  data: Buffer.from('<p>HTML content</p>').toString('base64url')
                }
              }
            ]
          }
        }
      };

      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: { messages: [{ id: 'multipart1' }] }
      });
      mockGmailAPI.users.messages.get.mockResolvedValue(multipartMessage);

      const emails = await client.getEmails({ maxResults: 1 });

      expect(emails).toHaveLength(1);
      expect(emails[0].body).toContain('Plain text content');
      expect(emails[0].body).toContain('HTML content');
    });

    it('should clean HTML content', async () => {
      const htmlMessage = {
        data: {
          id: 'html1',
          payload: {
            headers: [
              { name: 'From', value: 'sender@example.com' },
              { name: 'Subject', value: 'HTML Email' },
              { name: 'Date', value: new Date().toISOString() }
            ],
            body: {
              data: Buffer.from('<html><body><p>HTML content</p></body></html>').toString('base64url')
            }
          }
        }
      };

      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: { messages: [{ id: 'html1' }] }
      });
      mockGmailAPI.users.messages.get.mockResolvedValue(htmlMessage);

      const emails = await client.getEmails({ maxResults: 1 });

      expect(emails[0].body).not.toContain('<html>');
      expect(emails[0].body).not.toContain('<body>');
      expect(emails[0].body).toContain('HTML content');
    });
  });
});