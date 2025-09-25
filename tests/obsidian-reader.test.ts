import fs from 'fs/promises';
import path from 'path';
import { ObsidianReader } from '../src/obsidian-reader';

// Mock the logger to avoid console output during tests
jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('ObsidianReader', () => {
  const testVaultPath = path.join(process.cwd(), 'tests/fixtures');
  const testRulesPath = path.join(testVaultPath, 'Proyectos', 'Smart Email Reminders', 'Email Rules.md');

  beforeAll(async () => {
    // Create test directory structure
    await fs.mkdir(path.dirname(testRulesPath), { recursive: true });
  });

  afterAll(async () => {
    // Clean up test files
    try {
      await fs.rm(testVaultPath, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('loadRules', () => {
    it('should parse valid rules correctly', async () => {
      const testRulesContent = `# Smart Email Reminders

## Email Processing Rules

### Rule: gastos_comunes
- **Status**: ✅ Active
- **Providers**: Gmail, iCloud
- **From Contains**: ["gastos", "edificio"]
- **Subject Contains**: ["gasto común", "cuota"]

**Prompt:**
\`\`\`
Analiza este email y extrae:
- Monto: busca cifras en pesos chilenos
- Vencimiento: fecha límite de pago
- Período: mes que corresponde

Crear recordatorio:
- Título: "💰 Pagar gastos comunes \${monto} - \${período}"
- Fecha: \${vencimiento - 3 días}
\`\`\`

---

### Rule: facturas_servicios
- **Status**: ⏸️ Paused
- **Providers**: Gmail
- **From Domains**: ["enel.cl", "movistar.cl"]
- **Subject Contains**: ["factura", "cuenta"]

**Prompt:**
\`\`\`
Procesar factura de servicios:
- Empresa: nombre del proveedor
- Monto: total a pagar
- Vencimiento: fecha límite

Recordatorio:
- Título: "🔌 Pagar \${empresa} - $\${monto}"
- Lista: "Servicios"
\`\`\`
`;

      await fs.writeFile(testRulesPath, testRulesContent, 'utf-8');

      const reader = new ObsidianReader(testVaultPath);
      const rules = await reader.loadRules();

      expect(rules).toHaveLength(2);

      // Test first rule
      const gascosRule = rules.find(r => r.name === 'gastos_comunes');
      expect(gascosRule).toBeDefined();
      expect(gascosRule?.status).toBe('active');
      expect(gascosRule?.providers).toEqual(['gmail', 'icloud']);
      expect(gascosRule?.fromContains).toEqual(['gastos', 'edificio']);
      expect(gascosRule?.subjectContains).toEqual(['gasto común', 'cuota']);
      expect(gascosRule?.prompt).toContain('Analiza este email y extrae');
      expect(gascosRule?.prompt).toContain('💰 Pagar gastos comunes');

      // Test second rule
      const facturasRule = rules.find(r => r.name === 'facturas_servicios');
      expect(facturasRule).toBeDefined();
      expect(facturasRule?.status).toBe('paused');
      expect(facturasRule?.providers).toEqual(['gmail']);
      expect(facturasRule?.fromDomains).toEqual(['enel.cl', 'movistar.cl']);
      expect(facturasRule?.prompt).toContain('Procesar factura de servicios');
    });

    it('should handle empty rules file gracefully', async () => {
      await fs.writeFile(testRulesPath, '# Empty Rules File\n\nNo rules here.', 'utf-8');

      const reader = new ObsidianReader(testVaultPath);
      const rules = await reader.loadRules();

      expect(rules).toHaveLength(0);
    });

    it('should return empty array when rules file does not exist', async () => {
      // Remove the test file
      try {
        await fs.unlink(testRulesPath);
      } catch {
        // File might not exist
      }

      const reader = new ObsidianReader(testVaultPath);
      const rules = await reader.loadRules();

      expect(rules).toHaveLength(0);
    });

    it('should use cached rules when file unchanged', async () => {
      const testContent = `### Rule: test_rule
- **Status**: ✅ Active
- **Providers**: Gmail

**Prompt:**
\`\`\`
Test prompt
\`\`\`
`;

      await fs.writeFile(testRulesPath, testContent, 'utf-8');

      const reader = new ObsidianReader(testVaultPath);

      // First load
      const rules1 = await reader.loadRules();
      expect(rules1).toHaveLength(1);

      // Second load (should use cache)
      const rules2 = await reader.loadRules();
      expect(rules2).toHaveLength(1);
      expect(rules2).toBe(rules1); // Same object reference (cached)
    });
  });

  describe('validateRule', () => {
    beforeEach(async () => {
      const testContent = `### Rule: valid_rule
- **Status**: ✅ Active
- **Providers**: Gmail

**Prompt:**
\`\`\`
Valid test prompt
\`\`\`

### Rule: invalid_rule
- **Status**: ✅ Active
- **Providers**: InvalidProvider

**Prompt:**
\`\`\`
Invalid provider test
\`\`\`
`;

      await fs.writeFile(testRulesPath, testContent, 'utf-8');
    });

    it('should validate existing valid rule', async () => {
      const reader = new ObsidianReader(testVaultPath);
      const validation = await reader.validateRule('valid_rule');

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should return error for non-existent rule', async () => {
      const reader = new ObsidianReader(testVaultPath);
      const validation = await reader.validateRule('non_existent_rule');

      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toContain('not found');
    });
  });

  describe('updateRuleStatus', () => {
    beforeEach(async () => {
      const testContent = `### Rule: test_rule
- **Status**: ✅ Active
- **Providers**: Gmail

**Prompt:**
\`\`\`
Test prompt
\`\`\`
`;

      await fs.writeFile(testRulesPath, testContent, 'utf-8');
    });

    it('should update rule status correctly', async () => {
      const reader = new ObsidianReader(testVaultPath);

      // Update to paused
      await reader.updateRuleStatus('test_rule', 'paused');

      // Read file to verify change
      const updatedContent = await fs.readFile(testRulesPath, 'utf-8');
      expect(updatedContent).toContain('⏸️ Paused');
      expect(updatedContent).not.toContain('✅ Active');

      // Verify rule is actually paused
      const rules = await reader.loadRules();
      const testRule = rules.find(r => r.name === 'test_rule');
      expect(testRule?.status).toBe('paused');
    });
  });

  describe('getActiveRules', () => {
    beforeEach(async () => {
      const testContent = `### Rule: active_rule
- **Status**: ✅ Active
- **Providers**: Gmail

**Prompt:**
\`\`\`
Active rule prompt
\`\`\`

### Rule: paused_rule
- **Status**: ⏸️ Paused
- **Providers**: Gmail

**Prompt:**
\`\`\`
Paused rule prompt
\`\`\`
`;

      await fs.writeFile(testRulesPath, testContent, 'utf-8');
    });

    it('should return only active rules', async () => {
      const reader = new ObsidianReader(testVaultPath);
      const activeRules = await reader.getActiveRules();

      expect(activeRules).toHaveLength(1);
      expect(activeRules[0].name).toBe('active_rule');
      expect(activeRules[0].status).toBe('active');
    });
  });

  describe('parsing edge cases', () => {
    it('should handle rules without code blocks in prompts', async () => {
      const testContent = `### Rule: no_code_blocks
- **Status**: ✅ Active
- **Providers**: Gmail

**Prompt:**
This is a prompt without code blocks.
It spans multiple lines.
And should still be parsed correctly.

---
`;

      await fs.writeFile(testRulesPath, testContent, 'utf-8');

      const reader = new ObsidianReader(testVaultPath);
      const rules = await reader.loadRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].prompt).toContain('This is a prompt without code blocks');
      expect(rules[0].prompt).toContain('should still be parsed correctly');
    });

    it('should handle missing optional fields with defaults', async () => {
      const testContent = `### Rule: minimal_rule
**Prompt:**
\`\`\`
Minimal prompt
\`\`\`
`;

      await fs.writeFile(testRulesPath, testContent, 'utf-8');

      const reader = new ObsidianReader(testVaultPath);
      const rules = await reader.loadRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].status).toBe('active'); // default
      expect(rules[0].providers).toEqual(['gmail', 'icloud']); // default
      expect(rules[0].reminderTemplate.listName).toBe('Facturas'); // default
    });
  });

  describe('configuration', () => {
    it('should return correct configuration info', () => {
      const reader = new ObsidianReader(testVaultPath);
      const config = reader.getConfiguration();

      expect(config.vaultPath).toBe(testVaultPath);
      expect(config.rulesFilePath).toContain('Email Rules.md');
      expect(config.cacheSize).toBe(0);
      expect(config.lastModified).toBe('never');
    });
  });
});