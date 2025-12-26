/**
 * Security Module
 * Comprehensive security configuration validation, risk assessment, and runtime monitoring
 *
 * Modules:
 * - validate: Security configuration validation and compliance checking
 * - audit: Audit logging system for security events
 * - sensitive: Sensitive data detection and masking
 * - sensitive-enhanced: Enhanced sensitive data filtering for tool outputs
 * - command-injection: Command injection detection and prevention
 * - runtime-monitor: Runtime behavior monitoring and interception
 */

// Core validation and configuration
export * from './validate.js';

// Audit logging
export * from './audit.js';

// Sensitive data detection
export * from './sensitive.js';

// Enhanced filtering
export * from './sensitive-enhanced.js';

// Command injection detection
export {
  type InjectionPattern,
  type InjectionCheckResult,
  type CommandValidationOptions,
  DANGEROUS_PATTERNS,
  CommandInjectionDetector,
  isCommandSafe,
  sanitizeArgs,
  createDetector as createInjectionDetector
} from './command-injection.js';

// Runtime monitoring
export * from './runtime-monitor.js';
