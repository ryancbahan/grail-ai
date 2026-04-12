import { TreeOptions, Import } from "../ast/types";

export interface ResolveContext {
  containingFile: string;
  projectRoot: string;
}

export type ParsedImport = Pick<Import, "specifier" | "kind">;

export interface LanguageConfig {
  name: string;
  extensions: string[];
  markers: string[];
  treeOptions: TreeOptions;
  init?: () => Promise<void>;
  parseImports?: (filePath: string, content: string) => ParsedImport[];
  resolveImport?: (specifier: string, context: ResolveContext) => string | null;
  inferDependencies?: (filePath: string, content: string, context: ResolveContext) => ParsedImport[];
}
