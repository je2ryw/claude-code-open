# Rules 系统提示词对比报告

## 概述

本文档对比项目中 Rules 系统（CLAUDE.md）的实现与官方源码的差异。

**对比时间**: 2025-12-30
**项目路径**: `/home/user/claude-code-open/src/rules/`
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 核心常量对比

### 官方实现

**文件位置**: `cli.js` (行1600附近)

```javascript
var NI5 = "Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.",
km = 40000,      // CLAUDE.md 大小警告阈值
cKA = 3000,      // 未知用途
MI5 = 5,         // 最大递归深度
xV,              // 缓存函数
JJ0 = () => {    // CLAUDE.md 格式化函数
  let A = xV(), Q = [];
  for (let B of A)
    if (B.content) {
      let G = B.type === "Project"
        ? " (project instructions, checked into the codebase)"
        : B.type === "Local"
          ? " (user's private project instructions, not checked in)"
          : " (user's private global instructions for all projects)";
      Q.push(`Contents of ${B.path}${G}:

${B.content}`);
    }
  if (Q.length === 0) return "";
  return `${NI5}

${Q.join(`

`)}`;
};
```

### 项目实现

**文件位置**: `/home/user/claude-code-open/src/config/claude-md-parser.ts`

```typescript
/**
 * 注入到系统提示
 */
injectIntoSystemPrompt(basePrompt: string): string {
  const info = this.parse();

  if (!info.exists || !info.content.trim()) {
    return basePrompt;
  }

  // 按照官方格式注入
  return `${basePrompt}

# claudeMd
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of ${this.claudeMdPath} (project instructions, checked into the codebase):

${info.content}

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.`;
}
```

---

## 关键差异

### 1. ✅ 系统提示词前缀（完全一致）

**官方**:
```
"Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written."
```

**项目**:
```
"Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written."
```

**结论**: ✅ **完全一致**

---

### 2. ❌ 文件发现机制（有差异）

#### 官方实现的文件查找

官方使用 `xV` 缓存函数，支持多种文件和路径：

```javascript
// 支持的文件列表（从cli.js推断）
const CLAUDE_MD_FILES = [
  'CLAUDE.md',                    // 项目根目录
  '.claude/CLAUDE.md',            // .claude 子目录
  'CLAUDE.local.md',              // 本地私有配置
  '.claude/rules/*.md',           // rules 目录下的规则文件
];

// 支持的类型
- "Project": 项目级配置（会被 git 追踪）
- "Local": 本地私有配置（不会被 git 追踪）
- "User": 用户全局配置（~/.claude/）
- "Managed": 托管配置（官方提供）
```

**官方的查找逻辑**:
1. 从当前目录向上遍历，直到根目录
2. 支持 `@filepath` 语法引用其他文件
3. 支持 frontmatter 中的 `paths` 字段过滤适用范围
4. 支持 `.claude/rules/` 目录下的条件规则

#### 项目实现的文件查找

```typescript
// 项目只支持单个文件
constructor(workingDir?: string) {
  const dir = workingDir || process.cwd();
  this.claudeMdPath = path.join(dir, 'CLAUDE.md');  // 固定路径
}
```

**项目的查找逻辑**:
1. 仅查找当前目录的 `CLAUDE.md`
2. 不支持向上遍历
3. 不支持多文件
4. 不支持 Local、User、Managed 类型

**结论**: ❌ **重大差异 - 项目实现过于简化**

---

### 3. ❌ 内容格式化（有差异）

#### 官方格式

```
${NI5}

Contents of /path/to/CLAUDE.md (project instructions, checked into the codebase):

${content}

Contents of /path/to/CLAUDE.local.md (user's private project instructions, not checked in):

${content}

Contents of ~/.claude/CLAUDE.md (user's private global instructions for all projects):

${content}
```

**特点**:
- 支持多个文件，每个文件单独列出
- 根据文件类型添加不同的说明文本
- 文件之间用两个空行分隔

#### 项目格式

```
${basePrompt}

# claudeMd
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of ${this.claudeMdPath} (project instructions, checked into the codebase):

${info.content}

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
```

