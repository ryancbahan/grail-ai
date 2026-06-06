import type { Node, Tree } from "web-tree-sitter";
import type { SymbolLocation, SymbolKind } from "@grail-ai/core";

export function locateRubySymbol(
  filePath: string,
  content: string,
  tree: unknown,
  symbolName: string,
  parentName?: string
): SymbolLocation | null {
  const t = tree as Tree;
  if (!t) return null;

  const lines = content.split("\n");
  const node = findSymbolNode(t.rootNode, symbolName, parentName);
  if (!node) return null;

  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const source = lines.slice(startLine - 1, endLine).join("\n");

  return {
    file: filePath,
    name: symbolName,
    kind: inferKind(node),
    parent: parentName,
    range: {
      start: { line: startLine, column: node.startPosition.column },
      end: { line: endLine, column: node.endPosition.column },
    },
    source,
  };
}

function findSymbolNode(
  root: Node,
  symbolName: string,
  parentName?: string
): Node | null {
  if (parentName) {
    // Find the class/module first, then the method within it
    const container = findContainerByQualifiedName(root, parentName);
    if (!container) return null;
    const body = container.childForFieldName("body");
    if (!body) return null;
    return findByName(body, symbolName, ["method", "singleton_method"]);
  }

  return findByName(root, symbolName, ["class", "module", "method", "singleton_method"]);
}

function findContainerByQualifiedName(root: Node, qualifiedName: string): Node | null {
  const parts = qualifiedName.split("::").filter(Boolean);
  if (parts.length === 0) return null;

  let scope: Node = root;
  let found: Node | null = null;

  for (const part of parts) {
    found = findByName(scope, part, ["class", "module"]);
    if (!found) return null;
    scope = found.childForFieldName("body") ?? found;
  }

  return found;
}

function findByName(node: Node, name: string, types: string[]): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (types.includes(child.type)) {
      const nameNode = child.childForFieldName("name");
      if (nameNode?.text === name) return child;
    }

    // Recurse into bodies and program nodes
    const found = findByName(child, name, types);
    if (found) return found;
  }
  return null;
}

function inferKind(node: Node): SymbolKind {
  switch (node.type) {
    case "method":
      return "method";
    case "singleton_method":
      return "function";
    case "class":
      return "class";
    case "module":
      return "module";
    default:
      return "unknown";
  }
}
