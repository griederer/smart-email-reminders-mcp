import { EmailRule } from './types/index.js';

// Stub implementation - will be developed in Task 2.0
export class ObsidianReader {
  async loadRules(vaultPath?: string): Promise<EmailRule[]> {
    return [];
  }

  async validateRule(ruleName: string): Promise<{ isValid: boolean; errors: string[] }> {
    return { isValid: true, errors: [] };
  }

  async updateRuleStatus(ruleName: string, status: string): Promise<void> {
    // TODO: Implement
  }

  async getActiveRules(): Promise<EmailRule[]> {
    return [];
  }
}