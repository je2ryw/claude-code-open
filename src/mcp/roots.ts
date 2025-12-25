/**
 * MCP Roots Module
 *
 * Manages root directories for MCP servers. Roots define the base directories
 * that servers can access, providing a sandboxing mechanism for file operations.
 *
 * Based on MCP Specification 2024-11-05
 */

import { EventEmitter } from 'events';
import { Root } from './protocol.js';
import path from 'path';
import fs from 'fs';

// ============ Type Definitions ============

/**
 * Root directory with metadata
 */
export interface RootInfo extends Root {
  uri: string;
  name?: string;
  // Additional metadata
  exists?: boolean;
  absolutePath?: string;
  permissions?: {
    read: boolean;
    write: boolean;
  };
}

/**
 * Roots configuration
 */
export interface RootsConfig {
  roots: Root[];
  allowDynamicRoots?: boolean;
  validatePaths?: boolean;
}

// ============ Roots Manager ============

/**
 * Manages root directories for MCP servers
 *
 * Features:
 * - Root directory registration and management
 * - Path validation and sandboxing
 * - Dynamic root addition/removal
 * - Event emission for root changes
 */
export class McpRootsManager extends EventEmitter {
  private roots: Map<string, RootInfo> = new Map();
  private config: {
    allowDynamicRoots: boolean;
    validatePaths: boolean;
  };

  constructor(config?: RootsConfig) {
    super();

    this.config = {
      allowDynamicRoots: config?.allowDynamicRoots ?? true,
      validatePaths: config?.validatePaths ?? true,
    };

    // Initialize with provided roots
    if (config?.roots) {
      config.roots.forEach(root => {
        this.addRoot(root);
      });
    }
  }

  // ============ Root Management ============

  /**
   * Add a root directory
   */
  addRoot(root: Root): RootInfo {
    // Parse URI
    const rootInfo = this.parseRoot(root);

    // Validate if enabled
    if (this.config.validatePaths && rootInfo.absolutePath) {
      this.validateRootPath(rootInfo.absolutePath);
    }

    // Store root
    this.roots.set(rootInfo.uri, rootInfo);

    this.emit('root:added', { root: rootInfo });

    return rootInfo;
  }

  /**
   * Remove a root directory
   */
  removeRoot(uri: string): boolean {
    const root = this.roots.get(uri);
    if (!root) {
      return false;
    }

    this.roots.delete(uri);
    this.emit('root:removed', { root });

    return true;
  }

  /**
   * Update a root directory
   */
  updateRoot(uri: string, updates: Partial<Root>): RootInfo | null {
    const existing = this.roots.get(uri);
    if (!existing) {
      return null;
    }

    const updated = this.parseRoot({
      ...existing,
      ...updates,
    });

    // Validate if path changed
    if (updates.uri && this.config.validatePaths && updated.absolutePath) {
      this.validateRootPath(updated.absolutePath);
    }

    this.roots.set(uri, updated);
    this.emit('root:updated', { root: updated, previous: existing });

    return updated;
  }

  /**
   * Get a root by URI
   */
  getRoot(uri: string): RootInfo | undefined {
    return this.roots.get(uri);
  }

  /**
   * Get all roots
   */
  getRoots(): RootInfo[] {
    return Array.from(this.roots.values());
  }

  /**
   * Get all roots as plain Root objects (for MCP protocol)
   */
  getRootsForProtocol(): Root[] {
    return this.getRoots().map(root => ({
      uri: root.uri,
      ...(root.name && { name: root.name }),
    }));
  }

  /**
   * Clear all roots
   */
  clearRoots(): void {
    const count = this.roots.size;
    this.roots.clear();
    this.emit('roots:cleared', { count });
  }

  /**
   * Check if a URI is registered as a root
   */
  hasRoot(uri: string): boolean {
    return this.roots.has(uri);
  }

  // ============ Path Operations ============

  /**
   * Parse a root and extract information
   */
  private parseRoot(root: Root): RootInfo {
    let absolutePath: string | undefined;
    let exists: boolean | undefined;
    let permissions: { read: boolean; write: boolean } | undefined;

    // Parse file:// URIs
    if (root.uri.startsWith('file://')) {
      try {
        absolutePath = this.uriToPath(root.uri);

        // Check if path exists
        if (this.config.validatePaths) {
          exists = fs.existsSync(absolutePath);

          // Check permissions
          if (exists) {
            try {
              fs.accessSync(absolutePath, fs.constants.R_OK);
              const read = true;

              let write = false;
              try {
                fs.accessSync(absolutePath, fs.constants.W_OK);
                write = true;
              } catch {
                // Not writable
              }

              permissions = { read, write };
            } catch {
              permissions = { read: false, write: false };
            }
          }
        }
      } catch (error) {
        // Invalid file URI
      }
    }

    return {
      ...root,
      absolutePath,
      exists,
      permissions,
    };
  }

