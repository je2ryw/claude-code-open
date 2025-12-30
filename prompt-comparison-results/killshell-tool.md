# KillShell 工具提示词对比报告

## 概述
本文档对比了项目实现与官方源码中 KillShell/KillBash 工具的提示词差异。

## 1. 工具名称

| 项目 | 工具名称 |
|------|---------|
| 项目实现 | `KillShell` |
| 官方源码 | `KillShell` (内部名称可能为 `vV1`) |

✅ **一致**

## 2. 描述文本 (Description)

### 项目实现
文件位置: `/home/user/claude-code-open/src/tools/bash.ts` (第 825-830 行)

```typescript
description = `Kills a running background task by its ID.

Usage:
  - Takes a shell_id (or task_id) parameter identifying the task to kill
  - Returns a success or failure status
  - Use this tool when you need to terminate a long-running task`;
```

### 官方源码
文件位置: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 2885-2889 行)

```javascript
- Kills a running background bash shell by its ID
- Takes a shell_id parameter identifying the shell to kill
- Returns a success or failure status
- Use this tool when you need to terminate a long-running shell
- Shell IDs can be found using the /tasks command
```

## 3. 差异分析

### 3.1 主要差异

| 方面 | 项目实现 | 官方源码 | 影响 |
|------|----------|----------|------|
| **第一行描述** | "Kills a running background **task**" | "Kills a running background **bash shell**" | ⚠️ 中等 - 术语不一致 |
| **参数说明** | "shell_id **(or task_id)**" | "shell_id" | ⚠️ 轻微 - 项目提供了额外的向后兼容性说明 |
| **使用场景** | "terminate a long-running **task**" | "terminate a long-running **shell**" | ⚠️ 轻微 - 术语不一致 |
| **/tasks 命令提示** | ❌ 缺失 | ✅ "Shell IDs can be found using the /tasks command" | ⚠️ 中等 - 缺少重要的使用提示 |

### 3.2 格式差异

| 方面 | 项目实现 | 官方源码 |
|------|----------|----------|
| **格式风格** | 多行文本块，带 "Usage:" 标题 | 简洁的项目符号列表 (markdown 格式) |
| **结构** | 分段式（描述 + Usage 列表） | 平铺式列表 |

## 4. 输入 Schema 对比

### 项目实现
```typescript
{
  type: 'object',
  properties: {
    shell_id: {
      type: 'string',
      description: 'The ID of the background task to kill (shell_id or task_id)',
    },
  },
  required: ['shell_id'],
}
```

### 官方源码（从 sdk-tools.d.ts 推断）
```typescript
export interface KillShellInput {
  /**
   * The ID of the background shell to kill
   */
  shell_id: string;
}
```

**差异**:
- 项目实现在 schema description 中明确说明支持 `shell_id` 或 `task_id`
- 官方只提到 `shell_id`
- ⚠️ 轻微差异 - 项目提供了更多向后兼容性信息

## 5. 功能实现对比

### 项目实现特点
```typescript
async execute(input: { shell_id: string }): Promise<BashResult> {
  const task = backgroundTasks.get(input.shell_id);
  if (!task) {
    return { success: false, error: `Task ${input.shell_id} not found` };
  }

  try {
    task.process.kill('SIGTERM');
    // 关闭输出流
    task.outputStream?.end();

    // 等待一秒，如果还在运行则强制杀死
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (task.status === 'running') {
      task.process.kill('SIGKILL');
    }

    backgroundTasks.delete(input.shell_id);

    return {
      success: true,
      output: `Task ${input.shell_id} killed`,
    };
  } catch (err) {
    return { success: false, error: `Failed to kill task: ${err}` };
  }
}
```

### 官方源码关键验证逻辑
从反编译代码推断的验证流程：
```javascript
async validateInput({shell_id:A},{getAppState:Q}){
  let G=(await Q()).tasks?.[A];
  if(!G)
    return{result:!1,message:`No shell found with ID: ${A}`,errorCode:1};
  if(G.type!=="local_bash")
    return{result:!1,message:`Task ${A} is not a local bash task`,errorCode:2};
  return{result:!0}
}

async call({shell_id:A},{getAppState:Q,setAppState:B,abortController:G}){
  let Y=(await Q()).tasks?.[A];
  if(!Y)throw Error(`No shell found with ID: ${A}`);
  if(Y.type!=="local_bash")throw Error(`Task ${A} is not a local bash task`);
  if(Y.status!=="running")
    throw Error(`Shell ${A} is not running, so cannot be killed (status: ${Y.status})`);
  return await So.kill(A,{abortController:G,getAppState:Q,setAppState:B}),
    {data:{message:`Successfully killed shell: ${A} (${Y.command})`,shell_id:A}}
}
```

