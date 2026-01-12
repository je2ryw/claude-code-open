import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import styles from './BlueprintDetailContent.module.css';
import { codebaseApi, fileApi, FileTreeNode, NodeAnalysis, FileContent } from '../../../api/blueprint';


interface BlueprintDetailContentProps {
  blueprintId: string;
  onNavigateToSwarm?: () => void;
  onDeleted?: () => void;
  onRefresh?: () => void;
}

// 视图模式类型
type ViewMode = 'analysis' | 'code';

// 代码符号类型
interface CodeSymbol {
  name: string;
  kind: 'class' | 'method' | 'function' | 'property' | 'interface' | 'type' | 'const' | 'variable';
  line: number;
  detail?: string;
  children?: CodeSymbol[];
}

/**
 * VS Code 风格的代码仓库浏览器
 *
 * 功能：
 * - 左侧显示真实目录结构
 * - 点击节点时调用 Agent 生成语义分析
 * - 支持代码预览和编辑
 * - 分析结果缓存
 */
export const BlueprintDetailContent: React.FC<BlueprintDetailContentProps> = ({
  blueprintId,
  onNavigateToSwarm,
  onDeleted,
  onRefresh,
}) => {
  // 目录树
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  // 展开状态
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['src']));

  // 选中节点
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedIsFile, setSelectedIsFile] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<CodeSymbol | null>(null);

  // 节点分析缓存
  const [analysisCache, setAnalysisCache] = useState<Map<string, NodeAnalysis>>(new Map());

  // 代码符号缓存（文件路径 -> 符号列表）
  const [symbolsCache, setSymbolsCache] = useState<Map<string, CodeSymbol[]>>(new Map());

  // 当前分析状态
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>('analysis');

  // 文件内容相关
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 代码编辑器 ref
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  // 蓝图基本信息
  const [blueprintInfo, setBlueprintInfo] = useState<{
    name: string;
    description: string;
    status: string;
    moduleCount: number;
  } | null>(null);


  // 加载目录树
  useEffect(() => {
    loadFileTree();
    loadBlueprintInfo();
  }, [blueprintId]);

  const loadBlueprintInfo = async () => {
    try {
      const response = await fetch(`/api/blueprint/blueprints/${blueprintId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setBlueprintInfo({
            name: data.data.name,
            description: data.data.description,
            status: data.data.status,
            moduleCount: data.data.modules?.length || 0,
          });
        }
      }
    } catch (err) {
      console.error('加载蓝图信息失败:', err);
    }
  };

  const loadFileTree = async () => {
    try {
      setLoadingTree(true);
      setTreeError(null);

      // 使用封装好的 API 获取目录树
      const tree = await codebaseApi.getFileTree('src');
      setFileTree(tree);
      // 默认展开 src
      setExpandedPaths(new Set(['src']));
    } catch (err: any) {
      setTreeError(err.message);
      // 如果获取失败，使用模拟数据
      setFileTree(createMockFileTree());
    } finally {
      setLoadingTree(false);
    }
  };

  // 模拟目录树（当 API 不可用时）
  const createMockFileTree = (): FileTreeNode => ({
    name: 'src',
    path: 'src',
    type: 'directory',
    children: [
      { name: 'agents', path: 'src/agents', type: 'directory', children: [] },
      { name: 'blueprint', path: 'src/blueprint', type: 'directory', children: [] },
      { name: 'commands', path: 'src/commands', type: 'directory', children: [] },
      { name: 'config', path: 'src/config', type: 'directory', children: [] },
      { name: 'core', path: 'src/core', type: 'directory', children: [
        { name: 'client.ts', path: 'src/core/client.ts', type: 'file' },
        { name: 'loop.ts', path: 'src/core/loop.ts', type: 'file' },
        { name: 'session.ts', path: 'src/core/session.ts', type: 'file' },
      ]},
      { name: 'hooks', path: 'src/hooks', type: 'directory', children: [] },
      { name: 'tools', path: 'src/tools', type: 'directory', children: [] },
      { name: 'ui', path: 'src/ui', type: 'directory', children: [] },
      { name: 'web', path: 'src/web', type: 'directory', children: [] },
      { name: 'cli.ts', path: 'src/cli.ts', type: 'file' },
      { name: 'index.ts', path: 'src/index.ts', type: 'file' },
    ],
  });

  // 分析节点
  const analyzeNode = useCallback(async (path: string) => {
    // 检查缓存
    if (analysisCache.has(path)) {
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      // 使用封装好的 API 分析节点
      const analysis = await codebaseApi.analyzeNode(path, blueprintId);
      setAnalysisCache(prev => new Map(prev).set(path, analysis));
    } catch (err: any) {
      setAnalysisError(err.message);
      // 生成模拟分析结果
      const mockAnalysis = createMockAnalysis(path);
      setAnalysisCache(prev => new Map(prev).set(path, mockAnalysis));
    } finally {
      setAnalyzing(false);
    }
  }, [blueprintId, analysisCache]);


  // 解析代码符号
  const parseCodeSymbols = useCallback((content: string, filePath: string): CodeSymbol[] => {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');

    // 解析类
    const classRegex = /^export\s+(?:abstract\s+)?class\s+(\w+)/;
    // 解析接口
    const interfaceRegex = /^export\s+interface\s+(\w+)/;
    // 解析类型别名
    const typeRegex = /^export\s+type\s+(\w+)/;
    // 解析函数
    const functionRegex = /^export\s+(?:async\s+)?function\s+(\w+)/;
    // 解析常量
    const constRegex = /^export\s+const\s+(\w+)/;
    // 解析方法（类内部）
    const methodRegex = /^\s+(?:async\s+)?(\w+)\s*\(/;
    // 解析属性（类内部）
    const propertyRegex = /^\s+(?:private|public|protected)?\s*(\w+):\s*(.+);/;

    let currentClass: CodeSymbol | null = null;
    let classStartLine = -1;

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      const lineNumber = index + 1;

      // 类定义
      const classMatch = line.match(classRegex);
      if (classMatch) {
        currentClass = {
          name: classMatch[1],
          kind: 'class',
          line: lineNumber,
          children: [],
        };
        symbols.push(currentClass);
        classStartLine = index;
        return;
      }

      // 接口定义
      const interfaceMatch = line.match(interfaceRegex);
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          kind: 'interface',
          line: lineNumber,
        });
        return;
      }

      // 类型别名
      const typeMatch = line.match(typeRegex);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: 'type',
          line: lineNumber,
        });
        return;
      }

      // 函数定义
      const functionMatch = line.match(functionRegex);
      if (functionMatch) {
        symbols.push({
          name: functionMatch[1],
          kind: 'function',
          line: lineNumber,
        });
        return;
      }

      // 常量定义
      const constMatch = line.match(constRegex);
      if (constMatch) {
        symbols.push({
          name: constMatch[1],
          kind: 'const',
          line: lineNumber,
        });
        return;
      }

      // 类内部的成员（方法和属性）
      if (currentClass && classStartLine >= 0) {
        // 检测类结束
        if (trimmedLine === '}' && index > classStartLine) {
          currentClass = null;
          classStartLine = -1;
          return;
        }

        // 方法
        const methodMatch = line.match(methodRegex);
        if (methodMatch && !trimmedLine.startsWith('//')) {
          currentClass.children = currentClass.children || [];
          currentClass.children.push({
            name: methodMatch[1],
            kind: 'method',
            line: lineNumber,
          });
          return;
        }

        // 属性
        const propertyMatch = line.match(propertyRegex);
        if (propertyMatch) {
          currentClass.children = currentClass.children || [];
          currentClass.children.push({
            name: propertyMatch[1],
            kind: 'property',
            line: lineNumber,
            detail: propertyMatch[2],
          });
          return;
        }
      }
    });

    return symbols;
  }, []);

  // 加载文件内容
  const loadFileContent = useCallback(async (path: string) => {
    setLoadingFile(true);
    setFileError(null);

    try {
      const content = await fileApi.getContent(path);
      setFileContent(content);
      setEditedContent(content.content);
      setHasUnsavedChanges(false);

      // 解析代码符号
      const symbols = parseCodeSymbols(content.content, path);
      setSymbolsCache(prev => new Map(prev).set(path, symbols));
    } catch (err: any) {
      setFileError(err.message);
      setFileContent(null);
    } finally {
      setLoadingFile(false);
    }
  }, [parseCodeSymbols]);

  // 保存文件
  const saveFile = async () => {
    if (!selectedPath || !hasUnsavedChanges) return;

    setSaving(true);
    try {
      await fileApi.saveContent(selectedPath, editedContent);
      setHasUnsavedChanges(false);
      // 更新缓存的文件内容
      if (fileContent) {
        setFileContent({
          ...fileContent,
          content: editedContent,
          modifiedAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      setFileError(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 模拟分析结果
  const createMockAnalysis = (path: string): NodeAnalysis => {
    const name = path.split('/').pop() || path;
    const isFile = name.includes('.');

    if (isFile) {
      return {
        path,
        name,
        type: 'file',
        summary: `${name} 文件`,
        description: `这是 ${path} 文件。点击"重新分析"按钮来获取 AI 生成的详细语义分析。`,
        exports: ['(点击生成分析查看)'],
        dependencies: ['(点击生成分析查看)'],
        techStack: ['TypeScript'],
        keyPoints: ['需要 AI 分析来获取详细信息'],
        analyzedAt: new Date().toISOString(),
      };
    }

    return {
      path,
      name,
      type: 'directory',
      summary: `${name} 模块目录`,
      description: `这是 ${path} 目录。点击"重新分析"按钮来获取 AI 生成的详细语义分析。`,
      responsibilities: ['(点击生成分析查看)'],
      techStack: ['TypeScript'],
      children: [],
      analyzedAt: new Date().toISOString(),
    };
  };

  // 选中节点
  const handleSelectNode = (path: string, isFile: boolean) => {
    // 检查是否有未保存的更改
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('有未保存的更改，确定要切换文件吗？');
      if (!confirmed) return;
    }

    setSelectedPath(path);
    setSelectedIsFile(isFile);
    setHasUnsavedChanges(false);

    if (isFile) {
      // 文件：加载内容，同时也触发语义分析
      loadFileContent(path);
      setViewMode('code');
      // 也为文件生成语义分析
      if (!analysisCache.has(path)) {
        analyzeNode(path);
      }
    } else {
      // 目录：只显示分析视图，不显示代码tab
      setViewMode('analysis');
      if (!analysisCache.has(path)) {
        analyzeNode(path);
      }
    }
  };

  // 切换展开
  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // 获取当前选中节点的分析
  const currentAnalysis = selectedPath ? analysisCache.get(selectedPath) : null;

  // 重新生成分析
  const regenerateAnalysis = async () => {
    if (!selectedPath) return;

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      // 1. 清除前端缓存
      setAnalysisCache(prev => {
        const next = new Map(prev);
        next.delete(selectedPath);
        return next;
      });

      // 2. 清除后端缓存
      await fetch('/api/blueprint/cache/path', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath }),
      });

      // 3. 重新分析
      await analyzeNode(selectedPath);
    } catch (err: any) {
      setAnalysisError(`重新分析失败: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // 处理代码编辑
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setEditedContent(newContent);
    setHasUnsavedChanges(newContent !== fileContent?.content);
  };

  // 处理 Tab 键（插入制表符）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = editedContent.substring(0, start) + '  ' + editedContent.substring(end);
        setEditedContent(newValue);
        setHasUnsavedChanges(true);
        // 恢复光标位置
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        }, 0);
      }
    } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveFile();
    }
  };

  // 获取符号图标
  const getSymbolIcon = (kind: CodeSymbol['kind']): string => {
    switch (kind) {
      case 'class': return '🏛️';
      case 'interface': return '📋';
      case 'type': return '🔤';
      case 'function': return '🔧';
      case 'method': return '⚙️';
      case 'property': return '🔹';
      case 'const': return '💎';
      case 'variable': return '📦';
      default: return '•';
    }
  };

  // 渲染代码符号
  const renderCodeSymbol = (symbol: CodeSymbol, filePath: string, depth: number): React.ReactNode => {
    const symbolKey = `${filePath}:${symbol.name}:${symbol.line}`;
    const isExpanded = expandedPaths.has(symbolKey);
    const isSelected = selectedSymbol?.name === symbol.name && selectedSymbol?.line === symbol.line;
    const hasChildren = symbol.children && symbol.children.length > 0;

    return (
      <div key={symbolKey}>
        <div
          className={`${styles.treeItem} ${styles.symbolItem} ${isSelected ? styles.selected : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedSymbol(symbol);
            setSelectedPath(filePath);
            // 跳转到代码行
            if (editorRef.current) {
              editorRef.current.revealLineInCenter(symbol.line);
              editorRef.current.setPosition({ lineNumber: symbol.line, column: 1 });
              editorRef.current.focus();
            }
            // 如果有子项，切换展开状态
            if (hasChildren) {
              toggleExpand(symbolKey);
            }
          }}
        >
          <span className={styles.treeIcon}>
            {hasChildren ? (isExpanded ? '▼' : '▶') : '　'}
          </span>
          <span className={styles.fileIcon}>{getSymbolIcon(symbol.kind)}</span>
          <span className={styles.treeName}>{symbol.name}</span>
          <span className={styles.symbolLine}>:{symbol.line}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {symbol.children!.map(child => renderCodeSymbol(child, filePath, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // 渲染目录树节点
  const renderTreeNode = (node: FileTreeNode, depth: number = 0): React.ReactNode => {
    const hasChildren = node.type === 'directory' && node.children && node.children.length > 0;
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedPath === node.path && !selectedSymbol;
    const isAnalyzed = analysisCache.has(node.path);
    const symbols = node.type === 'file' ? symbolsCache.get(node.path) : undefined;
    const hasSymbols = symbols && symbols.length > 0;

    return (
      <div key={node.path}>
        <div
          className={`${styles.treeItem} ${isSelected ? styles.selected : ''} ${isAnalyzed ? styles.analyzed : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (node.type === 'directory') {
              toggleExpand(node.path);
            } else {
              // 文件：展开/折叠符号列表
              toggleExpand(node.path);
            }
            handleSelectNode(node.path, node.type === 'file');
            setSelectedSymbol(null); // 清除符号选择
          }}
        >
          <span className={styles.treeIcon}>
            {node.type === 'directory' ? (isExpanded ? '▼' : '▶') :
             hasSymbols ? (isExpanded ? '▼' : '▶') : '　'}
          </span>
          <span className={styles.fileIcon}>
            {node.type === 'directory' ? (isExpanded ? '📂' : '📁') : getFileIcon(node.name)}
          </span>
          <span className={styles.treeName}>{node.name}</span>
          {isAnalyzed && <span className={styles.analyzedDot}>●</span>}
        </div>
        {/* 目录的子节点 */}
        {node.type === 'directory' && hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
        {/* 文件的代码符号 */}
        {node.type === 'file' && hasSymbols && isExpanded && (
          <div>
            {symbols!.map(symbol => renderCodeSymbol(symbol, node.path, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // 获取文件图标
  const getFileIcon = (name: string): string => {
    if (name.endsWith('.ts') || name.endsWith('.tsx')) return '📘';
    if (name.endsWith('.js') || name.endsWith('.jsx')) return '📒';
    if (name.endsWith('.css')) return '🎨';
    if (name.endsWith('.json')) return '📋';
    if (name.endsWith('.md')) return '📝';
    return '📄';
  };

  // 获取 Monaco 编辑器语言
  const getMonacoLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'json': 'json',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'md': 'markdown',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'sh': 'shell',
      'bash': 'shell',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'sql': 'sql',
      'graphql': 'graphql',
      'vue': 'vue',
      'svelte': 'svelte',
    };
    return languageMap[ext] || 'plaintext';
  };

  // Monaco Editor 挂载回调
  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 配置 TypeScript/JavaScript 语言服务（用于跳转支持）
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowJs: true,
      typeRoots: ['node_modules/@types'],
    });

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowJs: true,
    });

    // 启用诊断
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    // 注册自定义定义提供器（用于跨文件跳转）
    const languages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];
    languages.forEach(lang => {
      monaco.languages.registerDefinitionProvider(lang, {
        provideDefinition: async (model, position) => {
          const word = model.getWordAtPosition(position);
          if (!word) return null;

          const lineContent = model.getLineContent(position.lineNumber);

          // 检测 import 语句
          const importMatch = lineContent.match(/from\s+['"]([^'"]+)['"]/);
          if (importMatch) {
            const importPath = importMatch[1];
            // 解析相对路径
            let targetPath = importPath;
            if (importPath.startsWith('.')) {
              const currentDir = selectedPath?.split('/').slice(0, -1).join('/') || '';
              targetPath = resolveRelativePath(currentDir, importPath);
            }

            // 尝试添加扩展名
            const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
            for (const ext of extensions) {
              const fullPath = targetPath + ext;
              // 检查文件是否存在（通过尝试加载）
              try {
                const response = await fetch(`/api/blueprint/file/content?path=${encodeURIComponent(fullPath)}`);
                if (response.ok) {
                  // 找到文件，跳转并选中该文件
                  handleSelectNode(fullPath, true);
                  return null; // 返回 null，因为我们已经手动处理了跳转
                }
              } catch {
                continue;
              }
            }
          }

          return null;
        }
      });
    });

    // 添加键盘快捷键
    editor.addAction({
      id: 'custom-save',
      label: '保存文件',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        saveFile();
      }
    });

    editor.addAction({
      id: 'custom-goto-definition',
      label: '跳转到定义',
      keybindings: [monaco.KeyCode.F12],
      run: () => {
        editor.trigger('keyboard', 'editor.action.revealDefinition', null);
      }
    });

    // 双击跳转到定义
    editor.onMouseDown((e) => {
      if (e.event.detail === 2) { // 双击
        const position = e.target.position;
        if (position) {
          // 延迟执行，让默认的双击选中完成
          setTimeout(() => {
            editor.trigger('keyboard', 'editor.action.revealDefinition', null);
          }, 100);
        }
      }
    });
  };

  // 解析相对路径
  const resolveRelativePath = (basePath: string, relativePath: string): string => {
    const baseParts = basePath.split('/').filter(Boolean);
    const relativeParts = relativePath.split('/');

    for (const part of relativeParts) {
      if (part === '..') {
        baseParts.pop();
      } else if (part !== '.') {
        baseParts.push(part);
      }
    }

    return baseParts.join('/');
  };

  // Monaco Editor 内容变化回调
  const handleEditorChange = (value: string | undefined) => {
    const newContent = value || '';
    setEditedContent(newContent);
    setHasUnsavedChanges(newContent !== fileContent?.content);
  };

  // 跳转到定义（模拟 LSP Go to Definition）
  const handleGoToDefinition = async () => {
    if (!editorRef.current || !monacoRef.current || !selectedPath) return;

    const editor = editorRef.current;
    const position = editor.getPosition();
    if (!position) return;

    // 触发 Monaco 内置的 Go to Definition
    editor.trigger('keyboard', 'editor.action.revealDefinition', null);
  };

  // 解析依赖路径并尝试定位文件
  const handleDependencyClick = async (dep: string) => {
    // 如果是外部包，忽略
    if (!dep.startsWith('.') && !dep.startsWith('/')) {
      console.log('外部依赖，无法跳转:', dep);
      return;
    }

    if (!selectedPath) return;

    // 解析相对路径
    const currentDir = selectedPath.split('/').slice(0, -1).join('/');
    const resolvedPath = resolveRelativePath(currentDir, dep);

    // 尝试不同的扩展名
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
    for (const ext of extensions) {
      const fullPath = resolvedPath + ext;
      try {
        // 检查文件是否存在（通过API）
        const response = await fetch(`/api/blueprint/file-content?path=${encodeURIComponent(fullPath)}`);
        if (response.ok) {
          // 文件存在，跳转
          handleSelectNode(fullPath, true);
          return;
        }
      } catch {
        continue;
      }
    }

    console.log('无法找到依赖文件:', dep);
  };

  const statusTexts: Record<string, string> = {
    draft: '草稿', review: '审核中', approved: '已批准',
    executing: '执行中', completed: '已完成', paused: '已暂停', modified: '已修改',
  };


  // 渲染代码视图
  const renderCodeView = () => {
    if (loadingFile) {
      return (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>正在加载文件内容...</p>
        </div>
      );
    }

    if (fileError) {
      return (
        <div className={styles.errorState}>
          <p className={styles.errorText}>{fileError}</p>
          <button className={styles.retryButton} onClick={() => selectedPath && loadFileContent(selectedPath)}>
            重试
          </button>
        </div>
      );
    }

    if (!fileContent) {
      return (
        <div className={styles.welcomePage}>
          <h2 className={styles.welcomeTitle}>选择文件查看代码</h2>
          <p className={styles.welcomeDesc}>点击左侧文件树中的文件来查看和编辑代码</p>
        </div>
      );
    }

    const filename = selectedPath?.split('/').pop() || 'file.txt';
    const language = getMonacoLanguage(filename);

    return (
      <div className={styles.codeEditor}>
        <div className={styles.codeHeader}>
          <div className={styles.codeInfo}>
            <span className={styles.codeLanguage}>{language}</span>
            <span className={styles.codeSize}>{formatFileSize(fileContent.size)}</span>
            {hasUnsavedChanges && <span className={styles.unsavedBadge}>未保存</span>}
          </div>
          <div className={styles.codeActions}>
            <button
              className={`${styles.codeBtn} ${isEditing ? styles.active : ''}`}
              onClick={() => setIsEditing(!isEditing)}
              title={isEditing ? '切换到只读模式' : '切换到编辑模式'}
            >
              {isEditing ? '📖 只读' : '✏️ 编辑'}
            </button>
            <button
              className={styles.codeBtn}
              onClick={handleGoToDefinition}
              title="跳转到定义 (F12)"
            >
              🔗 跳转
            </button>
            {hasUnsavedChanges && (
              <button
                className={`${styles.codeBtn} ${styles.saveBtn}`}
                onClick={saveFile}
                disabled={saving}
                title="保存文件 (Ctrl+S)"
              >
                {saving ? '保存中...' : '💾 保存'}
              </button>
            )}
          </div>
        </div>
        <div className={styles.monacoContainer}>
          <Editor
            height="100%"
            language={language}
            value={editedContent}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              readOnly: !isEditing,
              minimap: { enabled: true },
              fontSize: 14,
              fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
              fontLigatures: true,
              lineNumbers: 'on',
              wordWrap: 'off',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              folding: true,
              foldingStrategy: 'indentation',
              showFoldingControls: 'mouseover',
              bracketPairColorization: {
                enabled: true,
              },
              guides: {
                bracketPairs: true,
                indentation: true,
              },
              renderWhitespace: 'selection',
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              smoothScrolling: true,
              tabSize: 2,
              formatOnPaste: true,
              formatOnType: true,
              suggest: {
                showMethods: true,
                showFunctions: true,
                showConstructors: true,
                showFields: true,
                showVariables: true,
                showClasses: true,
                showStructs: true,
                showInterfaces: true,
                showModules: true,
                showProperties: true,
                showEvents: true,
                showOperators: true,
                showUnits: true,
                showValues: true,
                showConstants: true,
                showEnums: true,
                showEnumMembers: true,
                showKeywords: true,
                showWords: true,
                showColors: true,
                showFiles: true,
                showReferences: true,
                showFolders: true,
                showTypeParameters: true,
                showSnippets: true,
              },
              quickSuggestions: {
                other: true,
                comments: true,
                strings: true,
              },
              // LSP 相关选项
              gotoLocation: {
                multiple: 'goto',
                multipleDefinitions: 'goto',
                multipleTypeDefinitions: 'goto',
                multipleDeclarations: 'goto',
                multipleImplementations: 'goto',
                multipleReferences: 'goto',
              },
              hover: {
                enabled: true,
                delay: 300,
              },
              parameterHints: {
                enabled: true,
              },
            }}
          />
        </div>
        <div className={styles.codeFooter}>
          <span className={styles.codeModified}>
            最后修改: {new Date(fileContent.modifiedAt).toLocaleString('zh-CN')}
          </span>
          <span className={styles.codeLines}>
            {editedContent.split('\n').length} 行
          </span>
          <span className={styles.codeShortcuts}>
            F12: 跳转定义 | Ctrl+S: 保存 | Ctrl+Space: 自动补全
          </span>
        </div>
      </div>
    );
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // 渲染分析视图
  const renderAnalysisView = () => {
    // 如果选中了代码符号，显示符号详情
    if (selectedSymbol && selectedPath) {
      return (
        <div className={styles.symbolDetail}>
          <div className={styles.symbolDetailHeader}>
            <span className={styles.symbolDetailIcon}>{getSymbolIcon(selectedSymbol.kind)}</span>
            <div className={styles.symbolDetailTitle}>
              <h2 className={styles.symbolName}>{selectedSymbol.name}</h2>
              <span className={styles.symbolKind}>{selectedSymbol.kind}</span>
              <span className={styles.symbolLocation}>
                {selectedPath}:{selectedSymbol.line}
              </span>
            </div>
          </div>

          {/* 符号类型说明 */}
          <div className={styles.symbolSection}>
            <h3 className={styles.symbolSectionTitle}>类型说明</h3>
            <div className={styles.symbolTypeInfo}>
              {selectedSymbol.kind === 'class' && '类定义 - 封装数据和行为的蓝图'}
              {selectedSymbol.kind === 'interface' && '接口 - 定义对象的形状和契约'}
              {selectedSymbol.kind === 'type' && '类型别名 - 为类型定义一个新名称'}
              {selectedSymbol.kind === 'function' && '函数 - 可重用的代码块'}
              {selectedSymbol.kind === 'method' && '方法 - 类中的函数成员'}
              {selectedSymbol.kind === 'property' && '属性 - 类中的数据成员'}
              {selectedSymbol.kind === 'const' && '常量 - 不可变的值'}
              {selectedSymbol.kind === 'variable' && '变量 - 可变的值'}
            </div>
            {selectedSymbol.detail && (
              <div className={styles.symbolTypeDetail}>
                <code>{selectedSymbol.detail}</code>
              </div>
            )}
          </div>

          {/* 子成员（如果是类） */}
          {selectedSymbol.children && selectedSymbol.children.length > 0 && (
            <div className={styles.symbolSection}>
              <h3 className={styles.symbolSectionTitle}>成员 ({selectedSymbol.children.length})</h3>
              <div className={styles.symbolMembers}>
                {selectedSymbol.children.map((child, i) => (
                  <div key={i} className={styles.symbolMember}>
                    <span className={styles.symbolMemberIcon}>{getSymbolIcon(child.kind)}</span>
                    <span className={styles.symbolMemberName}>{child.name}</span>
                    <span className={styles.symbolMemberKind}>{child.kind}</span>
                    <span className={styles.symbolMemberLine}>:{child.line}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 位置信息 */}
          <div className={styles.symbolSection}>
            <h3 className={styles.symbolSectionTitle}>位置</h3>
            <div className={styles.symbolLocation}>
              <div className={styles.locationItem}>
                <span className={styles.locationLabel}>文件:</span>
                <code className={styles.locationValue}>{selectedPath}</code>
              </div>
              <div className={styles.locationItem}>
                <span className={styles.locationLabel}>行号:</span>
                <code className={styles.locationValue}>{selectedSymbol.line}</code>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!selectedPath) {
      return (
        <div className={styles.welcomePage}>
          <h2 className={styles.welcomeTitle}>
            {blueprintInfo?.name || '代码仓库浏览器'}
          </h2>
          <p className={styles.welcomeDesc}>
            {blueprintInfo?.description || '点击左侧目录树浏览代码结构，选中节点后 AI 将自动分析其语义信息。'}
          </p>

          <div className={styles.welcomeStats}>
            <div className={styles.welcomeStat}>
              <span className={styles.welcomeStatValue}>{analysisCache.size}</span>
              <span className={styles.welcomeStatLabel}>已分析</span>
            </div>
            {blueprintInfo && (
              <div className={styles.welcomeStat}>
                <span className={styles.welcomeStatValue}>{blueprintInfo.moduleCount}</span>
                <span className={styles.welcomeStatLabel}>模块</span>
              </div>
            )}
          </div>

          <div className={styles.welcomeHint}>
            ← 点击左侧目录开始浏览
          </div>

          <div className={styles.welcomeTips}>
            <div className={styles.tipItem}>
              <span className={styles.tipIcon}>📁</span>
              <span>点击目录展开/折叠</span>
            </div>
            <div className={styles.tipItem}>
              <span className={styles.tipIcon}>🔍</span>
              <span>选中节点自动分析语义</span>
            </div>
            <div className={styles.tipItem}>
              <span className={styles.tipIcon}>●</span>
              <span>绿点表示已分析</span>
            </div>
            <div className={styles.tipItem}>
              <span className={styles.tipIcon}>🏛️</span>
              <span>点击文件查看类/方法结构</span>
            </div>
          </div>
        </div>
      );
    }

    if (analyzing) {
      return (
        <div className={styles.analyzingState}>
          <div className={styles.analyzingSpinner}></div>
          <h3 className={styles.analyzingTitle}>正在分析 {selectedPath}</h3>
          <p className={styles.analyzingHint}>AI 正在阅读代码并生成语义分析...</p>
        </div>
      );
    }

    if (analysisError && !currentAnalysis) {
      return (
        <div className={styles.errorState}>
          <p className={styles.errorText}>分析失败: {analysisError}</p>
          <button className={styles.retryButton} onClick={() => analyzeNode(selectedPath)}>
            重试
          </button>
        </div>
      );
    }

    if (currentAnalysis) {
      return (
        <div className={styles.analysisResult}>
          <div className={styles.analysisHeader}>
            <div className={styles.analysisTitle}>
              <span className={styles.analysisIcon}>
                {currentAnalysis.type === 'directory' ? '📁' : '📄'}
              </span>
              <h2 className={styles.analysisPath}>{currentAnalysis.path}</h2>
              <span className={styles.analysisType}>
                {currentAnalysis.type === 'directory' ? '目录' : '文件'}
              </span>
            </div>
            <button
              className={styles.regenerateBtn}
              onClick={regenerateAnalysis}
              title="重新生成分析"
            >
              🔄 重新分析
            </button>
          </div>

          <div className={styles.analysisSummary}>
            {currentAnalysis.summary}
          </div>

          <div className={styles.analysisDescription}>
            {currentAnalysis.description}
          </div>

          {/* 职责（目录） */}
          {currentAnalysis.responsibilities && currentAnalysis.responsibilities.length > 0 && (
            <div className={styles.analysisSection}>
              <h3 className={styles.sectionTitle}>职责</h3>
              <ul className={styles.sectionList}>
                {currentAnalysis.responsibilities.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 导出（文件） */}
          {currentAnalysis.exports && currentAnalysis.exports.length > 0 && (
            <div className={styles.analysisSection}>
              <h3 className={styles.sectionTitle}>导出</h3>
              <div className={styles.exportList}>
                {currentAnalysis.exports.map((e, i) => (
                  <code key={i} className={styles.exportItem}>{e}</code>
                ))}
              </div>
            </div>
          )}

          {/* 依赖 */}
          {currentAnalysis.dependencies && currentAnalysis.dependencies.length > 0 && (
            <div className={styles.analysisSection}>
              <h3 className={styles.sectionTitle}>依赖</h3>
              <div className={styles.depList}>
                {currentAnalysis.dependencies.map((d, i) => {
                  const isInternal = d.startsWith('.') || d.startsWith('/') || d.startsWith('src');
                  return (
                    <span
                      key={i}
                      className={`${styles.depItem} ${isInternal ? styles.clickable : ''}`}
                      onClick={() => isInternal && handleDependencyClick(d)}
                      title={isInternal ? '点击跳转到文件' : '外部依赖'}
                    >
                      {isInternal && '→ '}{d}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 被引用（反向依赖） */}
          {currentAnalysis.reverseDependencies && currentAnalysis.reverseDependencies.length > 0 && (
            <div className={styles.analysisSection}>
              <h3 className={styles.sectionTitle}>被引用 ({currentAnalysis.reverseDependencies.length})</h3>
              <div className={styles.reverseDepList}>
                {currentAnalysis.reverseDependencies.map((rd, i) => (
                  <div
                    key={i}
                    className={styles.reverseDepItem}
                    onClick={() => handleSelectNode(rd.path, true)}
                  >
                    <span className={styles.reverseDepPath}>📄 {rd.path}</span>
                    <span className={styles.reverseDepImports}>
                      使用: {rd.imports.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 关系图谱（文件才显示） */}
          {currentAnalysis.type === 'file' && (currentAnalysis.dependencies?.length > 0 || currentAnalysis.reverseDependencies?.length > 0) && (
            <div className={styles.analysisSection}>
              <h3 className={styles.sectionTitle}>关系图谱</h3>
              <div className={styles.relationshipGraph}>
                {/* 被引用者（上方） */}
                {currentAnalysis.reverseDependencies && currentAnalysis.reverseDependencies.length > 0 && (
                  <div className={styles.graphRow}>
                    <div className={styles.graphNodes}>
                      {currentAnalysis.reverseDependencies.slice(0, 5).map((rd, i) => (
                        <div
                          key={i}
                          className={styles.graphNode}
                          onClick={() => handleSelectNode(rd.path, true)}
                          title={rd.path}
                        >
                          <div className={styles.graphNodeIcon}>📄</div>
                          <div className={styles.graphNodeName}>{rd.path.split('/').pop()}</div>
                          <div className={styles.graphConnector} style={{ top: '100%', height: '20px' }}></div>
                        </div>
                      ))}
                      {currentAnalysis.reverseDependencies.length > 5 && (
                        <div className={styles.graphNodeMore}>
                          +{currentAnalysis.reverseDependencies.length - 5} 更多
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 当前文件（中心） */}
                <div className={styles.graphCenter}>
                  <div className={styles.graphCurrent}>
                    <div className={styles.graphCurrentIcon}>📘</div>
                    <div className={styles.graphCurrentName}>{currentAnalysis.name}</div>
                    <div className={styles.graphCurrentBadge}>当前文件</div>
                  </div>
                </div>

                {/* 依赖项（下方） */}
                {currentAnalysis.dependencies && currentAnalysis.dependencies.length > 0 && (
                  <div className={styles.graphRow}>
                    <div className={styles.graphNodes}>
                      {currentAnalysis.dependencies.slice(0, 5).map((dep, i) => {
                        const isInternal = dep.startsWith('.') || dep.startsWith('/') || dep.startsWith('src');
                        const fileName = dep.split('/').pop() || dep;
                        return (
                          <div
                            key={i}
                            className={`${styles.graphNode} ${!isInternal ? styles.external : ''}`}
                            onClick={() => isInternal && handleDependencyClick(dep)}
                            title={dep}
                          >
                            <div className={styles.graphConnector} style={{ bottom: '100%', height: '20px' }}></div>
                            <div className={styles.graphNodeIcon}>{isInternal ? '📄' : '📦'}</div>
                            <div className={styles.graphNodeName}>{fileName}</div>
                          </div>
                        );
                      })}
                      {currentAnalysis.dependencies.length > 5 && (
                        <div className={styles.graphNodeMore}>
                          +{currentAnalysis.dependencies.length - 5} 更多
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 技术栈 */}
          {currentAnalysis.techStack && currentAnalysis.techStack.length > 0 && (
            <div className={styles.analysisSection}>
              <h3 className={styles.sectionTitle}>技术栈</h3>
              <div className={styles.techTags}>
                {currentAnalysis.techStack.map((t, i) => (
                  <span key={i} className={styles.techTag}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* 关键点 */}
          {currentAnalysis.keyPoints && currentAnalysis.keyPoints.length > 0 && (
            <div className={styles.analysisSection}>
              <h3 className={styles.sectionTitle}>关键点</h3>
              <ul className={styles.keyPointsList}>
                {currentAnalysis.keyPoints.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 子项（目录） */}
          {currentAnalysis.children && currentAnalysis.children.length > 0 && (
            <div className={styles.analysisSection}>
              <h3 className={styles.sectionTitle}>子模块概览</h3>
              <div className={styles.childrenGrid}>
                {currentAnalysis.children.map((c, i) => (
                  <div
                    key={i}
                    className={styles.childCard}
                    onClick={() => {
                      const childPath = `${currentAnalysis.path}/${c.name}`;
                      handleSelectNode(childPath, c.name.includes('.'));
                      setExpandedPaths(prev => new Set(prev).add(currentAnalysis.path));
                    }}
                  >
                    <span className={styles.childName}>{c.name}</span>
                    <span className={styles.childDesc}>{c.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.analysisFooter}>
            <span className={styles.analyzedTime}>
              分析时间: {new Date(currentAnalysis.analyzedAt).toLocaleString('zh-CN')}
            </span>
            {(currentAnalysis as any).fromCache && (
              <span className={styles.cacheBadge} title="此分析结果来自缓存，文件未变化">
                ⚡ 缓存
              </span>
            )}
            {(currentAnalysis as any).fromCache === false && (
              <span className={styles.freshBadge} title="此分析结果是新生成的">
                ✨ 新分析
              </span>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  if (loadingTree) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>正在加载目录结构...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* VS Code 风格主体 */}
      <div className={styles.vscodeLayout}>
        {/* 左侧边栏 - 资源管理器 */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarTitle}>资源管理器</span>
            <button
              className={styles.refreshBtn}
              onClick={loadFileTree}
              title="刷新目录"
            >
              ↻
            </button>
          </div>
          <div className={styles.sidebarContent}>
            {treeError && (
              <div className={styles.treeError}>
                {treeError}
              </div>
            )}
            {fileTree && renderTreeNode(fileTree)}
          </div>
        </div>

        {/* 主编辑区 */}
        <div className={styles.mainPanel}>
          {/* 标签栏 */}
          <div className={styles.tabBar}>
            {selectedPath ? (
              <>
                {/* 分析tab - 目录和文件都显示 */}
                <div
                  className={`${styles.tab} ${viewMode === 'analysis' ? styles.activeTab : ''}`}
                  onClick={() => setViewMode('analysis')}
                >
                  <span className={styles.tabIcon}>🔍</span>
                  <span className={styles.tabName}>{selectedIsFile ? '语义' : '分析'}</span>
                </div>
                {/* 代码编辑tab - 只有文件显示 */}
                {selectedIsFile && (
                  <div
                    className={`${styles.tab} ${viewMode === 'code' ? styles.activeTab : ''}`}
                    onClick={() => setViewMode('code')}
                  >
                    <span className={styles.tabIcon}>📝</span>
                    <span className={styles.tabName}>代码编辑</span>
                    {hasUnsavedChanges && <span className={styles.unsavedDot}>●</span>}
                  </div>
                )}
              </>
            ) : (
              <div className={`${styles.tab} ${styles.activeTab}`}>
                <span className={styles.tabIcon}>🏠</span>
                <span className={styles.tabName}>欢迎</span>
              </div>
            )}

            {/* 当前文件路径 */}
            {selectedPath && (
              <div className={styles.breadcrumb}>
                <span className={styles.breadcrumbPath}>{selectedPath}</span>
              </div>
            )}
          </div>

          {/* 编辑区内容 */}
          <div className={styles.editorContent}>
            {viewMode === 'code' && selectedIsFile ? renderCodeView() : renderAnalysisView()}
          </div>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={styles.statusItem}>
            {selectedPath || '未选择'}
          </span>
        </div>
        <div className={styles.statusRight}>
          {blueprintInfo && (
            <span className={`${styles.statusBadge} ${styles[blueprintInfo.status]}`}>
              {statusTexts[blueprintInfo.status] || blueprintInfo.status}
            </span>
          )}
          <span className={styles.statusItem}>
            {analysisCache.size} 已分析
          </span>
          {analyzing && (
            <span className={styles.statusAnalyzing}>分析中...</span>
          )}
          {saving && (
            <span className={styles.statusSaving}>保存中...</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlueprintDetailContent;
