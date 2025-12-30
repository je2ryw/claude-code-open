# 插件系统提示词对比报告

## 概述

本文档对比了项目中的插件系统实现与官方 Claude Code CLI (v2.0.76) 中插件系统相关的提示词和描述。

---

## 1. 插件架构差异

### 项目实现 (`/home/user/claude-code-open/src/plugins/`)

项目实现了一个完整的插件系统架构：

#### 核心组件
- **PluginManager**: 插件管理器，负责发现、加载、卸载、依赖管理
- **PluginContext**: 插件上下文，提供沙箱化的 API
- **PluginToolExecutor**: 工具执行器
- **PluginCommandExecutor**: 命令执行器
- **PluginSkillExecutor**: 技能执行器
- **PluginRecommender**: 插件推荐系统

#### 插件能力
1. **工具注册**: 插件可以注册自定义工具
2. **命令注册**: 插件可以注册 CLI 命令
3. **技能注册**: 插件可以注册可调用的提示词/技能
4. **钩子系统**: 支持生命周期钩子（beforeMessage, afterMessage, beforeToolCall 等）
5. **热重载**: 支持插件热重载
6. **依赖管理**: 支持插件间依赖关系
7. **版本检查**: 兼容性检查（Node.js、Claude Code 版本）
8. **内联插件**: 支持无文件系统的内联插件

#### 插件配置
- 配置目录：`~/.claude/plugins/` 和 `./.claude/plugins/`
- 配置文件：`~/.claude/plugins.json`
- 插件元数据：`package.json` 格式

### 官方实现 (从 cli.js 提取)

官方实现的插件系统特征：

#### 插件结构
- 使用 `.claude-plugin/` 目录
- 支持两种清单文件：
  - `.claude-plugin/marketplace.json` (优先)
  - `.claude-plugin/plugin.json`

#### 插件市场
- 支持插件市场系统
- 命令：`/plugin marketplace add anthropics/claude-code`
- 插件安装：`/plugin install <plugin>@<marketplace>`
- 示例：`frontend-design@claude-code-plugins`

#### 插件技能
- 插件可以提供技能（skills/prompts）
- 显示格式：`**Available plugin skills:**`
- 技能格式：`- /<skill-name>: <description>`

---

## 2. 提示词和错误信息对比

### 插件验证提示词

#### 官方源码
```
Validate a plugin or marketplace manifest file or directory.

Examples:
  /plugin validate .claude-plugin/plugin.json
  /plugin validate /path/to/plugin-directory
  /plugin validate .

When given a directory, automatically validates .claude-plugin/marketplace.json
or .claude-plugin/plugin.json (prefers marketplace if both exist).

Or from the command line:
  claude plugin validate <path>
```

#### 项目实现
```typescript
// CLI 帮助文本
pluginCommand
  .command('validate <path>')
  .description('Validate a plugin or manifest file')
  .action(async (pluginPath) => {
    await validatePlugin(pluginPath);
  });

// 验证输出
console.log(`Validating plugin at ${pluginPath}...`);
console.log(`✓ Validation passed: Plugin is valid`);
console.log(`  Name:    ${manifest.name}`);
console.log(`  Version: ${manifest.version}`);
```

**差异分析：**
- ✅ 官方支持 `.claude-plugin/` 目录结构
- ❌ 项目使用标准 `package.json`，缺少对 `.claude-plugin/` 的支持
- ❌ 项目不支持 marketplace.json
- ✅ 项目有更详细的验证输出格式

---

### 插件加载错误提示

#### 官方源码
```
Plugin manifest has {count} validation error(s):
{errors}

Validation errors: {details}

Please fix the manifest or remove it. The plugin cannot load with an invalid manifest.
```

```
Plugin {name} has a corrupt manifest file at {path}. Parse error: {error}

JSON parse error: {details}

Please fix the manifest or remove it. The plugin cannot load with an invalid manifest.
```

#### 项目实现
```typescript
// 验证错误
if (errors.length > 0) {
  console.log(`\n✗ Validation failed with ${errors.length} error(s):\n`);
  for (const error of errors) {
    console.log(`  - ${error}`);
  }
}

// JSON 解析错误
try {
  manifest = JSON.parse(manifestContent);
} catch (err) {
  console.error(`✗ Invalid JSON in manifest file`);
  process.exit(1);
}

// 加载错误
catch (err) {
  const errorMsg = err instanceof Error ? err.message : String(err);
  state.error = errorMsg;
  state.loaded = false;
  this.emit('plugin:error', name, err);
  console.error(`Failed to load plugin ${name}:`, errorMsg);
}
```

