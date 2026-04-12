import fs from "fs";
import { Import, RootNode } from "./types";
import { collectFiles } from "./walker";
import { parseFile } from "../languages/grammar-loader";
import { LanguageConfig, ResolveContext } from "../languages/types";

function getPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

export function buildDependencyGraph(
  root: RootNode,
  lang: LanguageConfig
): void {
  const extensions = new Set(lang.extensions);
  const allFiles = collectFiles(root);
  const externals = new Set<string>();

  for (const { filePath, node } of allFiles) {
    if (!node.extension || !extensions.has(node.extension)) continue;

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    // Parse once, pass tree to both hooks
    const tree = parseFile(filePath, content);

    const parsed = lang.parseImports(filePath, content, tree);

    const context: ResolveContext = {
      containingFile: filePath,
      projectRoot: root.absolutePath,
    };

    if (lang.inferDependencies) {
      parsed.push(...lang.inferDependencies(filePath, content, context));
    }

    const imports: Import[] = parsed.map(({ specifier, kind, symbols }) => {
      const resolvedPath = lang.resolveImport(specifier, context);

      const isRelative = specifier.startsWith(".");
      const isExternal = !isRelative && resolvedPath === null;

      if (isExternal) {
        externals.add(getPackageName(specifier));
      }

      return { specifier, kind, resolvedPath, isExternal, symbols };
    });

    node.imports = imports;
    node.symbols = lang.parseSymbols(filePath, content, tree);

    // Clean up tree-sitter tree
    if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
      (tree as { delete: () => void }).delete();
    }
  }

  root.externals = [...externals].sort();
}
