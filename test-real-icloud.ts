#!/usr/bin/env tsx

import { iCloudClient } from './src/email-providers/icloud-client.js';
import { createLogger } from './src/utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('test-real-icloud');

async function testRealICloudConnection() {
  console.log('🔗 Testing Real iCloud Connection...\n');

  try {
    // Load iCloud configuration
    const configPath = path.join(process.env.HOME!, '.config', 'smart-email-reminders', 'icloud-config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    console.log('📋 Configuration loaded:');
    console.log(`   Email: ${config.email}`);
    console.log(`   Server: ${config.server}:${config.port}`);
    console.log(`   Password: ${'*'.repeat(config.appSpecificPassword.length)}\n`);

    // Initialize iCloud client
    console.log('1️⃣  Initializing iCloud client...');
    const icloudClient = new iCloudClient({
      email: config.email,
      password: config.appSpecificPassword,
      host: config.server,
      port: config.port
    });

    // Test connection
    console.log('2️⃣  Testing connection...');
    await icloudClient.initialize();

    if (!icloudClient.isReady()) {
      throw new Error('iCloud client failed to initialize properly');
    }

    console.log('   ✅ Connection successful!\n');

    // Get status
    console.log('3️⃣  Connection status:');
    const status = await icloudClient.getStatus();
    console.log(`   Connected: ${status.connected}`);
    console.log(`   Authenticated: ${status.authenticated}\n`);

    // Fetch recent emails
    console.log('4️⃣  Fetching recent emails (last 10)...');
    const emails = await icloudClient.getEmails({
      folder: 'INBOX',
      limit: 10
    });

    console.log(`   📧 Found ${emails.length} recent emails:\n`);

    emails.forEach((email, index) => {
      console.log(`   ${index + 1}. From: ${email.from}`);
      console.log(`      Subject: ${email.subject}`);
      console.log(`      Date: ${email.date.toISOString()}`);
      console.log(`      ID: ${email.id}`);

      // Check if this looks like a GGCC email
      const isGGCC = email.subject.toLowerCase().includes('ggcc') ||
                     email.subject.toLowerCase().includes('gastos comunes') ||
                     email.subject.toLowerCase().includes('cobro') ||
                     email.from.toLowerCase().includes('ggcc');

      if (isGGCC) {
        console.log(`      🎯 POTENTIAL GGCC EMAIL!`);
      }
      console.log('');
    });

    // Look specifically for GGCC emails
    console.log('5️⃣  Searching for GGCC emails...');
    const ggccEmails = emails.filter(email =>
      email.subject.toLowerCase().includes('ggcc') ||
      email.subject.toLowerCase().includes('gastos comunes') ||
      email.subject.toLowerCase().includes('cobro') ||
      email.from.toLowerCase().includes('ggcc')
    );

    if (ggccEmails.length > 0) {
      console.log(`   🎉 Found ${ggccEmails.length} GGCC-related emails!\n`);

      for (const email of ggccEmails) {
        console.log(`   📄 GGCC Email Details:`);
        console.log(`      From: ${email.from}`);
        console.log(`      Subject: ${email.subject}`);
        console.log(`      Date: ${email.date.toISOString()}`);

        // The email body is already available
        if (email.body && email.body.length > 10) {
          console.log(`      Body preview: ${email.body.substring(0, 200)}...`);

          // Look for amount and due date
          const amountMatch = email.body.match(/\$\s*([\d,\.]+)(?:\s*pesos)?/i) ||
                             email.body.match(/([\d,\.]+)\s*pesos/i);
          const dueDateMatch = email.body.match(/vencimiento[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i);

          if (amountMatch) {
            console.log(`      💰 Amount found: $${amountMatch[1]}`);
          }
          if (dueDateMatch) {
            console.log(`      📅 Due date found: ${dueDateMatch[1]}`);
          }
        } else {
          console.log(`      ℹ️  Email body is empty or too short`);
        }
        console.log('');
      }
    } else {
      console.log('   ℹ️  No GGCC emails found in recent messages');
      console.log('   💡 The GGCC email might be older or in a different folder\n');
    }

    // Cleanup
    console.log('6️⃣  Cleaning up connection...');
    await icloudClient.disconnect();
    console.log('   ✅ Disconnected successfully\n');

    console.log('🎉 Real iCloud connection test completed successfully!');

    if (ggccEmails.length > 0) {
      console.log('\n🚀 Next steps:');
      console.log('   1. Run the daemon with real email processing');
      console.log('   2. It will automatically detect and process GGCC emails');
      console.log('   3. Create reminders in Apple Reminders');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('authentication') || error.message.includes('login')) {
        console.log('\n💡 Troubleshooting authentication:');
        console.log('   1. Verify your App-Specific Password is correct');
        console.log('   2. Make sure Two-Factor Authentication is enabled');
        console.log('   3. Try generating a new App-Specific Password');
      } else if (error.message.includes('connection') || error.message.includes('network')) {
        console.log('\n💡 Troubleshooting connection:');
        console.log('   1. Check your internet connection');
        console.log('   2. Try again in a few minutes');
        console.log('   3. iCloud servers might be temporarily unavailable');
      }
    }
  }
}

// Run the test
testRealICloudConnection();