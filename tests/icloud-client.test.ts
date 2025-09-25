import { iCloudClient } from '../src/email-providers/icloud-client';

// Mock dependencies
const mockImap = {
  connect: jest.fn(),
  once: jest.fn(),
  openBox: jest.fn(),
  search: jest.fn(),
  fetch: jest.fn(),
  end: jest.fn(),
  getBoxes: jest.fn()
};

jest.mock('imap', () => jest.fn(() => mockImap));
jest.mock('mailparser');
jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('iCloudClient', () => {
  const mockConfig = {
    email: 'test@icloud.com',
    password: 'app-specific-password'
  };

  let client: iCloudClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    client = new iCloudClient(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default iCloud settings', () => {
      const testClient = new iCloudClient(mockConfig);
      expect(testClient).toBeInstanceOf(iCloudClient);
    });

    it('should use custom host and port if provided', () => {
      const customConfig = {
        ...mockConfig,
        host: 'custom.host.com',
        port: 143,
        tls: false
      };

      const testClient = new iCloudClient(customConfig);
      expect(testClient).toBeInstanceOf(iCloudClient);
    });
  });

  describe('initialize', () => {
    it('should initialize IMAP client with correct config', async () => {
      // Setup mock to simulate successful connection
      mockImap.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await client.initialize();

      const Imap = require('imap');
      expect(Imap).toHaveBeenCalledWith({
        user: mockConfig.email,
        password: mockConfig.password,
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
        tlsOptions: {
          rejectUnauthorized: false
        },
        authTimeout: 10000,
        connTimeout: 10000
      });

      expect(mockImap.connect).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      mockImap.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Connection failed')), 0);
        }
      });

      await expect(client.initialize()).rejects.toThrow('iCloud client initialization failed: IMAP connection failed: Connection failed');
    });
  });

  describe('getStatus', () => {
    it('should return correct status', () => {
      const status = client.getStatus();

      expect(status).toEqual({
        authenticated: false,
        connected: false,
        email: mockConfig.email,
        host: 'imap.mail.me.com',
        port: 993
      });
    });
  });

  describe('isReady', () => {
    it('should return false when not authenticated or connected', () => {
      expect(client.isReady()).toBe(false);
    });
  });

  describe('getEmails', () => {
    beforeEach(async () => {
      // Setup successful connection
      mockImap.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });
      await client.initialize();
    });

    it('should throw error when not authenticated', async () => {
      const unauthenticatedClient = new iCloudClient(mockConfig);

      await expect(unauthenticatedClient.getEmails()).rejects.toThrow(
        'iCloud client not authenticated. Call initialize() first.'
      );
    });

    it('should handle empty search results', async () => {
      // Mock successful folder opening
      mockImap.openBox.mockImplementation((folder: string, readOnly: boolean, callback: Function) => {
        callback(null, { messages: { total: 0 } });
      });

      // Mock empty search results
      mockImap.search.mockImplementation((criteria: any[], callback: Function) => {
        callback(null, []);
      });

      const emails = await client.getEmails();
      expect(emails).toEqual([]);
    });

    it('should use default search criteria when none provided', async () => {
      mockImap.openBox.mockImplementation((folder: string, readOnly: boolean, callback: Function) => {
        callback(null, { messages: { total: 5 } });
      });

      mockImap.search.mockImplementation((criteria: any[], callback: Function) => {
        expect(criteria).toEqual(['ALL']);
        callback(null, []);
      });

      await client.getEmails();
    });

    it('should handle UNSEEN flag correctly', async () => {
      mockImap.openBox.mockImplementation((folder: string, readOnly: boolean, callback: Function) => {
        callback(null, { messages: { total: 5 } });
      });

      mockImap.search.mockImplementation((criteria: any[], callback: Function) => {
        expect(criteria).toContain('UNSEEN');
        callback(null, []);
      });

      await client.getEmails({ unseen: true });
    });
  });

  describe('searchEmails', () => {
    beforeEach(async () => {
      mockImap.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });
      await client.initialize();
    });

    it('should parse from: query correctly', async () => {
      mockImap.openBox.mockImplementation((folder: string, readOnly: boolean, callback: Function) => {
        callback(null, { messages: { total: 0 } });
      });

      mockImap.search.mockImplementation((criteria: any[], callback: Function) => {
        expect(criteria).toContainEqual(['FROM', 'sender@example.com']);
        callback(null, []);
      });

      await client.searchEmails('from:sender@example.com');
    });

    it('should parse subject: query correctly', async () => {
      mockImap.openBox.mockImplementation((folder: string, readOnly: boolean, callback: Function) => {
        callback(null, { messages: { total: 0 } });
      });

      mockImap.search.mockImplementation((criteria: any[], callback: Function) => {
        expect(criteria).toContainEqual(['SUBJECT', 'test']);
        callback(null, []);
      });

      await client.searchEmails('subject:test');
    });

    it('should use OR search for general queries', async () => {
      mockImap.openBox.mockImplementation((folder: string, readOnly: boolean, callback: Function) => {
        callback(null, { messages: { total: 0 } });
      });

      mockImap.search.mockImplementation((criteria: any[], callback: Function) => {
        expect(criteria).toContainEqual(['OR', ['SUBJECT', 'test'], ['BODY', 'test']]);
        callback(null, []);
      });

      await client.searchEmails('test');
    });
  });

  describe('getEmailById', () => {
    beforeEach(async () => {
      mockImap.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });
      await client.initialize();
    });

    it('should return null for invalid message ID format', async () => {
      const result = await client.getEmailById('invalid-id');
      expect(result).toBeNull();
    });

    it('should extract UID from valid message ID', async () => {
      mockImap.openBox.mockImplementation((folder: string, readOnly: boolean, callback: Function) => {
        callback(null, { messages: { total: 1 } });
      });

      // Mock fetch to return empty results
      const mockFetch = {
        on: jest.fn(),
        once: jest.fn().mockImplementation((event, callback) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0);
          }
        })
      };
      mockImap.fetch.mockReturnValue(mockFetch);

      await client.getEmailById('icloud_123');

      expect(mockImap.fetch).toHaveBeenCalledWith([123], {
        bodies: '',
        struct: true
      });
    });
  });

  describe('disconnect', () => {
    it('should handle disconnection gracefully when not connected', async () => {
      await expect(client.disconnect()).resolves.toBeUndefined();
    });

    it('should end IMAP connection when connected', async () => {
      // Setup successful connection first
      mockImap.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });
      await client.initialize();

      // Setup disconnect
      mockImap.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
      });

      await client.disconnect();

      expect(mockImap.end).toHaveBeenCalled();
    });
  });

  describe('getFolders', () => {
    beforeEach(async () => {
      mockImap.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });
      await client.initialize();
    });

    it('should retrieve folder list successfully', async () => {
      const mockBoxes = {
        'INBOX': { delimiter: '/', children: {} },
        'Sent': { delimiter: '/', children: {} },
        'Drafts': { delimiter: '/', children: {} }
      };

      mockImap.getBoxes.mockImplementation((callback: Function) => {
        callback(null, mockBoxes);
      });

      const folders = await client.getFolders();
      expect(folders).toEqual(['INBOX', 'Sent', 'Drafts']);
    });

    it('should handle nested folders', async () => {
      const mockBoxes = {
        'INBOX': {
          delimiter: '/',
          children: {
            'Subfolder': { delimiter: '/', children: {} }
          }
        }
      };

      mockImap.getBoxes.mockImplementation((callback: Function) => {
        callback(null, mockBoxes);
      });

      const folders = await client.getFolders();
      expect(folders).toContain('INBOX');
      expect(folders).toContain('INBOX/Subfolder');
    });

    it('should handle getBoxes errors', async () => {
      mockImap.getBoxes.mockImplementation((callback: Function) => {
        callback(new Error('Failed to get boxes'), null);
      });

      await expect(client.getFolders()).rejects.toThrow('Failed to get folders: Failed to get boxes');
    });

    it('should throw error when not connected', async () => {
      const disconnectedClient = new iCloudClient(mockConfig);

      await expect(disconnectedClient.getFolders()).rejects.toThrow('Not connected to iCloud IMAP');
    });
  });
});