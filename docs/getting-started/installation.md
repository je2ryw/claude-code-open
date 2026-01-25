# 安装指南

本文档详细介绍如何在不同操作系统上安装和配置 Claude Code 开源项目。

## 系统要求

### 最低要求
- **Node.js:** >= 18.0.0 (推荐 20.x LTS)
- **npm:** >= 9.0.0
- **内存:** >= 4GB RAM
- **磁盘空间:** >= 500MB

### 推荐配置
- **Node.js:** 20.x LTS
- **npm:** 10.x
- **内存:** >= 8GB RAM
- **终端:** 支持 ANSI 颜色和 Unicode

### 操作系统支持

| 系统 | 支持状态 | 特殊说明 |
|------|---------|---------|
| Linux (Ubuntu/Debian) | ✅ 完全支持 | 推荐使用,支持 Bubblewrap 沙箱 |
| macOS | ✅ 完全支持 | 支持 Tmux 多终端 |
| Windows 10/11 | ✅ 完全支持 | 需要 PowerShell 5.1+ 或 WSL2 |
| WSL2 | ✅ 完全支持 | 推荐 Windows 用户使用 |

## 安装步骤

### 1. 克隆仓库

```bash
# HTTPS 方式
git clone https://github.com/kill136/claude-code.git

# SSH 方式
git clone git@github.com:kill136/claude-code.git

# 进入项目目录
cd claude-code
```

### 2. 安装依赖

```bash
# 使用 npm
npm install

# 或使用 pnpm (推荐,更快)
pnpm install

# 或使用 yarn
yarn install
```

**注意事项:**
- 首次安装可能需要 3-5 分钟,包括下载 Tree-sitter WASM 和 Ripgrep 二进制
- 如遇网络问题,可配置国内镜像:
  ```bash
  npm config set registry https://registry.npmmirror.com
  ```

### 3. 编译项目

```bash
# 编译 TypeScript 到 dist/
npm run build

# 或开发模式 (热重载)
npm run dev
```

### 4. 配置 API Key

选择以下任一方式配置:

#### 方式 1: 环境变量 (推荐)

**Linux/macOS:**
```bash
# 临时设置 (仅当前会话)
export ANTHROPIC_API_KEY="sk-ant-xxx"

# 永久设置 (添加到 ~/.bashrc 或 ~/.zshrc)
echo 'export ANTHROPIC_API_KEY="sk-ant-xxx"' >> ~/.bashrc
source ~/.bashrc
```

**Windows PowerShell:**
```powershell
# 临时设置
$env:ANTHROPIC_API_KEY="sk-ant-xxx"

# 永久设置 (系统环境变量)
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'sk-ant-xxx', 'User')
```

**Windows CMD:**
```cmd
set ANTHROPIC_API_KEY=sk-ant-xxx
```

#### 方式 2: 配置文件

创建配置文件 `~/.claude/settings.json`:

**Linux/macOS:**
```bash
mkdir -p ~/.claude
cat > ~/.claude/settings.json << EOF
{
  "apiKey": "sk-ant-xxx",
  "defaultModel": "claude-sonnet-4-20250514",
  "maxTokens": 32000
}
EOF
```

**Windows PowerShell:**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude"
@"
{
  "apiKey": "sk-ant-xxx",
  "defaultModel": "claude-sonnet-4-20250514",
  "maxTokens": 32000
}
"@ | Out-File -FilePath "$env:USERPROFILE\.claude\settings.json" -Encoding utf8
```

### 5. 验证安装

```bash
# 检查版本
node dist/cli.js --version

# 测试运行
node dist/cli.js "Hello, Claude!"

# 或开发模式
npm run dev
```

预期输出:
```
Claude Code v2.1.14
┌─────────────────────────────────────────┐
│ Claude (Sonnet 4.5)                     │
│ Hello! How can I help you today?        │
└─────────────────────────────────────────┘
```

## 可选组件安装

### Bubblewrap 沙箱 (仅 Linux)

提供 Bash 命令隔离执行:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install bubblewrap

# Arch Linux
sudo pacman -S bubblewrap

# Fedora
sudo dnf install bubblewrap

# 验证安装
bwrap --version
```

### Tmux 多终端 (Linux/macOS)

支持多终端会话管理:

```bash
# Ubuntu/Debian
sudo apt install tmux

# macOS (Homebrew)
brew install tmux

# Arch Linux
sudo pacman -S tmux

# 验证安装
tmux -V
```

**Windows 用户:** 使用 WSL2 或 Windows Terminal 的多标签功能。

### Ripgrep (可选)

项目内置 vendored 版本,但可使用系统版本:

```bash
# Ubuntu/Debian
sudo apt install ripgrep

# macOS
brew install ripgrep

# Windows (Chocolatey)
choco install ripgrep

# 启用系统 ripgrep
export USE_BUILTIN_RIPGREP=0
```

## 全局安装 (可选)

将 Claude Code 安装为全局命令:

```bash
# 链接到全局
npm link

# 现在可以直接使用
claude-code "Analyze this project"

# 取消链接
npm unlink -g claude-code
```

## Docker 安装 (备选方案)

适用于无法安装 Node.js 的环境:

```bash
# 构建镜像
docker build -t claude-code .

# 运行容器
docker run -it --rm \
  -e ANTHROPIC_API_KEY="sk-ant-xxx" \
  -v $(pwd):/workspace \
  claude-code

# 或使用 docker-compose
docker-compose up
```

**Dockerfile 示例:**
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

ENTRYPOINT ["node", "dist/cli.js"]
```

## 故障排查

### 问题 1: 找不到 ANTHROPIC_API_KEY

**症状:**
```
Error: ANTHROPIC_API_KEY not found
```

**解决:**
1. 检查环境变量: `echo $ANTHROPIC_API_KEY` (Linux/macOS) 或 `echo %ANTHROPIC_API_KEY%` (Windows)
2. 确认配置文件存在: `cat ~/.claude/settings.json`
3. 重新加载环境: `source ~/.bashrc`

### 问题 2: 编译错误

**症状:**
```
TS2307: Cannot find module '@anthropic-ai/sdk'
```

**解决:**
```bash
# 清除缓存
rm -rf node_modules package-lock.json

# 重新安装
npm install

# 检查 Node 版本
node -v  # 应该 >= 18.0.0
```

### 问题 3: 权限错误 (Linux)

**症状:**
```
EACCES: permission denied
```

**解决:**
```bash
# 修复 npm 权限
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### 问题 4: 中文显示乱码 (Windows)

**症状:**
终端显示乱码字符

**解决:**
```powershell
# PowerShell 设置 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 或使用 Windows Terminal (推荐)
# 下载: https://aka.ms/terminal
```

## 下一步

安装完成后,推荐阅读:
- [快速入门](./quickstart.md) - 5分钟上手教程
- [基础概念](./concepts.md) - 核心概念解释
- [配置指南](../api/configuration.md) - 详细配置选项

## 获取帮助

遇到问题?
- 查看 [FAQ](../appendix/faq.md)
- 提交 [Issue](https://github.com/kill136/claude-code/issues)
- 加入 [Discord](https://discord.gg/bNyJKk6PVZ) 社区
