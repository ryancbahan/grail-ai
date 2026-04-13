export interface TreeOptions {
  ignorePaths?: string[];
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

export interface Symbol {
  name: string;
  kind: SymbolKind;
  signature: string;
  visibility: SymbolVisibility;
  parent?: string;
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

export interface SymbolLocation {
  file: string;
  symbol: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  source: string;
}
