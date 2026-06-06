import type { Node, Tree } from "web-tree-sitter";
import type { ImportedSymbol, ParsedImport, Range } from "@grail-ai/core";

export function parseRustImports(
  _filePath: string,
  _content: string,
  tree: unknown
): ParsedImport[] {
  const t = tree as Tree;
  if (!t) return [];

  const imports: ParsedImport[] = [];
  const seen = new Set<string>();

  function add(specifier: string, kind: ParsedImport["kind"], symbols: ImportedSymbol[], range?: Range) {
    const key = `${kind}:${specifier}`;
    if (!seen.has(key)) {
      seen.add(key);
      imports.push({ specifier, kind, symbols, range });
    }
  }

  visit(t.rootNode, add);
  return imports;
}

function rangeOf(node: Node): Range {
  return {
    start: { line: node.startPosition.row + 1, column: node.startPosition.column },
    end: { line: node.endPosition.row + 1, column: node.endPosition.column },
  };
}

function visit(
  node: Node,
  add: (specifier: string, kind: ParsedImport["kind"], symbols: ImportedSymbol[], range?: Range) => void
): void {
  if (node.type === "use_declaration") {
    const arg = node.childForFieldName("argument") ?? node.namedChildren[0];
    if (arg) {
      add(arg.text, "static", extractImportedSymbols(arg), rangeOf(node));
    }
  } else if (node.type === "mod_item") {
    const name = node.childForFieldName("name");
    const body = node.childForFieldName("body");
    if (name && !body) {
      add(name.text, "static", [{ name: name.text, originalName: name.text }], rangeOf(node));
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) visit(child, add);
  }
}

function extractImportedSymbols(node: Node): ImportedSymbol[] {
  const symbols: ImportedSymbol[] = [];
  const seen = new Set<string>();

  function add(name: string, originalName = name) {
    const key = `${name}:${originalName}`;
    if (!seen.has(key)) {
      seen.add(key);
      symbols.push({ name, originalName });
    }
  }

  function walk(current: Node) {
    if (current.type === "use_as_clause") {
      const alias = current.childForFieldName("alias");
      const path = current.childForFieldName("path");
      if (alias && path) {
        add(alias.text, lastPathSegment(path.text));
        return;
      }
    }

    if (current.type === "use_wildcard") {
      add("*", "*");
      return;
    }

    if (current.type === "identifier" || current.type === "type_identifier") {
      add(current.text);
    }

    if (current.type === "scoped_identifier") {
      const name = current.childForFieldName("name");
      if (name) add(name.text);
    }

    for (let i = 0; i < current.namedChildCount; i++) {
      const child = current.namedChild(i);
      if (child) walk(child);
    }
  }

  walk(node);
  return symbols;
}

function lastPathSegment(text: string): string {
  const parts = text.split("::").filter(Boolean);
  return parts[parts.length - 1] ?? text;
}
