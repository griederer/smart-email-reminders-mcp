import fs from 'fs/promises';
import path from 'path';
import { EmailRuleSchema } from './types/index.js';
import { createLogger } from './utils/logger.js';
const logger = createLogger('ObsidianReader');
export class ObsidianReader {
    vaultPath;
    rulesFilePath;
    cachedRules = [];
    lastModified = null;
    constructor(vaultPath) {
        // Default path to Obsidian vault
        this.vaultPath = vaultPath || '/Users/gonzaloriederer/Documents/Obsidian/griederer';
        this.rulesFilePath = path.join(this.vaultPath, 'Proyectos', 'Smart Email Reminders', 'Email Rules.md');
        logger.info(`ObsidianReader initialized with vault: ${this.vaultPath}`);
    }
    async loadRules(vaultPath) {
        try {
            if (vaultPath) {
                this.vaultPath = vaultPath;
                this.rulesFilePath = path.join(vaultPath, 'Proyectos', 'Smart Email Reminders', 'Email Rules.md');
            }
            // Check if file exists
            try {
                await fs.access(this.rulesFilePath);
            }
            catch {
                logger.warn(`Rules file not found: ${this.rulesFilePath}`);
                return [];
            }
            // Check if file was modified since last load
            const stats = await fs.stat(this.rulesFilePath);
            if (this.lastModified && stats.mtime <= this.lastModified && this.cachedRules.length > 0) {
                logger.debug('Using cached rules (no changes detected)');
                return this.cachedRules;
            }
            logger.info('Loading email rules from Obsidian...');
            const content = await fs.readFile(this.rulesFilePath, 'utf-8');
            const rules = this.parseMarkdownRules(content);
            const validatedRules = await this.validateRules(rules);
            this.cachedRules = validatedRules;
            this.lastModified = stats.mtime;
            logger.info(`Successfully loaded ${validatedRules.length} valid rules`);
            return validatedRules;
        }
        catch (error) {
            logger.error('Error loading rules from Obsidian:', error);
            throw new Error(`Failed to load rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    parseMarkdownRules(content) {
        const rules = [];
        const lines = content.split('\n');
        let currentRule = null;
        let inPromptSection = false;
        let promptLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Detect rule header: ### Rule: rule_name
            const ruleMatch = line.match(/^### Rule: (.+)$/);
            if (ruleMatch) {
                // Save previous rule if exists
                if (currentRule && currentRule.name && currentRule.prompt) {
                    rules.push(this.completeRule(currentRule));
                }
                // Start new rule
                currentRule = {
                    name: ruleMatch[1],
                    prompt: '',
                    reminderTemplate: {
                        titleTemplate: '${concepto} - ${monto}',
                        listName: 'Facturas',
                        priority: 'normal',
                        daysBeforeReminder: 3,
                        timeOfDay: '09:00'
                    }
                };
                inPromptSection = false;
                promptLines = [];
                continue;
            }
            if (!currentRule)
                continue;
            // Parse rule metadata
            if (line.startsWith('- **Status**:')) {
                const status = this.extractStatus(line);
                if (status)
                    currentRule.status = status;
            }
            else if (line.startsWith('- **Providers**:')) {
                currentRule.providers = this.extractProviders(line);
            }
            else if (line.startsWith('- **From Contains**:')) {
                currentRule.fromContains = this.extractArrayValue(line);
            }
            else if (line.startsWith('- **From Domains**:')) {
                currentRule.fromDomains = this.extractArrayValue(line);
            }
            else if (line.startsWith('- **Subject Contains**:')) {
                currentRule.subjectContains = this.extractArrayValue(line);
            }
            else if (line.startsWith('- **Subject Regex**:')) {
                currentRule.subjectRegex = this.extractStringValue(line);
            }
            // Detect prompt section start
            if (line === '**Prompt:**' || line === 'Prompt:') {
                inPromptSection = true;
                continue;
            }
            // Collect prompt content
            if (inPromptSection) {
                if (line === '```' && promptLines.length === 0) {
                    // Start of code block
                    continue;
                }
                else if (line === '```' && promptLines.length > 0) {
                    // End of code block
                    inPromptSection = false;
                    currentRule.prompt = promptLines.join('\n').trim();
                    promptLines = [];
                }
                else if (line.startsWith('---') || line.startsWith('### ')) {
                    // End of rule section
                    inPromptSection = false;
                    if (promptLines.length > 0) {
                        currentRule.prompt = promptLines.join('\n').trim();
                    }
                    // Don't continue here, let the line be processed for next rule
                    if (line.startsWith('### Rule:')) {
                        i--; // Reprocess this line
                    }
                }
                else {
                    promptLines.push(line);
                }
            }
        }
        // Add last rule if exists
        if (currentRule && currentRule.name && currentRule.prompt) {
            rules.push(this.completeRule(currentRule));
        }
        return rules;
    }
    completeRule(partial) {
        return {
            name: partial.name || 'unnamed',
            status: partial.status || 'active',
            providers: partial.providers || ['gmail', 'icloud'],
            fromContains: partial.fromContains,
            fromDomains: partial.fromDomains,
            subjectContains: partial.subjectContains,
            subjectRegex: partial.subjectRegex,
            prompt: partial.prompt || '',
            reminderTemplate: partial.reminderTemplate || {
                titleTemplate: '${concepto} - ${monto}',
                listName: 'Facturas',
                priority: 'normal',
                daysBeforeReminder: 3,
                timeOfDay: '09:00'
            }
        };
    }
    extractStatus(line) {
        if (line.includes('✅') || line.toLowerCase().includes('active'))
            return 'active';
        if (line.includes('⏸️') || line.toLowerCase().includes('paused'))
            return 'paused';
        if (line.includes('❌') || line.toLowerCase().includes('disabled'))
            return 'disabled';
        return null;
    }
    extractProviders(line) {
        const providers = [];
        if (line.toLowerCase().includes('gmail'))
            providers.push('gmail');
        if (line.toLowerCase().includes('icloud'))
            providers.push('icloud');
        return providers.length > 0 ? providers : ['gmail', 'icloud'];
    }
    extractArrayValue(line) {
        // Extract array from formats like: [\"item1\", \"item2\"] or [item1, item2]
        const match = line.match(/\[(.*?)\]/);
        if (!match)
            return [];
        return match[1]
            .split(',')
            .map(item => item.trim().replace(/[\"\']/g, ''))
            .filter(item => item.length > 0);
    }
    extractStringValue(line) {
        const match = line.match(/:\s*(.+)$/);
        return match ? match[1].trim() : undefined;
    }
    async validateRules(rules) {
        const validRules = [];
        for (const rule of rules) {
            try {
                const validatedRule = EmailRuleSchema.parse({
                    name: rule.name,
                    status: rule.status,
                    providers: rule.providers,
                    fromContains: rule.fromContains,
                    fromDomains: rule.fromDomains,
                    subjectContains: rule.subjectContains,
                    subjectRegex: rule.subjectRegex,
                    prompt: rule.prompt,
                    reminderTemplate: rule.reminderTemplate
                });
                validRules.push(validatedRule);
                logger.debug(`Rule '${rule.name}' validated successfully`);
            }
            catch (error) {
                logger.warn(`Rule '${rule.name}' validation failed:`, error);
            }
        }
        return validRules;
    }
    async validateRule(ruleName) {
        try {
            const rules = await this.loadRules();
            const rule = rules.find(r => r.name === ruleName);
            if (!rule) {
                return {
                    isValid: false,
                    errors: [`Rule '${ruleName}' not found`]
                };
            }
            // Re-validate the specific rule
            EmailRuleSchema.parse(rule);
            return {
                isValid: true,
                errors: []
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
            return {
                isValid: false,
                errors: [errorMessage]
            };
        }
    }
    async updateRuleStatus(ruleName, status) {
        try {
            const content = await fs.readFile(this.rulesFilePath, 'utf-8');
            // Find and update the rule status
            const lines = content.split('\n');
            let inRule = false;
            let updatedLines = [];
            for (const line of lines) {
                if (line.includes(`### Rule: ${ruleName}`)) {
                    inRule = true;
                    updatedLines.push(line);
                }
                else if (inRule && line.startsWith('- **Status**:')) {
                    const statusIcon = status === 'active' ? '✅' : status === 'paused' ? '⏸️' : '❌';
                    updatedLines.push(`- **Status**: ${statusIcon} ${status.charAt(0).toUpperCase() + status.slice(1)}`);
                    inRule = false;
                }
                else if (inRule && line.startsWith('### Rule:')) {
                    // Moved to next rule without finding status line
                    inRule = false;
                    updatedLines.push(line);
                }
                else {
                    updatedLines.push(line);
                }
            }
            await fs.writeFile(this.rulesFilePath, updatedLines.join('\n'), 'utf-8');
            // Clear cache to force reload
            this.lastModified = null;
            this.cachedRules = [];
            logger.info(`Updated rule '${ruleName}' status to '${status}'`);
        }
        catch (error) {
            logger.error(`Failed to update rule status for '${ruleName}':`, error);
            throw error;
        }
    }
    async getActiveRules() {
        const allRules = await this.loadRules();
        return allRules.filter(rule => rule.status === 'active');
    }
    // Utility method for debugging
    async getRuleByName(ruleName) {
        const rules = await this.loadRules();
        return rules.find(rule => rule.name === ruleName) || null;
    }
    // Get configuration and file paths for debugging
    getConfiguration() {
        return {
            vaultPath: this.vaultPath,
            rulesFilePath: this.rulesFilePath,
            cacheSize: this.cachedRules.length,
            lastModified: this.lastModified?.toISOString() || 'never'
        };
    }
}
//# sourceMappingURL=obsidian-reader.js.map