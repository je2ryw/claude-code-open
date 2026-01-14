/**
 * TypeScript/JavaScript 语法关键字字典
 * 用于新手模式悬浮提示，本地缓存实现 0ms 响应
 */

// 关键字解释接口
export interface SyntaxExplanation {
  keyword: string;
  category: 'keyword' | 'modifier' | 'type' | 'operator' | 'pattern' | 'library';
  brief: string;      // 一句话解释
  detail?: string;    // 详细说明
  example?: string;   // 示例代码
  level: 'basic' | 'intermediate' | 'advanced';  // 难度等级
}

// 语法关键字字典 - 使用 Map 实现 O(1) 查询
const syntaxMap = new Map<string, SyntaxExplanation>();

// ============ 基础关键字 ============
const basicKeywords: SyntaxExplanation[] = [
  // 声明类
  { keyword: 'const', category: 'keyword', brief: '声明常量，赋值后不可重新赋值', detail: '使用 const 声明的变量必须在声明时初始化，且之后不能重新赋值。但如果是对象或数组，其内部属性仍可修改。', example: 'const name = "Claude";', level: 'basic' },
  { keyword: 'let', category: 'keyword', brief: '声明变量，可以重新赋值', detail: '块级作用域变量声明，比 var 更安全，推荐使用。', example: 'let count = 0; count++;', level: 'basic' },
  { keyword: 'var', category: 'keyword', brief: '声明变量（旧语法，不推荐）', detail: '函数作用域变量声明，存在变量提升问题，建议用 let/const 替代。', level: 'basic' },
  { keyword: 'function', category: 'keyword', brief: '声明函数', detail: '定义一个可重复调用的代码块。', example: 'function greet(name) { return `Hello ${name}`; }', level: 'basic' },
  { keyword: 'class', category: 'keyword', brief: '声明类，用于创建对象的模板', detail: '类是面向对象编程的核心，封装数据和行为。', example: 'class Person { constructor(name) { this.name = name; } }', level: 'basic' },
  { keyword: 'interface', category: 'keyword', brief: '声明接口，定义对象的结构约束', detail: 'TypeScript 特性，用于定义对象必须具有的属性和方法。', example: 'interface User { name: string; age: number; }', level: 'basic' },
  { keyword: 'type', category: 'keyword', brief: '类型别名，给类型起一个新名字', detail: '可以为复杂类型创建简短的别名，提高代码可读性。', example: 'type ID = string | number;', level: 'basic' },
  { keyword: 'enum', category: 'keyword', brief: '枚举，定义一组命名的常量', detail: '用于表示一组固定的可选值，如状态、方向等。', example: 'enum Status { Pending, Active, Done }', level: 'basic' },

  // 控制流
  { keyword: 'if', category: 'keyword', brief: '条件判断', detail: '根据条件执行不同的代码分支。', level: 'basic' },
  { keyword: 'else', category: 'keyword', brief: '否则分支', detail: 'if 条件不满足时执行的代码。', level: 'basic' },
  { keyword: 'for', category: 'keyword', brief: '循环语句', detail: '重复执行代码块指定次数。', example: 'for (let i = 0; i < 10; i++) { }', level: 'basic' },
  { keyword: 'while', category: 'keyword', brief: '条件循环', detail: '当条件为真时重复执行。', level: 'basic' },
  { keyword: 'do', category: 'keyword', brief: 'do-while 循环', detail: '至少执行一次，然后检查条件。', level: 'basic' },
  { keyword: 'switch', category: 'keyword', brief: '多分支选择', detail: '根据表达式的值选择执行的分支。', level: 'basic' },
  { keyword: 'case', category: 'keyword', brief: 'switch 分支', detail: 'switch 语句中的一个分支选项。', level: 'basic' },
  { keyword: 'default', category: 'keyword', brief: '默认分支', detail: 'switch 语句中没有匹配时执行的分支。', level: 'basic' },
  { keyword: 'break', category: 'keyword', brief: '跳出循环或 switch', detail: '立即终止当前循环或 switch 语句。', level: 'basic' },
  { keyword: 'continue', category: 'keyword', brief: '跳过本次循环', detail: '跳过当前迭代，继续下一次循环。', level: 'basic' },
  { keyword: 'return', category: 'keyword', brief: '返回值并退出函数', detail: '结束函数执行并返回一个值给调用者。', level: 'basic' },

  // 异常处理
  { keyword: 'try', category: 'keyword', brief: '尝试执行可能出错的代码', detail: '包裹可能抛出异常的代码块。', level: 'basic' },
  { keyword: 'catch', category: 'keyword', brief: '捕获并处理错误', detail: '当 try 块中发生错误时执行。', example: 'try { } catch (error) { console.error(error); }', level: 'basic' },
  { keyword: 'finally', category: 'keyword', brief: '无论是否出错都会执行', detail: '清理资源的理想位置，如关闭文件。', level: 'basic' },
  { keyword: 'throw', category: 'keyword', brief: '抛出错误', detail: '主动触发一个错误，中断正常执行流程。', example: 'throw new Error("Something went wrong");', level: 'basic' },

  // 模块
  { keyword: 'import', category: 'keyword', brief: '导入其他模块的内容', detail: '从其他文件引入函数、类、变量等。', example: 'import { useState } from "react";', level: 'basic' },
  { keyword: 'export', category: 'keyword', brief: '导出，使其他模块可以使用', detail: '将函数、类、变量暴露给其他文件使用。', example: 'export function helper() { }', level: 'basic' },
  { keyword: 'from', category: 'keyword', brief: '指定导入来源', detail: 'import 语句中指定模块路径。', level: 'basic' },
  { keyword: 'as', category: 'keyword', brief: '重命名导入/导出', detail: '给导入或导出的内容起别名。', example: 'import { Component as Comp } from "react";', level: 'basic' },

  // 其他基础
  { keyword: 'new', category: 'keyword', brief: '创建类的实例', detail: '调用类的构造函数创建新对象。', example: 'const user = new User("Alice");', level: 'basic' },
  { keyword: 'this', category: 'keyword', brief: '当前对象的引用', detail: '在类方法中指向当前实例。', level: 'basic' },
  { keyword: 'super', category: 'keyword', brief: '调用父类', detail: '在子类中调用父类的构造函数或方法。', level: 'basic' },
  { keyword: 'extends', category: 'keyword', brief: '继承父类', detail: '让一个类继承另一个类的属性和方法。', example: 'class Admin extends User { }', level: 'basic' },
  { keyword: 'implements', category: 'keyword', brief: '实现接口', detail: '声明类实现某个接口的所有成员。', example: 'class Dog implements Animal { }', level: 'basic' },
  { keyword: 'typeof', category: 'operator', brief: '获取值的类型', detail: '返回值的类型字符串，如 "string"、"number"。', example: 'typeof "hello" // "string"', level: 'basic' },
  { keyword: 'instanceof', category: 'operator', brief: '检查对象是否是某类的实例', detail: '判断对象的原型链上是否有指定构造函数。', example: 'user instanceof User // true', level: 'basic' },
  { keyword: 'in', category: 'operator', brief: '检查属性是否存在', detail: '判断对象是否包含某个属性。', example: '"name" in user // true', level: 'basic' },
  { keyword: 'delete', category: 'operator', brief: '删除对象属性', detail: '从对象中移除指定属性。', level: 'basic' },
  { keyword: 'void', category: 'keyword', brief: '表示无返回值', detail: '函数不返回任何值，或使表达式返回 undefined。', level: 'basic' },
  { keyword: 'null', category: 'keyword', brief: '空值，表示"无"', detail: '明确表示一个空或不存在的值。', level: 'basic' },
  { keyword: 'undefined', category: 'keyword', brief: '未定义', detail: '变量声明但未赋值时的默认值。', level: 'basic' },
  { keyword: 'true', category: 'keyword', brief: '布尔值：真', level: 'basic' },
  { keyword: 'false', category: 'keyword', brief: '布尔值：假', level: 'basic' },
];

