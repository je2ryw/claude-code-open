/**
 * 环境预检服务 - Environment Checker
 *
 * 设计理念：
 * - Worker 不应该获取管理员权限（安全风险太高）
 * - 但可以诊断环境问题，生成修复脚本让用户审查后执行
 * - 类似于 CI/CD 的 "setup" 阶段
 *
 * 工作流程：
 * 1. 任务开始前，预检环境
 * 2. 如果缺少必要组件，生成 setup 脚本
 * 3. 暂停任务，等待用户运行脚本
 * 4. 用户确认后，继续执行任务
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, exec } from 'child_process';
import { EventEmitter } from 'events';
import type { TechStack } from './types.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 环境检查项
 */
export interface EnvironmentCheck {
  name: string;
  description: string;
  /** 检查命令（返回 0 表示通过） */
  checkCommand: string;
  /** 修复命令（需要管理员权限） */
  fixCommand?: {
    windows?: string;
    darwin?: string;  // macOS
    linux?: string;
  };
  /** 是否必须（否则为可选） */
  required: boolean;
  /** 检查结果 */
  status?: 'passed' | 'failed' | 'skipped';
  /** 错误信息 */
  error?: string;
}

/**
 * 环境检查结果
 */
export interface EnvironmentCheckResult {
  /** 是否全部通过 */
  allPassed: boolean;
  /** 必须项是否全部通过 */
  requiredPassed: boolean;
  /** 检查详情 */
  checks: EnvironmentCheck[];
  /** 如果有失败项，生成的修复脚本路径 */
  setupScriptPath?: string;
  /** 需要用户操作的项目 */
  userActions: string[];
}

/**
 * 预检配置
 */
export interface EnvironmentCheckerConfig {
  /** 项目路径 */
  projectPath: string;
  /** 技术栈 */
  techStack: TechStack;
  /** 是否需要 Docker */
  requiresDocker?: boolean;
  /** 是否需要数据库 */
  requiresDatabase?: boolean;
  /** 自定义检查项 */
  customChecks?: EnvironmentCheck[];
}

// ============================================================================
// 核心实现
// ============================================================================

export class EnvironmentChecker extends EventEmitter {
  private config: EnvironmentCheckerConfig;
  private platform: NodeJS.Platform;

  constructor(config: EnvironmentCheckerConfig) {
    super();
    this.config = config;
    this.platform = os.platform();
  }

  /**
   * 执行环境预检
   */
  async check(): Promise<EnvironmentCheckResult> {
    const checks = this.buildCheckList();
    const userActions: string[] = [];

    // 执行每个检查
    for (const check of checks) {
      try {
        this.emit('check:start', { name: check.name });

        const result = this.runCheck(check.checkCommand);
        check.status = result ? 'passed' : 'failed';

        if (!result && check.required) {
          // 必须项失败，记录用户操作
          const action = this.getFixInstructions(check);
          if (action) {
            userActions.push(action);
          }
        }

        this.emit('check:end', { name: check.name, status: check.status });
      } catch (error) {
        check.status = 'failed';
        check.error = error instanceof Error ? error.message : String(error);
        this.emit('check:error', { name: check.name, error: check.error });
      }
    }

    const failedRequired = checks.filter(c => c.required && c.status === 'failed');
    const allPassed = checks.every(c => c.status === 'passed' || c.status === 'skipped');
    const requiredPassed = failedRequired.length === 0;

    let setupScriptPath: string | undefined;

    // 如果有必须项失败，生成修复脚本
    if (!requiredPassed) {
      setupScriptPath = await this.generateSetupScript(failedRequired);
    }

    return {
      allPassed,
      requiredPassed,
      checks,
      setupScriptPath,
      userActions,
    };
  }

