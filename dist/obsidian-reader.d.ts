import { EmailRule } from './types/index.js';
export declare class ObsidianReader {
    private vaultPath;
    private rulesFilePath;
    private cachedRules;
    private lastModified;
    constructor(vaultPath?: string);
    loadRules(vaultPath?: string): Promise<EmailRule[]>;
    private parseMarkdownRules;
    private completeRule;
    private extractStatus;
    private extractProviders;
    private extractArrayValue;
    private extractStringValue;
    private validateRules;
    validateRule(ruleName: string): Promise<{
        isValid: boolean;
        errors: string[];
    }>;
    updateRuleStatus(ruleName: string, status: string): Promise<void>;
    getActiveRules(): Promise<EmailRule[]>;
    getRuleByName(ruleName: string): Promise<EmailRule | null>;
    getConfiguration(): {
        vaultPath: string;
        rulesFilePath: string;
        cacheSize: number;
        lastModified: string;
    };
}
//# sourceMappingURL=obsidian-reader.d.ts.map