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

  for (const symbol of parseUseSymbols(node.text)) add(symbol.name, symbol.originalName);
  return symbols;
}

function parseUseSymbols(text: string): ImportedSymbol[] {
  const source = text.trim().replace(/;$/, "");
  const list = topLevelBraceContents(source);
  if (list) {
    const [prefix, contents] = list;
    return splitTopLevel(contents).flatMap((item) => {
      const trimmed = item.trim();
      if (!trimmed) return [];
      if (trimmed === "self") {
        const name = lastPathSegment(prefix);
        return name ? [{ name, originalName: name }] : [];
      }
      return parseUseSymbols(`${prefix}::${trimmed}`);
    });
  }

  if (source.endsWith("::*")) return [{ name: "*", originalName: "*" }];

  const alias = source.match(/\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/);
  if (alias) {
    const pathText = source.slice(0, alias.index).trim();
    const originalName = lastPathSegment(pathText);
    return originalName ? [{ name: alias[1], originalName }] : [];
  }

  const name = lastPathSegment(source);
  return name ? [{ name, originalName: name }] : [];
}

function topLevelBraceContents(text: string): [string, string] | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const prefix = text.slice(0, start).replace(/::$/, "").trim();
        return [prefix, text.slice(start + 1, i)];
      }
    }
  }
  return null;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
}

function lastPathSegment(text: string): string {
  const parts = text.split("::").filter(Boolean);
  return parts[parts.length - 1] ?? text;
}
