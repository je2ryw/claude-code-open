/**
 * MFA (多因素认证) 命令
 * 提供 MFA 设置、验证、管理等功能
 */

import type { SlashCommand, CommandContext, CommandResult } from './types.js';
import { commandRegistry } from './registry.js';
import * as readline from 'readline';
import {
  getMFAStatus,
  setupTOTP,
  verifyTOTPSetup,
  getTOTPConfig,
  disableTOTP,
  getTrustedDevices,
  removeTrustedDevice,
  clearTrustedDevices,
  disableMFA,
  regenerateRecoveryCodes,
  isMFAEnabled,
} from '../auth/index.js';

// ============ /mfa - MFA 状态 ============

export const mfaCommand: SlashCommand = {
  name: 'mfa',
  description: 'Show MFA (Multi-Factor Authentication) status',
  usage: '/mfa [status | help]',
  category: 'auth',
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const { args } = ctx;
    const subcommand = args[0]?.toLowerCase() || 'status';

    if (subcommand === 'help' || subcommand === '-h' || subcommand === '--help') {
      const helpInfo = `╭─ MFA (Multi-Factor Authentication) ───────────────────╮
│                                                        │
│  MFA adds an extra layer of security to your account   │
│  by requiring a second form of verification.           │
│                                                        │
│  Available Commands:                                   │
│                                                        │
│  /mfa                  Show MFA status                 │
│  /mfa-setup            Setup MFA (TOTP)                │
│  /mfa-verify <code>    Verify MFA code                 │
│  /mfa-disable          Disable MFA                     │
│  /mfa-devices          Manage trusted devices          │
│  /mfa-recovery         Manage recovery codes           │
│                                                        │
│  Supported Methods:                                    │
│                                                        │
│  ✓ TOTP (Authenticator App)                            │
│    • Google Authenticator                              │
│    • Microsoft Authenticator                           │
│    • Authy                                             │
│    • 1Password                                         │
│                                                        │
│  ○ SMS Verification (planned)                          │
│  ○ Email Verification (planned)                        │
│  ○ Hardware Keys (WebAuthn/FIDO2) (planned)            │
│                                                        │
│  Security Features:                                    │
│                                                        │
│  • Recovery codes for account recovery                 │
│  • Trusted device management (30-day trust)            │
│  • Encrypted secret storage                            │
│  • Time-based one-time passwords (TOTP)                │
│                                                        │
│  Quick Start:                                          │
│                                                        │
│  1. Setup TOTP:        /mfa-setup                      │
│  2. Scan QR code with authenticator app                │
│  3. Verify setup:      /mfa-verify <6-digit code>      │
│  4. Save recovery codes in a safe place                │
│                                                        │
╰────────────────────────────────────────────────────────╯`;

      ctx.ui.addMessage('assistant', helpInfo);
      return { success: true };
    }

    // 显示 MFA 状态
    const status = getMFAStatus();

    const statusInfo = `╭─ MFA Status ───────────────────────────────────────────╮
│                                                        │
│  Status: ${status.enabled ? '✓ Enabled'.padEnd(42) : '✗ Disabled'.padEnd(42)}│
│                                                        │
│  Configured Methods:                                   │
${
  status.methods.length > 0
    ? status.methods.map(m => `│    • ${m.toUpperCase().padEnd(44)}│`).join('\n')
    : '│    (none)                                              │'
}
│                                                        │
│  TOTP Authenticator: ${status.totpConfigured ? 'Configured'.padEnd(28) : 'Not configured'.padEnd(28)}│
│  Trusted Devices: ${status.trustedDevicesCount.toString().padEnd(31)}│
│                                                        │
${
  status.enabled
    ? `│  MFA Protection: Active                                │
│                                                        │
│  Next Steps:                                           │
│    • Verify login with authenticator app               │
│    • Manage trusted devices: /mfa-devices              │
│    • View recovery codes: /mfa-recovery                │`
    : `│  Recommendation: Enable MFA for better security        │
│                                                        │
│  To enable MFA:                                        │
│    1. Run: /mfa-setup                                  │
│    2. Scan QR code with authenticator app              │
│    3. Verify with: /mfa-verify <code>                  │`
}
│                                                        │
╰────────────────────────────────────────────────────────╯`;

    ctx.ui.addMessage('assistant', statusInfo);
    return { success: true };
  },
};

