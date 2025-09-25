import { z } from 'zod';
export declare const EmailRuleSchema: z.ZodObject<{
    name: z.ZodString;
    status: z.ZodEnum<["active", "paused", "disabled"]>;
    providers: z.ZodArray<z.ZodEnum<["gmail", "icloud"]>, "many">;
    fromContains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    fromDomains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    subjectContains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    bodyContains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    subjectRegex: z.ZodOptional<z.ZodString>;
    prompt: z.ZodString;
    reminderTemplate: z.ZodObject<{
        titleTemplate: z.ZodString;
        listName: z.ZodDefault<z.ZodString>;
        priority: z.ZodDefault<z.ZodEnum<["low", "normal", "high"]>>;
        daysBeforeReminder: z.ZodDefault<z.ZodNumber>;
        timeOfDay: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        titleTemplate: string;
        listName: string;
        priority: "low" | "normal" | "high";
        daysBeforeReminder: number;
        timeOfDay: string;
    }, {
        titleTemplate: string;
        listName?: string | undefined;
        priority?: "low" | "normal" | "high" | undefined;
        daysBeforeReminder?: number | undefined;
        timeOfDay?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    name: string;
    status: "active" | "paused" | "disabled";
    providers: ("gmail" | "icloud")[];
    prompt: string;
    reminderTemplate: {
        titleTemplate: string;
        listName: string;
        priority: "low" | "normal" | "high";
        daysBeforeReminder: number;
        timeOfDay: string;
    };
    fromContains?: string[] | undefined;
    fromDomains?: string[] | undefined;
    subjectContains?: string[] | undefined;
    bodyContains?: string[] | undefined;
    subjectRegex?: string | undefined;
}, {
    name: string;
    status: "active" | "paused" | "disabled";
    providers: ("gmail" | "icloud")[];
    prompt: string;
    reminderTemplate: {
        titleTemplate: string;
        listName?: string | undefined;
        priority?: "low" | "normal" | "high" | undefined;
        daysBeforeReminder?: number | undefined;
        timeOfDay?: string | undefined;
    };
    fromContains?: string[] | undefined;
    fromDomains?: string[] | undefined;
    subjectContains?: string[] | undefined;
    bodyContains?: string[] | undefined;
    subjectRegex?: string | undefined;
}>;
export type EmailRule = z.infer<typeof EmailRuleSchema>;
export declare const EmailDataSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    subject: z.ZodString;
    body: z.ZodString;
    date: z.ZodDate;
    provider: z.ZodEnum<["gmail", "icloud"]>;
    processed: z.ZodDefault<z.ZodBoolean>;
    matchedRules: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    date: Date;
    id: string;
    from: string;
    subject: string;
    body: string;
    provider: "gmail" | "icloud";
    processed: boolean;
    matchedRules: string[];
}, {
    date: Date;
    id: string;
    from: string;
    subject: string;
    body: string;
    provider: "gmail" | "icloud";
    processed?: boolean | undefined;
    matchedRules?: string[] | undefined;
}>;
export type EmailData = z.infer<typeof EmailDataSchema>;
export declare const ExtractedDataSchema: z.ZodRecord<z.ZodString, z.ZodAny>;
export type ExtractedData = z.infer<typeof ExtractedDataSchema>;
export declare const ProcessingResultSchema: z.ZodObject<{
    emailId: z.ZodString;
    ruleName: z.ZodString;
    extractedFields: z.ZodRecord<z.ZodString, z.ZodAny>;
    confidence: z.ZodNumber;
    extractionMethod: z.ZodString;
    processingTime: z.ZodOptional<z.ZodNumber>;
    timestamp: z.ZodDate;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    emailId: string;
    ruleName: string;
    extractedFields: Record<string, any>;
    confidence: number;
    extractionMethod: string;
    timestamp: Date;
    processingTime?: number | undefined;
    error?: string | undefined;
}, {
    emailId: string;
    ruleName: string;
    extractedFields: Record<string, any>;
    confidence: number;
    extractionMethod: string;
    timestamp: Date;
    processingTime?: number | undefined;
    error?: string | undefined;
}>;
export type ProcessingResult = z.infer<typeof ProcessingResultSchema>;
export declare const ReminderSchema: z.ZodObject<{
    title: z.ZodString;
    dueDate: z.ZodDate;
    list: z.ZodString;
    notes: z.ZodOptional<z.ZodString>;
    priority: z.ZodDefault<z.ZodEnum<["low", "normal", "high"]>>;
    completed: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDefault<z.ZodDate>;
    sourceEmailId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    priority: "low" | "normal" | "high";
    title: string;
    dueDate: Date;
    list: string;
    completed: boolean;
    createdAt: Date;
    sourceEmailId: string;
    notes?: string | undefined;
}, {
    title: string;
    dueDate: Date;
    list: string;
    sourceEmailId: string;
    priority?: "low" | "normal" | "high" | undefined;
    notes?: string | undefined;
    completed?: boolean | undefined;
    createdAt?: Date | undefined;
}>;
export type Reminder = z.infer<typeof ReminderSchema>;
export declare const ConfigurationSchema: z.ZodObject<{
    obsidianVaultPath: z.ZodString;
    rulesFilePath: z.ZodString;
    gmail: z.ZodOptional<z.ZodObject<{
        credentialsPath: z.ZodString;
        tokenPath: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        credentialsPath: string;
        tokenPath: string;
    }, {
        credentialsPath: string;
        tokenPath: string;
    }>>;
    icloud: z.ZodOptional<z.ZodObject<{
        username: z.ZodString;
        appSpecificPassword: z.ZodString;
        server: z.ZodDefault<z.ZodString>;
        port: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        username: string;
        appSpecificPassword: string;
        server: string;
        port: number;
    }, {
        username: string;
        appSpecificPassword: string;
        server?: string | undefined;
        port?: number | undefined;
    }>>;
    daemon: z.ZodObject<{
        intervalMinutes: z.ZodDefault<z.ZodNumber>;
        maxEmailsPerScan: z.ZodDefault<z.ZodNumber>;
        retryAttempts: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        intervalMinutes: number;
        maxEmailsPerScan: number;
        retryAttempts: number;
    }, {
        intervalMinutes?: number | undefined;
        maxEmailsPerScan?: number | undefined;
        retryAttempts?: number | undefined;
    }>;
    appleReminders: z.ZodObject<{
        defaultList: z.ZodDefault<z.ZodString>;
        timezone: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        defaultList: string;
        timezone: string;
    }, {
        defaultList?: string | undefined;
        timezone?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    obsidianVaultPath: string;
    rulesFilePath: string;
    daemon: {
        intervalMinutes: number;
        maxEmailsPerScan: number;
        retryAttempts: number;
    };
    appleReminders: {
        defaultList: string;
        timezone: string;
    };
    gmail?: {
        credentialsPath: string;
        tokenPath: string;
    } | undefined;
    icloud?: {
        username: string;
        appSpecificPassword: string;
        server: string;
        port: number;
    } | undefined;
}, {
    obsidianVaultPath: string;
    rulesFilePath: string;
    daemon: {
        intervalMinutes?: number | undefined;
        maxEmailsPerScan?: number | undefined;
        retryAttempts?: number | undefined;
    };
    appleReminders: {
        defaultList?: string | undefined;
        timezone?: string | undefined;
    };
    gmail?: {
        credentialsPath: string;
        tokenPath: string;
    } | undefined;
    icloud?: {
        username: string;
        appSpecificPassword: string;
        server?: string | undefined;
        port?: number | undefined;
    } | undefined;
}>;
export type Configuration = z.infer<typeof ConfigurationSchema>;
export declare const ProcessingLogSchema: z.ZodObject<{
    timestamp: z.ZodDate;
    emailId: z.ZodString;
    ruleName: z.ZodString;
    status: z.ZodEnum<["success", "error", "skipped"]>;
    processingResult: z.ZodOptional<z.ZodObject<{
        emailId: z.ZodString;
        ruleName: z.ZodString;
        extractedFields: z.ZodRecord<z.ZodString, z.ZodAny>;
        confidence: z.ZodNumber;
        extractionMethod: z.ZodString;
        processingTime: z.ZodOptional<z.ZodNumber>;
        timestamp: z.ZodDate;
        error: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        emailId: string;
        ruleName: string;
        extractedFields: Record<string, any>;
        confidence: number;
        extractionMethod: string;
        timestamp: Date;
        processingTime?: number | undefined;
        error?: string | undefined;
    }, {
        emailId: string;
        ruleName: string;
        extractedFields: Record<string, any>;
        confidence: number;
        extractionMethod: string;
        timestamp: Date;
        processingTime?: number | undefined;
        error?: string | undefined;
    }>>;
    reminderCreated: z.ZodBoolean;
    errorMessage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "error" | "success" | "skipped";
    emailId: string;
    ruleName: string;
    timestamp: Date;
    reminderCreated: boolean;
    processingResult?: {
        emailId: string;
        ruleName: string;
        extractedFields: Record<string, any>;
        confidence: number;
        extractionMethod: string;
        timestamp: Date;
        processingTime?: number | undefined;
        error?: string | undefined;
    } | undefined;
    errorMessage?: string | undefined;
}, {
    status: "error" | "success" | "skipped";
    emailId: string;
    ruleName: string;
    timestamp: Date;
    reminderCreated: boolean;
    processingResult?: {
        emailId: string;
        ruleName: string;
        extractedFields: Record<string, any>;
        confidence: number;
        extractionMethod: string;
        timestamp: Date;
        processingTime?: number | undefined;
        error?: string | undefined;
    } | undefined;
    errorMessage?: string | undefined;
}>;
export type ProcessingLog = z.infer<typeof ProcessingLogSchema>;
export declare const MCPToolResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    data: z.ZodOptional<z.ZodAny>;
    error: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodDefault<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    timestamp: Date;
    success: boolean;
    error?: string | undefined;
    data?: any;
}, {
    success: boolean;
    timestamp?: Date | undefined;
    error?: string | undefined;
    data?: any;
}>;
export type MCPToolResponse = z.infer<typeof MCPToolResponseSchema>;
//# sourceMappingURL=index.d.ts.map