  /**
   * Convert file:// URI to local path
   */
  private uriToPath(uri: string): string {
    if (!uri.startsWith('file://')) {
      throw new Error(`Invalid file URI: ${uri}`);
    }

    // Remove file:// prefix
    let path = uri.slice(7);

    // Handle Windows paths (file:///C:/...)
    if (process.platform === 'win32') {
      if (path.startsWith('/') && path[2] === ':') {
        path = path.slice(1);
      }
    }

    // Decode URI components
    path = decodeURIComponent(path);

    return path;
  }

  /**
   * Convert local path to file:// URI
   */
  private pathToUri(filePath: string): string {
    let uri = 'file://';

    // Convert to absolute path
    const absolute = path.resolve(filePath);

    // Handle Windows paths
    if (process.platform === 'win32') {
      // C:\path -> file:///C:/path
      uri += '/' + absolute.replace(/\\/g, '/');
    } else {
      // /path -> file:///path
      uri += absolute;
    }

    // Encode URI components
    uri = encodeURI(uri);

    return uri;
  }

  /**
   * Validate a root path
   */
  private validateRootPath(rootPath: string): void {
    // Check if path exists
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Root path does not exist: ${rootPath}`);
    }

    // Check if it's a directory
    const stats = fs.statSync(rootPath);
    if (!stats.isDirectory()) {
      throw new Error(`Root path is not a directory: ${rootPath}`);
    }

    // Check if readable
    try {
      fs.accessSync(rootPath, fs.constants.R_OK);
    } catch {
      throw new Error(`Root path is not readable: ${rootPath}`);
    }
  }

  /**
   * Check if a path is within any root
   */
  isPathInRoots(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);

    for (const root of this.roots.values()) {
      if (root.absolutePath && this.isPathInRoot(absolutePath, root.absolutePath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a path is within a specific root
   */
  isPathInRoot(filePath: string, rootPath: string): boolean {
    const absolutePath = path.resolve(filePath);
    const absoluteRoot = path.resolve(rootPath);

    // Normalize paths
    const normalizedPath = path.normalize(absolutePath);
    const normalizedRoot = path.normalize(absoluteRoot);

    // Check if path starts with root
    return normalizedPath.startsWith(normalizedRoot + path.sep) ||
           normalizedPath === normalizedRoot;
  }

  /**
   * Get the root that contains a path
   */
  getRootForPath(filePath: string): RootInfo | null {
    const absolutePath = path.resolve(filePath);

    for (const root of this.roots.values()) {
      if (root.absolutePath && this.isPathInRoot(absolutePath, root.absolutePath)) {
        return root;
      }
    }

    return null;
  }

  /**
   * Resolve a relative path against roots
   */
  resolvePath(relativePath: string): string | null {
    for (const root of this.roots.values()) {
      if (root.absolutePath) {
        const resolved = path.join(root.absolutePath, relativePath);
        if (fs.existsSync(resolved)) {
          return resolved;
        }
      }
    }

    return null;
  }

  // ============ Dynamic Roots ============

  /**
   * Add a root from a local path
   */
  addRootFromPath(filePath: string, name?: string): RootInfo {
    if (!this.config.allowDynamicRoots) {
      throw new Error('Dynamic roots are not allowed');
    }

    const uri = this.pathToUri(filePath);
    const root: Root = {
      uri,
      ...(name && { name }),
    };

    return this.addRoot(root);
  }

  /**
   * Add the current working directory as a root
   */
  addCwdRoot(name: string = 'Current Directory'): RootInfo {
    return this.addRootFromPath(process.cwd(), name);
  }

  /**
   * Add home directory as a root
   */
  addHomeRoot(name: string = 'Home Directory'): RootInfo {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) {
      throw new Error('Could not determine home directory');
    }

    return this.addRootFromPath(home, name);
  }

  // ============ Statistics ============

  /**
   * Get statistics about roots
   */
  getStats() {
    const roots = this.getRoots();

    return {
      totalRoots: roots.length,
      existingRoots: roots.filter(r => r.exists).length,
      readableRoots: roots.filter(r => r.permissions?.read).length,
      writableRoots: roots.filter(r => r.permissions?.write).length,
      allowDynamicRoots: this.config.allowDynamicRoots,
      validatePaths: this.config.validatePaths,
    };
  }

  /**
   * Refresh root information (check existence and permissions)
   */
  refreshRoots(): void {
    const roots = Array.from(this.roots.values());

    for (const root of roots) {
      const updated = this.parseRoot(root);
      this.roots.set(root.uri, updated);
    }

    this.emit('roots:refreshed', { count: roots.length });
  }
}

// ============ Helper Functions ============

/**
 * Create a root from a file path
 */
export function createRootFromPath(filePath: string, name?: string): Root {
  const uri = path.isAbsolute(filePath)
    ? `file://${filePath}`
    : `file://${path.resolve(filePath)}`;

  return {
    uri,
    ...(name && { name }),
  };
}

/**
 * Create default roots configuration
 */
export function getDefaultRootsConfig(): RootsConfig {
  return {
    roots: [
      createRootFromPath(process.cwd(), 'Current Directory'),
    ],
    allowDynamicRoots: true,
    validatePaths: true,
  };
}

/**
 * Normalize a file path for comparison
 */
export function normalizePath(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}