// ============ /mfa-setup - 设置 MFA ============

export const mfaSetupCommand: SlashCommand = {
  name: 'mfa-setup',
  description: 'Setup MFA (TOTP authenticator)',
  usage: '/mfa-setup [email]',
  category: 'auth',
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const { args } = ctx;

    // 检查是否已启用 MFA
    if (isMFAEnabled()) {
      ctx.ui.addMessage('assistant', `MFA is already enabled!

Current status:
  ${getMFAStatus().methods.map(m => `• ${m}`).join('\n  ')}

To reconfigure MFA:
  1. Disable current MFA: /mfa-disable
  2. Run setup again: /mfa-setup

To view recovery codes:
  /mfa-recovery`);
      return { success: false };
    }

    // 获取账户名称（用于 TOTP URL）
    const accountName = args[0] || process.env.USER || 'claude-user';

    ctx.ui.addActivity('Setting up TOTP authenticator...');

    try {
      // 生成 TOTP 密钥和恢复代码
      const totpData = setupTOTP(accountName);

      const setupInfo = `╭─ MFA Setup - TOTP Authenticator ───────────────────────╮
│                                                        │
│  STEP 1: Scan QR Code                                  │
│                                                        │
│  Open your authenticator app and scan this code:       │
│                                                        │
│  QR Code URL (for manual entry):                       │
│  ${totpData.qrCodeUrl?.substring(0, 50) || ''}
│  ${totpData.qrCodeUrl?.substring(50, 100) || ''}
│                                                        │
│  Or manually enter this secret key:                    │
│  ${totpData.secret}                                    │
│                                                        │
│  Recommended Apps:                                     │
│    • Google Authenticator                              │
│    • Microsoft Authenticator                           │
│    • Authy                                             │
│    • 1Password                                         │
│                                                        │
│  STEP 2: Save Recovery Codes                           │
│                                                        │
│  Save these codes in a secure location!                │
│  Each code can only be used once.                      │
│                                                        │
${totpData.backupCodes.map((code, i) => `│    ${(i + 1).toString().padStart(2)}. ${code.padEnd(40)}│`).join('\n')}
│                                                        │
│  ⚠️  IMPORTANT: Keep these codes safe!                 │
│     You'll need them if you lose access to your        │
│     authenticator app.                                 │
│                                                        │
│  STEP 3: Verify Setup                                  │
│                                                        │
│  Enter the 6-digit code from your authenticator app:   │
│                                                        │
│    /mfa-verify <6-digit-code>                          │
│                                                        │
│  Example:                                              │
│    /mfa-verify 123456                                  │
│                                                        │
╰────────────────────────────────────────────────────────╯

Recovery Codes saved to: ~/.claude/mfa/totp.json`;

      ctx.ui.addMessage('assistant', setupInfo);
      ctx.ui.addActivity('TOTP setup initiated - waiting for verification');
      return { success: true };
    } catch (error) {
      const errorMsg = `❌ MFA Setup Failed

Error: ${error instanceof Error ? error.message : String(error)}

Please try again or contact support if the issue persists.`;

      ctx.ui.addMessage('assistant', errorMsg);
      return { success: false };
    }
  },
};

// ============ /mfa-verify - 验证 MFA ============

