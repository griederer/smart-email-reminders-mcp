// Jest setup file
// Global test configuration and utilities

// Increase timeout for async operations
jest.setTimeout(10000);

// Mock console.log/warn/error to keep test output clean
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};