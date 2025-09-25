import { EmailData, EmailRule } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('EmailFilter');

export class EmailFilter {
  /**
   * Filter emails based on active rules
   * @param emails Array of emails to filter
   * @param rules Array of active email rules
   * @returns Array of emails with matched rules populated
   */
  static filterEmails(emails: EmailData[], rules: EmailRule[]): EmailData[] {
    if (emails.length === 0 || rules.length === 0) {
      logger.debug('No emails or rules provided for filtering');
      return emails;
    }

    logger.debug(`Filtering ${emails.length} emails against ${rules.length} rules`);

    return emails.map(email => {
      const matchedRules = this.findMatchingRules(email, rules);

      if (matchedRules.length > 0) {
        logger.debug(`Email "${email.subject}" matched ${matchedRules.length} rules: ${matchedRules.map(r => r.name).join(', ')}`);
      }

      return {
        ...email,
        matchedRules: matchedRules.map(rule => rule.name),
        processed: false // Mark as unprocessed when newly matched
      };
    });
  }

  /**
   * Find rules that match a given email
   */
  private static findMatchingRules(email: EmailData, rules: EmailRule[]): EmailRule[] {
    return rules.filter(rule => this.doesEmailMatchRule(email, rule));
  }

  /**
   * Check if an email matches a specific rule
   */
  private static doesEmailMatchRule(email: EmailData, rule: EmailRule): boolean {
    // Check provider match
    if (!this.matchesProvider(email, rule)) {
      return false;
    }

    // Check sender criteria
    if (!this.matchesSender(email, rule)) {
      return false;
    }

    // Check subject criteria
    if (!this.matchesSubject(email, rule)) {
      return false;
    }

    // Check body criteria
    if (!this.matchesBody(email, rule)) {
      return false;
    }

    logger.debug(`Email "${email.subject}" matches rule "${rule.name}"`);
    return true;
  }

  /**
   * Check if email provider matches rule
   */
  private static matchesProvider(email: EmailData, rule: EmailRule): boolean {
    // Convert both to lowercase for case-insensitive comparison
    const emailProvider = email.provider.toLowerCase();
    const ruleProviders = rule.providers.map(p => p.toLowerCase());

    return ruleProviders.includes(emailProvider);
  }

  /**
   * Check if email sender matches rule criteria
   */
  private static matchesSender(email: EmailData, rule: EmailRule): boolean {
    if (!email.from) {
      return true; // No sender constraint
    }

    const fromLower = email.from.toLowerCase();

    // Check fromContains
    if (rule.fromContains && rule.fromContains.length > 0) {
      const hasMatch = rule.fromContains.some(term =>
        fromLower.includes(term.toLowerCase())
      );
      if (!hasMatch) {
        logger.debug(`Email from "${email.from}" doesn't contain any of: ${rule.fromContains.join(', ')}`);
        return false;
      }
    }

    // Check fromDomains
    if (rule.fromDomains && rule.fromDomains.length > 0) {
      // Extract domain from email address
      const emailMatch = email.from.match(/@([^>]+)/);
      if (!emailMatch) {
        logger.debug(`Could not extract domain from "${email.from}"`);
        return false;
      }

      const emailDomain = emailMatch[1].toLowerCase();
      const hasMatch = rule.fromDomains.some(domain =>
        emailDomain.includes(domain.toLowerCase())
      );

      if (!hasMatch) {
        logger.debug(`Email domain "${emailDomain}" doesn't match any of: ${rule.fromDomains.join(', ')}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Check if email subject matches rule criteria
   */
  private static matchesSubject(email: EmailData, rule: EmailRule): boolean {
    if (!rule.subjectContains || rule.subjectContains.length === 0) {
      return true; // No subject constraint
    }

    if (!email.subject) {
      logger.debug('Email has no subject but rule requires subject match');
      return false;
    }

    const subjectLower = email.subject.toLowerCase();
    const hasMatch = rule.subjectContains.some(term =>
      subjectLower.includes(term.toLowerCase())
    );

    if (!hasMatch) {
      logger.debug(`Email subject "${email.subject}" doesn't contain any of: ${rule.subjectContains.join(', ')}`);
    }

    return hasMatch;
  }

  /**
   * Check if email body matches rule criteria
   */
  private static matchesBody(email: EmailData, rule: EmailRule): boolean {
    if (!rule.bodyContains || rule.bodyContains.length === 0) {
      return true; // No body constraint
    }

    if (!email.body) {
      logger.debug('Email has no body but rule requires body match');
      return false;
    }

    const bodyLower = email.body.toLowerCase();
    const hasMatch = rule.bodyContains.some(term =>
      bodyLower.includes(term.toLowerCase())
    );

    if (!hasMatch) {
      logger.debug(`Email body doesn't contain any of: ${rule.bodyContains.join(', ')}`);
    }

    return hasMatch;
  }

  /**
   * Get detailed match information for debugging
   */
  static getMatchDetails(email: EmailData, rule: EmailRule): {
    matches: boolean;
    details: {
      provider: boolean;
      sender: boolean;
      subject: boolean;
      body: boolean;
    };
  } {
    const details = {
      provider: this.matchesProvider(email, rule),
      sender: this.matchesSender(email, rule),
      subject: this.matchesSubject(email, rule),
      body: this.matchesBody(email, rule)
    };

    const matches = Object.values(details).every(Boolean);

    return {
      matches,
      details
    };
  }

  /**
   * Filter emails by specific rule name
   */
  static filterEmailsByRule(emails: EmailData[], rules: EmailRule[], ruleName: string): EmailData[] {
    const rule = rules.find(r => r.name === ruleName);
    if (!rule) {
      logger.warn(`Rule "${ruleName}" not found`);
      return [];
    }

    return emails.filter(email => this.doesEmailMatchRule(email, rule))
      .map(email => ({
        ...email,
        matchedRules: [ruleName],
        processed: false
      }));
  }

  /**
   * Get statistics about email matching
   */
  static getFilterStats(emails: EmailData[], rules: EmailRule[]): {
    totalEmails: number;
    totalRules: number;
    emailsWithMatches: number;
    emailsWithoutMatches: number;
    ruleMatchCounts: Record<string, number>;
  } {
    const filteredEmails = this.filterEmails(emails, rules);

    const emailsWithMatches = filteredEmails.filter(e => e.matchedRules.length > 0).length;
    const emailsWithoutMatches = filteredEmails.length - emailsWithMatches;

    const ruleMatchCounts: Record<string, number> = {};
    rules.forEach(rule => {
      ruleMatchCounts[rule.name] = filteredEmails.filter(e =>
        e.matchedRules.includes(rule.name)
      ).length;
    });

    return {
      totalEmails: emails.length,
      totalRules: rules.length,
      emailsWithMatches,
      emailsWithoutMatches,
      ruleMatchCounts
    };
  }
}