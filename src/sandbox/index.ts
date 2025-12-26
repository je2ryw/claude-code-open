/**
 * Sandbox Module
 * Provides sandboxing capabilities for filesystem, network, and process isolation
 */

// Filesystem sandbox
export {
  FilesystemSandbox,
  createDefaultPolicy,
  createPermissivePolicy,
  createStrictPolicy,
  validatePolicy,
  mergePolicies,
  matchPathPattern,
  isPathInside,
  getSandboxStats,
} from './filesystem.js';

export type {
  PathRule,
  FilesystemPolicy,
  SandboxedFs,
  SandboxStats,
} from './filesystem.js';

// Bubblewrap (Linux process isolation)
export {
  isBubblewrapAvailable,
  buildBwrapArgs,
  execInSandbox,
  createSandboxedBash,
  getSandboxCapabilities as getBubblewrapCapabilities,
  getRecommendedSandbox,
  getSandboxInfo,
} from './bubblewrap.js';

export type {
  BubblewrapConfig,
  SandboxResult,
} from './bubblewrap.js';

// Network sandbox
export {
  NetworkSandbox,
  parseUrl,
  matchDomainPattern,
  createRestrictiveSandbox,
  createPermissiveSandbox,
  createUnrestrictedSandbox,
} from './network.js';

export type {
  NetworkPolicy,
  ParsedUrl,
  NetworkRequest,
  NetworkStats,
  SandboxedHttp,
} from './network.js';

// Seatbelt (macOS sandbox)
export {
  SeatbeltSandbox,
  generateSeatbeltProfile,
  execInSeatbelt,
  getSeatbeltInfo,
} from './seatbelt.js';

export type {
  SeatbeltOptions,
  SeatbeltResult,
} from './seatbelt.js';

// Docker sandbox
export {
  DockerSandbox,
  isDockerAvailable,
  getDockerVersion,
  listDockerImages,
  pullDockerImage,
  execInDocker,
  getDockerInfo,
  buildDockerImage,
} from './docker.js';

export type {
  DockerOptions,
  DockerResult,
  DockerInfo,
} from './docker.js';

// Resource limits
export {
  ResourceLimiter,
  isCgroupsV2Available,
  applyCgroupLimits,
  cleanupCgroup,
  getCgroupUsage,
  buildUlimitArgs,
  execWithUlimit,
  applyMacOSLimits,
  parseMemoryString,
  formatBytes,
} from './resource-limits.js';

export type {
  ResourceLimits,
  ResourceUsage,
} from './resource-limits.js';

// Unified executor
export {
  SandboxExecutor,
  executeInSandbox,
  detectBestSandbox,
  getSandboxCapabilities,
} from './executor.js';

export type {
  ExecutorResult,
  ExecutorOptions,
} from './executor.js';

// Configuration management
export {
  SandboxConfigManager,
  sandboxConfigManager,
  getRecommendedPreset,
  createConfigFromPreset,
  sanitizePaths,
  SANDBOX_PRESETS,
} from './config.js';

export type {
  SandboxConfig,
  ValidationResult,
} from './config.js';
