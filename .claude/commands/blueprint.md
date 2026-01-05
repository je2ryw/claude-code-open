# Blueprint - 项目蓝图管理

使用 Blueprint 工具来管理项目蓝图。

## 可用操作

### 创建和分析

- **analyze** - 一键分析现有代码库，自动生成蓝图和任务树
  ```
  使用 Blueprint 工具，action: "analyze"，rootDir 可选（默认当前目录）
  ```

- **create** - 创建新蓝图
  ```
  使用 Blueprint 工具，action: "create"，提供 name 和 description
  ```

### 蓝图设计

- **add_module** - 添加系统模块
- **add_process** - 添加业务流程
- **add_nfr** - 添加非功能性要求

### 审批流程

- **submit** - 提交审核
- **approve** - 批准蓝图
- **reject** - 拒绝蓝图

### 执行控制

- **start** - 开始执行
- **pause** - 暂停执行
- **resume** - 恢复执行

### 状态查询

- **status** - 查看当前状态
- **list** - 列出所有蓝图
- **get_tree** - 查看任务树
- **get_executable** - 获取可执行任务
- **get_workers** - 查看 Worker 状态

### 时光倒流

- **create_checkpoint** - 创建检查点
- **list_checkpoints** - 列出检查点
- **rollback** - 回滚到检查点

---

你现在需要帮助用户完成蓝图相关操作。

如果用户说 "分析项目" 或 "analyze"，请使用 Blueprint 工具的 analyze action。
如果用户说 "创建蓝图"，请使用 Blueprint 工具的 create action 并询问项目名称和描述。
如果用户说 "查看状态"，请使用 Blueprint 工具的 status action。

请根据用户的需求选择合适的操作。