// ============ 修饰符 ============
const modifiers: SyntaxExplanation[] = [
  { keyword: 'public', category: 'modifier', brief: '公共，任何地方都可访问', detail: '类成员的默认访问级别，可以从任何位置访问。', level: 'basic' },
  { keyword: 'private', category: 'modifier', brief: '私有，只能在类内部访问', detail: '隐藏实现细节，防止外部直接访问。', example: 'private password: string;', level: 'basic' },
  { keyword: 'protected', category: 'modifier', brief: '受保护，类内部和子类可访问', detail: '比 private 宽松，子类也能访问。', level: 'intermediate' },
  { keyword: 'readonly', category: 'modifier', brief: '只读，初始化后不可修改', detail: '属性只能在声明时或构造函数中赋值。', example: 'readonly id: string;', level: 'basic' },
  { keyword: 'static', category: 'modifier', brief: '静态，属于类本身而非实例', detail: '不需要创建实例就可以访问，所有实例共享。', example: 'static count = 0;', level: 'intermediate' },
  { keyword: 'abstract', category: 'modifier', brief: '抽象，必须被子类实现', detail: '定义规范但不提供实现，强制子类实现。', example: 'abstract class Animal { abstract speak(): void; }', level: 'intermediate' },
  { keyword: 'async', category: 'modifier', brief: '异步函数，返回 Promise', detail: '允许在函数内使用 await 等待异步操作。', example: 'async function fetchData() { }', level: 'basic' },
  { keyword: 'await', category: 'keyword', brief: '等待 Promise 完成', detail: '暂停执行直到 Promise 解决，获取其结果。', example: 'const data = await fetch(url);', level: 'basic' },
  { keyword: 'override', category: 'modifier', brief: '重写父类方法', detail: 'TypeScript 4.3+ 特性，明确标记重写的方法。', level: 'intermediate' },
  { keyword: 'declare', category: 'modifier', brief: '声明类型（不生成代码）', detail: '告诉 TypeScript 某个变量存在但不生成 JS 代码。', level: 'advanced' },
];

