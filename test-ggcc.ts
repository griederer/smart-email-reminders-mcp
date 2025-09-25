#!/usr/bin/env tsx

import { ObsidianReader } from './src/obsidian/obsidian-reader.js';
import { EmailFilter } from './src/email-processors/email-filter.js';
import { ClaudeProcessor } from './src/ai-engine/claude-processor.js';
import { AppleReminders } from './src/reminders/apple-reminders.js';
import { EmailData, EmailRule } from './src/types/index.js';

// Email de prueba basado en tu descripción
const mockGGCCEmail: EmailData = {
  id: 'test-ggcc-' + Date.now(),
  from: 'ggcc@edificio.cl',
  subject: 'Cobro GGCC - Gastos Comunes Octubre 2024',
  body: `Estimado Propietario,

Se informa cobro de gastos comunes correspondientes al mes de OCTUBRE 2024.

DETALLE DEL COBRO:
- Monto: $65.669 pesos chilenos
- Vencimiento: 15 de noviembre de 2024
- Período: Octubre 2024

Para pagos después de la fecha de vencimiento se aplicará recargo del 1% mensual.

Favor realizar pago a través de:
- Transferencia bancaria
- Pago presencial en administración

Saludos cordiales,
Administración del Edificio`,
  date: new Date(),
  provider: 'gmail',
  processed: false,
  matchedRules: []
};

async function testGGCCProcessing() {
  console.log('🧪 Testing GGCC Email Processing...\n');

  try {
    // 1. Load rules from Obsidian
    console.log('1️⃣  Loading rules from Obsidian...');
    const obsidianReader = new ObsidianReader('/Users/gonzaloriederer/Documents/Obsidian/griederer');
    const rules = await obsidianReader.loadRules();

    console.log(`   Found ${rules.length} rules:`);
    rules.forEach(rule => {
      console.log(`   - ${rule.name} (${rule.status})`);
    });

    // 2. Filter email against rules
    console.log('\n2️⃣  Filtering email against rules...');
    const filteredEmails = EmailFilter.filterEmails([mockGGCCEmail], rules);
    const matchedEmail = filteredEmails[0];

    if (!matchedEmail.matchedRules || matchedEmail.matchedRules.length === 0) {
      console.log('   ❌ No rules matched the email');
      console.log('\n📧 Email details:');
      console.log(`   From: ${mockGGCCEmail.from}`);
      console.log(`   Subject: ${mockGGCCEmail.subject}`);
      console.log(`   Body preview: ${mockGGCCEmail.body.substring(0, 100)}...`);
      return;
    }

    console.log(`   ✅ Matched ${matchedEmail.matchedRules.length} rules: ${matchedEmail.matchedRules.join(', ')}`);

    // 3. Process with AI
    console.log('\n3️⃣  Processing with AI (Claude mock)...');
    const claudeProcessor = new ClaudeProcessor();

    const results = await claudeProcessor.processMultipleEmails([matchedEmail], rules);

    for (const result of results) {
      console.log(`\n   Rule: ${result.ruleName}`);
      console.log(`   Confidence: ${result.confidence}%`);
      console.log(`   Extracted data:`, JSON.stringify(result.extractedFields, null, 2));

      if (result.confidence < 25) {
        console.log('   ⚠️  Low confidence, skipping reminder creation');
        continue;
      }

      // 4. Create Apple Reminder
      console.log('\n4️⃣  Creating Apple Reminder...');
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

      const reminderResult = await appleReminders.createReminderFromExtractedData(
        result.extractedFields,
        matchedRule.reminderTemplate,
        mockGGCCEmail.id
      );

      if (reminderResult.success) {
        console.log(`   ✅ Reminder created successfully!`);
        console.log(`   Reminder ID: ${reminderResult.reminderId}`);
      } else {
        console.log(`   ❌ Failed to create reminder: ${reminderResult.error}`);
      }
    }

    console.log('\n🎉 Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testGGCCProcessing();