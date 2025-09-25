# Smart Email Reminders MCP

🤖 **Intelligent MCP server that reads email processing rules from Obsidian and creates Apple Reminders automatically using AI-powered parsing.**

## Features

- 📧 **Multi-provider support**: Gmail API + iCloud IMAP
- 🧠 **AI-powered parsing**: Claude analyzes emails with custom prompts
- 📝 **Obsidian integration**: Write rules in markdown, auto-loaded by MCP
- 🍎 **Apple Reminders**: Automatic reminder creation via AppleScript
- ⚡ **Real-time processing**: Daemon monitors emails every 30 minutes
- 🔧 **Claude Code ready**: Full MCP integration for seamless workflow

## Quick Start

```bash
# Install the MCP server
npm install -g smart-email-reminders-mcp

# Add to Claude Code
claude mcp add smart-email-reminders ~/smart-email-reminders-mcp

# Configure email providers
claude> configure_email_providers

# Start processing emails
claude> scan_emails_now
```

## How It Works

1. **Write rules** in your Obsidian vault (`Smart Email Reminders/Email Rules.md`)
2. **MCP reads rules** automatically from your vault
3. **Daemon scans** Gmail + iCloud every 30 minutes
4. **Claude processes** emails using your custom prompts
5. **Reminders created** in Apple Reminders with extracted data

## Example Rule

```markdown
### Rule: gastos_comunes
- **Status**: ✅ Active
- **From Contains**: ["gastos", "edificio"]
- **Subject Contains**: ["gasto común", "cuota"]

**Prompt:**
```
Extrae del email:
- Monto en pesos chilenos
- Fecha de vencimiento
- Período que corresponde

Crear recordatorio:
- Título: "💰 Pagar gastos comunes ${monto} - ${período}"
- Fecha: ${vencimiento - 3 días}
- Lista: "Facturas"
```
```

## Installation

See [INSTALLATION.md](./docs/INSTALLATION.md) for detailed setup instructions.

## Documentation

- [📋 Implementation Plan](./docs/IMPLEMENTATION.md)
- [🔧 Configuration Guide](./docs/CONFIGURATION.md)
- [📝 Rule Templates](./docs/RULE_TEMPLATES.md)
- [🧪 Testing Guide](./docs/TESTING.md)
- [🔍 Troubleshooting](./docs/TROUBLESHOOTING.md)

## MCP Tools

- `reload_rules_from_obsidian` - Refresh rules from vault
- `scan_emails_now` - Manual email scan
- `test_rule_syntax` - Validate rule format
- `debug_rule_matching` - Show matching rules for email
- `show_processing_log` - View processing history

## Architecture

```
Obsidian Vault → MCP Server → Email Providers → Claude AI → Apple Reminders
     ↑              ↑              ↑           ↑           ↑
   Rules.md    Rule Parser    Gmail/iCloud  AI Analysis  AppleScript
```

## Requirements

- macOS (for Apple Reminders integration)
- Node.js 18+
- Obsidian with Smart Email Reminders vault structure
- Gmail API credentials / iCloud app-specific password
- Claude Code with MCP support

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Repository**: https://github.com/griederer/smart-email-reminders-mcp
**Issues**: https://github.com/griederer/smart-email-reminders-mcp/issues