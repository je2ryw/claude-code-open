/**
 * Diagnostics and Health Check System
 * For /doctor command and troubleshooting
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import { detectProvider, validateProviderConfig } from '../providers/index.js';

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string;
}

export interface DiagnosticReport {
  timestamp: number;
  version: string;
  platform: string;
  nodeVersion: string;
  checks: DiagnosticCheck[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
}

/**
 * Run all diagnostic checks
 */
export async function runDiagnostics(): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = [];

  // Get version from package.json
  let version = 'unknown';
  try {
    const packagePath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    version = packageJson.version;
  } catch {
    // Ignore
  }

  // Run all checks
  checks.push(await checkNodeVersion());
  checks.push(await checkAuthConfiguration());
  checks.push(await checkApiConnectivity());
  checks.push(await checkFilePermissions());
  checks.push(await checkGitAvailability());
  checks.push(await checkDiskSpace());
  checks.push(await checkConfigurationFiles());
  checks.push(await checkMCPServers());
  checks.push(await checkNetworkConnectivity());
  checks.push(await checkEnvironmentVariables());

  // Calculate summary
  const summary = {
    passed: checks.filter((c) => c.status === 'pass').length,
    warnings: checks.filter((c) => c.status === 'warn').length,
    failed: checks.filter((c) => c.status === 'fail').length,
  };

  return {
    timestamp: Date.now(),
    version,
    platform: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    checks,
    summary,
  };
}

/**
 * Check Node.js version
 */
async function checkNodeVersion(): Promise<DiagnosticCheck> {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);

  if (major >= 20) {
    return {
      name: 'Node.js Version',
      status: 'pass',
      message: `Node.js ${version} is installed`,
    };
  } else if (major >= 18) {
    return {
      name: 'Node.js Version',
      status: 'warn',
      message: `Node.js ${version} works but 20+ recommended`,
    };
  } else {
    return {
      name: 'Node.js Version',
      status: 'fail',
      message: `Node.js ${version} is too old`,
      details: 'Please upgrade to Node.js 20 or later',
    };
  }
}

/**
 * Check authentication configuration
 */
async function checkAuthConfiguration(): Promise<DiagnosticCheck> {
  const provider = detectProvider();
  const validation = validateProviderConfig(provider);

  if (validation.valid) {
    return {
      name: 'Authentication',
      status: 'pass',
      message: `${provider.type} credentials configured`,
    };
  } else {
    return {
      name: 'Authentication',
      status: 'fail',
      message: 'Authentication not configured',
      details: validation.errors.join('; '),
    };
  }
}

/**
 * Check API connectivity
 */
async function checkApiConnectivity(): Promise<DiagnosticCheck> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok || response.status === 405) {
      return {
        name: 'API Connectivity',
        status: 'pass',
        message: 'Can reach Anthropic API',
      };
    } else {
      return {
        name: 'API Connectivity',
        status: 'warn',
        message: `API responded with status ${response.status}`,
      };
    }
  } catch (err) {
    return {
      name: 'API Connectivity',
      status: 'fail',
      message: 'Cannot reach Anthropic API',
      details: String(err),
    };
  }
}

/**
 * Check file permissions
 */
async function checkFilePermissions(): Promise<DiagnosticCheck> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const issues: string[] = [];

  // Check if .claude directory exists and is writable
  try {
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Try to write a test file
    const testFile = path.join(claudeDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (err) {
    issues.push(`Cannot write to ${claudeDir}: ${err}`);
  }

  // Check current directory permissions
  try {
    const cwd = process.cwd();
    fs.accessSync(cwd, fs.constants.R_OK);
  } catch {
    issues.push('Cannot read current directory');
  }

  if (issues.length === 0) {
    return {
      name: 'File Permissions',
      status: 'pass',
      message: 'File permissions OK',
    };
  } else {
    return {
      name: 'File Permissions',
      status: 'fail',
      message: 'Permission issues detected',
      details: issues.join('; '),
    };
  }
}

/**
 * Check Git availability
 */
async function checkGitAvailability(): Promise<DiagnosticCheck> {
  return new Promise((resolve) => {
    child_process.exec('git --version', (error, stdout) => {
      if (error) {
        resolve({
          name: 'Git',
          status: 'warn',
          message: 'Git not found',
          details: 'Some features may not work without Git',
        });
      } else {
        resolve({
          name: 'Git',
          status: 'pass',
          message: stdout.trim(),
        });
      }
    });
  });
}

/**
 * Check disk space
 */
async function checkDiskSpace(): Promise<DiagnosticCheck> {
  try {
    const homeDir = os.homedir();
    const stats = fs.statfsSync(homeDir);
    const freeGB = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024);

    if (freeGB >= 1) {
      return {
        name: 'Disk Space',
        status: 'pass',
        message: `${freeGB.toFixed(1)} GB available`,
      };
    } else if (freeGB >= 0.1) {
      return {
        name: 'Disk Space',
        status: 'warn',
        message: `Only ${freeGB.toFixed(1)} GB available`,
        details: 'Consider freeing up disk space',
      };
    } else {
      return {
        name: 'Disk Space',
        status: 'fail',
        message: 'Very low disk space',
        details: 'Less than 100MB available',
      };
    }
  } catch {
    return {
      name: 'Disk Space',
      status: 'warn',
      message: 'Could not check disk space',
    };
  }
}

/**
 * Check configuration files
 */