**特点**:
- 只支持单个文件
- 多了 `# claudeMd` 标题
- 多了结尾的 IMPORTANT 提示

**结论**: ❌ **有差异 - 项目添加了额外的标题和结尾提示**

---

### 4. ❌ 高级特性缺失

#### 官方支持的高级特性

1. **文件引用 (@语法)**
   ```javascript
   function OI5(A, Q) {
     // 使用正则匹配 @filepath 语法
     let W = /(?:^|\s)@((?:[^\s\\]|\\ )+)/g, K;
     while ((K = W.exec(I)) !== null) {
       let V = K[1];
       // 解析并加载引用的文件
     }
   }
   ```

2. **Frontmatter paths 过滤**
   ```javascript
   function LI5(A) {
     let {frontmatter: Q, content: B} = NV(A);
     if (!Q.paths) return {content: B};
     let G = NCB(Q.paths).map((Z) => {
       return Z.endsWith("/**") ? Z.slice(0, -3) : Z
     }).filter((Z) => Z.length > 0);
     if (G.length === 0 || G.every((Z) => Z === "**"))
       return {content: B};
     return {content: B, paths: G};
   }
   ```

   示例 frontmatter:
   ```yaml
   ---
   paths:
     - src/**
     - tests/**
   ---
   ```

3. **.claude/rules/ 目录支持**
   - 支持条件规则（基于文件路径过滤）
   - 支持多层嵌套
   - 支持 glob 模式

4. **外部文件包含警告**
   ```javascript
   async function pY2() {
     let A = dG();
     if (A.hasClaudeMdExternalIncludesApproved ||
         A.hasClaudeMdExternalIncludesWarningShown)
       return false;
     return IJ0();
   }
   ```

5. **文件大小检查**
   ```javascript
   function g2A() {
     return xV().filter((A) => A.content.length > km);  // km = 40000
   }
   ```

#### 项目实现

```typescript
// 无上述任何高级特性
// 仅基础的单文件解析
```

**结论**: ❌ **项目缺少所有高级特性**

---

## 完整对比表

| 功能特性 | 官方实现 | 项目实现 | 状态 |
|---------|---------|---------|------|
| 系统提示前缀 | "Codebase and user instructions..." | 相同 | ✅ 一致 |
| 文件查找 | 多文件、向上遍历、多类型 | 单文件、固定路径 | ❌ 差异 |
| 文件类型支持 | Project, Local, User, Managed | 仅 Project | ❌ 差异 |
| 多文件合并 | ✅ 支持 | ❌ 不支持 | ❌ 缺失 |
| @filepath 引用 | ✅ 支持 | ❌ 不支持 | ❌ 缺失 |
| Frontmatter paths | ✅ 支持 | ❌ 不支持 | ❌ 缺失 |
| .claude/rules/ 目录 | ✅ 支持 | ❌ 不支持 | ❌ 缺失 |
| 文件大小警告 | ✅ 支持 (>40KB) | ✅ 支持 (>50KB) | ⚠️ 阈值不同 |
| 外部文件警告 | ✅ 支持 | ❌ 不支持 | ❌ 缺失 |
| 格式化输出 | 多文件分别列出 | 单文件 | ❌ 差异 |
| 结尾提示 | 无 | "IMPORTANT: this context..." | ⚠️ 额外内容 |
| # claudeMd 标题 | 无 | 有 | ⚠️ 额外内容 |

---

## 代码结构对比

### 官方代码结构

```
官方源码 (cli.js)
├── 常量定义
│   ├── NI5: 系统提示前缀
│   ├── km: 文件大小阈值 (40000)
│   ├── MI5: 最大递归深度 (5)
│   └── CLAUDE_MD_FILES: 文件名列表
├── 文件读取
│   ├── gY2(): 读取单个文件
│   ├── bk(): 递归加载文件（支持@引用）
│   └── pKA(): 加载rules目录
├── 内容解析
│   ├── LI5(): 解析frontmatter
│   ├── OI5(): 提取@引用
│   └── NV(): frontmatter解析器
├── 文件发现
│   ├── xV(): 缓存的文件查找
│   ├── mY2(): 项目级文件
│   ├── uY2(): 用户级文件
│   └── dY2(): 条件规则
└── 格式化输出
    ├── JJ0(): 格式化所有规则
    └── g2A(): 检查大文件
```

