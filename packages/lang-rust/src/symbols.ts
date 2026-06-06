import type { Node, Tree } from "web-tree-sitter";
import type { Symbol, SymbolKind, SymbolVisibility, Range } from "@grail-ai/core";

interface Scope {
  name: string;
  kind: "module" | "type" | "trait";
}

export function parseRustSymbols(
  _filePath: string,
  _content: string,
  tree: unknown
): Symbol[] {
  const t = tree as Tree;
  if (!t) return [];

  const symbols: Symbol[] = [];
  const seen = new Set<string>();

  function add(sym: Symbol) {
    const key = `${sym.parent ?? ""}:${sym.kind}:${sym.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      symbols.push(sym);
    }
  }

  visitSymbols(t.rootNode, add);
  return symbols;
}

function rangeOf(node: Node): { range: Range } {
  return {
    range: {
      start: { line: node.startPosition.row + 1, column: node.startPosition.column },
      end: { line: node.endPosition.row + 1, column: node.endPosition.column },
    },
  };
}

function visitSymbols(node: Node, add: (sym: Symbol) => void, scope?: Scope): void {
  switch (node.type) {
    case "mod_item": {
      const name = node.childForFieldName("name");
      if (!name) break;
      add({
        name: name.text,
        kind: "module",
        signature: signatureOf(node),
        visibility: visibilityOf(node),
        parent: scope?.name,
        ...rangeOf(node),
      });

      const body = node.childForFieldName("body");
      if (body) {
        visitChildren(body, add, { name: qualify(scope, name.text), kind: "module" });
      }
      return;
    }

    case "struct_item":
    case "union_item": {
      addNamedType(node, add, scope, "class");
      return;
    }

    case "enum_item": {
      addNamedType(node, add, scope, "enum");
      return;
    }

    case "trait_item": {
      const name = node.childForFieldName("name");
      if (!name) break;
      add({
        name: name.text,
        kind: "trait",
        signature: signatureOf(node),
        visibility: visibilityOf(node),
        parent: scope?.name,
        ...rangeOf(node),
      });

      const body = node.childForFieldName("body");
      if (body) {
        visitChildren(body, add, { name: qualify(scope, name.text), kind: "trait" });
      }
      return;
    }

    case "impl_item": {
      const body = node.childForFieldName("body");
      const typeNode = node.childForFieldName("type");
      if (body && typeNode) {
        visitChildren(body, add, { name: qualify(scope, typeNode.text), kind: "type" });
      }
      return;
    }

    case "function_item":
    case "function_signature_item": {
      const name = node.childForFieldName("name");
      if (!name) break;
      add({
        name: name.text,
        kind: scope?.kind === "type" || scope?.kind === "trait" ? "method" : "function",
        signature: signatureOf(node),
        visibility: visibilityOf(node),
        parent: scope?.name,
        ...rangeOf(node),
      });
      return;
    }

    case "type_item": {
      addNamedSymbol(node, add, scope, "type");
      return;
    }

    case "const_item":
    case "static_item": {
      addNamedSymbol(node, add, scope, "variable");
      return;
    }

    case "macro_definition": {
      addNamedSymbol(node, add, scope, "function");
      return;
    }
  }

  visitChildren(node, add, scope);
}

function visitChildren(node: Node, add: (sym: Symbol) => void, scope?: Scope): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) visitSymbols(child, add, scope);
  }
}

function addNamedType(node: Node, add: (sym: Symbol) => void, scope: Scope | undefined, kind: SymbolKind): void {
  addNamedSymbol(node, add, scope, kind);
}

function addNamedSymbol(node: Node, add: (sym: Symbol) => void, scope: Scope | undefined, kind: SymbolKind): void {
  const name = node.childForFieldName("name");
  if (!name) return;
  add({
    name: name.text,
    kind,
    signature: signatureOf(node),
    visibility: visibilityOf(node),
    parent: scope?.name,
    ...rangeOf(node),
  });
}

function qualify(scope: Scope | undefined, name: string): string {
  if (!scope || name.includes("::")) return name;
  return scope.kind === "module" ? `${scope.name}::${name}` : name;
}

function visibilityOf(node: Node): SymbolVisibility {
  const modifier = node.namedChildren.find((child) => child.type === "visibility_modifier");
  if (!modifier) return "private";
  if (modifier.text === "pub") return "public";
  if (modifier.text.includes("crate")) return "internal";
  return "protected";
}

function signatureOf(node: Node): string {
  const body = node.childForFieldName("body");
  if (body) {
    return node.text.slice(0, body.startIndex - node.startIndex).trimEnd();
  }

  return node.text.split("\n")[0].trim();
}
