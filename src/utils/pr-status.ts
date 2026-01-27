/**
 * PR Review Status Utility
 * 官方 2.1.20 新增的 PR 审核状态指示器
 *
 * 通过 `gh pr view` 命令获取当前分支的 PR 状态
 * 显示在 prompt footer 中作为带颜色的圆点和可点击链接
 */

import { spawn } from 'child_process';

/**
 * PR 审核状态类型
 */
export type PRReviewState =
  | 'approved'       // 已批准 (绿色)
  | 'changes_requested'  // 需要修改 (红色)
  | 'pending'        // 等待审核 (黄色)
  | 'draft'          // 草稿 (灰色)
  | null;            // 无 PR 或获取失败

/**
 * PR 状态信息
 */
export interface PRStatus {
  number: number | null;
  url: string | null;
  reviewState: PRReviewState;
  lastUpdated: number;
}

/**
 * PR 状态缓存
 */
let prStatusCache: PRStatus = {
  number: null,
  url: null,
  reviewState: null,
  lastUpdated: 0,
};

/**
 * 缓存有效期（5秒）
 */
const CACHE_TTL = 5000;

/**
 * gh 命令超时时间（5秒）
 */
const GH_TIMEOUT = 5000;

/**
 * 执行 gh 命令获取 PR 信息
 */
async function executeGhCommand(): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const args = ['pr', 'view', '--json', 'number,url,reviewDecision,isDraft'];
    const proc = spawn('gh', args, {
      timeout: GH_TIMEOUT,
      stdio: ['ignore', 'pipe', 'pipe'],
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
      resolve({ stdout, code: code ?? 1 });
    });

    proc.on('error', () => {
      resolve({ stdout: '', code: 1 });
    });

    // 超时处理
    setTimeout(() => {
      proc.kill();
      resolve({ stdout: '', code: 1 });
    }, GH_TIMEOUT);
  });
}

/**
 * 将 GitHub API 响应转换为审核状态
 * 官方 jAz() 函数
 */
function getReviewState(isDraft: boolean, reviewDecision: string | null): PRReviewState {
  if (isDraft) {
    return 'draft';
  }

  switch (reviewDecision) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes_requested';
    case 'REVIEW_REQUIRED':
    case null:
    case '':
      return 'pending';
    default:
      return 'pending';
  }
}

/**
 * 获取当前分支的 PR 状态
 *
 * @returns PR 状态信息，如果无法获取则返回 null
 */
export async function getPRStatus(): Promise<PRStatus | null> {
  try {
    const { stdout, code } = await executeGhCommand();

    if (code !== 0 || !stdout.trim()) {
      return null;
    }

    const data = JSON.parse(stdout);

    return {
      number: data.number,
      url: data.url,
      reviewState: getReviewState(data.isDraft, data.reviewDecision),
      lastUpdated: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * 获取 PR 状态（带缓存）
 *
 * @returns PR 状态信息
 */
export async function getPRStatusCached(): Promise<PRStatus> {
  const now = Date.now();

  // 检查缓存是否有效
  if (prStatusCache.lastUpdated > 0 && now - prStatusCache.lastUpdated < CACHE_TTL) {
    return prStatusCache;
  }

  // 获取新状态
  const status = await getPRStatus();

  if (status) {
    prStatusCache = status;
  } else {
    // 如果获取失败，更新时间戳但保留旧数据
    prStatusCache.lastUpdated = now;
  }

  return prStatusCache;
}

/**
 * 获取审核状态的显示颜色
 */
export function getReviewStateColor(state: PRReviewState): string {
  switch (state) {
    case 'approved':
      return 'green';
    case 'changes_requested':
      return 'red';
    case 'pending':
      return 'yellow';
    case 'draft':
      return 'gray';
    default:
      return 'gray';
  }
}

/**
 * 获取审核状态的显示文本
 */
export function getReviewStateText(state: PRReviewState): string {
  switch (state) {
    case 'approved':
      return 'Approved';
    case 'changes_requested':
      return 'Changes requested';
    case 'pending':
      return 'Pending review';
    case 'draft':
      return 'Draft';
    default:
      return '';
  }
}

/**
 * 清除 PR 状态缓存
 */
export function clearPRStatusCache(): void {
  prStatusCache = {
    number: null,
    url: null,
    reviewState: null,
    lastUpdated: 0,
  };
}

/**
 * 检查 PR 状态功能是否可用
 * 需要安装 gh CLI 并且当前目录是 git 仓库
 */
export async function isPRStatusAvailable(): Promise<boolean> {
  try {
    const { code } = await executeGhCommand();
    // 即使没有 PR，命令也可能返回非零，但至少 gh 是可用的
    return true;
  } catch {
    return false;
  }
}