**关键差异**:
1. ⚠️ **类型检查**: 官方会检查 `type !== "local_bash"`，项目实现未做此检查
2. ⚠️ **状态检查**: 官方会检查 `status !== "running"`，项目实现未明确检查状态
3. ⚠️ **错误消息**: 官方返回更详细的错误信息，包含命令内容

## 6. 建议修改

### 6.1 高优先级修改

#### 修改 1: 统一术语和添加 /tasks 提示
```typescript
description = `Kills a running background bash shell by its ID.

Usage:
  - Takes a shell_id parameter identifying the shell to kill
  - Returns a success or failure status
  - Use this tool when you need to terminate a long-running shell
  - Shell IDs can be found using the /tasks command`;
```

**理由**:
- 与官方保持术语一致（使用 "bash shell" 而非 "task"）
- 添加 `/tasks` 命令提示，帮助用户发现如何获取 shell ID

### 6.2 中优先级修改

#### 修改 2: 添加任务类型和状态检查
```typescript
async execute(input: { shell_id: string }): Promise<BashResult> {
  const task = backgroundTasks.get(input.shell_id);
  if (!task) {
    return { success: false, error: `No shell found with ID: ${input.shell_id}` };
  }

  // 添加类型检查（如果有多种任务类型）
  // if (task.type !== 'local_bash') {
  //   return { success: false, error: `Task ${input.shell_id} is not a local bash task` };
  // }

  // 添加状态检查
  if (task.status !== 'running') {
    return {
      success: false,
      error: `Shell ${input.shell_id} is not running, so cannot be killed (status: ${task.status})`
    };
  }

  try {
    task.process.kill('SIGTERM');
    task.outputStream?.end();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (task.status === 'running') {
      task.process.kill('SIGKILL');
    }

    backgroundTasks.delete(input.shell_id);

    // 返回更详细的成功消息
    return {
      success: true,
      output: `Successfully killed shell: ${input.shell_id} (${task.command})`,
    };
  } catch (err) {
    return { success: false, error: `Failed to kill task: ${err}` };
  }
}
```

**理由**:
- 与官方行为一致
- 提供更好的错误处理
- 防止杀死已完成的任务

### 6.3 低优先级修改

#### 修改 3: 调整格式风格
可以考虑将描述格式改为简洁的列表式，与官方风格一致：
```typescript
description = `- Kills a running background bash shell by its ID
- Takes a shell_id parameter identifying the shell to kill
- Returns a success or failure status
- Use this tool when you need to terminate a long-running shell
- Shell IDs can be found using the /tasks command`;
```

**理由**: 与官方格式保持一致，但这主要是风格问题，不影响功能。

## 7. 总结

### 7.1 一致性评分
- ✅ **工具名称**: 100% 一致
- ⚠️ **描述文本**: 70% 相似（缺少 /tasks 提示，术语不一致）
- ⚠️ **输入 Schema**: 95% 一致（项目提供了额外的向后兼容说明）
- ⚠️ **功能实现**: 80% 一致（缺少类型和状态检查）

### 7.2 关键发现

1. **术语差异**: 项目使用 "task"，官方使用 "bash shell"
2. **缺少提示**: 项目未提及 `/tasks` 命令
3. **验证逻辑**: 项目缺少任务类型和运行状态的检查
4. **错误信息**: 项目的错误信息较简单，官方更详细

### 7.3 兼容性影响

- ✅ **向后兼容**: 项目实现支持 `shell_id` 和 `task_id`，提供了更好的向后兼容性
- ⚠️ **行为差异**: 缺少状态检查可能导致尝试杀死已完成的任务
- ✅ **API 兼容**: 输入输出接口与官方兼容

### 7.4 推荐行动

**必须修改**:
1. 将描述中的 "task" 改为 "bash shell"
2. 添加 "Shell IDs can be found using the /tasks command" 提示

**建议修改**:
1. 添加任务运行状态检查
2. 改进错误消息，包含命令信息
3. 如果支持多种任务类型，添加类型检查

**可选修改**:
1. 调整描述格式为列表式（纯风格问题）

---

**生成时间**: 2025-12-30
**对比版本**:
- 项目实现: `/home/user/claude-code-open/src/tools/bash.ts`
- 官方源码: `@anthropic-ai/claude-code@2.0.76` (cli.js)