**差异分析：**
- ✅ 官方有统一的错误提示格式
- ⚠️ 项目错误信息较分散，缺少"Please fix the manifest or remove it"的引导性提示
- ✅ 项目使用符号（✓、✗）使输出更直观
- ❌ 项目缺少"The plugin cannot load with an invalid manifest"的明确说明

---

### 插件技能展示

#### 官方源码
```javascript
let J = Q.filter((K) => K.type === "prompt" && K.source === "plugin");
if (J.length > 0) {
  let K = J.map((V) => `- /${V.name}: ${V.description}`).join('\n');
  B.push(`**Available plugin skills:**\n${K}`);
}
```

#### 项目实现
```typescript
/**
 * 列出所有技能（格式化输出）
 */
listSkills(): string {
  const skills = this.getAvailableSkills();
  if (skills.length === 0) {
    return 'No skills available.';
  }

  // 按分类分组
  const categories = new Map<string, SkillDefinition[]>();
  for (const skill of skills) {
    const category = skill.category || 'General';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(skill);
  }

  let output = 'Available Plugin Skills:\n\n';
  for (const [category, categorySkills] of Array.from(categories.entries())) {
    output += `${category}:\n`;
    for (const skill of categorySkills) {
      output += `  /${skill.name}: ${skill.description}\n`;
    }
    output += '\n';
  }

  return output;
}
```

**差异分析：**
- ✅ 官方使用 Markdown 粗体格式：`**Available plugin skills:**`
- ✅ 项目支持按分类展示技能
- ⚠️ 项目格式为 `Available Plugin Skills:` 而非 `**Available plugin skills:**`
- ✅ 两者都使用 `- /${name}: ${description}` 格式

---

## 3. CLI 命令对比

### 官方命令（从源码推断）

```bash
# 插件验证
/plugin validate .claude-plugin/plugin.json
/plugin validate /path/to/plugin-directory
claude plugin validate <path>

# 插件安装
/plugin install <plugin>@<marketplace>
/plugin install frontend-design@claude-code-plugins

# 插件市场
/plugin marketplace add anthropics/claude-code
```

### 项目命令实现

```bash
# 插件列表
claude plugin list
claude plugin ls
claude plugin list --all
claude plugin list --verbose

# 插件安装
claude plugin install <plugin>
claude plugin i <plugin>
claude plugin install <plugin> --no-auto-load
claude plugin install <plugin> --enable-hot-reload

# 插件移除
claude plugin remove <plugin>
claude plugin uninstall <plugin>

# 插件启用/禁用
claude plugin enable <plugin>
claude plugin disable <plugin>

# 插件更新
claude plugin update <plugin>

# 插件信息
claude plugin info <plugin>

# 插件验证
claude plugin validate <path>
```

**差异分析：**
- ❌ 项目不支持 `/plugin` 斜杠命令格式（仅支持 `claude plugin`）
- ❌ 项目不支持插件市场功能
- ❌ 项目不支持 `<plugin>@<marketplace>` 语法
- ✅ 项目提供了更多管理命令（list, enable, disable, info, update）
- ✅ 项目支持热重载功能

---

## 4. 插件推荐系统

### 官方实现

官方有针对性的插件推荐提示：

```
Working with HTML/CSS? Install the frontend-design plugin:
/plugin install frontend-design@claude-code-plugins
```

这个提示会在用户处理 HTML/CSS 文件时自动显示。

### 项目实现

项目实现了完整的插件推荐系统：

```typescript
export class PluginRecommender {
  private recommendationRules: Array<{
    pluginPattern: RegExp;
    triggers: {
      fileExtensions?: string[];
      keywords?: string[];
      taskTypes?: string[];
    };
    reason: string;
  }> = [
    // 前端开发插件推荐
    {
      pluginPattern: /frontend|html|css|design/i,
      triggers: {
        fileExtensions: ['.html', '.htm', '.css', '.scss', '.sass', '.less'],
        keywords: ['html', 'css', 'frontend', 'design', 'styling'],
      },
      reason: 'Working with HTML/CSS files',
    },
    // ... 更多规则
  ];

  async recommend(context: {
    currentFiles?: string[];
    recentCommands?: string[];
    userQuery?: string;
    taskType?: string;
  }): Promise<PluginRecommendation[]>
}
```

