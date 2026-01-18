/**
 * 影响分析器 (Impact Analyzer)
 *
 * 核心功能：
 * 1. 分析新需求对现有代码库的影响范围
 * 2. 识别需要新增、修改的文件
 * 3. 确定回归测试范围
 * 4. 设置安全边界（红线）
 *
 * 这是保证 "持续开发不破坏现有功能" 的关键组件
 */

import { EventEmitter } from 'events';
import { Blueprint, SystemModule, TaskNode, AcceptanceTest } from './types.js';
import { CodebaseAnalyzer, CodebaseInfo, DetectedModule } from './codebase-analyzer.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 影响分析结果类型
// ============================================================================

/**
 * 风险等级
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 变更类型
 */
export type ChangeType =
  | 'add_file'           // 新增文件
  | 'add_method'         // 新增方法
  | 'modify_method'      // 修改方法
  | 'add_field'          // 新增字段
  | 'modify_field'       // 修改字段
  | 'change_signature'   // 修改接口签名（高风险）
  | 'delete_file'        // 删除文件（高风险）
  | 'refactor';          // 重构

/**
 * 文件变更影响
 */
export interface FileImpact {
  path: string;
  changeType: ChangeType;
  riskLevel: RiskLevel;
  reason: string;
  affectedBy?: string[];      // 被哪些需求影响
  dependents?: string[];      // 依赖此文件的其他文件
}

/**
 * 模块变更影响
 */
export interface ModuleImpact {
  moduleId: string;
  moduleName: string;
  modulePath: string;
  files: FileImpact[];
  overallRisk: RiskLevel;
  requiresReview: boolean;    // 是否需要人工审核
}

/**
 * 接口变更
 */
export interface InterfaceChange {
  interfaceId: string;
  interfaceName: string;
  filePath: string;
  changeType: 'add' | 'modify' | 'delete';
  breakingChange: boolean;    // 是否是破坏性变更
  affectedConsumers: string[]; // 受影响的调用方
}

/**
 * 回归测试范围
 */
export interface RegressionScope {
  // 必须运行的测试（直接相关）
  mustRun: {
    testPath: string;
    reason: string;
  }[];
  
  // 建议运行的测试（间接相关）
  shouldRun: {
    testPath: string;
    reason: string;
  }[];
  
  // 所有现有测试（全量回归）
  allExisting: string[];
  
  // 估计的测试运行时间（秒）
  estimatedDuration: number;
}

/**
 * 安全边界定义
 */
export interface SafetyBoundary {
  // 允许操作的路径
  allowedPaths: {
    path: string;
    operations: ('read' | 'write' | 'delete')[];
  }[];
  
  // 只读路径（可以读取但不能修改）
  readOnlyPaths: string[];
  
  // 禁止访问的路径（红线）
  forbiddenPaths: {
    path: string;
    reason: string;
  }[];
  
  // 需要人工审核的路径
  requireReviewPaths: {
    path: string;
    reason: string;
  }[];
  
  // 受保护的接口（不能修改签名）
  protectedInterfaces: {
    interfaceId: string;
    filePath: string;
    reason: string;
  }[];
}

/**
 * 完整的影响分析报告
 */
export interface ImpactAnalysisReport {
  // 元信息
  id: string;
  timestamp: Date;
  requirementSummary: string;
  
  // 影响评估
  impact: {
    // 新增内容（安全区）
    additions: FileImpact[];
    
    // 修改内容（警戒区）
    modifications: FileImpact[];
    
    // 可能被删除的内容（危险区）
    deletions: FileImpact[];
    
    // 按模块分组的影响
    byModule: ModuleImpact[];
    
    // 接口变更
    interfaceChanges: InterfaceChange[];
  };
  
  // 风险评估
  risk: {
    overallLevel: RiskLevel;
    breakingChanges: number;
    highRiskFiles: number;
    summary: string;
  };
  
  // 回归测试范围
  regressionScope: RegressionScope;
  
  // 安全边界
  safetyBoundary: SafetyBoundary;
  
