import { ProcessingLog } from './types/index.js';

// Stub implementation - will be developed in Task 3.0-4.0
export class EmailProcessor {
  async scanAndProcess(options: any): Promise<{ processed: number; remindersCreated: number; errors: number }> {
    return { processed: 0, remindersCreated: 0, errors: 0 };
  }

  async debugRuleMatching(emailId?: string, emailText?: string): Promise<{ ruleName: string; matched: boolean; reason: string }[]> {
    return [];
  }

  async getProcessingLog(hours: number, status: string): Promise<ProcessingLog[]> {
    return [];
  }

  async processSpecificEmail(emailId: string, provider: string, dryRun: boolean): Promise<{ rulesMatched: number; reminderCreated: boolean }> {
    return { rulesMatched: 0, reminderCreated: false };
  }
}