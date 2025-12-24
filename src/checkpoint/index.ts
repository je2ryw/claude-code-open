/**
 * File Checkpointing System
 * Save and restore file states during editing sessions
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface FileCheckpoint {
  path: string;
  content: string;
  hash: string;
  timestamp: number;
  metadata?: {
    mode?: number;
    uid?: number;
    gid?: number;
  };
}

export interface CheckpointSession {
  id: string;
  startTime: number;
  workingDirectory: string;
  checkpoints: Map<string, FileCheckpoint[]>;
  currentIndex: Map<string, number>;
}

// Checkpoint storage directory
const CHECKPOINT_DIR = path.join(os.homedir(), '.claude', 'checkpoints');
const MAX_CHECKPOINTS_PER_FILE = 50;
const CHECKPOINT_RETENTION_DAYS = 7;

// Current session
let currentSession: CheckpointSession | null = null;

/**
 * Initialize checkpoint system
 */
export function initCheckpoints(sessionId?: string): CheckpointSession {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }

  currentSession = {
    id: sessionId || generateSessionId(),
    startTime: Date.now(),
    workingDirectory: process.cwd(),
    checkpoints: new Map(),
    currentIndex: new Map(),
  };

  // Clean up old checkpoints
  cleanupOldCheckpoints();

  return currentSession;
}

/**
 * Generate session ID
 */
function generateSessionId(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Get content hash
 */
function getContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Create a checkpoint for a file
 */
export function createCheckpoint(filePath: string): FileCheckpoint | null {
  if (!currentSession) {
    initCheckpoints();
  }

  const absolutePath = path.resolve(filePath);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const stats = fs.statSync(absolutePath);
    const hash = getContentHash(content);

    // Check if content is different from last checkpoint
    const existingCheckpoints = currentSession!.checkpoints.get(absolutePath) || [];
    if (existingCheckpoints.length > 0) {
      const lastCheckpoint = existingCheckpoints[existingCheckpoints.length - 1];
      if (lastCheckpoint.hash === hash) {
        // Content unchanged, skip
        return lastCheckpoint;
      }
    }

    const checkpoint: FileCheckpoint = {
      path: absolutePath,
      content,
      hash,
      timestamp: Date.now(),
      metadata: {
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
      },
    };

    // Add to session
    if (!currentSession!.checkpoints.has(absolutePath)) {
      currentSession!.checkpoints.set(absolutePath, []);
    }

    const checkpoints = currentSession!.checkpoints.get(absolutePath)!;
    checkpoints.push(checkpoint);

    // Limit checkpoints
    if (checkpoints.length > MAX_CHECKPOINTS_PER_FILE) {
      checkpoints.shift();
    }

    // Update index
    currentSession!.currentIndex.set(absolutePath, checkpoints.length - 1);

    // Persist checkpoint
    saveCheckpointToDisk(checkpoint);

    return checkpoint;
  } catch (err) {
    console.error(`Failed to create checkpoint for ${filePath}:`, err);
    return null;
  }
}

/**
 * Save checkpoint to disk
 */
function saveCheckpointToDisk(checkpoint: FileCheckpoint): void {
  if (!currentSession) return;

  const sessionDir = path.join(CHECKPOINT_DIR, currentSession.id);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // Use hash of file path as filename
  const fileHash = getContentHash(checkpoint.path);
  const checkpointFile = path.join(
    sessionDir,
    `${fileHash}-${checkpoint.timestamp}.json`
  );

  fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2), {
    mode: 0o600,
  });
}

/**
 * Restore file from checkpoint
 */
export function restoreCheckpoint(
  filePath: string,
  index?: number
): { success: boolean; message: string } {
  if (!currentSession) {
    return { success: false, message: 'No active checkpoint session' };
  }

  const absolutePath = path.resolve(filePath);
  const checkpoints = currentSession.checkpoints.get(absolutePath);

  if (!checkpoints || checkpoints.length === 0) {
    return { success: false, message: 'No checkpoints found for this file' };
  }

  const targetIndex = index ?? currentSession.currentIndex.get(absolutePath) ?? checkpoints.length - 1;

  if (targetIndex < 0 || targetIndex >= checkpoints.length) {
    return { success: false, message: 'Invalid checkpoint index' };
  }

  const checkpoint = checkpoints[targetIndex];

  try {
    // Create backup of current state first
    if (fs.existsSync(absolutePath)) {
      createCheckpoint(absolutePath);
    }

    // Restore content
    fs.writeFileSync(absolutePath, checkpoint.content);

    // Restore metadata if possible
    if (checkpoint.metadata?.mode) {
      try {
        fs.chmodSync(absolutePath, checkpoint.metadata.mode);
      } catch {
        // Ignore permission errors
      }
    }

    currentSession.currentIndex.set(absolutePath, targetIndex);

    return {
      success: true,
      message: `Restored to checkpoint from ${new Date(checkpoint.timestamp).toLocaleString()}`,
    };
  } catch (err) {
    return { success: false, message: `Failed to restore: ${err}` };
  }
}

/**
 * Undo last change (go to previous checkpoint)
 */