export const mfaVerifyCommand: SlashCommand = {
  name: 'mfa-verify',
  description: 'Verify MFA code to complete setup',
  usage: '/mfa-verify <code> [--trust-device]',
  category: 'auth',
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const { args } = ctx;

    if (args.length === 0) {
      ctx.ui.addMessage('assistant', `Usage: /mfa-verify <6-digit-code> [--trust-device]

Example:
  /mfa-verify 123456
  /mfa-verify 123456 --trust-device

Options:
  --trust-device    Trust this device for 30 days (skip MFA)`);
      return { success: false };
    }

    const code = args[0];
    const trustDevice = args.includes('--trust-device') || args.includes('-t');

    // 验证码格式检查
    if (!/^\d{6}$/.test(code) && code.length !== 8) {
      ctx.ui.addMessage('assistant', `Invalid code format.

TOTP codes are 6 digits (e.g., 123456)
Recovery codes are 8 characters (e.g., ABCD1234)`);
      return { success: false };
    }

    ctx.ui.addActivity('Verifying MFA code...');

    try {
      // 验证 TOTP 设置
      const verified = verifyTOTPSetup(code);

      if (verified) {
        const successMsg = `✅ MFA Verification Successful!

MFA is now enabled for your account.

Security Status:
  • TOTP Authenticator: Enabled
  • Recovery Codes: 10 codes available
  ${trustDevice ? '• This Device: Trusted for 30 days' : '• This Device: Not trusted'}

Next Steps:
  • Keep your recovery codes in a safe place
  • Use your authenticator app for future logins
  ${!trustDevice ? '• Consider trusting frequently used devices' : ''}

To manage MFA:
  /mfa              View MFA status
  /mfa-devices      Manage trusted devices
  /mfa-recovery     View/regenerate recovery codes
  /mfa-disable      Disable MFA`;

        ctx.ui.addMessage('assistant', successMsg);
        ctx.ui.addActivity('MFA enabled successfully');
        return { success: true };
      } else {
        const errorMsg = `❌ Verification Failed

The code you entered is invalid.

Possible reasons:
  • Code expired (TOTP codes change every 30 seconds)
  • Incorrect code from authenticator app
  • Time sync issue on your device

Please try:
  1. Wait for a new code in your authenticator app
  2. Ensure your device time is synchronized
  3. Double-check you're using the correct account

If you haven't completed setup:
  Run /mfa-setup to start over`;

        ctx.ui.addMessage('assistant', errorMsg);
        return { success: false };
      }
    } catch (error) {
      const errorMsg = `❌ Verification Error

Error: ${error instanceof Error ? error.message : String(error)}

If you need to start over:
  /mfa-setup`;

      ctx.ui.addMessage('assistant', errorMsg);
      return { success: false };
    }
  },
};

// ============ /mfa-disable - 禁用 MFA ============

export const mfaDisableCommand: SlashCommand = {
  name: 'mfa-disable',
  description: 'Disable MFA',
  usage: '/mfa-disable [--confirm]',
  category: 'auth',
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const { args } = ctx;

    if (!isMFAEnabled()) {
      ctx.ui.addMessage('assistant', `MFA is not enabled.

To enable MFA:
  /mfa-setup`);
      return { success: true };
    }

    const confirmed = args.includes('--confirm') || args.includes('-y');

    if (!confirmed) {
      ctx.ui.addMessage('assistant', `⚠️  Warning: Disable MFA?

Disabling MFA will reduce your account security.

This will:
  • Remove TOTP authenticator
  • Clear all trusted devices
  • Delete recovery codes
  • Require only password for login

To confirm, run:
  /mfa-disable --confirm

To keep MFA enabled:
  (do nothing)`);
      return { success: false };
    }

    try {
      disableMFA();

      const successMsg = `✅ MFA Disabled

MFA has been removed from your account.

What was removed:
  • TOTP authenticator configuration
  • All trusted devices
  • Recovery codes

Your account is now less secure. Consider re-enabling MFA:
  /mfa-setup

To verify:
  /mfa`;

      ctx.ui.addMessage('assistant', successMsg);
      ctx.ui.addActivity('MFA disabled');
      return { success: true };
    } catch (error) {
      const errorMsg = `❌ Failed to Disable MFA

Error: ${error instanceof Error ? error.message : String(error)}`;

      ctx.ui.addMessage('assistant', errorMsg);
      return { success: false };
    }
  },
};

