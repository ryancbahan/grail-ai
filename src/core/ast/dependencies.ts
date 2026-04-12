import fs from "fs";
import path from "path";
import { ASTNode, FileNode, Import, RootNode } from "./types";
import { LanguageConfig, ResolveContext } from "../languages/types";

function walkFiles(
  node: ASTNode,
  currentPath: string,
  extensions: Set<string>,
  out: Map<string, FileNode>
): void {
  if (node.type === "file") {
    if (node.extension && extensions.has(node.extension)) {
      out.set(currentPath, node);
    }
    return;
  }

  for (const child of node.children) {
    walkFiles(child, path.join(currentPath, child.name), extensions, out);
  }
}

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
  if (!lang.parseImports) return;

  const extensions = new Set(lang.extensions);
  const files = new Map<string, FileNode>();
  walkFiles(root.tree, root.absolutePath, extensions, files);

  const externals = new Set<string>();

  for (const [filePath, fileNode] of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const parsed = lang.parseImports(filePath, content);

    const context: ResolveContext = {
      containingFile: filePath,
      projectRoot: root.absolutePath,
    };

    if (lang.inferDependencies) {
      parsed.push(...lang.inferDependencies(filePath, content, context));
    }

    const imports: Import[] = parsed.map(({ specifier, kind }) => {
      const resolvedPath = lang.resolveImport
        ? lang.resolveImport(specifier, context)
        : null;

      const isRelative = specifier.startsWith(".");
      const isExternal = !isRelative && resolvedPath === null;

      if (isExternal) {
        externals.add(getPackageName(specifier));
      }

      return { specifier, kind, resolvedPath, isExternal };
    });

    fileNode.imports = imports;
  }

  root.externals = [...externals].sort();
}
