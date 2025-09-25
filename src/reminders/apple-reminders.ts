import { exec } from 'child_process';
import { promisify } from 'util';
import { Reminder } from '../types';
import { createLogger } from '../utils/logger';

const execAsync = promisify(exec);
const logger = createLogger('apple-reminders');

export interface AppleRemindersConfig {
  defaultList: string;
  timezone: string;
}

export interface ReminderCreationOptions {
  title: string;
  dueDate?: Date;
  listName?: string;
  notes?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface ReminderCreationResult {
  success: boolean;
  reminderId?: string;
  error?: string;
}

export class AppleReminders {
  private config: AppleRemindersConfig;

  constructor(config: AppleRemindersConfig = {
    defaultList: 'Facturas',
    timezone: 'America/Santiago'
  }) {
    this.config = config;
  }

  public async createReminder(options: ReminderCreationOptions): Promise<ReminderCreationResult> {
    const startTime = Date.now();
    logger.info(`Creating reminder: "${options.title}"`);

    try {
      // Validate inputs
      if (!options.title || options.title.trim().length === 0) {
        throw new Error('Reminder title cannot be empty');
      }

      const listName = options.listName || this.config.defaultList;

      // Build AppleScript command
      const applescript = this.buildAppleScript(options, listName);

      logger.debug('Executing AppleScript:', applescript);

      // Execute AppleScript
      const { stdout, stderr } = await execAsync(`osascript -e '${applescript}'`);

      if (stderr && stderr.trim().length > 0) {
        logger.warn('AppleScript stderr:', stderr);
      }

      const reminderId = stdout.trim();
      const processingTime = Date.now() - startTime;

      logger.info(`Successfully created reminder in ${processingTime}ms, ID: ${reminderId}`);

      return {
        success: true,
        reminderId
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`Failed to create reminder after ${processingTime}ms:`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check for common permission errors
      if (errorMessage.includes('not allowed assistive access') ||
          errorMessage.includes('not authorized') ||
          errorMessage.includes('permission denied')) {
        return {
          success: false,
          error: 'AppleScript permission denied. Please grant accessibility permissions to your terminal/app.'
        };
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  private buildAppleScript(options: ReminderCreationOptions, listName: string): string {
    const title = this.escapeAppleScriptString(options.title);
    const notes = options.notes ? this.escapeAppleScriptString(options.notes) : '';

    let script = `tell application "Reminders"
  set targetList to list "${this.escapeAppleScriptString(listName)}"
  if targetList is missing value then
    set targetList to make new list with properties {name:"${this.escapeAppleScriptString(listName)}"}
  end if

  set newReminder to make new reminder at end of reminders of targetList
  set name of newReminder to "${title}"`;

    // Add notes if provided
    if (notes) {
      script += `
  set body of newReminder to "${notes}"`;
    }

    // Add due date if provided
    if (options.dueDate) {
      const dueDateString = this.formatDateForAppleScript(options.dueDate);
      script += `
  set due date of newReminder to ${dueDateString}`;
    }

    // Add priority if provided
    if (options.priority) {
      const priorityValue = this.getPriorityValue(options.priority);
      script += `
  set priority of newReminder to ${priorityValue}`;
    }

    script += `

  return id of newReminder
end tell`;

    return script;
  }

  private escapeAppleScriptString(str: string): string {
    // Escape quotes and backslashes for AppleScript
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  private formatDateForAppleScript(date: Date): string {
    // Calculate days from today for AppleScript
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    const hours = date.getHours();
    const minutes = date.getMinutes();

    // Use current date arithmetic which is most reliable in AppleScript
    if (diffDays === 0) {
      return `(current date) + (${hours} * hours) + (${minutes} * minutes)`;
    } else {
      return `(current date) + (${diffDays} * days) + (${hours} * hours) + (${minutes} * minutes)`;
    }
  }

  private getPriorityValue(priority: 'low' | 'normal' | 'high'): number {
    // Apple Reminders priority values
    switch (priority) {
      case 'low': return 1;
      case 'normal': return 5;
      case 'high': return 9;
      default: return 5;
    }
  }

  public async listExists(listName: string): Promise<boolean> {
    try {
      const script = `tell application "Reminders"
  try
    set targetList to list "${this.escapeAppleScriptString(listName)}"
    return "true"
  on error
    return "false"
  end try
end tell`;

      const { stdout } = await execAsync(`osascript -e '${script}'`);
      return stdout.trim() === 'true';

    } catch (error) {
      logger.error(`Failed to check if list exists: ${listName}:`, error);
      return false;
    }
  }

  public async createList(listName: string): Promise<boolean> {
    try {
      logger.info(`Creating reminders list: "${listName}"`);

      const script = `tell application "Reminders"
  make new list with properties {name:"${this.escapeAppleScriptString(listName)}"}
  return "success"
end tell`;

      await execAsync(`osascript -e '${script}'`);
      logger.info(`Successfully created list: "${listName}"`);
      return true;

    } catch (error) {
      logger.error(`Failed to create list: ${listName}:`, error);
      return false;
    }
  }

  public async getLists(): Promise<string[]> {
    try {
      const script = `tell application "Reminders"
  set listNames to {}
  repeat with currentList in lists
    set end of listNames to name of currentList
  end repeat
  return listNames
end tell`;

      const { stdout } = await execAsync(`osascript -e '${script}'`);

      // Parse AppleScript list output
      const listString = stdout.trim();
      if (listString === '') {
        return [];
      }

      // AppleScript returns lists like: "List1, List2, List3"
      return listString.split(', ').map(name => name.trim());

    } catch (error) {
      logger.error('Failed to get reminders lists:', error);
      return [];
    }
  }

  public async testAccess(): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Testing Apple Reminders access...');

      const script = `tell application "Reminders"
  return count of lists
end tell`;

      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const listCount = parseInt(stdout.trim(), 10);

      logger.info(`Apple Reminders access successful. Found ${listCount} lists.`);

      return { success: true };

    } catch (error) {
      logger.error('Apple Reminders access test failed:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not allowed assistive access') ||
          errorMessage.includes('not authorized') ||
          errorMessage.includes('permission denied')) {
        return {
          success: false,
          error: 'AppleScript permission denied. Please grant accessibility permissions in System Preferences > Security & Privacy > Privacy > Accessibility.'
        };
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  public async createReminderFromExtractedData(
    extractedData: Record<string, any>,
    template: {
      titleTemplate: string;
      listName: string;
      priority: 'low' | 'normal' | 'high';
      daysBeforeReminder: number;
      timeOfDay: string;
    },
    sourceEmailId: string
  ): Promise<ReminderCreationResult> {
    try {
      // Substitute template variables
      const title = this.substituteTemplateVariables(template.titleTemplate, extractedData);

      // Calculate due date
      let dueDate: Date | undefined;

      if (extractedData.vencimiento || extractedData.fechaEntrega) {
        const targetDateString = extractedData.vencimiento || extractedData.fechaEntrega;
        const targetDate = new Date(targetDateString);

        if (!isNaN(targetDate.getTime())) {
          // Subtract reminder days
          dueDate = new Date(targetDate);
          dueDate.setDate(dueDate.getDate() - template.daysBeforeReminder);

          // Set time of day
          const [hours, minutes] = template.timeOfDay.split(':').map(Number);
          dueDate.setHours(hours, minutes, 0, 0);

          // If the calculated reminder date is in the past, set it for tomorrow
          const now = new Date();
          if (dueDate.getTime() < now.getTime()) {
            logger.warn(`Calculated reminder date ${dueDate.toISOString()} is in the past, setting for tomorrow`);
            dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + 1); // Tomorrow
            dueDate.setHours(hours, minutes, 0, 0);
          }
        }
      }

      // Create notes with source information
      let notes = `Fuente: Email ${sourceEmailId}\n`;

      if (extractedData.monto) {
        notes += `Monto: $${extractedData.monto}\n`;
      }

      if (extractedData.empresa) {
        notes += `Empresa: ${extractedData.empresa}\n`;
      }

      if (extractedData.tracking) {
        notes += `Tracking: ${extractedData.tracking}\n`;
      }

      // Create the reminder
      const result = await this.createReminder({
        title,
        dueDate,
        listName: template.listName,
        notes: notes.trim(),
        priority: template.priority
      });

      return result;

    } catch (error) {
      logger.error('Failed to create reminder from extracted data:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private substituteTemplateVariables(template: string, data: Record<string, any>): string {
    let result = template;

    // Replace template variables like ${variable}
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        const placeholder = `\${${key}}`;
        result = result.replace(new RegExp(placeholder.replace(/[{}$]/g, '\\$&'), 'g'), String(value));
      }
    }

    // Remove any unreplaced variables
    result = result.replace(/\${[^}]+}/g, '');

    // Clean up extra spaces
    result = result.replace(/\s+/g, ' ').trim();

    return result;
  }

  public async deleteReminder(reminderId: string): Promise<boolean> {
    try {
      logger.info(`Deleting reminder: ${reminderId}`);

      const script = `tell application "Reminders"
  delete reminder id "${this.escapeAppleScriptString(reminderId)}"
  return "success"
end tell`;

      await execAsync(`osascript -e '${script}'`);
      logger.info(`Successfully deleted reminder: ${reminderId}`);
      return true;

    } catch (error) {
      logger.error(`Failed to delete reminder ${reminderId}:`, error);
      return false;
    }
  }

  public getConfig(): AppleRemindersConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AppleRemindersConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Updated Apple Reminders configuration:', this.config);
  }
}