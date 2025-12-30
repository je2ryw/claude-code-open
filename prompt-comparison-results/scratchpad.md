# Scratchpad 提示词对比报告

## 执行摘要

**状态**: ❌ 未实现
**影响级别**: 中等
**建议优先级**: 中

项目中**完全缺失** Scratchpad 相关的提示词和功能实现。官方版本提供了一个会话级的临时目录功能，用于隔离临时文件，避免污染用户项目和系统 /tmp 目录。

---

## 官方实现

### 位置
`node_modules/@anthropic-ai/claude-code/cli.js` 第 4575-4590 行（mY7 函数）

### 完整提示词

```
# Scratchpad Directory

IMPORTANT: Always use this scratchpad directory for temporary files instead of `/tmp` or other system temp directories:
`${ID1()}`

Use this directory for ALL temporary file needs:
- Storing intermediate results or data during multi-step tasks
- Writing temporary scripts or configuration files
- Saving outputs that don't belong in the user's project
- Creating working files during analysis or processing
- Any file that would otherwise go to `/tmp`

Only use `/tmp` if the user explicitly requests it.

The scratchpad directory is session-specific, isolated from the user's project, and can be used freely without permission prompts.
```

### 功能实现

#### 核心函数

**1. qFA() - 功能开关**
```javascript
function qFA(){return!1}
```
- 返回 `false`，表示 Scratchpad 功能默认被禁用
- 可能通过 feature flag 控制

**2. ID1() - 路径生成**
```javascript
function ID1(){return Gp(W91(),h0(),"scratchpad")}
```
- 返回 scratchpad 目录的绝对路径
- 格式: `<项目临时目录>/<session-id>/scratchpad`

**3. W91() - 项目临时目录**
```javascript
function W91(){return Gp(VX7(),bc(nQ()))+ls}
```
- 返回项目级别的临时目录
- 基于项目路径的哈希值

**4. VX7() - 系统临时目录**
```javascript
function VX7(){return kQ()==="windows"?Gp(GX7(),"claude")+ls:"/tmp/claude/"}
```
- Windows: `<系统临时目录>/claude/`
- Unix/Linux: `/tmp/claude/`

**5. PK9() - 创建目录**
```javascript
function PK9(){
  if(!qFA())throw Error("Scratchpad directory feature is not enabled");
  let A=jA(),Q=ID1();
  if(!A.existsSync(Q))A.mkdirSync(Q);
  return Q}
```
- 检查功能是否启用
- 自动创建目录（如果不存在）
- 返回路径

**6. HX7() - 路径检查**
```javascript
function HX7(A){
  if(!qFA())return!1;
  let Q=ID1();
  return A===Q||A.startsWith(Q+ls)}
```
- 检查给定路径是否在 scratchpad 目录下

#### 权限策略集成

在 `CX7()` 函数中（权限检查）：
```javascript
function CX7(A,Q){
  if(TK9(A))return{behavior:"allow",updatedInput:Q,decisionReason:{type:"other",reason:"Plan files for current session are allowed for writing"}};
  if(HX7(A))return{behavior:"allow",updatedInput:Q,decisionReason:{type:"other",reason:"Scratchpad files for current session are allowed for writing"}};
  return{behavior:"passthrough",message:""}}
```
- Scratchpad 文件**自动批准写入权限**，无需用户确认
- 权限原因: "Scratchpad files for current session are allowed for writing"

在 `$X7()` 函数中（读取权限）：
```javascript
// W91() 是项目临时目录，包含 scratchpad
let Y=W91();
if(A.startsWith(Y))return{behavior:"allow",updatedInput:Q,decisionReason:{type:"other",reason:"Project temp directory files are allowed for reading"}};
```
- Scratchpad 文件自动批准读取权限

#### 目录结构示例

```
/tmp/claude/                          # 系统临时目录
└── <project-hash>/                   # 项目临时目录 W91()
    └── <session-id>/
        └── scratchpad/               # Scratchpad 目录 ID1()
            ├── temp-script.sh
            ├── analysis-result.json
            └── intermediate-data.txt
```

---

## 项目实现

### 状态
**❌ 完全未实现**

### 搜索结果

已搜索以下位置，均未找到 scratchpad 相关实现：

1. **提示词文件**: `/home/user/claude-code-open/src/prompt/`
   - ❌ 无 scratchpad 相关提示词

2. **核心逻辑**: `/home/user/claude-code-open/src/core/loop.ts`
   - ❌ 无 scratchpad 路径生成逻辑

3. **权限系统**: `/home/user/claude-code-open/src/permissions/`
   - ❌ 无 scratchpad 文件的权限特殊处理

4. **文件工具**: `/home/user/claude-code-open/src/tools/`
   - ❌ 无 scratchpad 目录管理

5. **全局搜索**: `src/` 目录
   - ❌ 无任何 "scratchpad" 关键词