export function undo(filePath: string): { success: boolean; message: string } {
  if (!currentSession) {
    return { success: false, message: 'No active checkpoint session' };
  }

  const absolutePath = path.resolve(filePath);
  const checkpoints = currentSession.checkpoints.get(absolutePath);

  if (!checkpoints || checkpoints.length === 0) {
    return { success: false, message: 'No checkpoints available' };
  }

  const currentIndex = currentSession.currentIndex.get(absolutePath) ?? checkpoints.length - 1;

  if (currentIndex <= 0) {
    return { success: false, message: 'Already at oldest checkpoint' };
  }

  return restoreCheckpoint(absolutePath, currentIndex - 1);
}

/**
 * Redo (go to next checkpoint)
 */
export function redo(filePath: string): { success: boolean; message: string } {
  if (!currentSession) {
    return { success: false, message: 'No active checkpoint session' };
  }

  const absolutePath = path.resolve(filePath);
  const checkpoints = currentSession.checkpoints.get(absolutePath);

  if (!checkpoints || checkpoints.length === 0) {
    return { success: false, message: 'No checkpoints available' };
  }

  const currentIndex = currentSession.currentIndex.get(absolutePath) ?? checkpoints.length - 1;

  if (currentIndex >= checkpoints.length - 1) {
    return { success: false, message: 'Already at newest checkpoint' };
  }

  return restoreCheckpoint(absolutePath, currentIndex + 1);
}

/**
 * Get checkpoint history for a file
 */
export function getCheckpointHistory(filePath: string): {
  checkpoints: Array<{
    index: number;
    timestamp: number;
    hash: string;
    current: boolean;
  }>;
  currentIndex: number;
} {
  if (!currentSession) {
    return { checkpoints: [], currentIndex: -1 };
  }

  const absolutePath = path.resolve(filePath);
  const checkpoints = currentSession.checkpoints.get(absolutePath) || [];
  const currentIndex = currentSession.currentIndex.get(absolutePath) ?? checkpoints.length - 1;

  return {
    checkpoints: checkpoints.map((cp, idx) => ({
      index: idx,
      timestamp: cp.timestamp,
      hash: cp.hash,
      current: idx === currentIndex,
    })),
    currentIndex,
  };
}

/**
 * Get diff between two checkpoints
 */
export function getCheckpointDiff(
  filePath: string,
  fromIndex: number,
  toIndex: number
): { added: number; removed: number; diff: string } | null {
  if (!currentSession) {
    return null;
  }

  const absolutePath = path.resolve(filePath);
  const checkpoints = currentSession.checkpoints.get(absolutePath);

  if (!checkpoints || fromIndex < 0 || toIndex >= checkpoints.length) {
    return null;
  }

  const fromContent = checkpoints[fromIndex].content;
  const toContent = checkpoints[toIndex].content;

  // Simple line-based diff
  const fromLines = fromContent.split('\n');
  const toLines = toContent.split('\n');

  let added = 0;
  let removed = 0;
  const diffLines: string[] = [];

  // Very simple diff - just count line changes
  const maxLines = Math.max(fromLines.length, toLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (i >= fromLines.length) {
      added++;
      diffLines.push(`+ ${toLines[i]}`);
    } else if (i >= toLines.length) {
      removed++;
      diffLines.push(`- ${fromLines[i]}`);
    } else if (fromLines[i] !== toLines[i]) {
      removed++;
      added++;
      diffLines.push(`- ${fromLines[i]}`);
      diffLines.push(`+ ${toLines[i]}`);
    }
  }

  return {
    added,
    removed,
    diff: diffLines.join('\n'),
  };
}

/**
 * Clean up old checkpoints
 */
function cleanupOldCheckpoints(): void {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    return;
  }

  const cutoffTime = Date.now() - CHECKPOINT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  try {
    const sessions = fs.readdirSync(CHECKPOINT_DIR);

    for (const sessionDir of sessions) {
      const sessionPath = path.join(CHECKPOINT_DIR, sessionDir);
      const stats = fs.statSync(sessionPath);

      if (stats.isDirectory() && stats.mtimeMs < cutoffTime) {
        // Remove old session directory
        fs.rmSync(sessionPath, { recursive: true });
      }
    }
  } catch (err) {
    // Ignore cleanup errors
  }
}

/**
 * Export checkpoint session
 */
export function exportCheckpointSession(): object | null {
  if (!currentSession) {
    return null;
  }

  const exported: Record<string, FileCheckpoint[]> = {};

  for (const [filePath, checkpoints] of currentSession.checkpoints) {
    exported[filePath] = checkpoints;
  }

  return {
    id: currentSession.id,
    startTime: currentSession.startTime,
    workingDirectory: currentSession.workingDirectory,
    files: exported,
  };
}

/**
 * Clear all checkpoints for current session
 */
export function clearCheckpoints(): void {
  if (!currentSession) {
    return;
  }

  currentSession.checkpoints.clear();
  currentSession.currentIndex.clear();

  // Remove session directory
  const sessionDir = path.join(CHECKPOINT_DIR, currentSession.id);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true });
  }
}

/**
 * Get current session
 */
export function getCurrentSession(): CheckpointSession | null {
  return currentSession;
}

/**
 * End current checkpoint session
 */
export function endCheckpointSession(): void {
  currentSession = null;
}