  /**
   * 构建检查列表
   */
  private buildCheckList(): EnvironmentCheck[] {
    const checks: EnvironmentCheck[] = [];
    const { techStack, requiresDocker, requiresDatabase } = this.config;

    // Node.js 项目检查
    if (techStack.language === 'typescript' || techStack.language === 'javascript') {
      checks.push({
        name: 'Node.js',
        description: '检查 Node.js 是否安装',
        checkCommand: 'node --version',
        fixCommand: {
          windows: 'winget install OpenJS.NodeJS.LTS',
          darwin: 'brew install node',
          linux: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
        },
        required: true,
      });

      checks.push({
        name: 'npm',
        description: '检查 npm 是否安装',
        checkCommand: 'npm --version',
        required: true,
      });
    }

    // Python 项目检查
    if (techStack.language === 'python') {
      checks.push({
        name: 'Python',
        description: '检查 Python 是否安装',
        checkCommand: 'python --version || python3 --version',
        fixCommand: {
          windows: 'winget install Python.Python.3.11',
          darwin: 'brew install python',
          linux: 'sudo apt-get install -y python3 python3-pip',
        },
        required: true,
      });
    }

    // Docker 检查
    if (requiresDocker) {
      checks.push({
        name: 'Docker',
        description: '检查 Docker 是否安装',
        checkCommand: 'docker --version',
        fixCommand: {
          windows: 'winget install Docker.DockerDesktop',
          darwin: 'brew install --cask docker',
          linux: 'curl -fsSL https://get.docker.com | sudo sh',
        },
        required: true,
      });

      checks.push({
        name: 'Docker Running',
        description: '检查 Docker 服务是否运行',
        checkCommand: 'docker info',
        fixCommand: {
          // v2.1.28: Windows 上可以直接启动 Docker Desktop（不需要管理员权限）
          windows: 'Start-Process "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe" && timeout /t 30 /nobreak > nul && docker info',
          darwin: 'open -a Docker && sleep 30 && docker info',
          linux: 'sudo systemctl start docker',
        },
        required: true,
      });
    }

    // 数据库检查
    if (requiresDatabase) {
      // 检查 docker-compose 文件
      const hasDockerCompose = fs.existsSync(path.join(this.config.projectPath, 'docker-compose.yml')) ||
                               fs.existsSync(path.join(this.config.projectPath, 'docker-compose.yaml'));

      if (hasDockerCompose) {
        checks.push({
          name: 'Database (docker-compose)',
          description: '检查数据库容器是否运行',
          checkCommand: `cd "${this.config.projectPath}" && docker-compose ps --services --filter "status=running"`,
          fixCommand: {
            windows: `cd "${this.config.projectPath}" && docker-compose up -d`,
            darwin: `cd "${this.config.projectPath}" && docker-compose up -d`,
            linux: `cd "${this.config.projectPath}" && docker-compose up -d`,
          },
          required: false,  // 可选，因为可能用户有其他数据库配置
        });
      }
    }

    // 添加自定义检查
    if (this.config.customChecks) {
      checks.push(...this.config.customChecks);
    }

    return checks;
  }