// ============ 高级特性 ============
const advancedFeatures: SyntaxExplanation[] = [
  // 泛型
  { keyword: '<T>', category: 'pattern', brief: '泛型，类型参数', detail: '让函数或类支持多种类型，提高复用性。', example: 'function identity<T>(arg: T): T { return arg; }', level: 'intermediate' },
  { keyword: 'keyof', category: 'operator', brief: '获取对象的所有键的类型', detail: '返回对象类型所有属性名组成的联合类型。', example: 'type Keys = keyof User; // "name" | "age"', level: 'intermediate' },
  { keyword: 'infer', category: 'keyword', brief: '条件类型中推断类型', detail: '在条件类型中提取和推断类型。', level: 'advanced' },
  { keyword: 'extends', category: 'keyword', brief: '泛型约束/条件类型', detail: '限制泛型参数必须满足某个类型。', example: 'function fn<T extends object>(obj: T) { }', level: 'intermediate' },

  // 类型操作
  { keyword: 'Partial', category: 'type', brief: '所有属性变为可选', detail: '内置工具类型，将类型的所有属性设为可选。', example: 'Partial<User> // { name?: string; age?: number; }', level: 'intermediate' },
  { keyword: 'Required', category: 'type', brief: '所有属性变为必需', detail: '内置工具类型，将类型的所有属性设为必需。', level: 'intermediate' },
  { keyword: 'Readonly', category: 'type', brief: '所有属性变为只读', detail: '内置工具类型，将类型的所有属性设为只读。', level: 'intermediate' },
  { keyword: 'Pick', category: 'type', brief: '选取部分属性', detail: '从类型中挑选指定的属性组成新类型。', example: 'Pick<User, "name"> // { name: string; }', level: 'intermediate' },
  { keyword: 'Omit', category: 'type', brief: '排除部分属性', detail: '从类型中排除指定的属性组成新类型。', example: 'Omit<User, "password"> // 移除 password', level: 'intermediate' },
  { keyword: 'Record', category: 'type', brief: '构造键值对类型', detail: '创建一个对象类型，键为 K，值为 V。', example: 'Record<string, number> // { [key: string]: number }', level: 'intermediate' },
  { keyword: 'Exclude', category: 'type', brief: '从联合类型中排除', detail: '从联合类型中移除指定的类型。', level: 'advanced' },
  { keyword: 'Extract', category: 'type', brief: '从联合类型中提取', detail: '从联合类型中提取指定的类型。', level: 'advanced' },
  { keyword: 'NonNullable', category: 'type', brief: '排除 null 和 undefined', detail: '从类型中移除 null 和 undefined。', level: 'intermediate' },
  { keyword: 'ReturnType', category: 'type', brief: '获取函数返回类型', detail: '提取函数类型的返回值类型。', example: 'ReturnType<typeof fn> // string', level: 'intermediate' },
  { keyword: 'Parameters', category: 'type', brief: '获取函数参数类型', detail: '提取函数类型的参数类型元组。', level: 'intermediate' },
  { keyword: 'InstanceType', category: 'type', brief: '获取类的实例类型', detail: '提取构造函数类型的实例类型。', level: 'advanced' },

  // 断言
  { keyword: 'as', category: 'keyword', brief: '类型断言', detail: '告诉编译器"相信我，这个值是这个类型"。', example: 'const input = event.target as HTMLInputElement;', level: 'basic' },
  { keyword: 'is', category: 'keyword', brief: '类型谓词', detail: '自定义类型守卫函数的返回类型。', example: 'function isString(x: any): x is string { }', level: 'intermediate' },
  { keyword: 'asserts', category: 'keyword', brief: '断言函数', detail: '声明函数会断言某个条件为真。', level: 'advanced' },
  { keyword: 'satisfies', category: 'keyword', brief: '满足类型约束', detail: 'TypeScript 4.9+ 特性，检查值满足类型但保留推断。', level: 'advanced' },

  // 其他
  { keyword: 'never', category: 'type', brief: '永不存在的值的类型', detail: '表示不会发生的情况，如抛出异常的函数。', level: 'intermediate' },
  { keyword: 'unknown', category: 'type', brief: '未知类型，比 any 更安全', detail: '必须先进行类型检查才能使用，更安全的 any。', level: 'intermediate' },
  { keyword: 'any', category: 'type', brief: '任意类型，跳过类型检查', detail: '关闭类型检查，应尽量避免使用。', level: 'basic' },
  { keyword: 'object', category: 'type', brief: '非原始类型', detail: '表示非 number/string/boolean/null/undefined 的类型。', level: 'basic' },
  { keyword: 'namespace', category: 'keyword', brief: '命名空间', detail: '组织代码的方式，现在更推荐使用模块。', level: 'advanced' },
  { keyword: 'module', category: 'keyword', brief: '模块声明', detail: '声明外部模块的类型。', level: 'advanced' },
  { keyword: 'global', category: 'keyword', brief: '全局声明', detail: '在模块中声明全局变量。', level: 'advanced' },
];

