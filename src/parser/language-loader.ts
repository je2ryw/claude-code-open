/**
 * Language Loader for Tree-sitter WASM files
 * Implements T-006: Multi-language support with dynamic loading
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Parser, Language } from 'web-tree-sitter';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Language configuration mapping file extensions to language names
 */
export interface LanguageMapping {
  extensions: string[];
  wasmName: string;
  treeLanguageName?: string; // Some languages have different names in tree-sitter
}

/**
 * Supported language configurations
 */
export const LANGUAGE_MAPPINGS: Record<string, LanguageMapping> = {
  bash: {
    extensions: ['.sh', '.bash', '.zsh', '.fish'],
    wasmName: 'tree-sitter-bash',
  },
  javascript: {
    extensions: ['.js', '.mjs', '.cjs', '.jsx'],
    wasmName: 'tree-sitter-javascript',
  },
  typescript: {
    extensions: ['.ts', '.mts', '.cts'],
    wasmName: 'tree-sitter-typescript',
    treeLanguageName: 'typescript/typescript',
  },
  tsx: {
    extensions: ['.tsx'],
    wasmName: 'tree-sitter-tsx',
    treeLanguageName: 'typescript/tsx',
  },
  python: {
    extensions: ['.py', '.pyw', '.pyi'],
    wasmName: 'tree-sitter-python',
  },
  go: {
    extensions: ['.go'],
    wasmName: 'tree-sitter-go',
  },
  rust: {
    extensions: ['.rs'],
    wasmName: 'tree-sitter-rust',
  },
  java: {
    extensions: ['.java'],
    wasmName: 'tree-sitter-java',
  },
  c: {
    extensions: ['.c', '.h'],
    wasmName: 'tree-sitter-c',
  },
  cpp: {
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'],
    wasmName: 'tree-sitter-cpp',
  },
  ruby: {
    extensions: ['.rb'],
    wasmName: 'tree-sitter-ruby',
  },
  php: {
    extensions: ['.php'],
    wasmName: 'tree-sitter-php',
  },
  swift: {
    extensions: ['.swift'],
    wasmName: 'tree-sitter-swift',
  },
  kotlin: {
    extensions: ['.kt', '.kts'],
    wasmName: 'tree-sitter-kotlin',
  },
  scala: {
    extensions: ['.scala', '.sc'],
    wasmName: 'tree-sitter-scala',
  },
  csharp: {
    extensions: ['.cs'],
    wasmName: 'tree-sitter-c-sharp',
  },
  html: {
    extensions: ['.html', '.htm'],
    wasmName: 'tree-sitter-html',
  },
  css: {
    extensions: ['.css'],
    wasmName: 'tree-sitter-css',
  },
  json: {
    extensions: ['.json'],
    wasmName: 'tree-sitter-json',
  },
  yaml: {
    extensions: ['.yaml', '.yml'],
    wasmName: 'tree-sitter-yaml',
  },
  toml: {
    extensions: ['.toml'],
    wasmName: 'tree-sitter-toml',
  },
  markdown: {
    extensions: ['.md', '.markdown'],
    wasmName: 'tree-sitter-markdown',
  },
};

/**
 * Language Loader - Manages loading and caching of Tree-sitter language parsers
 */
export class LanguageLoader {
  private languageCache: Map<string, Language> = new Map();
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the language loader (must be called before loading languages)
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = Parser.init();
    await this.initPromise;
  }

  /**
   * Load a language WASM file
   */
  async loadLanguage(languageName: string): Promise<Language | null> {
    // Ensure initialized
    await this.initialize();

    // Check cache
    if (this.languageCache.has(languageName)) {
      return this.languageCache.get(languageName)!;
    }

    // Get language mapping
    const mapping = LANGUAGE_MAPPINGS[languageName];
    if (!mapping) {
      console.warn(`No language mapping found for: ${languageName}`);
      return null;
    }

    // Find WASM file
    const wasmPath = this.findWasmPath(mapping.wasmName);
    if (!wasmPath) {
      console.warn(`WASM file not found for language: ${languageName} (${mapping.wasmName})`);
      return null;
    }

    try {
      console.log(`Loading language ${languageName} from ${wasmPath}`);
      const language = await Language.load(wasmPath);
      this.languageCache.set(languageName, language);
      return language;
    } catch (error) {
      console.error(`Failed to load language ${languageName}:`, error);
      return null;
    }
  }

  /**
   * Find the WASM file path for a language
   */
  private findWasmPath(wasmName: string): string | null {
    const possiblePaths = [
      // tree-sitter-wasms package (primary source)
      path.join(__dirname, '../../node_modules/tree-sitter-wasms/out', `${wasmName}.wasm`),
      path.join(process.cwd(), 'node_modules/tree-sitter-wasms/out', `${wasmName}.wasm`),

      // Official Claude Code package (if available)
      path.join(__dirname, '../../node_modules/@anthropic-ai/claude-code', `${wasmName}.wasm`),
      path.join(process.cwd(), 'node_modules/@anthropic-ai/claude-code', `${wasmName}.wasm`),

      // Local vendor directory
      path.join(__dirname, '../../vendor/tree-sitter', `${wasmName}.wasm`),
      path.join(process.cwd(), 'vendor/tree-sitter', `${wasmName}.wasm`),

      // web-tree-sitter package
      path.join(__dirname, '../../node_modules/web-tree-sitter', `${wasmName}.wasm`),
      path.join(process.cwd(), 'node_modules/web-tree-sitter', `${wasmName}.wasm`),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Detect language from file extension
   */
  detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();

    for (const [langName, mapping] of Object.entries(LANGUAGE_MAPPINGS)) {
      if (mapping.extensions.includes(ext)) {
        return langName;
      }
    }

    return null;
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): string[] {
    return Object.keys(LANGUAGE_MAPPINGS);
  }

  /**
   * Get language mapping for a specific language
   */
  getLanguageMapping(languageName: string): LanguageMapping | null {
    return LANGUAGE_MAPPINGS[languageName] || null;
  }

  /**
   * Check if a language is supported
   */
  isLanguageSupported(languageName: string): boolean {
    return languageName in LANGUAGE_MAPPINGS;
  }

  /**
   * Preload commonly used languages
   */
  async preloadCommonLanguages(): Promise<void> {
    const commonLanguages = [
      'javascript',
      'typescript',
      'python',
      'go',
      'rust',
      'java',
      'c',
      'cpp',
    ];

    await Promise.all(
      commonLanguages.map((lang) =>
        this.loadLanguage(lang).catch((err) => {
          console.warn(`Failed to preload ${lang}:`, err);
        })
      )
    );
  }

  /**
   * Clear the language cache
   */
  clearCache(): void {
    this.languageCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; languages: string[] } {
    return {
      size: this.languageCache.size,
      languages: Array.from(this.languageCache.keys()),
    };
  }
}

/**
 * Singleton instance
 */
export const languageLoader = new LanguageLoader();