### 项目代码结构

```
项目实现
├── /src/config/claude-md-parser.ts
│   ├── ClaudeMdParser 类
│   ├── parse(): 解析单个文件
│   ├── injectIntoSystemPrompt(): 注入系统提示
│   ├── exists(): 检查文件存在
│   ├── watch(): 监听文件变化
│   ├── create(): 创建模板
│   ├── validate(): 验证格式
│   └── getStats(): 获取统计信息
└── /src/rules/index.ts
    ├── ProjectRules 接口
    ├── findClaudeMd(): 查找文件（简化版）
    ├── parseClaudeMd(): 解析Markdown
    ├── extractRules(): 提取规则
    ├── loadProjectRules(): 加载项目规则
    └── generateSystemPromptAddition(): 生成系统提示
```

---

## 详细功能差异

### 1. 文件类型支持

#### 官方 - 4种类型

```javascript
// 1. Managed - 官方管理的规则
let Y = h2A("Managed");
Q.push(...bk(Y, "Managed", B, Z));

// 2. User - 用户全局规则 (~/.claude/)
if (UV("userSettings")) {
  let W = h2A("User");
  Q.push(...bk(W, "User", B, true));
}

// 3. Project - 项目规则
if (UV("projectSettings")) {
  let K = fk(W, "CLAUDE.md");
  Q.push(...bk(K, "Project", B, Z));
}

// 4. Local - 本地私有规则
if (UV("localSettings")) {
  let K = fk(W, "CLAUDE.local.md");
  Q.push(...bk(K, "Local", B, Z));
}
```

每种类型在输出时有不同的说明：
- **Project**: "(project instructions, checked into the codebase)"
- **Local**: "(user's private project instructions, not checked in)"
- **User**: "(user's private global instructions for all projects)"

#### 项目 - 仅支持 Project

```typescript
// 固定查找当前目录的 CLAUDE.md
this.claudeMdPath = path.join(dir, 'CLAUDE.md');

// 输出固定为 Project 类型
`Contents of ${this.claudeMdPath} (project instructions, checked into the codebase):`
```

---

### 2. 文件查找机制

#### 官方 - 完整的层级查找

```javascript
// 向上遍历到根目录
let X = [], I = nQ();  // nQ() 获取当前目录
while (I !== UI5(I).root) {
  X.push(I);
  I = QG1(I);  // 向上一级
}

// 在每个目录查找
for (let W of X.reverse()) {
  if (UV("projectSettings")) {
    let K = fk(W, "CLAUDE.md");
    Q.push(...bk(K, "Project", B, Z));

    let V = fk(W, ".claude", "CLAUDE.md");
    Q.push(...bk(V, "Project", B, Z));

    let H = fk(W, ".claude", "rules");
    Q.push(...pKA({rulesDir: H, ...}));
  }
}
```

支持的路径：
```
/project/
├── CLAUDE.md                           ✅ 查找
├── .claude/
│   ├── CLAUDE.md                       ✅ 查找
│   └── rules/
│       ├── general.md                  ✅ 查找
│       └── typescript/
│           └── style.md                ✅ 查找
├── src/
│   └── (向上查找，能找到父级的 CLAUDE.md)
```

#### 项目 - 固定路径查找

```typescript
// 仅查找固定路径
constructor(workingDir?: string) {
  const dir = workingDir || process.cwd();
  this.claudeMdPath = path.join(dir, 'CLAUDE.md');
}

// 支持的路径
/project/
└── CLAUDE.md                           ✅ 查找
    ├── .claude/CLAUDE.md              ❌ 不查找
    └── .claude/rules/                 ❌ 不查找
```

---

### 3. 文件引用 (@语法)

#### 官方实现