// ============ 操作符/语法糖 ============
const operators: SyntaxExplanation[] = [
  { keyword: '=>', category: 'operator', brief: '箭头函数', detail: '简洁的函数写法，自动绑定 this。', example: 'const add = (a, b) => a + b;', level: 'basic' },
  { keyword: '...', category: 'operator', brief: '展开/剩余运算符', detail: '展开数组/对象，或收集剩余参数。', example: 'const arr2 = [...arr1, 4, 5];', level: 'basic' },
  { keyword: '?.', category: 'operator', brief: '可选链，安全访问属性', detail: '如果对象为 null/undefined，返回 undefined 而不报错。', example: 'user?.address?.city', level: 'basic' },
  { keyword: '??', category: 'operator', brief: '空值合并', detail: '左侧为 null/undefined 时使用右侧的值。', example: 'name ?? "匿名"', level: 'basic' },
  { keyword: '!', category: 'operator', brief: '非空断言', detail: '告诉编译器这个值一定不是 null/undefined。', example: 'element!.focus()', level: 'intermediate' },
  { keyword: '?:', category: 'operator', brief: '可选属性', detail: '接口中表示该属性可以不存在。', example: 'interface User { nickname?: string; }', level: 'basic' },
  { keyword: '|', category: 'operator', brief: '联合类型', detail: '值可以是多种类型之一。', example: 'type ID = string | number;', level: 'basic' },
  { keyword: '&', category: 'operator', brief: '交叉类型', detail: '合并多个类型为一个。', example: 'type Admin = User & { role: string };', level: 'intermediate' },
  { keyword: '===', category: 'operator', brief: '严格相等', detail: '比较值和类型是否都相等。', level: 'basic' },
  { keyword: '!==', category: 'operator', brief: '严格不等', detail: '比较值或类型是否不同。', level: 'basic' },
  { keyword: '`${}`', category: 'operator', brief: '模板字符串', detail: '支持嵌入表达式的字符串。', example: '`Hello ${name}!`', level: 'basic' },
  { keyword: '[]', category: 'operator', brief: '索引访问/数组', detail: '访问数组元素或对象属性。', level: 'basic' },
  { keyword: '{}', category: 'operator', brief: '对象字面量/解构', detail: '创建对象或从对象中提取属性。', example: 'const { name, age } = user;', level: 'basic' },
];