// ============ /mfa-devices - 管理受信任设备 ============

export const mfaDevicesCommand: SlashCommand = {
  name: 'mfa-devices',
  description: 'Manage trusted devices',
  usage: '/mfa-devices [list | remove <device-id> | clear]',
  category: 'auth',
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const { args } = ctx;
    const subcommand = args[0]?.toLowerCase() || 'list';

    if (subcommand === 'list' || !subcommand) {
      const devices = getTrustedDevices();

      if (devices.length === 0) {
        ctx.ui.addMessage('assistant', `No Trusted Devices

You haven't trusted any devices yet.

To trust a device:
  When logging in, verify MFA code with:
    /mfa-verify <code> --trust-device

Trusted devices skip MFA for 30 days.`);
        return { success: true };
      }

      const deviceList = `╭─ Trusted Devices (${devices.length}) ────────────────────────────────╮
│                                                        │
${devices
  .map(
    (device, i) => `│  ${(i + 1).toString().padStart(2)}. ${device.deviceName.substring(0, 40).padEnd(40)}│
│      ID: ${device.deviceId.substring(0, 40)}       │
│      Platform: ${device.platform.padEnd(34)}│
│      Last Used: ${new Date(device.lastUsed).toLocaleString().padEnd(30)}│
│      Expires: ${new Date(device.expiresAt).toLocaleString().padEnd(32)}│
│                                                        │`
  )
  .join('\n')}
│  Commands:                                             │
│    /mfa-devices remove <device-id>                     │
│    /mfa-devices clear                                  │
│                                                        │
╰────────────────────────────────────────────────────────╯`;

      ctx.ui.addMessage('assistant', deviceList);
      return { success: true };
    }

    if (subcommand === 'remove' && args[1]) {
      const deviceId = args[1];

      try {
        const removed = removeTrustedDevice(deviceId);

        if (removed) {
          ctx.ui.addMessage('assistant', `✅ Device Removed

Device ${deviceId.substring(0, 16)}... has been removed from trusted devices.

This device will now require MFA verification.

To view remaining devices:
  /mfa-devices`);
          return { success: true };
        } else {
          ctx.ui.addMessage('assistant', `Device Not Found

No device found with ID: ${deviceId.substring(0, 32)}...

To view all devices:
  /mfa-devices list`);
          return { success: false };
        }
      } catch (error) {
        ctx.ui.addMessage('assistant', `Error removing device: ${error instanceof Error ? error.message : String(error)}`);
        return { success: false };
      }
    }

    if (subcommand === 'clear') {
      const devices = getTrustedDevices();

      if (devices.length === 0) {
        ctx.ui.addMessage('assistant', 'No trusted devices to clear.');
        return { success: true };
      }

      if (!args.includes('--confirm')) {
        ctx.ui.addMessage('assistant', `⚠️  Clear All Trusted Devices?

This will remove ${devices.length} trusted device(s).
All devices will require MFA verification on next login.

To confirm:
  /mfa-devices clear --confirm`);
        return { success: false };
      }

      try {
        clearTrustedDevices();

        ctx.ui.addMessage('assistant', `✅ All Trusted Devices Cleared

${devices.length} device(s) removed.

All devices will now require MFA verification.`);
        return { success: true };
      } catch (error) {
        ctx.ui.addMessage('assistant', `Error clearing devices: ${error instanceof Error ? error.message : String(error)}`);
        return { success: false };
      }
    }

    ctx.ui.addMessage('assistant', `Usage: /mfa-devices [list | remove <device-id> | clear]

Commands:
  /mfa-devices              List all trusted devices
  /mfa-devices list         List all trusted devices
  /mfa-devices remove <id>  Remove a specific device
  /mfa-devices clear        Clear all trusted devices`);
    return { success: false };
  },
};

// ============ /mfa-recovery - 管理恢复代码 ============

