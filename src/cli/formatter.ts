import path from "path";
import { ASTNode, RootNode } from "../core/ast/types";
import { collectFiles } from "../core/ast/walker";
import { findCircularDependencies } from "../core/ast/queries";

export function formatTree(tree: ASTNode): string {
  const lines: string[] = [];
  walk(tree, "", true, lines);
  return lines.join("\n");
}

function walk(
  entry: ASTNode,
  prefix: string,
  isLast: boolean,
  lines: string[]
): void {
  const connector = lines.length === 0 ? "" : isLast ? "└── " : "├── ";
  const display = entry.type === "directory" ? `${entry.name}/` : entry.name;
  lines.push(`${prefix}${connector}${display}`);

  if (entry.type !== "directory") return;

  const childPrefix =
    lines.length === 1 ? "" : prefix + (isLast ? "    " : "│   ");

  entry.children.forEach((child, i) => {
    const last = i === entry.children.length - 1;
    walk(child, childPrefix, last, lines);
  });
}

export function formatDependencyGraph(root: RootNode): string {
  const lines: string[] = [];
  const rel = (p: string) => path.relative(root.absolutePath, p);
  const files = collectFiles(root);

  lines.push("Dependencies");
  lines.push("============");

  for (const { filePath, node } of files) {
    lines.push("");
    lines.push(rel(filePath));

    if (node.imports.length === 0) {
      lines.push("  (no imports)");
      continue;
    }

    node.imports.forEach((imp, i) => {
      const isLast = i === node.imports.length - 1;
      const connector = isLast ? "└── " : "├── ";
      if (imp.isExternal) {
        lines.push(`  ${connector}${imp.specifier} (external)`);
      } else if (imp.resolvedPath) {
        lines.push(`  ${connector}${imp.specifier} → ${rel(imp.resolvedPath)}`);
      } else {
        lines.push(`  ${connector}${imp.specifier} (unresolved)`);
      }
    });
  }

  if (root.externals.length > 0) {
    lines.push("");
    lines.push(`Externals: ${root.externals.join(", ")}`);
  }

  const cycles = findCircularDependencies(root);
  if (cycles.length > 0) {
    lines.push("");
    lines.push("Circular dependencies:");
    for (const cycle of cycles) {
      lines.push("  " + cycle.map(rel).join(" → ") + " → " + rel(cycle[0]));
    }
  }

  return lines.join("\n");
}
