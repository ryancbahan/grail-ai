export interface TreeOptions {
  ignorePaths?: string[];
}

export interface Import {
  specifier: string;
  kind: "static" | "dynamic" | "require" | "convention";
  resolvedPath: string | null;
  isExternal: boolean;
}

interface BaseNode {
  name: string;
}

export interface FileNode extends BaseNode {
  type: "file";
  extension: string | null;
  imports: Import[];
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