```javascript
function OI5(A, Q) {
  let B = new Set;
  let Z = new q$({gfm: false}).lex(A);  // Markdown lexer

  function Y(J) {
    for (let X of J) {
      if (X.type === "text") {
        let I = X.text || "";
        let W = /(?:^|\s)@((?:[^\s\\]|\\ )+)/g;
        let K;
        while ((K = W.exec(I)) !== null) {
          let V = K[1];
          if (!V) continue;
          V = V.replace(/\\ /g, " ");

          // 支持多种路径格式
          if (V.startsWith("./") ||
              V.startsWith("~/") ||
              V.startsWith("/") && V !== "/" ||
              !V.startsWith("@") &&
              !V.match(/^[#%^&*()]+/) &&
              V.match(/^[a-zA-Z0-9._-]/)) {
            let D = q4(V, QG1(Q));  // 解析相对路径
            B.add(D);
          }
        }
      }
    }
  }

  Y(Z);
  return [...B];
}
```

**使用示例**:

```markdown
# CLAUDE.md

这是项目的基础规则。

更多详细的规则请参考：
@./docs/coding-style.md
@./docs/architecture.md
@~/.claude/global-rules.md

TypeScript 特定规则：
@./.claude/rules/typescript.md
```

官方会：
1. 解析 Markdown 文本
2. 提取所有 `@filepath` 引用
3. 递归加载这些文件
4. 防止循环引用（最大深度5）
5. 支持相对路径、绝对路径、~路径

#### 项目实现

```typescript
// ❌ 完全不支持文件引用
parse(): ClaudeMdInfo {
  // 仅读取单个文件
  const content = fs.readFileSync(this.claudeMdPath, 'utf-8');
  return { content, path: this.claudeMdPath, exists: true };
}
```

---

### 4. Frontmatter Paths 过滤

#### 官方实现

```javascript
function LI5(A) {
  // 解析 frontmatter
  let {frontmatter: Q, content: B} = NV(A);

  if (!Q.paths) return {content: B};

  // 处理 paths 字段
  let G = NCB(Q.paths).map((Z) => {
    return Z.endsWith("/**") ? Z.slice(0, -3) : Z;
  }).filter((Z) => Z.length > 0);

  if (G.length === 0 || G.every((Z) => Z === "**"))
    return {content: B};

  return {content: B, paths: G};
}

// 条件规则过滤
function BG1(A, Q, B, G, Z) {
  return pKA({
    rulesDir: Q,
    type: B,
    processedPaths: G,
    includeExternal: Z,
    conditionalRule: true
  }).filter((J) => {
    if (!J.globs || J.globs.length === 0) return false;

    let X = B === "Project" ? QG1(QG1(Q)) : nQ();
    let I = qI5(A) ? wI5(X, A) : A;

    // 使用 minimatch 检查路径是否匹配
    return fY2.default().add(J.globs).ignores(I);
  });
}
```

**使用示例**:

```markdown
---
paths:
  - src/api/**
  - src/services/**
---

# API Style Guide

这些规则只适用于 API 和 services 相关的文件。

- 使用 async/await
- 统一错误处理
- ...
```

当用户编辑 `src/api/users.ts` 时，这个规则会被包含。
当用户编辑 `src/components/Button.tsx` 时，这个规则会被忽略。

#### 项目实现

```typescript
// ❌ 完全不支持 frontmatter
parse(): ClaudeMdInfo {
  const content = fs.readFileSync(this.claudeMdPath, 'utf-8');
  // 直接返回原始内容，不解析 frontmatter
  return { content, path: this.claudeMdPath, exists: true };
}
```

---

### 5. .claude/rules/ 目录支持

#### 官方实现

