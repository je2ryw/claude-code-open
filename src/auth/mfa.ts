/**
 * 多因素认证 (MFA/2FA) 模块
 *
 * 功能特性:
 * - TOTP 支持 (Time-based One-Time Password)
 * - 短信/邮件验证码
 * - 硬件密钥支持 (WebAuthn/FIDO2)
 * - 恢复代码机制
 * - MFA 配置管理
 * - 认证设备管理
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============ 类型定义 ============

export type MFAMethod = 'totp' | 'sms' | 'email' | 'webauthn';

export interface MFAConfig {
  enabled: boolean;
  methods: MFAMethod[];
  preferredMethod?: MFAMethod;
  requireMFA: boolean; // 是否强制要求 MFA
  trustedDevices: TrustedDevice[];
  createdAt: number;
  updatedAt: number;
}

export interface TOTPSecret {
  secret: string; // Base32 encoded secret
  qrCodeUrl?: string; // otpauth:// URL for QR code
  backupCodes: string[]; // 恢复代码
  verified: boolean; // 是否已验证
  createdAt: number;
}

export interface SMSConfig {
  phoneNumber: string;
  countryCode: string;
  verified: boolean;
  lastSentAt?: number;
}

export interface EmailConfig {
  email: string;
  verified: boolean;
  lastSentAt?: number;
}

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
  deviceName: string;
  createdAt: number;
}

export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  platform: string;
  browser?: string;
  ipAddress?: string;
  lastUsed: number;
  createdAt: number;
  expiresAt: number; // 信任过期时间（默认30天）
}

export interface MFAVerificationRequest {
  method: MFAMethod;
  code?: string; // TOTP/SMS/Email 验证码
  credentialId?: string; // WebAuthn credential ID
  signature?: string; // WebAuthn signature
  trustDevice?: boolean; // 是否信任此设备
}

export interface MFAVerificationResult {
  success: boolean;
  method: MFAMethod;
  deviceId?: string; // 如果选择信任设备
  expiresAt?: number; // 信任过期时间
  error?: string;
}

// ============ 常量配置 ============

const MFA_DIR = path.join(os.homedir(), '.claude', 'mfa');
const MFA_CONFIG_FILE = path.join(MFA_DIR, 'config.json');
const TOTP_FILE = path.join(MFA_DIR, 'totp.json');
const WEBAUTHN_FILE = path.join(MFA_DIR, 'webauthn.json');

// TOTP 配置
const TOTP_WINDOW = 1; // 允许前后1个时间窗口（±30秒）
const TOTP_STEP = 30; // 30秒为一个周期
const TOTP_DIGITS = 6; // 6位数字

// 恢复代码配置
const RECOVERY_CODE_COUNT = 10; // 生成10个恢复代码
const RECOVERY_CODE_LENGTH = 8; // 每个恢复代码8位

// 设备信任配置
const DEVICE_TRUST_DURATION = 30 * 24 * 60 * 60 * 1000; // 30天

// 加密密钥（基于机器特征生成）
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(os.hostname() + os.userInfo().username + 'mfa')
  .digest();

// ============ 加密工具函数 ============

/**
 * 加密数据
 */
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 解密数据
 */
function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============ TOTP 实现 ============

/**
 * 生成 Base32 编码的随机密钥
 */
function generateTOTPSecret(): string {
  const buffer = crypto.randomBytes(20); // 160 bits
  return base32Encode(buffer);
}

/**
 * Base32 编码
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Base32 解码
 */
