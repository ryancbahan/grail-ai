import fs from "fs";
import path from "path";
import { buildTree } from "./ast/builder";
import { buildDependencyGraph } from "./ast/dependencies";
import { detectLanguage, getLanguageDescriptor, loadLanguage } from "./languages";
import { RootNode, TreeOptions } from "./ast/types";
import { Language } from "./languages/types";

function findProjectRoot(filePath: string): string {
  let dir = path.dirname(filePath);
  while (dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, "package.json")) ||
      fs.existsSync(path.join(dir, ".git")) ||
      fs.existsSync(path.join(dir, "go.mod")) ||
      fs.existsSync(path.join(dir, "Cargo.toml")) ||
      fs.existsSync(path.join(dir, "pyproject.toml"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return path.dirname(filePath);
}

export interface AnalyzeOptions {
  depth?: number;
  language?: string;
}

export interface AnalysisResult {
  root: RootNode;
  language: Language | undefined;
}

export async function analyze(dirPath: string, options: AnalyzeOptions = {}): Promise<AnalysisResult> {
  const resolved = path.resolve(dirPath);
  const projectRoot = fs.statSync(resolved).isDirectory() ? resolved : findProjectRoot(resolved);
  const descriptor = options.language
    ? getLanguageDescriptor(options.language)
    : detectLanguage(projectRoot);

  let language: Language | undefined;
  if (descriptor) {
    language = await loadLanguage(descriptor);
  }

  const treeOptions: TreeOptions = {
    ...descriptor?.treeOptions,
    ...(options.depth !== undefined ? { depth: options.depth } : {}),
  };

  const root = buildTree(projectRoot, treeOptions);

  if (language) {
    buildDependencyGraph(root, language);
  }

  return { root, language };
}
