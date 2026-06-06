import type { Node, Tree } from "web-tree-sitter";
import type { ImportedSymbol, ParsedImport, Range } from "@grail-ai/core";

export function parseRubyImports(
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
  if (node.type === "call") {
    const method = node.childForFieldName("method");
    if (method) {
      if (method.text === "require" || method.text === "require_relative") {
        const args = node.childForFieldName("arguments");
        if (args) {
          const firstArg = args.namedChildren[0];
          if (firstArg && firstArg.type === "string") {
            const specifier = stripQuotes(firstArg.text);
            const kind = method.text === "require_relative" ? "static" : "require";
            add(specifier, kind, [], rangeOf(node));
          }
        }
      }
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) visit(child, add);
  }
}

function stripQuotes(text: string): string {
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}