function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  str = str.toUpperCase().replace(/=+$/, '');

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < str.length; i++) {
    const idx = alphabet.indexOf(str[i]);
    if (idx === -1) throw new Error('Invalid base32 character');

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * 生成 TOTP 码
 */
function generateTOTP(secret: string, time?: number): string {
  const epoch = Math.floor((time || Date.now()) / 1000);
  const counter = Math.floor(epoch / TOTP_STEP);

  // 将计数器转换为 8 字节大端序
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  // 解码 base32 密钥
  const key = base32Decode(secret);

  // HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buffer);
  const hash = hmac.digest();

  // 动态截断
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * 验证 TOTP 码
 */
function verifyTOTP(secret: string, token: string, window = TOTP_WINDOW): boolean {
  const now = Date.now();

  // 检查当前时间窗口以及前后 window 个窗口
  for (let i = -window; i <= window; i++) {
    const time = now + i * TOTP_STEP * 1000;
    const expectedToken = generateTOTP(secret, time);

    if (constantTimeCompare(token, expectedToken)) {
      return true;
    }
  }

  return false;
}

/**
 * 常量时间比较（防止时序攻击）
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * 生成 TOTP QR Code URL
 */
function generateTOTPUrl(secret: string, accountName: string, issuer = 'Claude Code'): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: TOTP_DIGITS.toString(),
    period: TOTP_STEP.toString(),
  });

  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params.toString()}`;
}

// ============ 恢复代码 ============

/**
 * 生成恢复代码
 */
function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    let code = '';
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    codes.push(code);
  }

  return codes;
}

/**
 * 验证并消费恢复代码
 */
function verifyRecoveryCode(code: string, availableCodes: string[]): boolean {
  const index = availableCodes.findIndex(c => constantTimeCompare(c, code.toUpperCase()));
  if (index !== -1) {
    // 消费此代码
    availableCodes.splice(index, 1);
    return true;
  }
  return false;
}

// ============ 设备信任 ============

/**
 * 生成设备标识
 */
function generateDeviceId(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 创建受信任设备记录
 */
function createTrustedDevice(deviceName?: string): TrustedDevice {
  return {
    deviceId: generateDeviceId(),
    deviceName: deviceName || 'Unknown Device',
    platform: os.platform(),
    lastUsed: Date.now(),
    createdAt: Date.now(),
    expiresAt: Date.now() + DEVICE_TRUST_DURATION,
  };
}

/**
 * 验证设备是否受信任
 */
function isDeviceTrusted(deviceId: string, trustedDevices: TrustedDevice[]): boolean {
  const device = trustedDevices.find(d => d.deviceId === deviceId);
  if (!device) {
    return false;
  }

  // 检查是否过期
  if (device.expiresAt < Date.now()) {
    return false;
  }

  // 更新最后使用时间
  device.lastUsed = Date.now();

  return true;
}

// ============ MFA 配置管理 ============

/**
 * 初始化 MFA 配置
 */
export function initMFAConfig(): MFAConfig {
  if (!fs.existsSync(MFA_DIR)) {
    fs.mkdirSync(MFA_DIR, { recursive: true });
  }

  if (fs.existsSync(MFA_CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(MFA_CONFIG_FILE, 'utf-8'));
      return data as MFAConfig;
    } catch (err) {
      // 配置文件损坏，创建新的
    }
  }

  const config: MFAConfig = {
    enabled: false,
    methods: [],
    requireMFA: false,
    trustedDevices: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  saveMFAConfig(config);
  return config;
}

/**
 * 保存 MFA 配置
 */
export function saveMFAConfig(config: MFAConfig): void {
  if (!fs.existsSync(MFA_DIR)) {
    fs.mkdirSync(MFA_DIR, { recursive: true });
  }

  config.updatedAt = Date.now();

  fs.writeFileSync(
    MFA_CONFIG_FILE,
    JSON.stringify(config, null, 2),
    { mode: 0o600 }
  );
}

/**
 * 获取 MFA 配置
 */
export function getMFAConfig(): MFAConfig {
  return initMFAConfig();
}

/**
 * 检查 MFA 是否启用
 */
export function isMFAEnabled(): boolean {
  const config = getMFAConfig();
  return config.enabled && config.methods.length > 0;
}

// ============ TOTP 管理 ============

/**
 * 设置 TOTP
 */
export function setupTOTP(accountName: string): TOTPSecret {
  const secret = generateTOTPSecret();
  const qrCodeUrl = generateTOTPUrl(secret, accountName);
  const backupCodes = generateRecoveryCodes();

  const totpData: TOTPSecret = {
    secret: encrypt(secret),
    qrCodeUrl,
    backupCodes: backupCodes.map(code => encrypt(code)),
    verified: false,
    createdAt: Date.now(),
  };

  // 保存到文件
  if (!fs.existsSync(MFA_DIR)) {
    fs.mkdirSync(MFA_DIR, { recursive: true });
  }

  fs.writeFileSync(
    TOTP_FILE,
    JSON.stringify(totpData, null, 2),
    { mode: 0o600 }
  );

  return {
    secret,
    qrCodeUrl,
    backupCodes,
    verified: false,
    createdAt: totpData.createdAt,
  };
}

/**
 * 验证 TOTP 设置
 */
export function verifyTOTPSetup(code: string): boolean {
  if (!fs.existsSync(TOTP_FILE)) {
    return false;
  }

  try {
    const data = JSON.parse(fs.readFileSync(TOTP_FILE, 'utf-8')) as TOTPSecret;
    const secret = decrypt(data.secret);

    if (verifyTOTP(secret, code)) {
      // 标记为已验证
      data.verified = true;
      fs.writeFileSync(TOTP_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });

      // 启用 MFA
      const config = getMFAConfig();
      if (!config.methods.includes('totp')) {
        config.methods.push('totp');
        config.enabled = true;
        config.preferredMethod = 'totp';
        saveMFAConfig(config);
      }

      return true;
    }
  } catch (err) {
    console.error('TOTP verification error:', err);
  }

  return false;
}

/**
 * 获取 TOTP 配置
 */
export function getTOTPConfig(): TOTPSecret | null {
  if (!fs.existsSync(TOTP_FILE)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(TOTP_FILE, 'utf-8')) as TOTPSecret;
    return {
      secret: decrypt(data.secret),
      qrCodeUrl: data.qrCodeUrl,
      backupCodes: data.backupCodes.map(code => decrypt(code)),
      verified: data.verified,
      createdAt: data.createdAt,
    };
  } catch (err) {
    return null;
  }
}

/**
 * 禁用 TOTP
 */
export function disableTOTP(): void {
  if (fs.existsSync(TOTP_FILE)) {
    fs.unlinkSync(TOTP_FILE);
  }

  const config = getMFAConfig();
  config.methods = config.methods.filter(m => m !== 'totp');
  if (config.methods.length === 0) {
    config.enabled = false;
  }
  saveMFAConfig(config);
}

// ============ MFA 验证 ============

/**
 * 验证 MFA
 */
export function verifyMFA(request: MFAVerificationRequest): MFAVerificationResult {
  const config = getMFAConfig();

  if (!config.enabled) {
    return {
      success: true,
      method: request.method,
      error: 'MFA is not enabled',
    };
  }

  // TOTP 验证
  if (request.method === 'totp' && request.code) {
    const totpConfig = getTOTPConfig();
    if (!totpConfig || !totpConfig.verified) {
      return {
        success: false,
        method: 'totp',
        error: 'TOTP is not configured',
      };
    }

    // 尝试验证 TOTP 码
    if (verifyTOTP(totpConfig.secret, request.code)) {
      const result: MFAVerificationResult = {
        success: true,
        method: 'totp',
      };

      // 如果选择信任设备
      if (request.trustDevice) {
        const device = createTrustedDevice();
        config.trustedDevices.push(device);
        saveMFAConfig(config);

        result.deviceId = device.deviceId;
        result.expiresAt = device.expiresAt;
      }

      return result;
    }

    // 尝试验证恢复代码
    if (verifyRecoveryCode(request.code, totpConfig.backupCodes)) {
      // 更新恢复代码
      const data = JSON.parse(fs.readFileSync(TOTP_FILE, 'utf-8')) as TOTPSecret;
      data.backupCodes = totpConfig.backupCodes.map(code => encrypt(code));
      fs.writeFileSync(TOTP_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });

      return {
        success: true,
        method: 'totp',
        error: 'Recovery code used',
      };
    }

    return {
      success: false,
      method: 'totp',
      error: 'Invalid TOTP code',
    };
  }

  // SMS 验证（占位符实现）
  if (request.method === 'sms' && request.code) {
    // 实际实现需要集成 SMS 服务提供商
    return {
      success: false,
      method: 'sms',
      error: 'SMS verification not implemented',
    };
  }

  // Email 验证（占位符实现）
  if (request.method === 'email' && request.code) {
    // 实际实现需要集成邮件服务
    return {
      success: false,
      method: 'email',
      error: 'Email verification not implemented',
    };
  }

  // WebAuthn 验证（占位符实现）
  if (request.method === 'webauthn' && request.credentialId && request.signature) {
    // 实际实现需要 WebAuthn API 支持
    return {
      success: false,
      method: 'webauthn',
      error: 'WebAuthn verification not implemented',
    };
  }

  return {
    success: false,
    method: request.method,
    error: 'Invalid MFA method',
  };
}

/**
 * 检查设备是否需要 MFA
 */
export function requiresMFA(deviceId?: string): boolean {
  const config = getMFAConfig();

  if (!config.enabled) {
    return false;
  }

  // 如果提供了设备 ID，检查是否受信任
  if (deviceId && isDeviceTrusted(deviceId, config.trustedDevices)) {
    // 更新配置（保存最后使用时间）
    saveMFAConfig(config);
    return false;
  }

  return true;
}

// ============ 设备管理 ============

/**
 * 获取受信任设备列表
 */
export function getTrustedDevices(): TrustedDevice[] {
  const config = getMFAConfig();
  const now = Date.now();

  // 过滤过期设备
  config.trustedDevices = config.trustedDevices.filter(d => d.expiresAt > now);
  saveMFAConfig(config);

  return config.trustedDevices;
}

/**
 * 移除受信任设备
 */
export function removeTrustedDevice(deviceId: string): boolean {
  const config = getMFAConfig();
  const initialLength = config.trustedDevices.length;

  config.trustedDevices = config.trustedDevices.filter(d => d.deviceId !== deviceId);

  if (config.trustedDevices.length < initialLength) {
    saveMFAConfig(config);
    return true;
  }

  return false;
}

/**
 * 清除所有受信任设备
 */
export function clearTrustedDevices(): void {
  const config = getMFAConfig();
  config.trustedDevices = [];
  saveMFAConfig(config);
}

// ============ 导出的辅助函数 ============

/**
 * 完全禁用 MFA
 */
export function disableMFA(): void {
  disableTOTP();
  clearTrustedDevices();

  const config = getMFAConfig();
  config.enabled = false;
  config.methods = [];
  config.preferredMethod = undefined;
  saveMFAConfig(config);
}

/**
 * 获取 MFA 状态摘要
 */
export function getMFAStatus(): {
  enabled: boolean;
  methods: MFAMethod[];
  trustedDevicesCount: number;
  totpConfigured: boolean;
} {
  const config = getMFAConfig();
  const totpConfig = getTOTPConfig();

  return {
    enabled: config.enabled,
    methods: config.methods,
    trustedDevicesCount: getTrustedDevices().length,
    totpConfigured: !!(totpConfig?.verified),
  };
}

/**
 * 生成新的恢复代码（用于恢复码用尽时）
 */
export function regenerateRecoveryCodes(): string[] | null {
  if (!fs.existsSync(TOTP_FILE)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(TOTP_FILE, 'utf-8')) as TOTPSecret;
    const newCodes = generateRecoveryCodes();

    data.backupCodes = newCodes.map(code => encrypt(code));
    fs.writeFileSync(TOTP_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });

    return newCodes;
  } catch (err) {
    return null;
  }
}