  // 建议
  recommendations: string[];
  
  // 是否需要人工确认
  requiresHumanApproval: boolean;
  approvalReasons?: string[];
}

// ============================================================================
// 影响分析器配置
// ============================================================================

export interface ImpactAnalyzerConfig {
  projectRoot: string;
  testDirectory: string;
  testPatterns: string[];          // 测试文件匹配模式
  protectedPatterns: string[];     // 受保护文件模式
  criticalPatterns: string[];      // 核心文件模式（修改需审核）
  maxRiskThreshold: RiskLevel;     // 超过此风险级别需人工审核
}

const DEFAULT_CONFIG: ImpactAnalyzerConfig = {
  projectRoot: process.cwd(),
  testDirectory: 'tests',
  testPatterns: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js'],
  protectedPatterns: [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    '.env*',
  ],
  criticalPatterns: [
    '**/core/**',
    '**/auth/**',
    '**/security/**',
  ],
  maxRiskThreshold: 'high',
};

// ============================================================================
// 影响分析器
// ============================================================================

export class ImpactAnalyzer extends EventEmitter {
  private config: ImpactAnalyzerConfig;
  private codebaseInfo: CodebaseInfo | null = null;
  private existingTests: string[] = [];
  
  constructor(config?: Partial<ImpactAnalyzerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * 初始化分析器，加载现有代码库信息
   */
  async initialize(codebaseInfo?: CodebaseInfo): Promise<void> {
    this.emit('status', { phase: 'initializing', message: '正在初始化影响分析器...' });
    
    if (codebaseInfo) {
      this.codebaseInfo = codebaseInfo;
    } else {
      // 使用 CodebaseAnalyzer 分析现有代码
      const analyzer = new CodebaseAnalyzer({ rootDir: this.config.projectRoot });
      const result = await analyzer.analyzeAndGenerate({
        rootDir: this.config.projectRoot,
        granularity: 'medium',
      });
      this.codebaseInfo = result.codebase;
    }
    
    // 收集现有测试文件
    this.existingTests = await this.collectExistingTests();
    
    this.emit('status', { 
      phase: 'initialized', 
      message: `初始化完成，发现 ${this.existingTests.length} 个测试文件` 
    });
  }
  
  /**
   * 分析新需求的影响
   */
  async analyzeRequirement(
    requirement: string,
    blueprint: Blueprint,
    targetModules?: string[]     // 可选：指定目标模块
  ): Promise<ImpactAnalysisReport> {
    this.emit('status', { phase: 'analyzing', message: '正在分析需求影响...' });
    
    const reportId = `impact-${Date.now()}`;
    const timestamp = new Date();
    
    // 1. 识别受影响的模块
    const affectedModules = this.identifyAffectedModules(
      requirement,
      blueprint,
      targetModules
    );
    
    // 2. 分析文件级别的影响
    const fileImpacts = await this.analyzeFileImpacts(
      requirement,
      blueprint,
      affectedModules
    );
    
    // 3. 检测接口变更
    const interfaceChanges = this.detectInterfaceChanges(
      requirement,
      blueprint,
      fileImpacts
    );
    
    // 4. 评估风险
    const riskAssessment = this.assessRisk(fileImpacts, interfaceChanges);
    
    // 5. 确定回归测试范围
    const regressionScope = this.determineRegressionScope(
      affectedModules,
      fileImpacts
    );
    
    // 6. 设置安全边界
    const safetyBoundary = this.defineSafetyBoundary(
      blueprint,
      affectedModules,
      fileImpacts
    );
    
    // 7. 生成建议
    const recommendations = this.generateRecommendations(
      riskAssessment,
      interfaceChanges,
      safetyBoundary
    );
    
    // 8. 判断是否需要人工审核
    const { requiresApproval, reasons } = this.checkApprovalRequired(
      riskAssessment,
      interfaceChanges,
      fileImpacts
    );
    
    const report: ImpactAnalysisReport = {
      id: reportId,
      timestamp,
      requirementSummary: requirement,
      impact: {
        additions: fileImpacts.filter(f => f.changeType === 'add_file'),
        modifications: fileImpacts.filter(f => 
          f.changeType !== 'add_file' && f.changeType !== 'delete_file'
        ),
        deletions: fileImpacts.filter(f => f.changeType === 'delete_file'),
        byModule: this.groupImpactsByModule(fileImpacts, blueprint),
        interfaceChanges,
      },
      risk: riskAssessment,
      regressionScope,
      safetyBoundary,
      recommendations,
      requiresHumanApproval: requiresApproval,
      approvalReasons: reasons,
    };
    
    this.emit('analysis_complete', report);
    return report;
  }
  
  /**
   * 识别受影响的模块
   */
  private identifyAffectedModules(
    requirement: string,
    blueprint: Blueprint,
    targetModules?: string[]
  ): SystemModule[] {
    if (targetModules && targetModules.length > 0) {
      return blueprint.modules.filter(m => targetModules.includes(m.id));
    }
    
    // 基于关键词匹配识别可能受影响的模块
    const keywords = this.extractKeywords(requirement);
    
    return blueprint.modules.filter(module => {
      // 检查模块名称、描述、职责是否包含关键词
      const moduleText = [
        module.name,
        module.description,
        ...module.responsibilities,
      ].join(' ').toLowerCase();
      
      return keywords.some(kw => moduleText.includes(kw.toLowerCase()));
    });
  }
  
  /**
   * 提取需求中的关键词
   */
  private extractKeywords(requirement: string): string[] {
    // 简单的关键词提取（可以用 AI 增强）
    const words = requirement
      .split(/[\s,，。.!！?？;；:：\n]+/)
      .filter(w => w.length > 2);
    
    // 过滤常见停用词
    const stopWords = new Set([
      '一个', '这个', '那个', '需要', '想要', '希望', '能够', '可以',
      '功能', '特性', '实现', '开发', '添加', '增加', '修改',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did',
    ]);
    
    return words.filter(w => !stopWords.has(w.toLowerCase()));
  }
  
  /**
   * 分析文件级别的影响
   */
  private async analyzeFileImpacts(
    requirement: string,
    blueprint: Blueprint,
    affectedModules: SystemModule[]
  ): Promise<FileImpact[]> {
    const impacts: FileImpact[] = [];
    
    for (const module of affectedModules) {
      const modulePath = module.rootPath || `src/${module.name.toLowerCase()}`;
      
      // 1. 新增文件（安全）
      impacts.push({
        path: `${modulePath}/new-feature.ts`,  // 示例，实际应基于需求分析
        changeType: 'add_file',
        riskLevel: 'low',
        reason: '新增功能文件',
        affectedBy: [requirement],
      });
      
      // 2. 检查是否需要修改现有文件
      if (this.codebaseInfo) {
        const moduleFiles = this.getModuleFiles(modulePath);
        
        for (const file of moduleFiles) {
          // 检查文件是否可能需要修改
          if (this.fileNeedsModification(file, requirement)) {
            const riskLevel = this.assessFileRisk(file);
            impacts.push({
              path: file,
              changeType: 'modify_method',
              riskLevel,
              reason: '可能需要添加新功能的集成点',
              dependents: this.findDependents(file),
            });
          }
        }
      }
    }
    
    return impacts;
  }
  
  /**
   * 获取模块下的所有文件
   */
  private getModuleFiles(modulePath: string): string[] {
    const fullPath = path.join(this.config.projectRoot, modulePath);
    if (!fs.existsSync(fullPath)) return [];
    
    const files: string[] = [];
    const traverse = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const entryPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!['node_modules', '.git', 'dist'].includes(entry.name)) {
              traverse(entryPath);
            }
          } else if (entry.isFile()) {
            files.push(entryPath.replace(this.config.projectRoot, '').replace(/\\/g, '/'));
          }
        }
      } catch {
        // 忽略无法访问的目录
      }
    };
    
    traverse(fullPath);
    return files;
  }
  
  /**
   * 检查文件是否可能需要修改
   */
  private fileNeedsModification(filePath: string, requirement: string): boolean {
    // 检查是否是入口文件、索引文件等（通常需要修改来集成新功能）
    const integrationPatterns = [
      /index\.(ts|js)$/,
      /routes?\.(ts|js)$/,
      /app\.(ts|js)$/,
      /main\.(ts|js)$/,
    ];
    
    return integrationPatterns.some(p => p.test(filePath));
  }
  
  /**
   * 评估文件的风险等级
   */
  private assessFileRisk(filePath: string): RiskLevel {
    // 核心文件 = 高风险
    if (this.config.criticalPatterns.some(p => 
      new RegExp(p.replace('**', '.*').replace('*', '[^/]*')).test(filePath)
    )) {
      return 'high';
    }
    
    // 受保护文件 = 极高风险
    if (this.config.protectedPatterns.some(p => filePath.includes(p))) {
      return 'critical';
    }
    
    // 被多个文件依赖 = 中等风险
    const dependents = this.findDependents(filePath);
    if (dependents.length > 5) {
      return 'medium';
    }
    
    return 'low';
  }
  
  /**
   * 查找依赖某个文件的其他文件
   */
  private findDependents(filePath: string): string[] {
    // 简化实现：基于文件名搜索 import
    // 实际应该使用 LSP 或静态分析
    const fileName = path.basename(filePath, path.extname(filePath));
    const dependents: string[] = [];
    
    if (this.codebaseInfo?.modules) {
      for (const module of this.codebaseInfo.modules) {
        if (module.imports?.some(imp => imp.includes(fileName))) {
          dependents.push(module.path);
        }
      }
    }
    
    return dependents;
  }
  
  /**
   * 检测接口变更
   */
  private detectInterfaceChanges(
    requirement: string,
    blueprint: Blueprint,
    fileImpacts: FileImpact[]
  ): InterfaceChange[] {
    const changes: InterfaceChange[] = [];
    
    // 检查是否影响到公共接口
    for (const module of blueprint.modules) {
      for (const iface of module.interfaces) {
        // 检查接口是否在受影响的文件中
        const affected = fileImpacts.some(f => 
          f.path.includes(module.name.toLowerCase()) &&
          f.changeType !== 'add_file'
        );
        
        if (affected) {
          changes.push({
            interfaceId: iface.id,
            interfaceName: iface.name,
            filePath: module.rootPath || `src/${module.name.toLowerCase()}`,
            changeType: 'modify',
            breakingChange: false, // 需要更详细的分析
            affectedConsumers: module.dependencies,
          });
        }
      }
    }
    
    return changes;
  }
  
  /**
   * 评估整体风险
   */
  private assessRisk(
    fileImpacts: FileImpact[],
    interfaceChanges: InterfaceChange[]
  ): ImpactAnalysisReport['risk'] {
    const breakingChanges = interfaceChanges.filter(c => c.breakingChange).length;
    const highRiskFiles = fileImpacts.filter(f => 
      f.riskLevel === 'high' || f.riskLevel === 'critical'
    ).length;
    
    let overallLevel: RiskLevel = 'low';
    
    if (breakingChanges > 0 || highRiskFiles > 3) {
      overallLevel = 'critical';
    } else if (highRiskFiles > 0) {
      overallLevel = 'high';
    } else if (fileImpacts.filter(f => f.riskLevel === 'medium').length > 3) {
      overallLevel = 'medium';
    }
    
    const summary = this.generateRiskSummary(
      overallLevel,
      fileImpacts.length,
      breakingChanges,
      highRiskFiles
    );
    
    return {
      overallLevel,
      breakingChanges,
      highRiskFiles,
      summary,
    };
  }
  
  /**
   * 生成风险摘要
   */
  private generateRiskSummary(
    level: RiskLevel,
    totalFiles: number,
    breakingChanges: number,
    highRiskFiles: number
  ): string {
    const levelText: Record<RiskLevel, string> = {
      'low': '低风险',
      'medium': '中等风险',
      'high': '高风险',
      'critical': '极高风险',
    };
    
    let summary = `整体风险评估: ${levelText[level]}。`;
    summary += `涉及 ${totalFiles} 个文件的变更，`;
    
    if (breakingChanges > 0) {
      summary += `其中有 ${breakingChanges} 个破坏性接口变更，`;
    }
    
    if (highRiskFiles > 0) {
      summary += `${highRiskFiles} 个高风险文件。`;
    } else {
      summary += `无高风险文件。`;
    }
    
    return summary;
  }
  
  /**
   * 确定回归测试范围
   */
  private determineRegressionScope(
    affectedModules: SystemModule[],
    fileImpacts: FileImpact[]
  ): RegressionScope {
    const mustRun: RegressionScope['mustRun'] = [];
    const shouldRun: RegressionScope['shouldRun'] = [];
    
    // 直接相关的测试（受影响模块的测试）
    for (const module of affectedModules) {
      const moduleTestPattern = `tests/${module.name.toLowerCase()}`;
      const relatedTests = this.existingTests.filter(t => 
        t.includes(moduleTestPattern) || t.includes(module.name)
      );
      
      for (const test of relatedTests) {
        mustRun.push({
          testPath: test,
          reason: `直接关联模块 ${module.name} 的测试`,
        });
      }
    }
    
    // 间接相关的测试（依赖受影响文件的测试）
    for (const impact of fileImpacts) {
      if (impact.dependents) {
        for (const dep of impact.dependents) {
          const depTests = this.existingTests.filter(t => t.includes(dep));
          for (const test of depTests) {
            if (!mustRun.some(m => m.testPath === test)) {
              shouldRun.push({
                testPath: test,
                reason: `依赖受影响文件 ${impact.path}`,
              });
            }
          }
        }
      }
    }
    
    return {
      mustRun,
      shouldRun,
      allExisting: this.existingTests,
      estimatedDuration: (mustRun.length + shouldRun.length) * 2 + this.existingTests.length * 0.5,
    };
  }
  
  /**
   * 定义安全边界
   */
  private defineSafetyBoundary(
    blueprint: Blueprint,
    affectedModules: SystemModule[],
    fileImpacts: FileImpact[]
  ): SafetyBoundary {
    const allowedPaths: SafetyBoundary['allowedPaths'] = [];
    const readOnlyPaths: string[] = [];
    const forbiddenPaths: SafetyBoundary['forbiddenPaths'] = [];
    const requireReviewPaths: SafetyBoundary['requireReviewPaths'] = [];
    const protectedInterfaces: SafetyBoundary['protectedInterfaces'] = [];
    
    // 1. 受影响模块的路径 = 允许操作
    for (const module of affectedModules) {
      const modulePath = module.rootPath || `src/${module.name.toLowerCase()}`;
      allowedPaths.push({
        path: modulePath,
        operations: ['read', 'write'],  // 注意：不包括 delete
      });
    }
    
    // 2. 测试目录 = 允许操作
    allowedPaths.push({
      path: this.config.testDirectory,
      operations: ['read', 'write'],
    });
    
    // 3. 其他模块 = 只读
    for (const module of blueprint.modules) {
      if (!affectedModules.some(m => m.id === module.id)) {
        const modulePath = module.rootPath || `src/${module.name.toLowerCase()}`;
        readOnlyPaths.push(modulePath);
      }
    }
    
    // 4. 受保护文件 = 禁止
    for (const pattern of this.config.protectedPatterns) {
      forbiddenPaths.push({
        path: pattern,
        reason: '受保护的配置文件',
      });
    }
    
    // 5. 核心文件 = 需要审核
    for (const pattern of this.config.criticalPatterns) {
      requireReviewPaths.push({
        path: pattern,
        reason: '核心模块文件，修改需人工审核',
      });
    }
    
    // 6. 公共接口 = 受保护
    for (const module of blueprint.modules) {
      for (const iface of module.interfaces) {
        if (iface.direction === 'out' || iface.direction === 'both') {
          protectedInterfaces.push({
            interfaceId: iface.id,
            filePath: module.rootPath || `src/${module.name.toLowerCase()}`,
            reason: '公共接口，不能修改现有签名',
          });
        }
      }
    }
    
    return {
      allowedPaths,
      readOnlyPaths,
      forbiddenPaths,
      requireReviewPaths,
      protectedInterfaces,
    };
  }
  
  /**
   * 生成建议
   */
  private generateRecommendations(
    risk: ImpactAnalysisReport['risk'],
    interfaceChanges: InterfaceChange[],
    safetyBoundary: SafetyBoundary
  ): string[] {
    const recommendations: string[] = [];
    
    // 基于风险级别的建议
    if (risk.overallLevel === 'critical' || risk.overallLevel === 'high') {
      recommendations.push('🚨 建议在开发前创建代码分支，以便必要时回滚');
      recommendations.push('🧪 强烈建议先运行全量回归测试确认基线状态');
    }
    
    if (risk.breakingChanges > 0) {
      recommendations.push('⚠️ 存在破坏性接口变更，需要同步更新所有调用方');
      recommendations.push('📝 建议记录变更日志，通知相关团队成员');
    }
    
    if (interfaceChanges.length > 0) {
      recommendations.push('🔗 修改接口时，请确保添加向后兼容的默认值');
    }
    
    if (safetyBoundary.forbiddenPaths.length > 0) {
      recommendations.push('🔒 部分配置文件被标记为禁止修改，如需调整请联系项目维护者');
    }
    
    // 通用建议
    recommendations.push('✅ 每完成一个任务后运行相关测试，确保不引入回归');
    recommendations.push('📸 在关键节点创建检查点，以便需要时回滚');
    
    return recommendations;
  }
  
  /**
   * 检查是否需要人工审核
   */
  private checkApprovalRequired(
    risk: ImpactAnalysisReport['risk'],
    interfaceChanges: InterfaceChange[],
    fileImpacts: FileImpact[]
  ): { requiresApproval: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    // 1. 风险级别过高
    if (risk.overallLevel === 'critical' || 
        (risk.overallLevel === 'high' && this.config.maxRiskThreshold !== 'critical')) {
      reasons.push(`风险级别为${risk.overallLevel}，需要人工确认`);
    }
    
    // 2. 存在破坏性变更
    if (risk.breakingChanges > 0) {
      reasons.push(`存在 ${risk.breakingChanges} 个破坏性接口变更`);
    }
    
    // 3. 涉及核心文件
    const criticalFiles = fileImpacts.filter(f => f.riskLevel === 'critical');
    if (criticalFiles.length > 0) {
      reasons.push(`涉及 ${criticalFiles.length} 个核心文件的修改`);
    }
    
    return {
      requiresApproval: reasons.length > 0,
      reasons,
    };
  }
  
  /**
   * 按模块分组影响
   */
  private groupImpactsByModule(
    fileImpacts: FileImpact[],
    blueprint: Blueprint
  ): ModuleImpact[] {
    const moduleMap = new Map<string, ModuleImpact>();
    
    for (const module of blueprint.modules) {
      const modulePath = module.rootPath || `src/${module.name.toLowerCase()}`;
      const moduleFiles = fileImpacts.filter(f => f.path.includes(modulePath));
      
      if (moduleFiles.length > 0) {
        const overallRisk = this.getHighestRisk(moduleFiles.map(f => f.riskLevel));
        const requiresReview = moduleFiles.some(f => 
          f.riskLevel === 'high' || f.riskLevel === 'critical'
        );
        
        moduleMap.set(module.id, {
          moduleId: module.id,
          moduleName: module.name,
          modulePath,
          files: moduleFiles,
          overallRisk,
          requiresReview,
        });
      }
    }
    
    return Array.from(moduleMap.values());
  }
  
  /**
   * 获取最高风险级别
   */
  private getHighestRisk(levels: RiskLevel[]): RiskLevel {
    const order: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    let highest: RiskLevel = 'low';
    
    for (const level of levels) {
      if (order.indexOf(level) > order.indexOf(highest)) {
        highest = level;
      }
    }
    
    return highest;
  }
  
  /**
   * 收集现有测试文件
   */
  private async collectExistingTests(): Promise<string[]> {
    const testDir = path.join(this.config.projectRoot, this.config.testDirectory);
    if (!fs.existsSync(testDir)) return [];
    
    const tests: string[] = [];
    const traverse = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const entryPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            traverse(entryPath);
          } else if (entry.isFile()) {
            const relativePath = entryPath.replace(this.config.projectRoot, '').replace(/\\/g, '/');
            if (this.config.testPatterns.some(p => {
              const regex = new RegExp(p.replace('**/', '').replace('*', '.*'));
              return regex.test(entry.name);
            })) {
              tests.push(relativePath);
            }
          }
        }
      } catch {
        // 忽略无法访问的目录
      }
    };
    
    traverse(testDir);
    
    // 也检查 src 目录下的测试文件
    const srcDir = path.join(this.config.projectRoot, 'src');
    if (fs.existsSync(srcDir)) {
      traverse(srcDir);
    }
    
    return tests;
  }
  
  /**
   * 应用安全边界到 Worker
   * 返回一个可用于验证操作的检查函数
   */
  createBoundaryValidator(safetyBoundary: SafetyBoundary): {
    canRead: (path: string) => boolean;
    canWrite: (path: string) => { allowed: boolean; reason?: string };
    canDelete: (path: string) => { allowed: boolean; reason?: string };
    canModifyInterface: (interfaceId: string) => { allowed: boolean; reason?: string };
  } {
    return {
      canRead: (filePath: string) => {
        // 检查是否在禁止路径中
        const forbidden = safetyBoundary.forbiddenPaths.find(f => filePath.includes(f.path));
        if (forbidden) return false;
        return true;  // 默认允许读取
      },
      
      canWrite: (filePath: string) => {
        // 1. 检查禁止路径
        const forbidden = safetyBoundary.forbiddenPaths.find(f => filePath.includes(f.path));
        if (forbidden) {
          return { allowed: false, reason: forbidden.reason };
        }
        
        // 2. 检查只读路径
        const readOnly = safetyBoundary.readOnlyPaths.find(p => filePath.includes(p));
        if (readOnly) {
          return { allowed: false, reason: '此路径为只读，不允许修改' };
        }
        
        // 3. 检查是否在允许路径中
        const allowed = safetyBoundary.allowedPaths.find(p => 
          filePath.includes(p.path) && p.operations.includes('write')
        );
        if (!allowed) {
          return { allowed: false, reason: '此路径不在允许操作的范围内' };
        }
        
        // 4. 检查是否需要审核
        const needsReview = safetyBoundary.requireReviewPaths.find(p => filePath.includes(p.path));
        if (needsReview) {
          return { allowed: true, reason: `需要人工审核: ${needsReview.reason}` };
        }
        
        return { allowed: true };
      },
      
      canDelete: (filePath: string) => {
        // 删除操作更严格
        const allowed = safetyBoundary.allowedPaths.find(p => 
          filePath.includes(p.path) && p.operations.includes('delete')
        );
        if (!allowed) {
          return { allowed: false, reason: '不允许删除此文件' };
        }
        return { allowed: true };
      },
      
      canModifyInterface: (interfaceId: string) => {
        const protected_ = safetyBoundary.protectedInterfaces.find(p => p.interfaceId === interfaceId);
        if (protected_) {
          return { allowed: false, reason: protected_.reason };
        }
        return { allowed: true };
      },
    };
  }
}

// ============================================================================
// 导出工厂函数
// ============================================================================

export function createImpactAnalyzer(config?: Partial<ImpactAnalyzerConfig>): ImpactAnalyzer {
  return new ImpactAnalyzer(config);
}

export { ImpactAnalyzer as default };
