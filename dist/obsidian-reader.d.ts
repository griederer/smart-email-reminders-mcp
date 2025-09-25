import { EmailRule } from './types/index.js';
export declare class ObsidianReader {
    loadRules(vaultPath?: string): Promise<EmailRule[]>;
    validateRule(ruleName: string): Promise<{
        isValid: boolean;
        errors: string[];
    }>;
    updateRuleStatus(ruleName: string, status: string): Promise<void>;
    getActiveRules(): Promise<EmailRule[]>;
}
//# sourceMappingURL=obsidian-reader.d.ts.map