export const mfaRecoveryCommand: SlashCommand = {
  name: 'mfa-recovery',
  description: 'Manage MFA recovery codes',
  usage: '/mfa-recovery [show | regenerate]',
  category: 'auth',
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const { args } = ctx;
    const subcommand = args[0]?.toLowerCase() || 'show';

    const totpConfig = getTOTPConfig();

    if (!totpConfig || !totpConfig.verified) {
      ctx.ui.addMessage('assistant', `MFA Not Configured

Recovery codes are only available after MFA is set up.

To setup MFA:
  /mfa-setup`);
      return { success: false };
    }

    if (subcommand === 'show') {
      const availableCodes = totpConfig.backupCodes.length;

      const recoveryInfo = `╭─ MFA Recovery Codes ───────────────────────────────────╮
│                                                        │
│  Available Codes: ${availableCodes.toString().padEnd(33)}│
│                                                        │
│  ⚠️  Keep these codes in a safe, secure location!     │
│     Each code can only be used once.                   │
│                                                        │
${totpConfig.backupCodes.map((code, i) => `│    ${(i + 1).toString().padStart(2)}. ${code.padEnd(40)}│`).join('\n')}
│                                                        │
│  How to Use:                                           │
│    • Use if you lose access to authenticator app       │
│    • Enter recovery code instead of TOTP code          │
│    • Each code works only once                         │
│                                                        │
│  Running Low on Codes?                                 │
│    Generate new codes: /mfa-recovery regenerate        │
│                                                        │
│  ⚠️  SECURITY WARNING:                                 │
│     • Never share these codes with anyone              │
│     • Store them securely (password manager, safe)     │
│     • Don't screenshot or email these codes            │
│                                                        │
╰────────────────────────────────────────────────────────╯`;

      ctx.ui.addMessage('assistant', recoveryInfo);
      return { success: true };
    }

    if (subcommand === 'regenerate') {
      if (!args.includes('--confirm')) {
        ctx.ui.addMessage('assistant', `⚠️  Regenerate Recovery Codes?

This will:
  • Invalidate all existing recovery codes (${totpConfig.backupCodes.length})
  • Generate 10 new recovery codes
  • You must save the new codes immediately

Current codes will no longer work!

To confirm:
  /mfa-recovery regenerate --confirm`);
        return { success: false };
      }

      try {
        const newCodes = regenerateRecoveryCodes();

        if (!newCodes) {
          throw new Error('Failed to regenerate recovery codes');
        }

        const regenerateInfo = `✅ Recovery Codes Regenerated

Old codes have been invalidated.
Save these NEW codes in a secure location!

${newCodes.map((code, i) => `  ${(i + 1).toString().padStart(2)}. ${code}`).join('\n')}

⚠️  IMPORTANT:
  • Old recovery codes no longer work
  • Save these new codes immediately
  • Each code can only be used once

Saved to: ~/.claude/mfa/totp.json`;

        ctx.ui.addMessage('assistant', regenerateInfo);
        ctx.ui.addActivity('Recovery codes regenerated');
        return { success: true };
      } catch (error) {
        ctx.ui.addMessage('assistant', `Error regenerating codes: ${error instanceof Error ? error.message : String(error)}`);
        return { success: false };
      }
    }

    ctx.ui.addMessage('assistant', `Usage: /mfa-recovery [show | regenerate]

Commands:
  /mfa-recovery              Show recovery codes
  /mfa-recovery show         Show recovery codes
  /mfa-recovery regenerate   Generate new recovery codes`);
    return { success: false };
  },
};

// ============ 注册所有 MFA 命令 ============

export function registerMFACommands(): void {
  commandRegistry.register(mfaCommand);
  commandRegistry.register(mfaSetupCommand);
  commandRegistry.register(mfaVerifyCommand);
  commandRegistry.register(mfaDisableCommand);
  commandRegistry.register(mfaDevicesCommand);
  commandRegistry.register(mfaRecoveryCommand);
}
