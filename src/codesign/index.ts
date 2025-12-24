/**
 * Code Signing System
 * Sign and verify code for security
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CodeSignature {
  hash: string;
  algorithm: 'sha256' | 'sha384' | 'sha512';
  timestamp: number;
  signedBy?: string;
  signature?: string;
}

export interface SignedFile {
  path: string;
  content: string;
  signature: CodeSignature;
}

export interface SigningKey {
  id: string;
  publicKey: string;
  privateKey?: string;
  createdAt: number;
  name?: string;
}

// Storage paths
const SIGNING_DIR = path.join(os.homedir(), '.claude', 'signing');
const KEYS_FILE = path.join(SIGNING_DIR, 'keys.json');
const SIGNATURES_FILE = path.join(SIGNING_DIR, 'signatures.json');

// Signature cache
const signatureCache = new Map<string, CodeSignature>();

/**
 * Initialize signing system
 */
export function initSigning(): void {
  if (!fs.existsSync(SIGNING_DIR)) {
    fs.mkdirSync(SIGNING_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Generate a new signing key pair
 */
export function generateKeyPair(): SigningKey {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const key: SigningKey = {
    id: crypto.randomBytes(16).toString('hex'),
    publicKey,
    privateKey,
    createdAt: Date.now(),
  };

  // Save to file
  saveKey(key);

  return key;
}

/**
 * Save signing key
 */
function saveKey(key: SigningKey): void {
  initSigning();

  let keys: SigningKey[] = [];
  if (fs.existsSync(KEYS_FILE)) {
    try {
      keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
    } catch {
      keys = [];
    }
  }

  // Remove existing key with same ID
  keys = keys.filter((k) => k.id !== key.id);
  keys.push(key);

  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
}

/**
 * Load signing keys
 */
export function loadKeys(): SigningKey[] {
  if (!fs.existsSync(KEYS_FILE)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Get key by ID
 */
export function getKey(id: string): SigningKey | null {
  const keys = loadKeys();
  return keys.find((k) => k.id === id) || null;
}

/**
 * Hash file content
 */
export function hashContent(content: string, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'): string {
  return crypto.createHash(algorithm).update(content).digest('hex');
}

/**
 * Sign content with private key
 */
export function signContent(content: string, key: SigningKey): CodeSignature | null {
  if (!key.privateKey) {
    return null;
  }

  const hash = hashContent(content);

  try {
    const sign = crypto.createSign('ed25519');
    sign.update(hash);
    const signature = sign.sign(key.privateKey, 'base64');

    return {
      hash,
      algorithm: 'sha256',
      timestamp: Date.now(),
      signedBy: key.id,
      signature,
    };
  } catch {
    return null;
  }
}

/**
 * Verify signature
 */
export function verifySignature(content: string, signature: CodeSignature): boolean {
  if (!signature.signature || !signature.signedBy) {
    return false;
  }

  const key = getKey(signature.signedBy);
  if (!key) {
    return false;
  }

  const hash = hashContent(content, signature.algorithm);
  if (hash !== signature.hash) {
    return false;
  }

  try {
    const verify = crypto.createVerify('ed25519');
    verify.update(hash);
    return verify.verify(key.publicKey, signature.signature, 'base64');
  } catch {
    return false;
  }
}

/**
 * Sign a file
 */
export function signFile(filePath: string, keyId?: string): SignedFile | null {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');

  // Get signing key
  let key: SigningKey | null = null;
  if (keyId) {
    key = getKey(keyId);
  } else {
    const keys = loadKeys();
    key = keys.find((k) => k.privateKey) || null;
  }

  if (!key) {
    // Create hash-only signature
    const signature: CodeSignature = {
      hash: hashContent(content),
      algorithm: 'sha256',
      timestamp: Date.now(),
    };

    signatureCache.set(absolutePath, signature);
    saveSignatures();

    return {
      path: absolutePath,
      content,
      signature,
    };
  }

  const signature = signContent(content, key);
  if (!signature) {
    return null;
  }

  signatureCache.set(absolutePath, signature);
  saveSignatures();

  return {
    path: absolutePath,
    content,
    signature,
  };
}

/**
 * Verify a file's signature
 */
export function verifyFile(filePath: string): {
  valid: boolean;
  reason?: string;
  signature?: CodeSignature;
} {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    return { valid: false, reason: 'File not found' };
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');

  // Check cache first
  let signature = signatureCache.get(absolutePath);

  // Load from file if not in cache
  if (!signature) {
    loadSignatures();
    signature = signatureCache.get(absolutePath);
  }

  if (!signature) {
    return { valid: false, reason: 'No signature found' };
  }

  // Verify hash
  const currentHash = hashContent(content, signature.algorithm);
  if (currentHash !== signature.hash) {
    return {
      valid: false,
      reason: 'File has been modified',
      signature,
    };
  }

  // Verify cryptographic signature if present
  if (signature.signature) {
    const cryptoValid = verifySignature(content, signature);
    if (!cryptoValid) {
      return {
        valid: false,
        reason: 'Cryptographic signature invalid',
        signature,
      };
    }
  }

  return { valid: true, signature };
}

/**
 * Save signatures to file
 */
function saveSignatures(): void {
  initSigning();

  const signatures: Record<string, CodeSignature> = {};
  for (const [filePath, signature] of signatureCache) {
    signatures[filePath] = signature;
  }

  fs.writeFileSync(SIGNATURES_FILE, JSON.stringify(signatures, null, 2), { mode: 0o600 });
}

/**
 * Load signatures from file
 */
function loadSignatures(): void {
  if (!fs.existsSync(SIGNATURES_FILE)) {
    return;
  }

  try {
    const signatures = JSON.parse(fs.readFileSync(SIGNATURES_FILE, 'utf-8'));
    for (const [filePath, signature] of Object.entries(signatures)) {
      signatureCache.set(filePath, signature as CodeSignature);
    }
  } catch {
    // Ignore
  }
}

/**
 * Clear signature for a file
 */
export function clearSignature(filePath: string): void {
  const absolutePath = path.resolve(filePath);
  signatureCache.delete(absolutePath);
  saveSignatures();
}

/**
 * Get all signed files
 */
export function getSignedFiles(): Array<{ path: string; signature: CodeSignature }> {
  loadSignatures();
  return Array.from(signatureCache.entries()).map(([path, signature]) => ({
    path,
    signature,
  }));
}

/**
 * Check if file is signed
 */
export function isSigned(filePath: string): boolean {
  const absolutePath = path.resolve(filePath);
  loadSignatures();
  return signatureCache.has(absolutePath);
}

/**
 * Watch for file changes and invalidate signatures
 */
export function watchAndInvalidate(filePath: string): fs.FSWatcher | null {
  const absolutePath = path.resolve(filePath);

  try {
    return fs.watch(absolutePath, () => {
      clearSignature(absolutePath);
    });
  } catch {
    return null;
  }
}
