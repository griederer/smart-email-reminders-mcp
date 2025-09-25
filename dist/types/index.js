import { z } from 'zod';
// Email Rule Schema
export const EmailRuleSchema = z.object({
    name: z.string(),
    status: z.enum(['active', 'paused', 'disabled']),
    providers: z.array(z.enum(['gmail', 'icloud'])),
    fromContains: z.array(z.string()).optional(),
    fromDomains: z.array(z.string()).optional(),
    subjectContains: z.array(z.string()).optional(),
    subjectRegex: z.string().optional(),
    prompt: z.string(),
    reminderTemplate: z.object({
        titleTemplate: z.string(),
        listName: z.string().default('Facturas'),
        priority: z.enum(['low', 'normal', 'high']).default('normal'),
        daysBeforeReminder: z.number().default(3),
        timeOfDay: z.string().default('09:00')
    })
});
// Email Data Schema
export const EmailDataSchema = z.object({
    id: z.string(),
    from: z.string(),
    subject: z.string(),
    body: z.string(),
    date: z.date(),
    provider: z.enum(['gmail', 'icloud']),
    processed: z.boolean().default(false),
    matchedRules: z.array(z.string()).default([])
});
// Extracted Data Schema
export const ExtractedDataSchema = z.object({
    monto: z.number().optional(),
    vencimiento: z.date().optional(),
    periodo: z.string().optional(),
    empresa: z.string().optional(),
    concepto: z.string().optional(),
    numeroFactura: z.string().optional(),
    tracking: z.string().optional(),
    direccion: z.string().optional(),
    producto: z.string().optional(),
    urgencia: z.enum(['baja', 'normal', 'alta']).default('normal')
});
// Reminder Schema
export const ReminderSchema = z.object({
    title: z.string(),
    dueDate: z.date(),
    list: z.string(),
    notes: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    completed: z.boolean().default(false),
    createdAt: z.date().default(() => new Date()),
    sourceEmailId: z.string()
});
// Configuration Schema
export const ConfigurationSchema = z.object({
    obsidianVaultPath: z.string(),
    rulesFilePath: z.string(),
    gmail: z.object({
        credentialsPath: z.string(),
        tokenPath: z.string()
    }).optional(),
    icloud: z.object({
        username: z.string(),
        appSpecificPassword: z.string(),
        server: z.string().default('imap.mail.me.com'),
        port: z.number().default(993)
    }).optional(),
    daemon: z.object({
        intervalMinutes: z.number().default(30),
        maxEmailsPerScan: z.number().default(50),
        retryAttempts: z.number().default(3)
    }),
    appleReminders: z.object({
        defaultList: z.string().default('Facturas'),
        timezone: z.string().default('America/Santiago')
    })
});
// Processing Log Schema
export const ProcessingLogSchema = z.object({
    timestamp: z.date(),
    emailId: z.string(),
    ruleName: z.string(),
    status: z.enum(['success', 'error', 'skipped']),
    extractedData: ExtractedDataSchema.optional(),
    reminderCreated: z.boolean(),
    errorMessage: z.string().optional()
});
// MCP Tool Response Schema
export const MCPToolResponseSchema = z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
    timestamp: z.date().default(() => new Date())
});
//# sourceMappingURL=index.js.map