```javascript
// 递归扫描 rules 目录
function pKA({rulesDir: A, type: Q, processedPaths: B,
              includeExternal: G, conditionalRule: Z,
              visitedDirs: Y = new Set}) {
  if (Y.has(A)) return [];  // 防止循环

  try {
    let J = jA();  // 文件系统
    if (!J.existsSync(A) || !J.statSync(A).isDirectory())
      return [];

    let {resolvedPath: X, isSymlink: I} = eX(J, A);
    if (Y.add(A), I) Y.add(X);  // 处理符号链接

    let W = [];
    let K = J.readdirSync(X);

    for (let V of K) {
      let H = fk(A, V.name);
      let {resolvedPath: D, isSymlink: F} = eX(J, H);
      let E = F ? J.statSync(D) : null;
      let z = E ? E.isDirectory() : V.isDirectory();
      let $ = E ? E.isFile() : V.isFile();

      if (z) {
        // 递归处理子目录
        W.push(...pKA({
          rulesDir: D, type: Q, processedPaths: B,
          includeExternal: G, conditionalRule: Z,
          visitedDirs: Y
        }));
      } else if ($ && V.name.endsWith(".md")) {
        // 加载 .md 文件
        let L = bk(D, Q, B, G);
        W.push(...L.filter((N) =>
          Z ? N.globs : !N.globs  // 条件规则过滤
        ));
      }
    }
    return W;
  } catch (J) {
    // 错误处理
    return [];
  }
}
```

**目录结构示例**:

```
.claude/
└── rules/
    ├── general.md              # 通用规则
    ├── typescript/
    │   ├── style.md            # TS 样式规则
    │   └── testing.md          # TS 测试规则
    ├── react/
    │   ├── components.md       # React 组件规则
    │   └── hooks.md            # React Hooks 规则
    └── api/
        └── rest.md             # REST API 规则
```

每个文件可以包含 frontmatter 指定适用范围：

```markdown
---
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# TypeScript Style Guide
...
```

#### 项目实现

```typescript
// ❌ 不支持 rules 目录
// 仅支持根目录的 CLAUDE.md
```

---

## 实际使用对比

### 场景1: 基本项目

#### 官方能力
```
project/
├── CLAUDE.md                    ✅ 加载
├── .claude/
│   └── CLAUDE.md                ✅ 加载
└── src/
```

#### 项目能力
```
project/
├── CLAUDE.md                    ✅ 加载
└── src/
```

### 场景2: 复杂项目

#### 官方能力
```
project/
├── CLAUDE.md                              ✅ 加载（基础规则）
├── CLAUDE.local.md                        ✅ 加载（本地私有）
├── .claude/
│   ├── CLAUDE.md                          ✅ 加载
│   └── rules/
│       ├── typescript.md                  ✅ 加载
│       │   # frontmatter: paths: src/**/*.ts
│       ├── react.md                       ✅ 加载
│       │   # frontmatter: paths: src/**/*.tsx
│       └── api/
│           └── rest.md                    ✅ 加载
│               # frontmatter: paths: src/api/**
└── docs/
    └── style-guide.md                     ✅ 通过 @引用 加载

# 在 CLAUDE.md 中：
# @./docs/style-guide.md
```

**输出格式**:
```
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of /project/CLAUDE.md (project instructions, checked into the codebase):

# Project Rules
...

Contents of /project/CLAUDE.local.md (user's private project instructions, not checked in):

# My Private Settings
...

Contents of /project/.claude/rules/typescript.md (project instructions, checked into the codebase):

# TypeScript Rules
...

Contents of /project/docs/style-guide.md (project instructions, checked into the codebase):

# Style Guide
...
```

#### 项目能力
```
project/
├── CLAUDE.md                    ✅ 加载
└── 其他所有文件                  ❌ 不支持
```

**输出格式**:
```
${basePrompt}

# claudeMd
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of /project/CLAUDE.md (project instructions, checked into the codebase):

# Project Rules
...

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
```

---

## 提示词完整对比

### 官方完整提示词

```
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of /path/to/managed/CLAUDE.md (managed instructions):

[Managed 内容]

Contents of /path/to/.claude/CLAUDE.md (project instructions, checked into the codebase):

[Project 内容]

Contents of /path/to/CLAUDE.local.md (user's private project instructions, not checked in):

[Local 内容]

Contents of ~/.claude/CLAUDE.md (user's private global instructions for all projects):

[User 内容]

Contents of /path/to/.claude/rules/typescript.md (project instructions, checked into the codebase):

[TypeScript 规则]

Contents of /path/to/docs/style-guide.md (project instructions, checked into the codebase):

[通过 @ 引用的内容]
```