**差异分析：**
- ✅ 官方实现简单但有效的上下文推荐
- ✅ 项目实现了更复杂的推荐系统，支持：
  - 文件扩展名匹配
  - 关键词匹配
  - 任务类型匹配
  - 相关度评分
  - 多规则支持
- ⚠️ 项目的推荐系统可能过于复杂，官方的简单提示可能更实用

---

## 5. 主要差异总结

### 架构差异

| 特性 | 官方实现 | 项目实现 |
|------|---------|---------|
| 插件目录 | `.claude-plugin/` | `package.json` 标准格式 |
| 清单文件 | `marketplace.json` / `plugin.json` | `package.json` |
| 插件市场 | ✅ 支持 | ❌ 不支持 |
| 依赖管理 | ❓ 未知 | ✅ 完整支持 |
| 热重载 | ❓ 未知 | ✅ 支持 |
| 内联插件 | ❓ 未知 | ✅ 支持 |
| 钩子系统 | ❓ 未知 | ✅ 完整实现 |

### 提示词差异

| 场景 | 官方提示词 | 项目提示词 | 对齐程度 |
|------|-----------|-----------|---------|
| 技能展示 | `**Available plugin skills:**` | `Available Plugin Skills:` | ⚠️ 格式不同 |
| 验证错误 | "Please fix the manifest or remove it. The plugin cannot load with an invalid manifest." | "✗ Validation failed with {n} error(s)" | ⚠️ 缺少引导性说明 |
| 推荐提示 | "Working with HTML/CSS? Install the..." | 复杂的推荐系统 | ⚠️ 方法不同 |

### 用户体验差异

| 方面 | 官方实现 | 项目实现 |
|------|---------|---------|
| 命令格式 | `/plugin` 斜杠命令 | `claude plugin` CLI 命令 |
| 安装来源 | 支持市场 `@marketplace` | 仅支持本地路径 |
| 错误提示 | 清晰、引导性强 | 详细但较分散 |
| 管理功能 | 基础功能 | 完整管理命令 |

---

## 6. 改进建议

### 高优先级

1. **支持 `.claude-plugin/` 目录结构**
   ```typescript
   // 添加对官方插件结构的支持
   const pluginManifestPaths = [
     path.join(pluginPath, '.claude-plugin/marketplace.json'),
     path.join(pluginPath, '.claude-plugin/plugin.json'),
     path.join(pluginPath, 'package.json'),
   ];
   ```

2. **统一错误提示格式**
   ```typescript
   // 使用官方的引导性错误信息
   throw new Error(
     `Plugin manifest has ${errors.length} validation error(s):\n` +
     `${errors.map(e => `  - ${e}`).join('\n')}\n\n` +
     `Please fix the manifest or remove it. The plugin cannot load with an invalid manifest.`
   );
   ```

3. **对齐技能展示格式**
   ```typescript
   // 使用 Markdown 粗体格式
   output = '**Available plugin skills:**\n';
   for (const skill of skills) {
     output += `- /${skill.name}: ${skill.description}\n`;
   }
   ```

### 中优先级

4. **添加插件市场支持**
   - 实现 `@marketplace` 语法
   - 支持从远程市场安装插件
   - 添加 `marketplace add/remove` 命令

5. **支持斜杠命令格式**
   - 在会话中支持 `/plugin` 命令
   - 保持 `claude plugin` CLI 命令作为备选

6. **简化推荐系统**
   - 参考官方的简单上下文推荐
   - 减少复杂度，提高实用性

### 低优先级

7. **文档完善**
   - 说明与官方插件系统的兼容性
   - 提供插件开发指南
   - 添加迁移文档

---

## 7. 兼容性评估

### 官方插件是否能在项目中运行？

**可能性：低到中等**

**兼容问题：**
1. ❌ 目录结构不兼容（`.claude-plugin/` vs `package.json`）
2. ❌ 清单格式不同（`marketplace.json` vs `package.json`）
3. ❓ API 差异（无法从混淆代码中提取完整 API）
4. ✅ 技能/命令/工具概念相似

