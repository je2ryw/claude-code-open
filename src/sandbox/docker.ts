/**
 * Docker Container Sandbox Implementation
 * Provides sandboxing using Docker containers with resource limits
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Type Definitions
// ============================================================================

export interface DockerOptions {
  /** Docker image to use */
  image?: string;
  /** Container name */
  containerName?: string;
  /** Volume mounts (host:container:mode) */
  volumes?: string[];
  /** Port mappings (host:container) */
  ports?: string[];
  /** Network mode */
  network?: string;
  /** User (uid:gid) */
  user?: string;
  /** Working directory in container */
  workdir?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Memory limit (e.g., "512m", "1g") */
  memory?: string;
  /** CPU limit (e.g., "0.5", "2.0") */
  cpus?: string;
  /** Read-only root filesystem */
  readOnly?: boolean;
  /** Remove container after execution */
  autoRemove?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Container entrypoint override */
  entrypoint?: string;
}

export interface DockerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxed: boolean;
  containerId?: string;
  duration?: number;
}

export interface DockerInfo {
  available: boolean;
  version?: string;
  images: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_OPTIONS: Required<Omit<DockerOptions, 'containerName' | 'entrypoint'>> = {
  image: 'node:20-alpine',
  volumes: [],
  ports: [],
  network: 'bridge',
  user: `${os.userInfo().uid}:${os.userInfo().gid}`,
  workdir: '/workspace',
  env: {},
  memory: '1g',
  cpus: '1.0',
  readOnly: false,
  autoRemove: true,
  timeout: 60000,
};

// ============================================================================
// Docker Availability
// ============================================================================

let dockerAvailable: boolean | null = null;
let dockerVersion: string | null = null;

/**
 * Check if Docker is available
 */
export function isDockerAvailable(): boolean {
  if (dockerAvailable !== null) {
    return dockerAvailable;
  }

  try {
    child_process.execSync('docker version', { stdio: 'ignore' });
    dockerAvailable = true;
  } catch {
    dockerAvailable = false;
  }

  return dockerAvailable;
}

/**
 * Get Docker version
 */
export function getDockerVersion(): string | null {
  if (dockerVersion !== null) {
    return dockerVersion;
  }

  if (!isDockerAvailable()) {
    return null;
  }

  try {
    const result = child_process.execSync('docker version --format "{{.Server.Version}}"', {
      encoding: 'utf-8',
    });
    dockerVersion = result.trim();
    return dockerVersion;
  } catch {
    return null;
  }
}

/**
 * List available Docker images
 */
export function listDockerImages(): string[] {
  if (!isDockerAvailable()) {
    return [];
  }

  try {
    const result = child_process.execSync('docker images --format "{{.Repository}}:{{.Tag}}"', {
      encoding: 'utf-8',
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Pull Docker image if not exists
 */
export async function pullDockerImage(image: string): Promise<boolean> {
  if (!isDockerAvailable()) {
    return false;
  }

  try {
    // Check if image exists locally
    const images = listDockerImages();
    if (images.includes(image)) {
      return true;
    }

    // Pull image
    console.log(`Pulling Docker image: ${image}...`);
    child_process.execSync(`docker pull ${image}`, {
      stdio: 'inherit',
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Docker Sandbox Class
// ============================================================================

export class DockerSandbox {
  private options: DockerOptions;

  /**
   * Check if Docker is available
   */
  static isAvailable(): boolean {
    return isDockerAvailable();
  }

  /**
   * Get Docker version
   */
  static getVersion(): string | null {
    return getDockerVersion();
  }

  constructor(options: DockerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Build docker run command arguments
   */
  private buildDockerArgs(command: string, args: string[] = []): string[] {
    const opts = this.options;
    const dockerArgs: string[] = ['run'];

    // Auto-remove container
    if (opts.autoRemove) {
      dockerArgs.push('--rm');
    }

    // Interactive + TTY
    dockerArgs.push('-i');

    // Container name
    if (opts.containerName) {
      dockerArgs.push('--name', opts.containerName);
    }

    // Resource limits
    if (opts.memory) {
      dockerArgs.push('--memory', opts.memory);
    }
    if (opts.cpus) {
      dockerArgs.push('--cpus', opts.cpus);
    }

    // Read-only filesystem
    if (opts.readOnly) {
      dockerArgs.push('--read-only');
      // Add tmpfs for /tmp
      dockerArgs.push('--tmpfs', '/tmp:rw,size=100m');
    }

    // Network
    if (opts.network) {
      dockerArgs.push('--network', opts.network);
    }

    // User
    if (opts.user) {
      dockerArgs.push('--user', opts.user);
    }

    // Working directory
    if (opts.workdir) {
      dockerArgs.push('-w', opts.workdir);
    }

    // Environment variables
    if (opts.env) {
      for (const [key, value] of Object.entries(opts.env)) {
        dockerArgs.push('-e', `${key}=${value}`);
      }
    }

    // Volume mounts
    if (opts.volumes && opts.volumes.length > 0) {
      for (const volume of opts.volumes) {
        dockerArgs.push('-v', volume);
      }
    } else {
      // Default: mount current directory
      const cwd = process.cwd();
      dockerArgs.push('-v', `${cwd}:${opts.workdir || '/workspace'}:rw`);
    }

    // Port mappings
    if (opts.ports && opts.ports.length > 0) {
      for (const port of opts.ports) {
        dockerArgs.push('-p', port);
      }
    }

    // Entrypoint override
    if (opts.entrypoint) {
      dockerArgs.push('--entrypoint', opts.entrypoint);
    }

    // Image
    dockerArgs.push(opts.image || DEFAULT_OPTIONS.image);

    // Command and args
    dockerArgs.push(command, ...args);

    return dockerArgs;
  }

  /**
   * Execute command in Docker container
   */
  async execute(command: string, args: string[] = []): Promise<DockerResult> {
    if (!isDockerAvailable()) {
      return this.executeFallback(command, args);
    }

    // Ensure image is available
    const imagePulled = await pullDockerImage(this.options.image || DEFAULT_OPTIONS.image);
    if (!imagePulled) {
      console.warn(`Failed to pull image: ${this.options.image}, falling back to unsandboxed`);
      return this.executeFallback(command, args);
    }

    const startTime = Date.now();
    const dockerArgs = this.buildDockerArgs(command, args);

    return new Promise((resolve) => {
      const proc = child_process.spawn('docker', dockerArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.options.timeout || DEFAULT_OPTIONS.timeout,
      });

      let stdout = '';
      let stderr = '';
      let containerId: string | undefined;

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          sandboxed: true,
          containerId,
          duration: Date.now() - startTime,
        });
      });

      proc.on('error', (err) => {
        // Fallback to unsandboxed execution
        this.executeFallback(command, args).then(resolve);
      });
    });
  }

  /**
   * Execute without Docker (fallback)
   */
  private async executeFallback(command: string, args: string[]): Promise<DockerResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = child_process.spawn(command, args, {
        env: this.options.env || process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.options.timeout || DEFAULT_OPTIONS.timeout,
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          sandboxed: false,
          duration: Date.now() - startTime,
        });
      });

      proc.on('error', (err) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
          sandboxed: false,
          duration: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Stop and remove container
   */
  async stop(containerId: string, force: boolean = false): Promise<void> {
    if (!isDockerAvailable()) {
      return;
    }

    try {
      const command = force ? 'kill' : 'stop';
      child_process.execSync(`docker ${command} ${containerId}`, {
        stdio: 'ignore',
      });

      // Remove container
      child_process.execSync(`docker rm ${containerId}`, {
        stdio: 'ignore',
      });
    } catch {
      // Ignore errors
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Execute command in Docker sandbox (convenience function)
 */
export async function execInDocker(
  command: string,
  args: string[] = [],
  options: DockerOptions = {}
): Promise<DockerResult> {
  const sandbox = new DockerSandbox(options);
  return sandbox.execute(command, args);
}

/**
 * Get Docker info
 */
export function getDockerInfo(): DockerInfo {
  return {
    available: isDockerAvailable(),
    version: getDockerVersion() || undefined,
    images: listDockerImages(),
  };
}

/**
 * Build a Docker image from Dockerfile
 */
export async function buildDockerImage(
  dockerfilePath: string,
  imageName: string,
  buildContext?: string
): Promise<boolean> {
  if (!isDockerAvailable()) {
    return false;
  }

  try {
    const context = buildContext || path.dirname(dockerfilePath);
    child_process.execSync(`docker build -t ${imageName} -f ${dockerfilePath} ${context}`, {
      stdio: 'inherit',
    });
    return true;
  } catch {
    return false;
  }
}
