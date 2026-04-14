import { TreeOptions, Range, Import, ImportedSymbol, Symbol, SymbolLocation, FileEntry } from "../ast/types";

export interface ResolveContext {
  containingFile: string;
  projectRoot: string;
}

export interface ParsedImport {
  specifier: string;
  kind: Import["kind"];
  symbols: ImportedSymbol[];
  range?: Range;
}

export interface GrammarMapping {
  extensions: string[];
  grammarPackage: string;
  wasmFile: string;
}

export interface LanguageImplementation {
  parseImports: (filePath: string, content: string, tree: unknown) => ParsedImport[];
  parseSymbols: (filePath: string, content: string, tree: unknown) => Symbol[];
  resolveImport: (specifier: string, context: ResolveContext) => string | null;
  locateSymbol: (filePath: string, content: string, tree: unknown, symbolName: string, parentName?: string) => SymbolLocation | null;
  inferDependencies?: (filePath: string, content: string, context: ResolveContext) => ParsedImport[];
  buildCallGraph?: (projectRoot: string, files: FileEntry[]) => Promise<void>;
}

export interface LanguageDescriptor {
  name: string;
  extensions: string[];
  markers: string[];
  treeOptions: TreeOptions;
  grammars: GrammarMapping[];
  load: () => Promise<LanguageImplementation>;
}

export interface Language {
  descriptor: LanguageDescriptor;
  implementation: LanguageImplementation;
}