### 项目完整提示词

```
${basePrompt}

# claudeMd
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of /path/to/CLAUDE.md (project instructions, checked into the codebase):

[Project 内容]

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
```

---

## 建议修复清单

### 🔴 高优先级（核心功能缺失）

1. **文件查找机制**
   - [ ] 实现向上遍历查找 CLAUDE.md
   - [ ] 支持 `.claude/CLAUDE.md` 路径
   - [ ] 支持 `CLAUDE.local.md`
   - [ ] 支持 `.claude/rules/` 目录

2. **多文件支持**
   - [ ] 实现多文件合并逻辑
   - [ ] 实现文件类型分类（Project, Local, User, Managed）
   - [ ] 实现正确的文件说明文本

3. **格式化输出**
   - [ ] 移除 `# claudeMd` 标题
   - [ ] 移除结尾的 IMPORTANT 提示
   - [ ] 实现多文件的正确分隔格式

### 🟡 中优先级（增强功能）

4. **文件引用支持**
   - [ ] 实现 `@filepath` 语法解析
   - [ ] 实现递归文件加载
   - [ ] 实现循环引用检测（最大深度限制）

5. **Frontmatter 支持**
   - [ ] 实现 frontmatter 解析
   - [ ] 实现 paths 字段过滤
   - [ ] 实现条件规则匹配

6. **目录扫描**
   - [ ] 实现 `.claude/rules/` 递归扫描
   - [ ] 实现 glob 模式匹配
   - [ ] 实现符号链接处理

### 🟢 低优先级（完善功能）

7. **用户配置支持**
   - [ ] 支持 `~/.claude/CLAUDE.md`
   - [ ] 支持用户级 rules 目录
   - [ ] 实现 Managed 配置

8. **安全和错误处理**
   - [ ] 实现外部文件引用警告
   - [ ] 实现文件权限错误处理
   - [ ] 实现大文件警告（40KB）

---

## 总结

### 主要问题

1. **功能完整性不足**: 项目实现只有官方功能的 ~20%
2. **架构过于简化**: 缺少官方的文件类型系统、缓存系统
3. **扩展性较差**: 不支持高级特性如文件引用、条件规则
4. **格式不一致**: 添加了官方没有的标题和提示

### 核心差异点

| 方面 | 官方 | 项目 | 影响 |
|-----|------|------|------|
| 文件发现 | 智能遍历 | 固定路径 | 🔴 严重 |
| 多文件支持 | ✅ | ❌ | 🔴 严重 |
| 文件引用 | ✅ | ❌ | 🟡 中等 |
| 条件规则 | ✅ | ❌ | 🟡 中等 |
| 输出格式 | 标准 | 有差异 | 🟡 中等 |

### 优先修复建议

**阶段1**: 基础功能对齐
1. 实现向上遍历查找
2. 支持多文件合并
3. 修正输出格式

**阶段2**: 高级功能
4. 实现文件引用
5. 实现 frontmatter 解析
6. 支持 .claude/rules/ 目录

**阶段3**: 完善功能
7. 用户配置支持
8. 安全和错误处理优化

---

## 附录

### A. 官方常量汇总

```javascript
// 提示词前缀
const NI5 = "Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.";

// 文件大小阈值
const km = 40000;      // 40KB
const cKA = 3000;      // 未知用途
const MI5 = 5;         // 最大递归深度

// 文件查找列表
const CLAUDE_MD_FILES = [
  'CLAUDE.md',
  '.claude.md',
  'claude.md',
  '.claude/CLAUDE.md',
  '.claude/instructions.md',
];

// 设置文件列表
const SETTINGS_FILES = [
  '.claude/settings.json',
  '.claude/settings.local.json',
];
```

### B. 相关文件列表

**项目文件**:
- `/home/user/claude-code-open/src/rules/index.ts`
- `/home/user/claude-code-open/src/config/claude-md-parser.ts`

**官方文件**:
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (行1600附近)

### C. 参考链接

- 官方文档: https://code.claude.com/docs/en/overview
- CLAUDE.md 示例: `/home/user/claude-code-open/CLAUDE.md`