**需要适配器：**
```typescript
class OfficialPluginAdapter {
  /**
   * 将官方插件格式转换为项目格式
   */
  async adapt(officialPluginPath: string): Promise<Plugin> {
    // 读取 .claude-plugin/plugin.json 或 marketplace.json
    const manifest = await this.readOfficialManifest(officialPluginPath);

    // 转换为 package.json 格式
    const packageJson = this.convertToPackageJson(manifest);

    // 包装插件接口
    return this.wrapPlugin(manifest, packageJson);
  }
}
```

---

## 8. 关键发现

### 官方设计理念

1. **市场驱动**: 官方强调插件市场，使用 `@marketplace` 语法
2. **简洁优先**: 提示词简洁明了，引导性强
3. **上下文感知**: 基于文件类型自动推荐相关插件
4. **专用目录**: 使用 `.claude-plugin/` 作为插件标识

### 项目设计理念

1. **功能完整**: 实现了完整的插件管理系统
2. **标准格式**: 使用 npm 标准的 `package.json`
3. **灵活扩展**: 支持钩子、热重载、依赖管理等高级功能
4. **命令丰富**: 提供详细的管理命令

### 两者的权衡

| 方面 | 官方优势 | 项目优势 |
|------|---------|---------|
| 易用性 | ✅ 市场安装更简单 | ✅ 本地开发更灵活 |
| 生态系统 | ✅ 官方市场支持 | ⚠️ 需自建生态 |
| 功能性 | ⚠️ 功能可能较基础 | ✅ 功能更完整 |
| 兼容性 | ✅ 官方标准 | ⚠️ 需要适配 |

---

## 9. 结论

**主要差异：**
1. 插件结构：官方使用 `.claude-plugin/`，项目使用 `package.json`
2. 插件来源：官方支持市场，项目仅支持本地
3. 提示词风格：官方简洁引导性强，项目详细但较分散
4. 功能范围：项目实现更完整，但可能不兼容官方插件

**建议行动：**
1. 添加对 `.claude-plugin/` 的支持以兼容官方插件
2. 统一错误提示格式以提供更好的用户体验
3. 考虑实现插件市场功能以扩展生态系统
4. 保持项目的高级功能（钩子、热重载等）作为差异化优势

**最终评估：**
项目的插件系统在功能上更完整，但在兼容性和用户体验上需要向官方对齐。建议采用"双模式"策略：同时支持官方格式和项目格式，提供适配层确保兼容性。

---

## 附录：官方源码片段

### A. 插件技能展示代码
```javascript
let J = Q.filter((K) => K.type === "prompt" && K.source === "plugin");
if (J.length > 0) {
  let K = J.map((V) => `- /${V.name}: ${V.description}`).join('\n');
  B.push(`**Available plugin skills:**\n${K}`);
}
```

### B. 插件验证错误提示
```javascript
throw Error(`Plugin ${Q} has invalid manifest file at ${A}.

Validation errors: ${X}

Please fix the manifest or remove it. The plugin cannot load with an invalid manifest.`);
```

### C. 插件推荐提示
```javascript
{
  id: "frontend-design-plugin",
  content: async (A) => {
    let Q = sQ("claude", A.theme);
    return `Working with HTML/CSS? Install the frontend-design plugin:
${B("/plugin install frontend-design@claude-code-plugins")}`;
  },
  cooldownSessions: 3,
  async isRelevant(A) {
    if (Vz("frontend-design@claude-code-plugins")) return false;
    if (!A?.readFileState) return false;
    return vk(A.readFileState).some((B) => /\.(html|css|htm)$/i.test(B));
  }
}
```

### D. 插件验证命令提示
```
Validate a plugin or marketplace manifest file or directory.

Examples:
  /plugin validate .claude-plugin/plugin.json
  /plugin validate /path/to/plugin-directory
  /plugin validate .

When given a directory, automatically validates .claude-plugin/marketplace.json
or .claude-plugin/plugin.json (prefers marketplace if both exist).

Or from the command line:
  claude plugin validate <path>
```

---

**生成时间**: 2025-12-30
**官方版本**: Claude Code CLI v2.0.76
**项目路径**: /home/user/claude-code-open/src/plugins/
