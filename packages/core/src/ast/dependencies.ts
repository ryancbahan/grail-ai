import fs from "fs";
import { Import, RootNode } from "./types";
import { collectFiles } from "./walker";
import { parseFile } from "../languages/grammar-loader";
import { Language, ResolveContext } from "../languages/types";

function getPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

export function buildDependencyGraph(
  root: RootNode,
  lang: Language
): void {
  const { descriptor, implementation } = lang;
  const extensions = new Set(descriptor.extensions);
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

    const parsed = implementation.parseImports(filePath, content, tree);

    const context: ResolveContext = {
      containingFile: filePath,
      projectRoot: root.absolutePath,
    };

    if (implementation.inferDependencies) {
      parsed.push(...implementation.inferDependencies(filePath, content, context));
    }

    const imports: Import[] = parsed.map(({ specifier, kind, symbols, range }) => {
      const resolvedPath = implementation.resolveImport(specifier, context);

      const isRelative = specifier.startsWith(".");
      const isExternal = resolvedPath === null && (
        implementation.isExternalImport
          ? implementation.isExternalImport(specifier, context)
          : !isRelative
      );

      if (isExternal) {
        externals.add(implementation.externalPackageName?.(specifier) ?? getPackageName(specifier));
      }

      return { specifier, kind, resolvedPath, isExternal, symbols, range };
    });

    node.imports = imports;
    node.symbols = implementation.parseSymbols(filePath, content, tree);

    // Clean up tree-sitter tree
    if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
      (tree as { delete: () => void }).delete();
    }
  }

  root.externals = [...externals].sort();
}
