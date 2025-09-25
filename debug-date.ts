#!/usr/bin/env tsx

// Debug date formatting for AppleScript

const now = new Date();
console.log('Current date:', now.toISOString());

// Tomorrow date
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(9, 0, 0, 0);

console.log('Tomorrow date:', tomorrow.toISOString());

// Test the exact format function
function formatDateForAppleScript(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  return `{year:${year}, month:${month}, day:${day}, hours:${hours}, minutes:${minutes}, seconds:${seconds}} as date`;
}

const formatted = formatDateForAppleScript(tomorrow);
console.log('Formatted for AppleScript:', formatted);

// Test AppleScript directly
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testAppleScriptDate() {
  try {
    const script = `tell application "Reminders"
  set testDate to ${formatted}
  return (day of testDate) & "/" & (month of testDate) & "/" & (year of testDate)
end tell`;

    console.log('Testing AppleScript with:', script);

    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);
    console.log('AppleScript result:', stdout.trim());

    if (stderr) {
      console.error('AppleScript error:', stderr);
    }

  } catch (error) {
    console.error('AppleScript test failed:', error);
  }
}

testAppleScriptDate();