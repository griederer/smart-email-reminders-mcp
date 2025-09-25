#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { ObsidianReader } from './obsidian-reader.js';
import { EmailProcessor } from './email-processor.js';
import { ReminderCreator } from './reminder-creator.js';
import { createLogger } from './utils/logger.js';
const logger = createLogger('SmartEmailRemindersMCP');
class SmartEmailRemindersMCPServer {
    server;
    obsidianReader;
    emailProcessor;
    reminderCreator;
    constructor() {
        this.server = new Server({
            name: 'smart-email-reminders-mcp',
            version: '0.1.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.obsidianReader = new ObsidianReader();
        this.emailProcessor = new EmailProcessor();
        this.reminderCreator = new ReminderCreator();
        this.setupToolHandlers();
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'reload_rules_from_obsidian',
                        description: 'Reload email processing rules from Obsidian vault',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                vaultPath: {
                                    type: 'string',
                                    description: 'Path to Obsidian vault (optional, uses config default)'
                                }
                            }
                        }
                    },
                    {
                        name: 'scan_emails_now',
                        description: 'Manually trigger email scan and processing',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                provider: {
                                    type: 'string',
                                    enum: ['gmail', 'icloud', 'all'],
                                    description: 'Email provider to scan (default: all)'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Maximum emails to process (default: 50)'
                                }
                            }
                        }
                    },
                    {
                        name: 'test_rule_syntax',
                        description: 'Validate email rule syntax and format',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                ruleName: {
                                    type: 'string',
                                    description: 'Name of rule to validate'
                                }
                            },
                            required: ['ruleName']
                        }
                    },
                    {
                        name: 'debug_rule_matching',
                        description: 'Show which rules match a given email',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                emailId: {
                                    type: 'string',
                                    description: 'Email ID to test against rules'
                                },
                                emailText: {
                                    type: 'string',
                                    description: 'Email content for testing (if no emailId)'
                                }
                            }
                        }
                    },
                    {
                        name: 'show_processing_log',
                        description: 'Display recent email processing history',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                hours: {
                                    type: 'number',
                                    description: 'Hours of history to show (default: 24)'
                                },
                                status: {
                                    type: 'string',
                                    enum: ['all', 'success', 'error', 'skipped'],
                                    description: 'Filter by processing status'
                                }
                            }
                        }
                    },
                    {
                        name: 'pause_rule',
                        description: 'Temporarily disable a specific email rule',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                ruleName: {
                                    type: 'string',
                                    description: 'Name of rule to pause'
                                }
                            },
                            required: ['ruleName']
                        }
                    },
                    {
                        name: 'activate_rule',
                        description: 'Activate a paused email rule',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                ruleName: {
                                    type: 'string',
                                    description: 'Name of rule to activate'
                                }
                            },
                            required: ['ruleName']
                        }
                    },
                    {
                        name: 'list_active_rules',
                        description: 'Show all currently active email processing rules',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'process_specific_email',
                        description: 'Process a specific email with all matching rules',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                emailId: {
                                    type: 'string',
                                    description: 'Email ID to process'
                                },
                                provider: {
                                    type: 'string',
                                    enum: ['gmail', 'icloud'],
                                    description: 'Email provider'
                                },
                                dryRun: {
                                    type: 'boolean',
                                    description: 'Test processing without creating reminders'
                                }
                            },
                            required: ['emailId', 'provider']
                        }
                    }
                ]
            };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case 'reload_rules_from_obsidian':
                        return await this.handleReloadRules(args);
                    case 'scan_emails_now':
                        return await this.handleScanEmails(args);
                    case 'test_rule_syntax':
                        return await this.handleTestRuleSyntax(args);
                    case 'debug_rule_matching':
                        return await this.handleDebugRuleMatching(args);
                    case 'show_processing_log':
                        return await this.handleShowProcessingLog(args);
                    case 'pause_rule':
                        return await this.handlePauseRule(args);
                    case 'activate_rule':
                        return await this.handleActivateRule(args);
                    case 'list_active_rules':
                        return await this.handleListActiveRules(args);
                    case 'process_specific_email':
                        return await this.handleProcessSpecificEmail(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                logger.error(`Error executing tool ${name}:`, error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ]
                };
            }
        });
    }
    async handleReloadRules(args) {
        const vaultPath = args?.vaultPath;
        const rules = await this.obsidianReader.loadRules(vaultPath);
        return {
            content: [
                {
                    type: 'text',
                    text: `✅ Loaded ${rules.length} rules from Obsidian vault:\n${rules.map(r => `- ${r.name} (${r.status})`).join('\n')}`
                }
            ]
        };
    }
    async handleScanEmails(args) {
        const provider = args?.provider || 'all';
        const limit = args?.limit || 50;
        const result = await this.emailProcessor.scanAndProcess({
            provider,
            limit
        });
        return {
            content: [
                {
                    type: 'text',
                    text: `📧 Email scan completed:\n- Processed: ${result.processed}\n- Reminders created: ${result.remindersCreated}\n- Errors: ${result.errors}`
                }
            ]
        };
    }
    async handleTestRuleSyntax(args) {
        const { ruleName } = args;
        const validation = await this.obsidianReader.validateRule(ruleName);
        return {
            content: [
                {
                    type: 'text',
                    text: validation.isValid ?
                        `✅ Rule '${ruleName}' syntax is valid` :
                        `❌ Rule '${ruleName}' has errors:\n${validation.errors.join('\n')}`
                }
            ]
        };
    }
    async handleDebugRuleMatching(args) {
        const { emailId, emailText } = args;
        const matches = await this.emailProcessor.debugRuleMatching(emailId, emailText);
        return {
            content: [
                {
                    type: 'text',
                    text: `🔍 Rule matching results:\n${matches.map(m => `- ${m.ruleName}: ${m.matched ? '✅' : '❌'} (${m.reason})`).join('\n')}`
                }
            ]
        };
    }
    async handleShowProcessingLog(args) {
        const hours = args?.hours || 24;
        const status = args?.status || 'all';
        const logs = await this.emailProcessor.getProcessingLog(hours, status);
        return {
            content: [
                {
                    type: 'text',
                    text: `📊 Processing log (last ${hours}h):\n${logs.map(l => `- ${l.timestamp.toISOString()}: ${l.ruleName} → ${l.status}${l.errorMessage ? ` (${l.errorMessage})` : ''}`).join('\n')}`
                }
            ]
        };
    }
    async handlePauseRule(args) {
        const { ruleName } = args;
        await this.obsidianReader.updateRuleStatus(ruleName, 'paused');
        return {
            content: [
                {
                    type: 'text',
                    text: `⏸️  Rule '${ruleName}' has been paused`
                }
            ]
        };
    }
    async handleActivateRule(args) {
        const { ruleName } = args;
        await this.obsidianReader.updateRuleStatus(ruleName, 'active');
        return {
            content: [
                {
                    type: 'text',
                    text: `▶️ Rule '${ruleName}' has been activated`
                }
            ]
        };
    }
    async handleListActiveRules(args) {
        const rules = await this.obsidianReader.getActiveRules();
        return {
            content: [
                {
                    type: 'text',
                    text: `📋 Active rules (${rules.length}):\n${rules.map(r => `- ${r.name}: ${r.providers.join(', ')} → ${r.reminderTemplate.listName}`).join('\n')}`
                }
            ]
        };
    }
    async handleProcessSpecificEmail(args) {
        const { emailId, provider, dryRun = false } = args;
        const result = await this.emailProcessor.processSpecificEmail(emailId, provider, dryRun);
        return {
            content: [
                {
                    type: 'text',
                    text: dryRun ?
                        `🧪 Dry run completed:\n${JSON.stringify(result, null, 2)}` :
                        `✅ Email processed:\n- Rules matched: ${result.rulesMatched}\n- Reminder created: ${result.reminderCreated ? 'Yes' : 'No'}`
                }
            ]
        };
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        logger.info('Smart Email Reminders MCP server running on stdio');
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new SmartEmailRemindersMCPServer();
    server.run().catch((error) => {
        logger.error('Failed to run server:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=server.js.map