// ============ React 相关 ============
const reactKeywords: SyntaxExplanation[] = [
  { keyword: 'useState', category: 'library', brief: 'React 状态 Hook', detail: '在函数组件中添加状态，返回 [状态值, 设置函数]。', example: 'const [count, setCount] = useState(0);', level: 'basic' },
  { keyword: 'useEffect', category: 'library', brief: 'React 副作用 Hook', detail: '处理副作用，如数据获取、订阅、DOM 操作等。', example: 'useEffect(() => { fetchData(); }, []);', level: 'basic' },
  { keyword: 'useCallback', category: 'library', brief: '缓存函数引用', detail: '避免函数在每次渲染时重新创建，优化性能。', example: 'const handleClick = useCallback(() => {}, [deps]);', level: 'intermediate' },
  { keyword: 'useMemo', category: 'library', brief: '缓存计算结果', detail: '避免昂贵计算在每次渲染时重复执行。', example: 'const result = useMemo(() => compute(a, b), [a, b]);', level: 'intermediate' },
  { keyword: 'useRef', category: 'library', brief: '持久化引用', detail: '保存可变值，不会触发重新渲染。', example: 'const inputRef = useRef<HTMLInputElement>(null);', level: 'basic' },
  { keyword: 'useContext', category: 'library', brief: '使用上下文', detail: '获取最近的 Context Provider 提供的值。', level: 'intermediate' },
  { keyword: 'useReducer', category: 'library', brief: '复杂状态管理', detail: '类似 Redux 的状态管理方式。', level: 'intermediate' },
  { keyword: 'FC', category: 'type', brief: 'Function Component 类型', detail: 'React 函数组件的类型定义。', example: 'const App: FC<Props> = ({ title }) => { };', level: 'basic' },
  { keyword: 'ReactNode', category: 'type', brief: 'React 可渲染内容', detail: '可以作为 children 的所有类型。', level: 'basic' },
  { keyword: 'JSX', category: 'pattern', brief: 'JavaScript XML', detail: '在 JS 中写类似 HTML 的语法，会被编译为 React.createElement。', level: 'basic' },
];

