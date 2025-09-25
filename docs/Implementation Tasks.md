# Implementation Tasks

## Phase 1: Foundation & Setup (Tasks 1.0-3.0)

### 1.0 Project Setup & Architecture
- [ ] 1.1 Create MCP project structure with TypeScript
- [ ] 1.2 Initialize npm package with required dependencies
- [ ] 1.3 Setup Jest testing framework
- [ ] 1.4 Configure ESLint and TypeScript strict mode
- [ ] 1.5 Test: Validate project builds and runs

### 2.0 Obsidian Integration
- [ ] 2.1 Implement obsidian-reader.ts using filesystem MCP
- [ ] 2.2 Create markdown parser for rule format
- [ ] 2.3 Add rule validation and error handling
- [ ] 2.4 Test: Parse sample Email Rules.md correctly
- [ ] 2.5 Test: Handle malformed rules gracefully

### 3.0 Email Provider Setup
- [ ] 3.1 Gmail API client with OAuth2 using github MCP for credentials storage
- [ ] 3.2 iCloud IMAP client with app-specific passwords
- [ ] 3.3 Email parsing and filtering logic
- [ ] 3.4 Test: Connect to both providers successfully
- [ ] 3.5 Test: Fetch and parse sample emails

## Phase 2: Core Processing (Tasks 4.0-6.0)

### 4.0 AI Processing Engine  
- [ ] 4.1 Claude integration for email analysis using sequential-thinking MCP
- [ ] 4.2 Prompt template system with variable substitution
- [ ] 4.3 Fallback regex patterns for basic data extraction
- [ ] 4.4 Test: Extract data from various email formats
- [ ] 4.5 Test: Handle AI processing failures gracefully

### 5.0 Apple Reminders Integration
- [ ] 5.1 AppleScript wrapper for creating reminders
- [ ] 5.2 Reminder template system with dynamic data
- [ ] 5.3 List management and error handling
- [ ] 5.4 Test: Create reminders in different lists successfully
- [ ] 5.5 Test: Handle AppleScript permission errors

### 6.0 Daemon & Scheduling
- [ ] 6.1 Background daemon with configurable intervals
- [ ] 6.2 Email processing queue with retry logic
- [ ] 6.3 State persistence using filesystem MCP
- [ ] 6.4 Test: Daemon runs continuously without memory leaks
- [ ] 6.5 Test: Process emails correctly on schedule

## Phase 3: MCP Integration & Tools (Tasks 7.0-9.0)

### 7.0 MCP Server Implementation
- [ ] 7.1 Define MCP tools interface
- [ ] 7.2 Implement rule management tools
- [ ] 7.3 Add debugging and monitoring tools
- [ ] 7.4 Test: All MCP tools respond correctly
- [ ] 7.5 Test: MCP integrates with Claude Code

### 8.0 Testing & Quality Assurance
- [ ] 8.1 Unit tests for all core functions (80%+ coverage)
- [ ] 8.2 Integration tests with real email providers
- [ ] 8.3 End-to-end tests using snap-happy MCP for UI verification
- [ ] 8.4 Performance tests with large email volumes
- [ ] 8.5 Test: Complete workflow from email to reminder

### 9.0 Documentation & Deployment
- [ ] 9.1 README with installation instructions
- [ ] 9.2 Obsidian templates and examples using obsidian MCP
- [ ] 9.3 Troubleshooting guide
- [ ] 9.4 Test: Installation process on clean system
- [ ] 9.5 Test: Documentation accuracy and completeness

## Testing Strategy

### Unit Tests (Jest)
- Email parsing functions
- Rule matching logic  
- AI prompt generation
- AppleScript wrapper
- Configuration validation

### Integration Tests  
- Gmail API connectivity
- iCloud IMAP connection
- Obsidian file reading using filesystem MCP
- Apple Reminders creation
- MCP tool registration

### E2E Tests
- Complete email → reminder workflow
- Multiple rule processing
- Error recovery scenarios
- Performance under load

### Manual Testing Scenarios
- Add new rule in Obsidian → automatic pickup
- Email arrives → reminder created correctly
- Invalid rule syntax → helpful error message  
- Provider auth failure → graceful degradation
- AppleScript permissions → clear instructions

## MCP Usage Plan

### Available MCPs to Leverage:
- **filesystem**: Read/write Obsidian files and config
- **github**: Store credentials and backup configurations  
- **sequential-thinking**: Complex email analysis logic
- **obsidian**: Direct vault integration for rule management
- **snap-happy**: Screenshot testing for reminder verification
- **puppeteer**: Test web-based OAuth flows

### Testing with MCPs:
- Use **github MCP** to create test repositories with sample emails
- Use **obsidian MCP** to create/modify test rules dynamically
- Use **snap-happy MCP** to verify reminders appear in Apple Reminders
- Use **sequential-thinking MCP** for complex parsing scenarios


