import path from "path";
import { buildTree } from "./ast/builder";
import { buildDependencyGraph } from "./ast/dependencies";
import { detectLanguage, loadLanguage } from "./languages";
import { RootNode, TreeOptions } from "./ast/types";
import { Language } from "./languages/types";

export interface AnalyzeOptions {
  depth?: number;
}

export interface AnalysisResult {
  root: RootNode;
  language: Language | undefined;
}

export async function analyze(dirPath: string, options: AnalyzeOptions = {}): Promise<AnalysisResult> {
  const resolved = path.resolve(dirPath);
  const descriptor = detectLanguage(resolved);

  let language: Language | undefined;
  if (descriptor) {
    language = await loadLanguage(descriptor);
  }

  const treeOptions: TreeOptions = {
    ...descriptor?.treeOptions,
    ...(options.depth !== undefined ? { depth: options.depth } : {}),
  };

  const root = buildTree(resolved, treeOptions);

  if (language) {
    buildDependencyGraph(root, language);
  }

  return { root, language };
}
