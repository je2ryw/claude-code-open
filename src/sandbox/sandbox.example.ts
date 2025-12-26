/**
 * Sandbox Usage Examples
 * Demonstrates how to use the enhanced sandbox system
 */

import {
  SandboxExecutor,
  detectBestSandbox,
  getSandboxCapabilities,
  SandboxConfigManager,
  SANDBOX_PRESETS,
} from './index.js';

// ============================================================================
// Example 1: Auto-detect and Execute
// ============================================================================

async function example1_AutoDetect() {
  console.log('=== Example 1: Auto-detect Best Sandbox ===\n');

  // Detect best sandbox for current platform
  const bestSandbox = detectBestSandbox();
  console.log(`Best sandbox for this platform: ${bestSandbox}`);

  // Get all capabilities
  const capabilities = getSandboxCapabilities();
  console.log('Available sandboxes:', capabilities);

  // Create executor with development preset
  const config = SANDBOX_PRESETS.development;
  const executor = new SandboxExecutor(config);

  // Execute a simple command
  const result = await executor.execute('echo', ['Hello from sandbox!']);

  console.log('\nExecution result:');
  console.log('- Exit code:', result.exitCode);
  console.log('- Sandboxed:', result.sandboxed);
  console.log('- Sandbox type:', result.sandboxType);
  console.log('- Output:', result.stdout.trim());
  console.log('- Duration:', result.duration, 'ms\n');
}

// ============================================================================
// Example 2: macOS Seatbelt Sandbox
// ============================================================================

async function example2_Seatbelt() {
  console.log('=== Example 2: macOS Seatbelt Sandbox ===\n');

  const { SeatbeltSandbox, getSeatbeltInfo } = await import('./seatbelt.js');

  // Check availability
  const info = getSeatbeltInfo();
  console.log('Seatbelt info:', info);

  if (!info.available) {
    console.log('Seatbelt not available on this platform\n');
    return;
  }

  // Create sandbox with restricted network
  const sandbox = new SeatbeltSandbox({
    allowNetwork: false,
    allowWrite: ['/tmp'],
    allowRead: ['/usr', '/Library'],
    timeout: 5000,
  });

  // Execute command
  const result = await sandbox.execute('echo', ['Testing Seatbelt']);

  console.log('\nSeatbelt execution result:');
  console.log('- Exit code:', result.exitCode);
  console.log('- Sandboxed:', result.sandboxed);
  console.log('- Output:', result.stdout.trim());
  console.log('- Duration:', result.duration, 'ms\n');
}

// ============================================================================
// Example 3: Docker Container Sandbox
// ============================================================================

async function example3_Docker() {
  console.log('=== Example 3: Docker Container Sandbox ===\n');

  const {
    DockerSandbox,
    getDockerInfo,
    isDockerAvailable,
  } = await import('./docker.js');

  // Check Docker availability
  if (!isDockerAvailable()) {
    console.log('Docker not available on this system\n');
    return;
  }

  // Get Docker info
  const info = getDockerInfo();
  console.log('Docker info:');
  console.log('- Version:', info.version);
  console.log('- Available images:', info.images.slice(0, 5).join(', '));

  // Create sandbox with resource limits
  const sandbox = new DockerSandbox({
    image: 'node:20-alpine',
    memory: '512m',
    cpus: '0.5',
    network: 'none', // Isolated network
    readOnly: false,
    autoRemove: true,
    timeout: 10000,
  });

  // Execute Node.js command
  const result = await sandbox.execute('node', ['-e', 'console.log(process.version)']);

  console.log('\nDocker execution result:');
  console.log('- Exit code:', result.exitCode);
  console.log('- Sandboxed:', result.sandboxed);
  console.log('- Output:', result.stdout.trim());
  console.log('- Duration:', result.duration, 'ms\n');
}

// ============================================================================
// Example 4: Resource Limits
// ============================================================================

async function example4_ResourceLimits() {
  console.log('=== Example 4: Resource Limits ===\n');

  const {
    ResourceLimiter,
    isCgroupsV2Available,
    parseMemoryString,
    formatBytes,
  } = await import('./resource-limits.js');

  // Check cgroups availability
  console.log('cgroups v2 available:', isCgroupsV2Available());

  // Parse memory strings
  const mem1 = parseMemoryString('512m');
  const mem2 = parseMemoryString('1g');
  console.log(`512m = ${formatBytes(mem1)} (${mem1} bytes)`);
  console.log(`1g = ${formatBytes(mem2)} (${mem2} bytes)`);

  // Create resource limiter
  const limiter = new ResourceLimiter({
    maxMemory: 512 * 1024 * 1024, // 512MB
    maxCpu: 50, // 50%
    maxProcesses: 10,
    maxExecutionTime: 30000, // 30 seconds
  });

  console.log('\nResource limiter created with:');
  console.log('- Max memory: 512 MB');
  console.log('- Max CPU: 50%');
  console.log('- Max processes: 10');
  console.log('- Max execution time: 30 seconds\n');
}

// ============================================================================
// Example 5: Configuration Presets
// ============================================================================

async function example5_Presets() {
  console.log('=== Example 5: Configuration Presets ===\n');

  const configManager = new SandboxConfigManager();

  // List all presets
  const presets = configManager.listPresets();
  console.log('Available presets:', presets.join(', '));

  // Use strict preset
  const strictConfig = configManager.getPreset('strict');
  console.log('\nStrict preset configuration:');
  console.log('- Sandbox type:', strictConfig.type);
  console.log('- Network access:', strictConfig.networkAccess);
  console.log('- Memory limit:', strictConfig.resourceLimits?.maxMemory, 'bytes');
  console.log('- CPU limit:', strictConfig.resourceLimits?.maxCpu, '%');

  // Use docker preset
  const dockerConfig = configManager.getPreset('docker');
  console.log('\nDocker preset configuration:');
  console.log('- Docker image:', dockerConfig.docker?.image);
  console.log('- Memory limit:', dockerConfig.resourceLimits?.maxMemory, 'bytes');
  console.log('- Volumes:', dockerConfig.docker?.volumes);

  // Create custom configuration
  const customConfig = configManager.mergeConfigs(
    strictConfig,
    {
      networkAccess: true,
      allowedPaths: ['/tmp', process.cwd()],
    }
  );

  console.log('\nCustom configuration (strict + overrides):');
  console.log('- Network access:', customConfig.networkAccess);
  console.log('- Allowed paths:', customConfig.allowedPaths);
  console.log('');
}

// ============================================================================
// Example 6: Unified Executor
// ============================================================================

async function example6_UnifiedExecutor() {
  console.log('=== Example 6: Unified Executor ===\n');

  const { SandboxExecutor } = await import('./executor.js');

  // Create executor with testing preset
  const config = SANDBOX_PRESETS.testing;
  const executor = new SandboxExecutor(config);

  // Execute single command
  console.log('Executing single command...');
  const result1 = await executor.execute('pwd', []);
  console.log('Current directory:', result1.stdout.trim());

  // Execute sequence of commands
  console.log('\nExecuting sequence of commands...');
  const results = await executor.executeSequence([
    { command: 'echo', args: ['First command'] },
    { command: 'echo', args: ['Second command'] },
    { command: 'echo', args: ['Third command'] },
  ]);

  results.forEach((result, i) => {
    console.log(`Command ${i + 1}:`, result.stdout.trim());
  });

  // Execute parallel commands
  console.log('\nExecuting parallel commands...');
  const parallelResults = await executor.executeParallel([
    { command: 'echo', args: ['Task 1'] },
    { command: 'echo', args: ['Task 2'] },
    { command: 'echo', args: ['Task 3'] },
  ]);

  parallelResults.forEach((result, i) => {
    console.log(`Task ${i + 1}:`, result.stdout.trim());
  });

  console.log('');
}

// ============================================================================
// Example 7: Configuration Manager
// ============================================================================

async function example7_ConfigManager() {
  console.log('=== Example 7: Configuration Manager ===\n');

  const configManager = new SandboxConfigManager();

  // Get current configuration summary
  const summary = configManager.getSummary();
  console.log('Current configuration summary:');
  console.log('- Enabled:', summary.enabled);
  console.log('- Type:', summary.type);
  console.log('- Network access:', summary.networkAccess);
  console.log('- Allowed paths:', summary.allowedPathsCount);
  console.log('- Denied paths:', summary.deniedPathsCount);

  // Check path permissions
  console.log('\nPath permissions:');
  console.log('- /tmp allowed:', configManager.isPathAllowed('/tmp'));
  console.log('- /tmp writable:', configManager.isPathWritable('/tmp'));
  console.log('- /etc/shadow allowed:', configManager.isPathAllowed('/etc/shadow'));

  // Get environment variables
  const env = configManager.getEnvironmentVariables();
  console.log('\nEnvironment variables:', Object.keys(env).slice(0, 5).join(', '), '...');

  // Execute command with config manager
  console.log('\nExecuting command with config manager...');
  const result = await configManager.executeCommand('echo', ['Config manager test']);
  console.log('- Output:', result.stdout.trim());
  console.log('- Sandbox type:', result.sandboxType);
  console.log('');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('Sandbox System Examples\n');
  console.log('========================================\n');

  try {
    await example1_AutoDetect();
    await example2_Seatbelt();
    await example3_Docker();
    await example4_ResourceLimits();
    await example5_Presets();
    await example6_UnifiedExecutor();
    await example7_ConfigManager();

    console.log('========================================');
    console.log('All examples completed successfully!');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run if executed directly (Node.js check)
const isMainModule = require.main === module || process.argv[1]?.includes('sandbox.example');

if (isMainModule) {
  main().catch(console.error);
}

export {
  example1_AutoDetect,
  example2_Seatbelt,
  example3_Docker,
  example4_ResourceLimits,
  example5_Presets,
  example6_UnifiedExecutor,
  example7_ConfigManager,
};