// ============ 常见库/API ============
const commonAPIs: SyntaxExplanation[] = [
  { keyword: 'Promise', category: 'library', brief: '异步操作的容器', detail: '表示一个未来会完成的操作，有 pending/fulfilled/rejected 三种状态。', example: 'new Promise((resolve, reject) => { });', level: 'basic' },
  { keyword: 'Map', category: 'library', brief: '键值对集合', detail: '任意类型的键都可以，比对象更灵活。', example: 'const map = new Map(); map.set("key", value);', level: 'basic' },
  { keyword: 'Set', category: 'library', brief: '唯一值集合', detail: '自动去重的值集合。', example: 'const set = new Set([1, 2, 2, 3]); // {1, 2, 3}', level: 'basic' },
  { keyword: 'Array', category: 'library', brief: '数组', detail: '有序的元素集合。', level: 'basic' },
  { keyword: 'Object', category: 'library', brief: '对象', detail: '键值对的集合，JavaScript 的基础数据结构。', level: 'basic' },
  { keyword: 'JSON', category: 'library', brief: 'JSON 处理', detail: 'parse() 解析字符串为对象，stringify() 对象转字符串。', level: 'basic' },
  { keyword: 'console', category: 'library', brief: '控制台输出', detail: 'log/warn/error 输出不同级别的日志。', level: 'basic' },
  { keyword: 'fetch', category: 'library', brief: '网络请求 API', detail: '发送 HTTP 请求，返回 Promise。', example: 'const res = await fetch(url);', level: 'basic' },
  { keyword: 'setTimeout', category: 'library', brief: '延迟执行', detail: '在指定毫秒后执行函数。', example: 'setTimeout(() => {}, 1000);', level: 'basic' },
  { keyword: 'setInterval', category: 'library', brief: '定时重复执行', detail: '每隔指定毫秒执行函数。', level: 'basic' },
  { keyword: 'clearTimeout', category: 'library', brief: '取消延迟执行', level: 'basic' },
  { keyword: 'clearInterval', category: 'library', brief: '取消定时执行', level: 'basic' },
  { keyword: 'RegExp', category: 'library', brief: '正则表达式', detail: '用于字符串模式匹配。', example: '/\\d+/g.test("123") // true', level: 'intermediate' },
  { keyword: 'Date', category: 'library', brief: '日期时间', detail: '处理日期和时间的对象。', example: 'new Date().toISOString()', level: 'basic' },
  { keyword: 'Error', category: 'library', brief: '错误对象', detail: '表示运行时错误。', example: 'throw new Error("message");', level: 'basic' },
];

// 初始化字典
function initDictionary() {
  const allEntries = [
    ...basicKeywords,
    ...modifiers,
    ...advancedFeatures,
    ...operators,
    ...reactKeywords,
    ...commonAPIs,
  ];

  allEntries.forEach(entry => {
    syntaxMap.set(entry.keyword, entry);
    // 也添加小写版本便于查找
    syntaxMap.set(entry.keyword.toLowerCase(), entry);
  });
}

// 立即初始化
initDictionary();

/**
 * 获取关键字解释（O(1) 查询）
 */
export function getSyntaxExplanation(keyword: string): SyntaxExplanation | undefined {
  return syntaxMap.get(keyword) || syntaxMap.get(keyword.toLowerCase());
}

/**
 * 批量获取多个关键字的解释
 */
export function getSyntaxExplanations(keywords: string[]): Map<string, SyntaxExplanation> {
  const result = new Map<string, SyntaxExplanation>();
  keywords.forEach(kw => {
    const explanation = getSyntaxExplanation(kw);
    if (explanation) {
      result.set(kw, explanation);
    }
  });
  return result;
}

/**
 * 从代码行中提取关键字
 */
export function extractKeywordsFromLine(line: string): string[] {
  const keywords: string[] = [];

  // 匹配修饰符和关键字
  const modifierPattern = /\b(export|public|private|protected|readonly|static|abstract|async|const|let|var|function|class|interface|type|enum|extends|implements|new|return|if|else|for|while|try|catch|throw|await|import|from)\b/g;
  let match;
  while ((match = modifierPattern.exec(line)) !== null) {
    keywords.push(match[1]);
  }

  // 匹配操作符
  if (line.includes('=>')) keywords.push('=>');
  if (line.includes('...')) keywords.push('...');
  if (line.includes('?.')) keywords.push('?.');
  if (line.includes('??')) keywords.push('??');
  if (line.includes('?:')) keywords.push('?:');

  return [...new Set(keywords)]; // 去重
}

/**
 * 获取所有关键字（用于搜索/自动补全）
 */
export function getAllKeywords(): string[] {
  return Array.from(new Set(
    [...basicKeywords, ...modifiers, ...advancedFeatures, ...operators, ...reactKeywords, ...commonAPIs]
      .map(e => e.keyword)
  ));
}

/**
 * 按难度级别获取关键字
 */
export function getKeywordsByLevel(level: 'basic' | 'intermediate' | 'advanced'): SyntaxExplanation[] {
  return [...basicKeywords, ...modifiers, ...advancedFeatures, ...operators, ...reactKeywords, ...commonAPIs]
    .filter(e => e.level === level);
}

// 导出字典供调试使用
export const syntaxDictionary = syntaxMap;
