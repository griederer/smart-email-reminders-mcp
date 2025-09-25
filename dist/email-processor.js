// Stub implementation - will be developed in Task 3.0-4.0
export class EmailProcessor {
    async scanAndProcess(options) {
        return { processed: 0, remindersCreated: 0, errors: 0 };
    }
    async debugRuleMatching(emailId, emailText) {
        return [];
    }
    async getProcessingLog(hours, status) {
        return [];
    }
    async processSpecificEmail(emailId, provider, dryRun) {
        return { rulesMatched: 0, reminderCreated: false };
    }
}
//# sourceMappingURL=email-processor.js.map