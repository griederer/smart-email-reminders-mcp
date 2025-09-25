#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { EmailDaemon, DaemonConfig } from './daemon/email-daemon.js';
import { Configuration } from './types/index.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('mcp-server');

class SmartEmailRemindersMCP {
  private server: Server;
  private daemon?: EmailDaemon;

  constructor() {
    this.server = new Server(
      {
        name: 'smart-email-reminders',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      if (this.daemon) {
        await this.daemon.stop();
      }
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'start_daemon',
            description: 'Start the email processing daemon with the given configuration',
            inputSchema: {
              type: 'object',
              properties: {
                obsidianVaultPath: {
                  type: 'string',
                  description: 'Path to the Obsidian vault containing email rules',
                  default: '/Users/gonzaloriederer/Documents/Obsidian/griederer'
                },
                intervalMinutes: {
                  type: 'number',
                  description: 'Processing interval in minutes',
                  default: 30
                },
                maxEmailsPerScan: {
                  type: 'number',
                  description: 'Maximum emails to process per scan',
                  default: 50
                },
                enableGmail: {
                  type: 'boolean',
                  description: 'Enable Gmail integration',
                  default: true
                },
                enableIcloud: {
                  type: 'boolean',
                  description: 'Enable iCloud integration',
                  default: false
                }
              }
            },
          },
          {
            name: 'stop_daemon',
            description: 'Stop the email processing daemon',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'daemon_status',
            description: 'Get current daemon status and statistics',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'force_processing',
            description: 'Force immediate email processing (bypass interval)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'test_with_sample_email',
            description: 'Test the system with a sample GGCC email',
            inputSchema: {
              type: 'object',
              properties: {
                subject: {
                  type: 'string',
                  description: 'Email subject',
                  default: 'Cobro GGCC - Gastos Comunes Enero 2025'
                },
                from: {
                  type: 'string',
                  description: 'Sender email',
                  default: 'ggcc@edificio.cl'
                },
                body: {
                  type: 'string',
                  description: 'Email body content',
                  default: 'Estimado propietario,\n\nSe informa que el monto de gastos comunes para enero 2025 es de $45.000.\n\nFecha de vencimiento: 15 de febrero de 2025.\n\nSaludos cordiales,\nAdministración'
                }
              }
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'start_daemon':
            return await this.startDaemon(args as any);
          case 'stop_daemon':
            return await this.stopDaemon();
          case 'daemon_status':
            return await this.getDaemonStatus();
          case 'force_processing':
            return await this.forceProcessing();
          case 'test_with_sample_email':
            return await this.testWithSampleEmail(args as any);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Tool ${name} failed:`, error);

        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  private async startDaemon(args: {
    obsidianVaultPath?: string;
    intervalMinutes?: number;
    maxEmailsPerScan?: number;
    enableGmail?: boolean;
    enableIcloud?: boolean;
  }) {
    if (this.daemon?.isRunning()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Daemon is already running',
          },
        ],
      };
    }

    const configuration: Configuration = {
      obsidianVaultPath: args.obsidianVaultPath || '/Users/gonzaloriederer/Documents/Obsidian/griederer',
      rulesFilePath: '', // Will be set by ObsidianReader
      appleReminders: {
        defaultList: 'Facturas',
        timezone: 'America/Santiago'
      },
      daemon: {
        intervalMinutes: args.intervalMinutes || 30,
        maxEmailsPerScan: args.maxEmailsPerScan || 50,
        retryAttempts: 3
      }
    };

    // Add Gmail configuration if available
    if (args.enableGmail) {
      configuration.gmail = {
        credentialsPath: '/Users/gonzaloriederer/.config/gmail/credentials.json',
        tokenPath: '/Users/gonzaloriederer/.config/gmail/token.json'
      };
    }

    // Add iCloud configuration if available
    if (args.enableIcloud) {
      configuration.icloud = {
        username: 'your-email@icloud.com', // You'll need to set this
        appSpecificPassword: 'your-app-password', // You'll need to set this
        server: 'imap.mail.me.com',
        port: 993
      };
    }

    this.daemon = new EmailDaemon(configuration);

    try {
      await this.daemon.start();

      return {
        content: [
          {
            type: 'text',
            text: `✅ Daemon started successfully!\n\nConfiguration:\n- Vault Path: ${configuration.obsidianVaultPath}\n- Interval: ${configuration.daemon.intervalMinutes} minutes\n- Gmail: ${args.enableGmail ? 'Enabled' : 'Disabled'}\n- iCloud: ${args.enableIcloud ? 'Enabled' : 'Disabled'}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to start daemon: ${errorMessage}`,
          },
        ],
      };
    }
  }

  private async stopDaemon() {
    if (!this.daemon || !this.daemon.isRunning()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Daemon is not running',
          },
        ],
      };
    }

    await this.daemon.stop();

    return {
      content: [
        {
          type: 'text',
          text: '✅ Daemon stopped successfully',
        },
      ],
    };
  }

  private async getDaemonStatus() {
    if (!this.daemon) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Daemon not initialized',
          },
        ],
      };
    }

    const stats = this.daemon.getStats();
    const isRunning = this.daemon.isRunning();

    return {
      content: [
        {
          type: 'text',
          text: `📊 Daemon Status:

**Running**: ${isRunning ? '✅ Yes' : '❌ No'}
**Emails Processed**: ${stats.totalEmailsProcessed}
**Reminders Created**: ${stats.totalRemindersCreated}
**Queue Size**: ${stats.queueSize}
**Last Processed**: ${stats.lastProcessedTimestamp.toISOString()}
**Currently Processing**: ${stats.isProcessing ? 'Yes' : 'No'}
${stats.lastError ? `**Last Error**: ${stats.lastError.message} (${stats.lastError.timestamp.toISOString()})` : ''}`,
        },
      ],
    };
  }

  private async forceProcessing() {
    if (!this.daemon || !this.daemon.isRunning()) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Daemon is not running. Start it first.',
          },
        ],
      };
    }

    try {
      await this.daemon.forceProcessing();

      return {
        content: [
          {
            type: 'text',
            text: '✅ Force processing completed. Check daemon status for results.',
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `❌ Force processing failed: ${errorMessage}`,
          },
        ],
      };
    }
  }

  private async testWithSampleEmail(args: {
    subject?: string;
    from?: string;
    body?: string;
  }) {
    // This is a mock test - in reality you'd need actual email clients configured
    const mockEmail = {
      id: `test-${Date.now()}`,
      from: args.from || 'ggcc@edificio.cl',
      subject: args.subject || 'Cobro GGCC - Gastos Comunes Enero 2025',
      body: args.body || 'Estimado propietario,\n\nSe informa que el monto de gastos comunes para enero 2025 es de $45.000.\n\nFecha de vencimiento: 15 de febrero de 2025.\n\nSaludos cordiales,\nAdministración',
      date: new Date(),
      provider: 'test' as const,
      processed: false,
      matchedRules: []
    };

    return {
      content: [
        {
          type: 'text',
          text: `🧪 Sample Email Test:

**From**: ${mockEmail.from}
**Subject**: ${mockEmail.subject}
**Body**: ${mockEmail.body}

**Result**: This would be processed by the GGCC rule and should extract:
- Monto: 45000
- Vencimiento: 2025-02-15
- Período: enero
- Tipo: gastos_comunes

**Reminder**: Would create "💰 GGCC: Pagar 45000 pesos - enero" in Facturas list for Feb 12, 2025 at 9:00 AM

To test with real emails, configure your email credentials and start the daemon.`,
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('Smart Email Reminders MCP server started');
  }
}

const server = new SmartEmailRemindersMCP();
server.run().catch((error) => {
  logger.error('Server failed to start:', error);
  process.exit(1);
});