### 相关发现

在 Plan Mode 的限制中提到了临时文件：
```typescript
// src/tools/planmode.ts:219 和 src/agents/plan.ts:196
- Creating temporary files anywhere, including /tmp
```

但这只是限制说明，并未提供替代方案（scratchpad）。

---

## 差异分析

| 方面 | 官方实现 | 项目实现 | 差异 |
|------|---------|---------|------|
| **提示词** | ✅ 完整的 Scratchpad 使用指南 | ❌ 无 | **缺失** |
| **路径生成** | ✅ ID1() 函数 | ❌ 无 | **缺失** |
| **目录管理** | ✅ PK9() 自动创建 | ❌ 无 | **缺失** |
| **权限集成** | ✅ 自动批准读写 | ❌ 无 | **缺失** |
| **功能开关** | ✅ qFA() feature flag | ❌ 无 | **缺失** |
| **路径检查** | ✅ HX7() 路径验证 | ❌ 无 | **缺失** |

---

## 影响评估

### 功能性影响

1. **临时文件管理混乱**
   - Claude 可能将临时文件写入用户项目目录
   - 污染项目文件树结构
   - 增加 .gitignore 管理负担

2. **权限请求增加**
   - 每次创建临时文件都需要用户批准
   - 影响自动化任务流畅性
   - 降低用户体验

3. **会话隔离不足**
   - 多个会话可能共享 /tmp，产生文件冲突
   - 缺少会话级别的临时文件清理机制

### 用户体验影响

- **中等影响**: 用户需要频繁批准临时文件操作
- **工作流中断**: 自动化任务被权限请求打断

### 安全影响

- **轻微风险**: 缺少隔离的临时目录可能导致文件泄露
- **权限模型不完整**: 无法区分"用户项目文件"和"AI临时文件"

---

## 实现建议

### 优先级: 中

虽然不是核心功能，但对提升用户体验和系统健壮性有明显帮助。

### 实现步骤

#### 1. 创建 Scratchpad 管理模块

**文件**: `src/scratchpad/index.ts`

```typescript
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';

/**
 * 生成项目哈希值
 */
function hashProject(projectPath: string): string {
  return createHash('md5').update(projectPath).digest('hex').slice(0, 16);
}

/**
 * 获取系统临时目录
 */
function getSystemTempDir(): string {
  return join(tmpdir(), 'claude');
}

/**
 * 获取项目临时目录
 */
function getProjectTempDir(projectPath: string): string {
  const hash = hashProject(projectPath);
  return join(getSystemTempDir(), hash);
}

/**
 * 获取 Scratchpad 目录路径
 */
export function getScratchpadPath(projectPath: string, sessionId: string): string {
  return join(getProjectTempDir(projectPath), sessionId, 'scratchpad');
}

/**
 * 创建 Scratchpad 目录
 */
export function ensureScratchpadDir(projectPath: string, sessionId: string): string {
  const scratchpadPath = getScratchpadPath(projectPath, sessionId);

  if (!existsSync(scratchpadPath)) {
    mkdirSync(scratchpadPath, { recursive: true });
  }

  return scratchpadPath;
}

/**
 * 检查路径是否在 Scratchpad 目录下
 */
export function isScratchpadPath(path: string, projectPath: string, sessionId: string): boolean {
  const scratchpadPath = getScratchpadPath(projectPath, sessionId);
  return path === scratchpadPath || path.startsWith(scratchpadPath + '/');
}
```

#### 2. 添加提示词

**文件**: `src/prompt/templates.ts`

```typescript
/**
 * Scratchpad 目录指南
 */
export function getScratchpadPrompt(scratchpadPath: string): string {
  return `# Scratchpad Directory

IMPORTANT: Always use this scratchpad directory for temporary files instead of \`/tmp\` or other system temp directories:
\`${scratchpadPath}\`

Use this directory for ALL temporary file needs:
- Storing intermediate results or data during multi-step tasks
- Writing temporary scripts or configuration files
- Saving outputs that don't belong in the user's project
- Creating working files during analysis or processing
- Any file that would otherwise go to \`/tmp\`

Only use \`/tmp\` if the user explicitly requests it.

The scratchpad directory is session-specific, isolated from the user's project, and can be used freely without permission prompts.`;
}
```

#### 3. 集成到系统提示词构建器

**文件**: `src/prompt/builder.ts`

```typescript
import { getScratchpadPath, ensureScratchpadDir } from '../scratchpad/index.js';
import { getScratchpadPrompt } from './templates.js';

// 在 build() 方法中添加
const scratchpadPath = ensureScratchpadDir(context.workingDir, sessionId);
const scratchpadSection = getScratchpadPrompt(scratchpadPath);

// 添加到系统提示词
sections.push(scratchpadSection);
```

#### 4. 权限系统集成

**文件**: `src/permissions/policy.ts`

```typescript
import { isScratchpadPath } from '../scratchpad/index.js';

