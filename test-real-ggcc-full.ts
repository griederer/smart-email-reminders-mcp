#!/usr/bin/env tsx

import { ObsidianReader } from './src/obsidian/obsidian-reader.js';
import { EmailFilter } from './src/email-processors/email-filter.js';
import { ClaudeProcessor } from './src/ai-engine/claude-processor.js';
import { AppleReminders } from './src/reminders/apple-reminders.js';
import { iCloudClient } from './src/email-providers/icloud-client.js';
import { createLogger } from './src/utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('test-real-ggcc-full');

async function testRealGGCCFullPipeline() {
  console.log('🚀 Testing REAL GGCC Email with Full Pipeline...\n');

  try {
    // 1. Load iCloud configuration and connect
    console.log('1️⃣  Connecting to iCloud...');
    const configPath = path.join(process.env.HOME!, '.config', 'smart-email-reminders', 'icloud-config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    const icloudClient = new iCloudClient({
      email: config.email,
      password: config.appSpecificPassword,
      host: config.server,
      port: config.port
    });

    await icloudClient.initialize();
    console.log('   ✅ Connected to iCloud\n');

    // 2. Find GGCC email
    console.log('2️⃣  Finding GGCC email...');
    const emails = await icloudClient.getEmails({
      folder: 'INBOX',
      limit: 20  // Check more emails to find GGCC
    });

    const ggccEmails = emails.filter(email =>
      email.subject.toLowerCase().includes('ggcc') ||
      email.subject.toLowerCase().includes('gastos comunes') ||
      email.subject.toLowerCase().includes('cobro') ||
      email.from.toLowerCase().includes('ggcc') ||
      email.from.toLowerCase().includes('villalobos')
    );

    if (ggccEmails.length === 0) {
      throw new Error('No GGCC emails found');
    }

    const realGGCCEmail = ggccEmails[0];
    console.log(`   ✅ Found GGCC email: "${realGGCCEmail.subject}"`);
    console.log(`   📧 From: ${realGGCCEmail.from}`);
    console.log(`   📅 Date: ${realGGCCEmail.date.toISOString()}`);
    console.log(`   📝 Body preview: ${realGGCCEmail.body.substring(0, 150)}...\n`);

    // 3. Load rules from Obsidian
    console.log('3️⃣  Loading rules from Obsidian...');
    const obsidianReader = new ObsidianReader('/Users/gonzaloriederer/Documents/Obsidian/griederer');
    const rules = await obsidianReader.loadRules();

    console.log(`   📋 Found ${rules.length} rules:`);
    rules.forEach(rule => {
      console.log(`   - ${rule.name} (${rule.status})`);
    });
    console.log('');

    // 4. Filter email against rules
    console.log('4️⃣  Filtering email against rules...');
    const filteredEmails = EmailFilter.filterEmails([realGGCCEmail], rules);
    const matchedEmail = filteredEmails[0];

    if (!matchedEmail.matchedRules || matchedEmail.matchedRules.length === 0) {
      console.log('   ❌ No rules matched the real email');
      console.log('   🔍 Email details for debugging:');
      console.log(`      Subject: "${realGGCCEmail.subject}"`);
      console.log(`      From: "${realGGCCEmail.from}"`);
      console.log(`      Body keywords: ${realGGCCEmail.body.toLowerCase().includes('gastos')} (gastos), ${realGGCCEmail.body.toLowerCase().includes('ggcc')} (ggcc), ${realGGCCEmail.body.toLowerCase().includes('cobro')} (cobro)`);
      return;
    }

    console.log(`   ✅ Matched ${matchedEmail.matchedRules.length} rules: ${matchedEmail.matchedRules.join(', ')}\n`);

    // 5. Process with AI (Claude)
    console.log('5️⃣  Processing with AI (Claude)...');
    const claudeProcessor = new ClaudeProcessor();

    const results = await claudeProcessor.processMultipleEmails([matchedEmail], rules);

    for (const result of results) {
      console.log(`\n   📊 AI Processing Results:`);
      console.log(`   Rule: ${result.ruleName}`);
      console.log(`   Confidence: ${result.confidence}%`);
      console.log(`   Extracted data:`, JSON.stringify(result.extractedFields, null, 4));

      if (result.confidence < 25) {
        console.log('   ⚠️  Low confidence, skipping reminder creation');
        continue;
      }

      // 6. Create Apple Reminder with REAL data
      console.log('\n6️⃣  Creating Apple Reminder with REAL data...');
      const appleReminders = new AppleReminders({
        defaultList: 'Facturas',
        timezone: 'America/Santiago'
      });

      // Find the matched rule
      const matchedRule = rules.find(r => r.name === result.ruleName);
      if (!matchedRule) {
        console.log(`   ❌ Could not find rule: ${result.ruleName}`);
        continue;
      }

      console.log(`   📝 Rule template: "${matchedRule.reminderTemplate.titleTemplate}"`);

      const reminderResult = await appleReminders.createReminderFromExtractedData(
        result.extractedFields,
        matchedRule.reminderTemplate,
        realGGCCEmail.id
      );

      if (reminderResult.success) {
        console.log(`   ✅ Reminder created successfully!`);
        console.log(`   🆔 Reminder ID: ${reminderResult.reminderId}`);
        console.log(`   📱 Check your Apple Reminders app!`);
      } else {
        console.log(`   ❌ Failed to create reminder: ${reminderResult.error}`);
      }
    }

    // 7. Cleanup
    console.log('\n7️⃣  Cleaning up...');
    await icloudClient.disconnect();
    console.log('   ✅ Disconnected from iCloud\n');

    console.log('🎉 REAL GGCC Email Processing Completed Successfully!');
    console.log('\n📱 Check your Apple Reminders app for the new reminder!');
    console.log('🔔 The system can now process your real emails automatically!');

  } catch (error) {
    console.error('❌ Full pipeline test failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('authentication') || error.message.includes('login')) {
        console.log('\n💡 Authentication issue - check your App-Specific Password');
      } else if (error.message.includes('No GGCC emails found')) {
        console.log('\n💡 No GGCC emails found in recent messages');
        console.log('   Try increasing the limit or checking older emails');
      }
    }
  }
}

// Run the full pipeline test
testRealGGCCFullPipeline();