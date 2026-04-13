import path from "path";
import { buildTree } from "./ast/builder";
import { buildDependencyGraph } from "./ast/dependencies";
import { detectLanguage, initLanguages } from "./languages";
import { RootNode } from "./ast/types";
import { LanguageConfig } from "./languages/types";

export async function initAnalyzer(): Promise<void> {
  await initLanguages();
}

export interface AnalysisResult {
  root: RootNode;
  language: LanguageConfig | undefined;
}

export function analyze(dirPath: string): AnalysisResult {
  const resolved = path.resolve(dirPath);
  const language = detectLanguage(resolved);
  const root = buildTree(resolved, language?.treeOptions);

  if (language) {
    buildDependencyGraph(root, language);
  }

  return { root, language };
}