/**
 * 检查文件写入权限
 */
function checkWritePermission(path: string, context: PermissionContext): PermissionDecision {
  // 检查是否为 Scratchpad 文件
  if (isScratchpadPath(path, context.workingDir, context.sessionId)) {
    return {
      behavior: 'allow',
      decisionReason: {
        type: 'other',
        reason: 'Scratchpad files for current session are allowed for writing'
      }
    };
  }

  // 其他权限检查...
}

/**
 * 检查文件读取权限
 */
function checkReadPermission(path: string, context: PermissionContext): PermissionDecision {
  // 检查是否在项目临时目录下（包含 scratchpad）
  const projectTempDir = getProjectTempDir(context.workingDir);
  if (path.startsWith(projectTempDir)) {
    return {
      behavior: 'allow',
      decisionReason: {
        type: 'other',
        reason: 'Project temp directory files are allowed for reading'
      }
    };
  }

  // 其他权限检查...
}
```

#### 5. Session 集成

**文件**: `src/core/session.ts`

```typescript
import { ensureScratchpadDir, getScratchpadPath } from '../scratchpad/index.js';

export class Session {
  private scratchpadPath?: string;

  /**
   * 获取 Scratchpad 路径
   */
  getScratchpadPath(): string {
    if (!this.scratchpadPath) {
      this.scratchpadPath = ensureScratchpadDir(
        this.workingDir,
        this.sessionId
      );
    }
    return this.scratchpadPath;
  }
}
```

#### 6. 清理机制

**文件**: `src/scratchpad/cleanup.ts`

```typescript
import { rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 清理过期的 Scratchpad 目录
 * @param maxAgeMs 最大保留时间（毫秒）
 */
export function cleanupOldScratchpads(projectPath: string, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
  const projectTempDir = getProjectTempDir(projectPath);

  if (!existsSync(projectTempDir)) {
    return;
  }

  const now = Date.now();
  const sessions = readdirSync(projectTempDir);

  for (const sessionId of sessions) {
    const sessionDir = join(projectTempDir, sessionId);
    const stats = statSync(sessionDir);

    // 删除超过保留期的目录
    if (now - stats.mtimeMs > maxAgeMs) {
      try {
        rmSync(sessionDir, { recursive: true, force: true });
        console.log(`Cleaned up old scratchpad: ${sessionId}`);
      } catch (error) {
        console.error(`Failed to cleanup scratchpad ${sessionId}:`, error);
      }
    }
  }
}
```

#### 7. Plan Mode 更新

**文件**: `src/tools/planmode.ts` 和 `src/agents/plan.ts`

```typescript
// 将限制说明更新为：
- Creating temporary files anywhere outside the scratchpad directory
```

---

## 测试建议

### 单元测试

```typescript
// tests/scratchpad.test.ts
describe('Scratchpad', () => {
  it('should generate session-specific path', () => {
    const path = getScratchpadPath('/project', 'session-123');
    expect(path).toContain('session-123');
    expect(path).toContain('scratchpad');
  });

  it('should create directory on first access', () => {
    const path = ensureScratchpadDir('/project', 'session-456');
    expect(existsSync(path)).toBe(true);
  });

  it('should recognize scratchpad paths', () => {
    const scratchpadPath = getScratchpadPath('/project', 'session-789');
    const testPath = join(scratchpadPath, 'test.txt');
    expect(isScratchpadPath(testPath, '/project', 'session-789')).toBe(true);
  });
});
```

### 集成测试

1. 验证提示词正确插入
2. 验证权限自动批准
3. 验证目录自动创建
4. 验证会话隔离
5. 验证清理机制

---

## 参考资料

### 官方实现文件
- `node_modules/@anthropic-ai/claude-code/cli.js`
  - 第 4575-4590 行: mY7() 提示词函数
  - 第 4739+ 行: qFA(), ID1(), W91(), VX7() 路径函数
  - CX7(), $X7() 权限检查函数

### 相关代码位置
- 项目提示词系统: `src/prompt/`
- 权限系统: `src/permissions/`
- 会话管理: `src/core/session.ts`

---

## 总结

Scratchpad 功能是官方 Claude Code 提供的一个**会话级临时文件管理**机制，通过以下特性提升用户体验：

1. **隔离性**: 每个会话有独立的临时目录
2. **自动化**: 自动批准 scratchpad 文件的读写权限
3. **清洁性**: 避免污染用户项目和系统 /tmp
4. **可维护**: 提供统一的临时文件清理机制

项目中**完全缺失**此功能，建议按照上述实现步骤补充，以提升：
- 用户体验（减少权限请求）
- 系统健壮性（文件隔离）
- 代码规范性（符合官方设计）

**实现优先级**: 中
**预计工作量**: 2-3 天（包含测试）
