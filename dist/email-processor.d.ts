import { ProcessingLog } from './types/index.js';
export declare class EmailProcessor {
    scanAndProcess(options: any): Promise<{
        processed: number;
        remindersCreated: number;
        errors: number;
    }>;
    debugRuleMatching(emailId?: string, emailText?: string): Promise<{
        ruleName: string;
        matched: boolean;
        reason: string;
    }[]>;
    getProcessingLog(hours: number, status: string): Promise<ProcessingLog[]>;
    processSpecificEmail(emailId: string, provider: string, dryRun: boolean): Promise<{
        rulesMatched: number;
        reminderCreated: boolean;
    }>;
}
//# sourceMappingURL=email-processor.d.ts.map