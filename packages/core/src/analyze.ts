import path from "path";
import { buildTree } from "./ast/builder";
import { buildDependencyGraph } from "./ast/dependencies";
import { detectLanguage, initLanguages } from "./languages";
import { RootNode, TreeOptions } from "./ast/types";
import { LanguageConfig } from "./languages/types";

export async function initAnalyzer(): Promise<void> {
  await initLanguages();
}

export interface AnalyzeOptions {
  depth?: number;
}

export interface AnalysisResult {
  root: RootNode;
  language: LanguageConfig | undefined;
}

export function analyze(dirPath: string, options: AnalyzeOptions = {}): AnalysisResult {
  const resolved = path.resolve(dirPath);
  const language = detectLanguage(resolved);

  const treeOptions: TreeOptions = {
    ...language?.treeOptions,
    ...(options.depth !== undefined ? { depth: options.depth } : {}),
  };

  const root = buildTree(resolved, treeOptions);

  if (language) {
    buildDependencyGraph(root, language);
  }

  return { root, language };
}
