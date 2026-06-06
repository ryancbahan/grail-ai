export interface Position {
  line: number;   // 1-based
  column: number; // 0-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface TreeOptions {
  ignorePaths?: string[];
  depth?: number;
  sourceExtensions?: string[];
  sourceFileNames?: string[];
}

export interface ImportedSymbol {
  name: string;
  originalName: string;
}

export interface Import {
  specifier: string;
  kind: string;
  resolvedPath: string | null;
  isExternal: boolean;
  symbols: ImportedSymbol[];
  range?: Range;
}

export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "variable"
  | "type"
  | "interface"
  | "enum"
  | "module"
  | "trait"
  | "default"
  | "unknown";

export type SymbolVisibility = "public" | "private" | "protected" | "internal";

export interface SymbolRef {
  file: string;
  name: string;
  kind?: SymbolKind;
  parent?: string;
  signature?: string;
  visibility?: SymbolVisibility;
  range?: Range;
  context?: string;
}

export interface Symbol {
  name: string;
  kind: SymbolKind;
  signature: string;
  visibility: SymbolVisibility;
  parent?: string;
  range?: Range;
  calls?: SymbolRef[];
}

export interface SymbolLocation extends SymbolRef {
  source: string;
}

interface BaseNode {
  name: string;
}

export interface FileNode extends BaseNode {
  type: "file";
  extension: string | null;
  imports: Import[];
  symbols: Symbol[];
}

export interface DirectoryNode extends BaseNode {
  type: "directory";
  children: ASTNode[];
}

export type ASTNode = FileNode | DirectoryNode;

export interface RootNode {
  type: "root";
  absolutePath: string;
  tree: DirectoryNode;
  externals: string[];
}

export interface FileEntry {
  filePath: string;
  node: FileNode;
}
