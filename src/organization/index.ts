/**
 * Organization and Team Management
 * Enterprise features for team collaboration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Organization {
  id: string;
  name: string;
  uuid?: string;
  plan?: 'free' | 'pro' | 'enterprise';
  members?: TeamMember[];
  settings?: OrganizationSettings;
  createdAt?: number;
}

export interface TeamMember {
  id: string;
  email: string;
  name?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'pending' | 'suspended';
  joinedAt?: number;
}

export interface OrganizationSettings {
  allowedModels?: string[];
  maxTokensPerDay?: number;
  maxCostPerDay?: number;
  auditLogging?: boolean;
  ssoEnabled?: boolean;
  ipWhitelist?: string[];
  defaultPermissionMode?: string;
}

export interface TeamMailbox {
  id: string;
  organizationId: string;
  messages: TeamMessage[];
}

export interface TeamMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  content: string;
  timestamp: number;
  read: boolean;
}

// Storage paths
const ORG_DIR = path.join(os.homedir(), '.claude', 'organization');
const ORG_FILE = path.join(ORG_DIR, 'org.json');

// Current organization
let currentOrg: Organization | null = null;

/**
 * Initialize organization module
 */
export function initOrganization(): Organization | null {
  if (!fs.existsSync(ORG_DIR)) {
    fs.mkdirSync(ORG_DIR, { recursive: true });
  }

  // Check environment variables
  const orgId = process.env.CLAUDE_ORG_ID;
  const orgName = process.env.CLAUDE_ORG_NAME;

  if (orgId) {
    currentOrg = {
      id: orgId,
      name: orgName || 'Unknown Organization',
    };
    return currentOrg;
  }

  // Try to load from file
  if (fs.existsSync(ORG_FILE)) {
    try {
      currentOrg = JSON.parse(fs.readFileSync(ORG_FILE, 'utf-8'));
      return currentOrg;
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Get current organization
 */
export function getOrganization(): Organization | null {
  return currentOrg;
}

/**
 * Set organization
 */
export function setOrganization(org: Organization): void {
  currentOrg = org;

  if (!fs.existsSync(ORG_DIR)) {
    fs.mkdirSync(ORG_DIR, { recursive: true });
  }

  fs.writeFileSync(ORG_FILE, JSON.stringify(org, null, 2), { mode: 0o600 });
}

/**
 * Clear organization
 */
export function clearOrganization(): void {
  currentOrg = null;

  if (fs.existsSync(ORG_FILE)) {
    fs.unlinkSync(ORG_FILE);
  }
}

/**
 * Check if user is in an organization
 */
export function isInOrganization(): boolean {
  return currentOrg !== null;
}

/**
 * Get organization display name
 */
export function getOrganizationDisplayName(): string | null {
  return currentOrg?.name || null;
}

/**
 * Check organization permission
 */
export function checkOrganizationPermission(action: string): {
  allowed: boolean;
  reason?: string;
} {
  if (!currentOrg) {
    return { allowed: true };
  }

  const settings = currentOrg.settings;
  if (!settings) {
    return { allowed: true };
  }

  // Check model restrictions
  if (action.startsWith('use_model:')) {
    const model = action.replace('use_model:', '');
    if (settings.allowedModels && !settings.allowedModels.includes(model)) {
      return {
        allowed: false,
        reason: `Model ${model} is not allowed by organization policy`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Log audit event
 */
export function logAuditEvent(event: {
  action: string;
  userId?: string;
  details?: Record<string, unknown>;
  timestamp?: number;
}): void {
  if (!currentOrg?.settings?.auditLogging) {
    return;
  }

  const auditFile = path.join(ORG_DIR, 'audit.jsonl');
  const logEntry = {
    ...event,
    timestamp: event.timestamp || Date.now(),
    organizationId: currentOrg.id,
  };

  try {
    fs.appendFileSync(auditFile, JSON.stringify(logEntry) + '\n', { mode: 0o600 });
  } catch {
    // Ignore audit log errors
  }
}

/**
 * Get audit logs
 */
export function getAuditLogs(options?: {
  limit?: number;
  since?: number;
  action?: string;
}): Array<{
  action: string;
  userId?: string;
  details?: Record<string, unknown>;
  timestamp: number;
  organizationId: string;
}> {
  const auditFile = path.join(ORG_DIR, 'audit.jsonl');

  if (!fs.existsSync(auditFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(auditFile, 'utf-8');
    let logs = content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    // Apply filters
    if (options?.since) {
      logs = logs.filter((log) => log.timestamp >= options.since!);
    }

    if (options?.action) {
      logs = logs.filter((log) => log.action === options.action);
    }

    // Sort by timestamp descending
    logs.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (options?.limit) {
      logs = logs.slice(0, options.limit);
    }

    return logs;
  } catch {
    return [];
  }
}

/**
 * Team collaboration features
 */
export class TeamManager {
  private mailbox: TeamMailbox | null = null;

  constructor() {
    this.loadMailbox();
  }

  private loadMailbox(): void {
    const mailboxFile = path.join(ORG_DIR, 'mailbox.json');

    if (fs.existsSync(mailboxFile)) {
      try {
        this.mailbox = JSON.parse(fs.readFileSync(mailboxFile, 'utf-8'));
      } catch {
        // Ignore
      }
    }
  }

  private saveMailbox(): void {
    if (!this.mailbox) return;

    const mailboxFile = path.join(ORG_DIR, 'mailbox.json');
    fs.writeFileSync(mailboxFile, JSON.stringify(this.mailbox, null, 2), { mode: 0o600 });
  }

  /**
   * Send team message
   */
  sendMessage(to: string, subject: string, content: string): TeamMessage | null {
    if (!currentOrg) {
      return null;
    }

    if (!this.mailbox) {
      this.mailbox = {
        id: `mailbox_${Date.now()}`,
        organizationId: currentOrg.id,
        messages: [],
      };
    }

    const message: TeamMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from: process.env.USER || 'unknown',
      to,
      subject,
      content,
      timestamp: Date.now(),
      read: false,
    };

    this.mailbox.messages.push(message);
    this.saveMailbox();

    return message;
  }

  /**
   * Get unread messages
   */
  getUnreadMessages(): TeamMessage[] {
    return this.mailbox?.messages.filter((m) => !m.read) || [];
  }

  /**
   * Mark message as read
   */
  markAsRead(messageId: string): boolean {
    if (!this.mailbox) return false;

    const message = this.mailbox.messages.find((m) => m.id === messageId);
    if (message) {
      message.read = true;
      this.saveMailbox();
      return true;
    }

    return false;
  }

  /**
   * Get all messages
   */
  getAllMessages(): TeamMessage[] {
    return this.mailbox?.messages || [];
  }
}

// Default team manager
export const teamManager = new TeamManager();
