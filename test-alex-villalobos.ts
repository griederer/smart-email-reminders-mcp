#!/usr/bin/env tsx

import { ObsidianReader } from './src/obsidian/obsidian-reader.js';
import { EmailFilter } from './src/email-processors/email-filter.js';
import { ClaudeProcessor } from './src/ai-engine/claude-processor.js';
import { AppleReminders } from './src/reminders/apple-reminders.js';
import { iCloudClient } from './src/email-providers/icloud-client.js';
import { createLogger } from './src/utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('test-alex-villalobos');

async function testAlexVillalobosRule() {
  console.log('🎯 Testing Alex Villalobos GGCC Rule...\n');

  try {
    // 1. Connect to iCloud and find Alex Villalobos email
    console.log('1️⃣  Searching for Alex Villalobos email...');
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

    // Search for Alex Villalobos emails specifically
    const emails = await icloudClient.getEmails({
      folder: 'INBOX',
      limit: 30  // Search more emails to find Alex's
    });

    const alexEmails = emails.filter(email =>
      email.from.toLowerCase().includes('alex villalobos') ||
      email.from.toLowerCase().includes('alexvr1953') ||
      (email.subject.toLowerCase().includes('cobro') && email.subject.toLowerCase().includes('ggcc'))
    );

    if (alexEmails.length === 0) {
      console.log('   ❌ No Alex Villalobos emails found');
      console.log('   🔍 Available emails from recent inbox:');
      emails.slice(0, 10).forEach((email, index) => {
        console.log(`      ${index + 1}. From: ${email.from}`);
        console.log(`         Subject: ${email.subject}`);
      });
      return;
    }

    const alexEmail = alexEmails[0];
    console.log('   ✅ Found Alex Villalobos email!');
    console.log(`   📧 From: ${alexEmail.from}`);
    console.log(`   📌 Subject: ${alexEmail.subject}`);
    console.log(`   📅 Date: ${alexEmail.date.toISOString()}`);
    console.log(`   📝 Body preview: ${alexEmail.body.substring(0, 150)}...\n`);

    // 2. Load updated rules
    console.log('2️⃣  Loading updated rules...');
    const obsidianReader = new ObsidianReader('/Users/gonzaloriederer/Documents/Obsidian/griederer');
    const rules = await obsidianReader.loadRules();

    const ggccRule = rules.find(r => r.name === 'cobro_ggcc');
    if (!ggccRule) {
      throw new Error('cobro_ggcc rule not found');
    }

    console.log('   📋 cobro_ggcc rule loaded:');
    console.log(`      Status: ${ggccRule.status}`);
    console.log(`      Subject patterns: ${ggccRule.subjectContains?.join(', ')}`);
    console.log(`      From patterns: ${ggccRule.fromContains?.join(', ')}\n`);

    // 3. Test rule matching
    console.log('3️⃣  Testing rule matching...');
    const filteredEmails = EmailFilter.filterEmails([alexEmail], rules);
    const matchedEmail = filteredEmails[0];

    if (!matchedEmail.matchedRules || matchedEmail.matchedRules.length === 0) {
      console.log('   ❌ Rule did not match Alex Villalobos email');
      console.log('   🔍 Debugging info:');
      console.log(`      From: "${alexEmail.from}"`);
      console.log(`      Subject: "${alexEmail.subject}"`);
      console.log('      Expected patterns:');
      console.log(`      - From contains: ${ggccRule.fromContains?.join(' OR ')}`);
      console.log(`      - Subject contains: ${ggccRule.subjectContains?.join(' OR ')}`);
      return;
    }

    console.log(`   ✅ Rule matched! Applied: ${matchedEmail.matchedRules.join(', ')}\n`);

    // 4. Process with AI
    console.log('4️⃣  Processing with AI...');
    const claudeProcessor = new ClaudeProcessor();
    const results = await claudeProcessor.processMultipleEmails([matchedEmail], rules);

    const result = results[0];
    console.log(`   📊 AI Results:`);
    console.log(`   Rule: ${result.ruleName}`);
    console.log(`   Confidence: ${result.confidence}%`);
    console.log(`   Extracted data:`, JSON.stringify(result.extractedFields, null, 4));

    if (result.confidence < 25) {
      console.log('   ⚠️  Low confidence, skipping reminder');
      return;
    }

    // 5. Create reminder
    console.log('\n5️⃣  Creating reminder...');
    const appleReminders = new AppleReminders({
      defaultList: 'Facturas',
      timezone: 'America/Santiago'
    });

    const reminderResult = await appleReminders.createReminderFromExtractedData(
      result.extractedFields,
      ggccRule.reminderTemplate,
      alexEmail.id,
      alexEmail.date
    );

    if (reminderResult.success) {
      console.log(`   ✅ Reminder created successfully!`);
      console.log(`   🆔 ID: ${reminderResult.reminderId}`);
      console.log(`   📱 Check Apple Reminders app!`);
    } else {
      console.log(`   ❌ Failed: ${reminderResult.error}`);
    }

    // Cleanup
    await icloudClient.disconnect();
    console.log('\n🎉 Alex Villalobos rule test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAlexVillalobosRule();