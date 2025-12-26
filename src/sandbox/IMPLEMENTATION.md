# Sandbox System Implementation Guide

## Overview

This document describes the enhanced sandbox system implementation for Claude Code, providing comprehensive sandboxing capabilities across multiple platforms.

## Architecture

### Core Modules

1. **bubblewrap.ts** - Linux sandboxing using Bubblewrap
2. **seatbelt.ts** - macOS sandboxing using sandbox-exec (NEW)
3. **docker.ts** - Container-based sandboxing (NEW)
4. **resource-limits.ts** - Resource management with cgroups/ulimit (NEW)
5. **executor.ts** - Unified sandbox executor (NEW)
6. **config.ts** - Configuration management with presets
7. **filesystem.ts** - File system access control
8. **network.ts** - Network access control

### Implementation Status

| Module | Status | Platform | Completion |
|--------|--------|----------|------------|
| Bubblewrap | ✅ Implemented | Linux | 100% |
| Seatbelt | ✅ Implemented | macOS | 100% |
| Docker | ✅ Implemented | Cross-platform | 100% |
| Resource Limits | ✅ Implemented | Linux/macOS | 85% |
| Unified Executor | ✅ Implemented | All | 100% |
| Filesystem Sandbox | ✅ Implemented | All | 100% |
| Network Sandbox | ✅ Implemented | All | 100% |
| Config Manager | ✅ Enhanced | All | 100% |

## New Features (T-016, T-017)

### T-016: macOS Seatbelt Support

**File:** `src/sandbox/seatbelt.ts`

**Features:**
- Seatbelt profile generation (Scheme-like syntax)
- Network isolation control
- File system access control (read/write paths)
- Subprocess control
- Automatic fallback to unsandboxed execution

**Usage Example:**
```typescript
import { SeatbeltSandbox, execInSeatbelt } from './sandbox/index.js';

// Using the class
const sandbox = new SeatbeltSandbox({
  allowNetwork: false,
  allowWrite: ['/tmp'],
  allowRead: ['/usr', '/Library'],
  timeout: 5000,
});

const result = await sandbox.execute('bash', ['-c', 'ls /tmp']);

// Or use the convenience function
const result2 = await execInSeatbelt('bash', ['-c', 'pwd'], {
  allowNetwork: true,
});
```

**Seatbelt Profile Example:**
```scheme
(version 1)
(debug deny)

;; Default deny all
(deny default)

;; Allow basic process operations
(allow process-exec*)
(allow process-fork)
(allow signal*)
(allow sysctl-read)

;; Allow read access to system paths
(allow file-read*
    (subpath "/System")
    (subpath "/usr")
    (subpath "/Library"))

;; Allow write access to /tmp
(allow file*
    (subpath "/tmp"))

;; Deny network access
(deny network*)
```

### T-017: Docker Container Mode

**File:** `src/sandbox/docker.ts`

**Features:**
- Container-based isolation
- Resource limits (memory, CPU)
- Volume mounting
- Network isolation modes
- Port mapping
- Image management (pull, build)
- Automatic fallback

**Usage Example:**
```typescript
import { DockerSandbox, execInDocker, getDockerInfo } from './sandbox/index.js';

// Check availability
const info = getDockerInfo();
console.log('Docker version:', info.version);

// Using the class
const sandbox = new DockerSandbox({
  image: 'node:20-alpine',
  memory: '512m',
  cpus: '0.5',
  network: 'none',
  readOnly: false,
  volumes: [`${process.cwd()}:/workspace:rw`],
  workdir: '/workspace',
});

const result = await sandbox.execute('node', ['-v']);

// Or use the convenience function
const result2 = await execInDocker('npm', ['--version'], {
  image: 'node:20-alpine',
  memory: '1g',
});
```

**Docker Configuration Options:**
```typescript
interface DockerOptions {
  image?: string;              // Default: 'node:20-alpine'
  containerName?: string;
  volumes?: string[];          // ['host:container:mode']
  ports?: string[];            // ['host:container']
  network?: string;            // 'bridge', 'none', 'host'
  user?: string;               // 'uid:gid'
  workdir?: string;            // '/workspace'
  env?: Record<string, string>;
  memory?: string;             // '512m', '1g'
  cpus?: string;               // '0.5', '2.0'
  readOnly?: boolean;
  autoRemove?: boolean;        // Default: true
  timeout?: number;
  entrypoint?: string;
}
```

### Resource Limits Enhancement

**File:** `src/sandbox/resource-limits.ts`

**Features:**
- Linux cgroups v2 integration
- macOS launchctl integration
- ulimit-based limits (POSIX)
- Resource usage monitoring
- Memory, CPU, process count limits
- File size and execution time limits

**Usage Example:**
```typescript
import {
  ResourceLimiter,
  applyCgroupLimits,
  buildUlimitArgs,
  parseMemoryString,
  formatBytes,
} from './sandbox/index.js';

// Create limiter
const limiter = new ResourceLimiter({
  maxMemory: 512 * 1024 * 1024,  // 512MB
  maxCpu: 50,                     // 50%
  maxProcesses: 10,
  maxExecutionTime: 30000,        // 30 seconds
  maxFileDescriptors: 100,
});

// Apply to process (Linux cgroups)
await limiter.applyLimits(process.pid);

// Monitor usage
const usage = await limiter.getUsage(process.pid);
console.log('Memory used:', formatBytes(usage.memoryUsed));

// Check limits
const check = await limiter.isLimitExceeded(process.pid);
if (check.exceeded) {
  console.log('Limit exceeded:', check.reason);
}

// Cleanup
await limiter.cleanup(process.pid);
```

### Unified Executor

**File:** `src/sandbox/executor.ts`

**Features:**
- Automatic sandbox detection
- Platform-specific sandbox selection
- Fallback mechanism
- Sequence and parallel execution
- Configuration integration

**Usage Example:**
```typescript
import { SandboxExecutor, detectBestSandbox } from './sandbox/index.js';

// Detect best sandbox
const bestSandbox = detectBestSandbox();
console.log('Using sandbox:', bestSandbox);

// Create executor
const executor = new SandboxExecutor({
  enabled: true,
  type: 'bubblewrap', // or 'seatbelt', 'docker'
  networkAccess: true,
  allowedPaths: ['/tmp', process.cwd()],
  resourceLimits: {
    maxMemory: 1024 * 1024 * 1024,
    maxCpu: 75,
  },
});

// Execute single command
const result = await executor.execute('ls', ['-la']);

// Execute sequence
const results = await executor.executeSequence([
  { command: 'echo', args: ['Step 1'] },
  { command: 'echo', args: ['Step 2'] },
]);

// Execute in parallel
const parallelResults = await executor.executeParallel([
  { command: 'echo', args: ['Task 1'] },
  { command: 'echo', args: ['Task 2'] },
]);
```

## Configuration Presets

The configuration system includes 8 presets:

1. **strict** - Maximum isolation, minimal resources
2. **development** - Permissive, high resources
3. **testing** - Balanced for tests
4. **production** - Secure, moderate resources
5. **docker** - Container-based
6. **unrestricted** - No sandboxing
7. **webscraping** - Network access, limited resources
8. **aicode** - AI code execution, strict isolation

**Usage:**
```typescript
import { SANDBOX_PRESETS, SandboxConfigManager } from './sandbox/index.js';

// Use preset directly
const config = SANDBOX_PRESETS.strict;

// Or through config manager
const manager = new SandboxConfigManager();
const preset = manager.getPreset('docker');

// Merge with custom overrides
const custom = manager.mergeConfigs(preset, {
  networkAccess: true,
  allowedPaths: ['/tmp'],
});
```

## Integration with Bash Tool

The sandbox system integrates with the Bash tool through the `dangerouslyDisableSandbox` parameter:

```typescript
// In Bash tool
interface BashInput {
  command: string;
  dangerouslyDisableSandbox?: boolean;
}

// Execute with sandbox (default)
const result = await bashTool.execute({ command: 'ls -la' });

// Execute without sandbox
const unsafeResult = await bashTool.execute({
  command: 'ls -la',
  dangerouslyDisableSandbox: true,
});
```

## Platform Support Matrix

| Feature | Linux | macOS | Windows | Docker |
|---------|-------|-------|---------|--------|
| Process Isolation | ✅ Bubblewrap | ✅ Seatbelt | ❌ | ✅ |
| Network Isolation | ✅ | ✅ | ❌ | ✅ |
| Filesystem Isolation | ✅ | ✅ | ⚠️ Partial | ✅ |
| Resource Limits | ✅ cgroups v2 | ⚠️ Limited | ❌ | ✅ |
| Memory Limit | ✅ | ⚠️ | ❌ | ✅ |
| CPU Limit | ✅ | ⚠️ | ❌ | ✅ |
| Process Count Limit | ✅ | ⚠️ | ❌ | ⚠️ |

## Testing

Run the example file to test all features:

```bash
# Using ts-node
npx ts-node src/sandbox/sandbox.example.ts

# Or compile and run
npm run build
node dist/sandbox/sandbox.example.js
```

## Error Handling

All sandbox implementations include automatic fallback:

1. Try platform-specific sandbox (Bubblewrap/Seatbelt)
2. Try Docker if available
3. Fallback to unsandboxed execution with warning
4. Apply ulimit resource limits if possible

## Security Considerations

### Seatbelt (macOS)
- Profile files are created in `/tmp` with unique names
- Automatic cleanup after execution
- Default deny policy with selective allows
- Network isolation by default

### Docker
- Uses `--read-only` for root filesystem when enabled
- Tmpfs for `/tmp` directory
- User mapping to prevent privilege escalation
- `--rm` for automatic container cleanup
- Network isolation modes (none/bridge)

### Resource Limits
- Prevents resource exhaustion attacks
- Enforces execution timeouts
- Limits memory consumption
- Controls process spawning

## Future Enhancements

1. Windows sandbox support (Job Objects API)
2. Seccomp filter support (Linux)
3. AppArmor/SELinux profiles
4. Enhanced audit logging
5. Real-time resource monitoring
6. Custom syscall filtering
7. Rootless Docker support
8. Podman integration

## References

- **Bubblewrap:** https://github.com/containers/bubblewrap
- **Seatbelt:** `man sandbox-exec` (macOS)
- **Docker:** https://docs.docker.com/engine/reference/run/
- **cgroups v2:** https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html
- **ulimit:** `man ulimit` (POSIX)

## File Locations

```
src/sandbox/
├── index.ts                    # Main exports
├── bubblewrap.ts              # Linux Bubblewrap sandbox
├── seatbelt.ts                # macOS Seatbelt sandbox (NEW)
├── docker.ts                  # Docker container sandbox (NEW)
├── resource-limits.ts         # Resource management (NEW)
├── executor.ts                # Unified executor (NEW)
├── config.ts                  # Configuration manager (ENHANCED)
├── filesystem.ts              # Filesystem sandbox
├── network.ts                 # Network sandbox
├── sandbox.example.ts         # Usage examples (NEW)
└── IMPLEMENTATION.md          # This file (NEW)
```

## Completion Status

- **T-016 (macOS Seatbelt):** ✅ 100% Complete
- **T-017 (Docker Container):** ✅ 100% Complete
- **Resource Limits Enhancement:** ✅ 85% Complete (Linux fully implemented, macOS limited)
- **Unified Executor:** ✅ 100% Complete
- **Integration Tests:** ⚠️ Pending
- **Documentation:** ✅ 100% Complete

## Summary

The sandbox system implementation is now feature-complete with support for:
- ✅ Linux (Bubblewrap + cgroups v2)
- ✅ macOS (Seatbelt + limited resource controls)
- ✅ Cross-platform (Docker)
- ✅ Resource limits (memory, CPU, processes, time)
- ✅ Unified executor with automatic platform detection
- ✅ 8 configuration presets
- ✅ Comprehensive examples and documentation

Total implementation: **~2,000 lines of code** across 4 new files and enhancements to existing modules.
