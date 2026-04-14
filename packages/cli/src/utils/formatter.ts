import path from "path";
import { collectFiles, findCircularDependencies } from "@grail-ai/core";
import type { ASTNode, FileNode, Symbol, SymbolKind, RootNode } from "@grail-ai/core";

const KIND_PREFIX: Record<SymbolKind, string> = {
  function: "fn",
  method: "method",
  class: "class",
  variable: "const",
  type: "type",
  interface: "interface",
  enum: "enum",
  module: "module",
  trait: "trait",
  default: "default",
  unknown: "",
};

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
      const symbolNames = imp.symbols.length > 0
        ? ` { ${imp.symbols.map((s) => s.originalName === s.name ? s.name : `${s.originalName} as ${s.name}`).join(", ")} }`
        : "";
      if (imp.isExternal) {
        lines.push(`  ${connector}${imp.specifier}${symbolNames} (external)`);
      } else if (imp.resolvedPath) {
        lines.push(`  ${connector}${imp.specifier}${symbolNames} → ${rel(imp.resolvedPath)}`);
      } else {
        lines.push(`  ${connector}${imp.specifier}${symbolNames} (unresolved)`);
      }
    });
  }

  if (root.externals.length > 0) {
    lines.push("");
    lines.push(`Externals: ${root.externals.join(", ")}`);
  }

  const cycles = findCircularDependencies(files);
  if (cycles.length > 0) {
    lines.push("");
    lines.push("Circular dependencies:");
    for (const cycle of cycles) {
      lines.push("  " + cycle.map(rel).join(" → ") + " → " + rel(cycle[0]));
    }
  }

  return lines.join("\n");
}

export function formatFileSummary(node: FileNode): string {
  const parts: string[] = [];

  if (node.symbols.length > 0) {
    const topLevel = node.symbols.filter((s) => !s.parent);
    const exported = topLevel.filter((s) => s.visibility === "public");
    const internal = topLevel.filter((s) => s.visibility === "internal");

    const format = (syms: typeof topLevel) =>
      syms.map((s) => { const p = KIND_PREFIX[s.kind]; return p ? `${p} ${s.name}` : s.name; }).join(", ");

    if (exported.length > 0) parts.push(`exports: ${format(exported)}`);
    if (internal.length > 0) parts.push(`internal: ${format(internal)}`);
  }

  const localDeps = node.imports.filter((i) => !i.isExternal).length;
  const extDeps = [...new Set(node.imports.filter((i) => i.isExternal).map((i) => i.specifier))];

  if (localDeps > 0 || extDeps.length > 0) {
    const segments: string[] = [];
    if (localDeps > 0) segments.push(`${localDeps} dep${localDeps !== 1 ? "s" : ""}`);
    if (extDeps.length > 0) {
      segments.push(`${extDeps.length} ext (${extDeps.join(", ")})`);
    }
    parts.push(segments.join(", "));
  }

  return parts.join(" | ");
}
