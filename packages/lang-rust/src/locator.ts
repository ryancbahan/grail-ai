import type { Node, Tree } from "web-tree-sitter";
import type { SymbolKind, SymbolLocation } from "@grail-ai/core";

export function locateRustSymbol(
  filePath: string,
  content: string,
  tree: unknown,
  symbolName: string,
  parentName?: string
): SymbolLocation | null {
  const t = tree as Tree;
  if (!t) return null;

  const node = findSymbolNode(t.rootNode, symbolName, parentName);
  if (!node) return null;

  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const source = content.split("\n").slice(startLine - 1, endLine).join("\n");

  return {
    file: filePath,
    name: symbolName,
    kind: inferKind(node, parentName),
    parent: parentName,
    range: {
      start: { line: startLine, column: node.startPosition.column },
      end: { line: endLine, column: node.endPosition.column },
    },
    source,
  };
}

function findSymbolNode(root: Node, symbolName: string, parentName?: string): Node | null {
  if (parentName) {
    const container = findContainer(root, parentName);
    if (!container) return null;
    const body = container.childForFieldName("body") ?? container;
    return findByName(body, symbolName, ["function_item", "function_signature_item"]);
  }

  return findByName(root, symbolName, [
    "function_item",
    "function_signature_item",
    "struct_item",
    "enum_item",
    "trait_item",
    "mod_item",
    "type_item",
    "const_item",
    "static_item",
    "macro_definition",
    "union_item",
  ]);
}

function findContainer(root: Node, qualifiedName: string): Node | null {
  const parts = qualifiedName.split("::").filter(Boolean);
  if (parts.length === 0) return null;

  let scope: Node = root;
  let found: Node | null = null;

  for (const part of parts) {
    found = findByName(scope, part, ["mod_item", "struct_item", "enum_item", "trait_item", "impl_item", "union_item"]);
    if (!found && parts.length === 1) {
      found = findImplForType(root, part);
    }
    if (!found) return null;
    scope = found.childForFieldName("body") ?? found;
  }

  return found;
}

function findImplForType(root: Node, typeName: string): Node | null {
  let found: Node | null = null;
  walk(root, (node) => {
    if (found || node.type !== "impl_item") return;
    const typeNode = node.childForFieldName("type");
    if (typeNode?.text === typeName) found = node;
  });
  return found;
}

function findByName(node: Node, name: string, types: string[]): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (types.includes(child.type)) {
      const nameNode = child.childForFieldName("name");
      if (nameNode?.text === name) return child;
      if (child.type === "impl_item" && child.childForFieldName("type")?.text === name) return child;
    }

    const found = findByName(child, name, types);
    if (found) return found;
  }

  return null;
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walk(child, visit);
  }
}

function inferKind(node: Node, parentName?: string): SymbolKind {
  switch (node.type) {
    case "function_item":
    case "function_signature_item":
      return parentName ? "method" : "function";
    case "struct_item":
    case "union_item":
      return "class";
    case "enum_item":
      return "enum";
    case "trait_item":
      return "trait";
    case "mod_item":
      return "module";
    case "type_item":
      return "type";
    case "const_item":
    case "static_item":
      return "variable";
    case "macro_definition":
      return "function";
    default:
      return "unknown";
  }
}