async function checkConfigurationFiles(): Promise<DiagnosticCheck> {
  const files: { path: string; name: string; required: boolean }[] = [
    { path: path.join(os.homedir(), '.claude', 'settings.json'), name: 'Global settings', required: false },
    { path: path.join(process.cwd(), '.claude', 'settings.local.json'), name: 'Local settings', required: false },
    { path: path.join(process.cwd(), 'CLAUDE.md'), name: 'Project instructions', required: false },
  ];

  const found: string[] = [];
  const issues: string[] = [];

  for (const file of files) {
    if (fs.existsSync(file.path)) {
      try {
        if (file.path.endsWith('.json')) {
          JSON.parse(fs.readFileSync(file.path, 'utf-8'));
        }
        found.push(file.name);
      } catch (err) {
        issues.push(`${file.name} has invalid format`);
      }
    } else if (file.required) {
      issues.push(`${file.name} not found`);
    }
  }

  if (issues.length > 0) {
    return {
      name: 'Configuration Files',
      status: 'warn',
      message: 'Some config issues detected',
      details: issues.join('; '),
    };
  } else if (found.length > 0) {
    return {
      name: 'Configuration Files',
      status: 'pass',
      message: `Found: ${found.join(', ')}`,
    };
  } else {
    return {
      name: 'Configuration Files',
      status: 'pass',
      message: 'Using default configuration',
    };
  }
}

/**
 * Check MCP servers
 */
async function checkMCPServers(): Promise<DiagnosticCheck> {
  const mcpConfigPath = path.join(os.homedir(), '.claude', 'mcp.json');

  if (!fs.existsSync(mcpConfigPath)) {
    return {
      name: 'MCP Servers',
      status: 'pass',
      message: 'No MCP servers configured',
    };
  }

  try {
    const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
    const servers = Object.keys(config.mcpServers || {});

    if (servers.length === 0) {
      return {
        name: 'MCP Servers',
        status: 'pass',
        message: 'No MCP servers configured',
      };
    }

    return {
      name: 'MCP Servers',
      status: 'pass',
      message: `${servers.length} server(s): ${servers.join(', ')}`,
    };
  } catch (err) {
    return {
      name: 'MCP Servers',
      status: 'warn',
      message: 'MCP config has issues',
      details: String(err),
    };
  }
}

/**
 * Check network connectivity
 */
async function checkNetworkConnectivity(): Promise<DiagnosticCheck> {
  const endpoints = [
    { url: 'https://www.google.com', name: 'Internet' },
    { url: 'https://registry.npmjs.org', name: 'NPM' },
  ];

  const results: string[] = [];
  const failures: string[] = [];

  for (const endpoint of endpoints) {
    try {
      await fetch(endpoint.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      results.push(endpoint.name);
    } catch {
      failures.push(endpoint.name);
    }
  }

  if (failures.length === 0) {
    return {
      name: 'Network',
      status: 'pass',
      message: 'Network connectivity OK',
    };
  } else if (results.length > 0) {
    return {
      name: 'Network',
      status: 'warn',
      message: `Some endpoints unreachable: ${failures.join(', ')}`,
    };
  } else {
    return {
      name: 'Network',
      status: 'fail',
      message: 'No network connectivity',
    };
  }
}

/**
 * Check environment variables
 */
async function checkEnvironmentVariables(): Promise<DiagnosticCheck> {
  const relevantVars = [
    'ANTHROPIC_API_KEY',
    'CLAUDE_API_KEY',
    'ANTHROPIC_MODEL',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CONFIG_DIR',
  ];

  const set = relevantVars.filter((v) => process.env[v]);
  const masked = set.map((v) => {
    const value = process.env[v] || '';
    if (v.includes('KEY') || v.includes('TOKEN')) {
      return `${v}=***${value.slice(-4)}`;
    }
    return `${v}=${value}`;
  });

  return {
    name: 'Environment',
    status: 'pass',
    message: set.length > 0 ? `${set.length} Claude vars set` : 'Using defaults',
    details: masked.length > 0 ? masked.join(', ') : undefined,
  };
}

/**
 * Format diagnostic report for display
 */
export function formatDiagnosticReport(report: DiagnosticReport): string {
  const lines: string[] = [];

  lines.push('╭─────────────────────────────────────────────╮');
  lines.push('│           Claude Code Diagnostics          │');
  lines.push('╰─────────────────────────────────────────────╯');
  lines.push('');
  lines.push(`  Version:  ${report.version}`);
  lines.push(`  Platform: ${report.platform}`);
  lines.push(`  Node:     ${report.nodeVersion}`);
  lines.push('');
  lines.push('─────────────────────────────────────────────');
  lines.push('');

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    const color = check.status === 'pass' ? '' : check.status === 'warn' ? '' : '';
    lines.push(`  ${icon} ${check.name}: ${check.message}`);
    if (check.details) {
      lines.push(`    └─ ${check.details}`);
    }
  }

  lines.push('');
  lines.push('─────────────────────────────────────────────');
  lines.push('');
  lines.push(`  Summary: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Quick health check (minimal checks)
 */
export async function quickHealthCheck(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check auth
  const provider = detectProvider();
  const validation = validateProviderConfig(provider);
  if (!validation.valid) {
    issues.push('Authentication not configured');
  }

  // Check basic connectivity
  try {
    await fetch('https://api.anthropic.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    issues.push('Cannot reach API');
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}
