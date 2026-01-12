/**
 * 数据流分析器测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DataFlowAnalyzer } from '../src/web/server/routes/data-flow-analyzer.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DataFlowAnalyzer', () => {
  let testDir: string;
  let testFilePath: string;

  beforeAll(() => {
    // 创建临时测试目录
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-flow-test-'));
    testFilePath = path.join(testDir, 'test.ts');

    // 创建测试文件
    const testCode = `
class TestClass {
  private counter: number = 0;

  increment() {
    this.counter++;
    console.log(this.counter);
  }

  decrement() {
    this.counter--;
  }

  getCounter() {
    return this.counter;
  }

  reset() {
    this.counter = 0;
  }
}

const instance = new TestClass();
instance.increment();
instance.increment();
const value = instance.getCounter();
instance.reset();
`;

    fs.writeFileSync(testFilePath, testCode, 'utf-8');
  });

  afterAll(() => {
    // 清理测试文件
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('应该能够分析类属性的数据流', async () => {
    const analyzer = new DataFlowAnalyzer();
    const symbolId = `${testFilePath}::TestClass::counter`;

    const result = await analyzer.analyzeDataFlow(symbolId);

    expect(result).toBeDefined();
    expect(result.symbolName).toBe('counter');
    expect(result.symbolId).toBe(symbolId);

    // 应该至少有一个写入（初始化）
    expect(result.writes.length).toBeGreaterThan(0);

    // 应该有读取（在 increment、decrement、getCounter 中）
    expect(result.reads.length).toBeGreaterThan(0);

    // 验证位置信息格式
    if (result.writes.length > 0) {
      const firstWrite = result.writes[0];
      // 规范化路径以处理 Windows/Linux 的路径分隔符差异
      const normalizedExpected = path.normalize(testFilePath);
      const normalizedActual = path.normalize(firstWrite.file);
      expect(normalizedActual).toBe(normalizedExpected);
      expect(firstWrite.line).toBeGreaterThan(0);
      expect(firstWrite.column).toBeGreaterThan(0);
      expect(firstWrite.code).toBeTruthy();
    }
  });

  it('应该能够生成数据流图', async () => {
    const analyzer = new DataFlowAnalyzer();
    const symbolId = `${testFilePath}::TestClass::counter`;

    const result = await analyzer.analyzeDataFlow(symbolId);

    expect(result.dataFlowGraph).toBeDefined();
    expect(result.dataFlowGraph?.nodes).toBeDefined();
    expect(result.dataFlowGraph?.edges).toBeDefined();

    // 应该有中心节点
    const centerNode = result.dataFlowGraph?.nodes.find(n => n.id === 'center');
    expect(centerNode).toBeDefined();

    // 边的数量应该等于读取+写入的总数
    const totalLocations = result.reads.length + result.writes.length;
    expect(result.dataFlowGraph?.edges.length).toBe(totalLocations);
  });

  it('应该能够区分读取和写入操作', async () => {
    const analyzer = new DataFlowAnalyzer();
    const symbolId = `${testFilePath}::TestClass::counter`;

    const result = await analyzer.analyzeDataFlow(symbolId);

    // 检查写入操作（应该包含 =, ++, --）
    const writeOperations = result.writes.map(w => w.code);
    expect(writeOperations.some(code => code.includes('='))).toBe(true);

    // 检查读取操作（应该包含 return、console.log 等）
    const readOperations = result.reads.map(r => r.code);
    expect(readOperations.length).toBeGreaterThan(0);
  });

  it('处理不存在的符号应该返回空结果', async () => {
    const analyzer = new DataFlowAnalyzer();
    const symbolId = `${testFilePath}::NonExistentClass::nonExistentProperty`;

    const result = await analyzer.analyzeDataFlow(symbolId);

    // 不存在的符号应该返回空的读写列表
    expect(result.reads.length).toBe(0);
    expect(result.writes.length).toBe(0);
  });

  it('处理不存在的文件应该抛出错误', async () => {
    const analyzer = new DataFlowAnalyzer();
    const symbolId = '/nonexistent/file.ts::Class::prop';

    await expect(analyzer.analyzeDataFlow(symbolId)).rejects.toThrow();
  });
});

describe('DataFlowAnalyzer - 变量分析', () => {
  let testDir: string;
  let testFilePath: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-flow-var-test-'));
    testFilePath = path.join(testDir, 'variables.ts');

    const testCode = `
let globalCounter = 0;

function increment() {
  globalCounter++;
  return globalCounter;
}

function decrement() {
  globalCounter--;
  return globalCounter;
}

function reset() {
  globalCounter = 0;
}

const value1 = increment();
const value2 = increment();
reset();
const value3 = decrement();
`;

    fs.writeFileSync(testFilePath, testCode, 'utf-8');
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('应该能够分析全局变量的数据流', async () => {
    const analyzer = new DataFlowAnalyzer();
    const symbolId = `${testFilePath}::globalCounter`;

    const result = await analyzer.analyzeDataFlow(symbolId);

    expect(result.symbolName).toBe('globalCounter');
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.reads.length).toBeGreaterThan(0);
  });
});