  /**
   * 运行单个检查
   */
  private runCheck(command: string): boolean {
    try {
      // 根据平台选择 shell
      const shell = this.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      execSync(command, {
        stdio: 'pipe',
        timeout: 10000,
        shell,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取修复指导
   */
  private getFixInstructions(check: EnvironmentCheck): string | undefined {
    if (!check.fixCommand) {
      return `${check.name}: 请手动安装或配置`;
    }

    const platformKey = this.platform === 'win32' ? 'windows' :
                        this.platform === 'darwin' ? 'darwin' : 'linux';

    const command = check.fixCommand[platformKey];
    if (!command) {
      return `${check.name}: 请手动安装（当前平台无自动安装命令）`;
    }

    return `${check.name}: 运行 \`${command}\``;
  }

  /**
   * 生成修复脚本
   */
  private async generateSetupScript(failedChecks: EnvironmentCheck[]): Promise<string> {
    const isWindows = this.platform === 'win32';
    const scriptExt = isWindows ? '.ps1' : '.sh';
    const scriptPath = path.join(this.config.projectPath, `setup-environment${scriptExt}`);

    const platformKey = isWindows ? 'windows' :
                        this.platform === 'darwin' ? 'darwin' : 'linux';

    let script = '';

    if (isWindows) {
      script = `# 环境配置脚本 (PowerShell)
# 请以管理员身份运行此脚本
# 生成时间: ${new Date().toISOString()}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  蜂群环境配置脚本" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "警告: 建议以管理员身份运行此脚本" -ForegroundColor Yellow
    Write-Host ""
}

`;
    } else {
      script = `#!/bin/bash
# 环境配置脚本
# 某些命令可能需要 sudo 权限
# 生成时间: ${new Date().toISOString()}

echo "======================================"
echo "  蜂群环境配置脚本"
echo "======================================"
echo ""

`;
    }

    // 添加每个失败检查的修复命令
    for (const check of failedChecks) {
      const command = check.fixCommand?.[platformKey];

      if (isWindows) {
        script += `
# ${check.name}: ${check.description}
Write-Host "正在配置: ${check.name}..." -ForegroundColor Yellow
`;
        if (command) {
          script += `try {
    ${command}
    Write-Host "${check.name} 配置成功!" -ForegroundColor Green
} catch {
    Write-Host "${check.name} 配置失败，请手动处理" -ForegroundColor Red
}
`;
        } else {
          script += `Write-Host "请手动配置 ${check.name}" -ForegroundColor Magenta
`;
        }
      } else {
        script += `
# ${check.name}: ${check.description}
echo "正在配置: ${check.name}..."
`;
        if (command) {
          script += `if ${command}; then
    echo "${check.name} 配置成功!"
else
    echo "${check.name} 配置失败，请手动处理"
fi
`;
        } else {
          script += `echo "请手动配置 ${check.name}"
`;
        }
      }
    }

    // 添加结束提示
    if (isWindows) {
      script += `
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  配置完成！请重新运行蜂群任务" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;
    } else {
      script += `
echo ""
echo "======================================"
echo "  配置完成！请重新运行蜂群任务"
echo "======================================"
`;
    }

    // 写入脚本文件
    fs.writeFileSync(scriptPath, script, { encoding: 'utf-8' });

    // 设置可执行权限（非 Windows）
    if (!isWindows) {
      fs.chmodSync(scriptPath, '755');
    }

    return scriptPath;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 快速环境预检
 */
export async function checkEnvironment(config: EnvironmentCheckerConfig): Promise<EnvironmentCheckResult> {
  const checker = new EnvironmentChecker(config);
  return checker.check();
}

/**
 * 从 Blueprint 推断需要的环境
 */
export function inferEnvironmentRequirements(
  projectPath: string,
  techStack: TechStack
): { requiresDocker: boolean; requiresDatabase: boolean } {
  let requiresDocker = false;
  let requiresDatabase = false;

  // 检查是否有 docker-compose 文件
  const hasDockerCompose = fs.existsSync(path.join(projectPath, 'docker-compose.yml')) ||
                           fs.existsSync(path.join(projectPath, 'docker-compose.yaml'));
  if (hasDockerCompose) {
    requiresDocker = true;
  }

  // 检查是否有 Dockerfile
  const hasDockerfile = fs.existsSync(path.join(projectPath, 'Dockerfile'));
  if (hasDockerfile) {
    requiresDocker = true;
  }

  // 检查 package.json 中的脚本
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const scripts = JSON.stringify(pkg.scripts || {});

      if (scripts.includes('docker') || scripts.includes('compose')) {
        requiresDocker = true;
      }

      // 检查数据库相关依赖
      const deps = JSON.stringify({ ...pkg.dependencies, ...pkg.devDependencies });
      if (deps.includes('mysql') || deps.includes('postgres') ||
          deps.includes('mongodb') || deps.includes('redis') ||
          deps.includes('prisma') || deps.includes('typeorm') ||
          deps.includes('sequelize') || deps.includes('knex')) {
        requiresDatabase = true;
      }
    } catch {
      // 忽略解析错误
    }
  }

  return { requiresDocker, requiresDatabase };
}

export default EnvironmentChecker;

// ============================================================================
// CLI 工具函数
// ============================================================================

/**
 * 预检并等待用户确认
 * 返回 true 表示可以继续执行，false 表示用户需要手动处理
 */
export async function preflightCheck(
  projectPath: string,
  techStack: TechStack,
  onMessage?: (msg: string) => void
): Promise<{ canProceed: boolean; issues: string[] }> {
  const log = onMessage || console.log;

  log('🔍 正在检查执行环境...');

  // 推断环境需求
  const { requiresDocker, requiresDatabase } = inferEnvironmentRequirements(projectPath, techStack);

  // 运行检查
  const checker = new EnvironmentChecker({
    projectPath,
    techStack,
    requiresDocker,
    requiresDatabase,
  });

  const result = await checker.check();

  if (result.allPassed) {
    log('✅ 环境检查通过，可以开始执行任务');
    return { canProceed: true, issues: [] };
  }

  if (result.requiredPassed) {
    log('⚠️ 部分可选组件缺失，但可以继续执行');
    return { canProceed: true, issues: result.userActions };
  }

  // 必须项失败
  log('❌ 环境检查失败，需要手动配置');
  log('');

  if (result.setupScriptPath) {
    log(`📝 已生成配置脚本: ${result.setupScriptPath}`);
    log('');
    log('请执行以下步骤:');
    log('1. 以管理员身份运行上述脚本');
    log('2. 脚本执行完成后，重新运行蜂群任务');
    log('');
  }

  if (result.userActions.length > 0) {
    log('需要手动处理的项目:');
    result.userActions.forEach((action, i) => {
      log(`  ${i + 1}. ${action}`);
    });
  }

  return { canProceed: false, issues: result.userActions };
}
