import type { Node, Tree } from "web-tree-sitter";
import type { ImportedSymbol } from "../../ast/types";
import { ParsedImport } from "../types";

export function parseJavaScriptImports(
  _filePath: string,
  _content: string,
  tree: unknown
): ParsedImport[] {
  const t = tree as Tree;
  if (!t) return [];

  const imports: ParsedImport[] = [];
  const seen = new Set<string>();

  function add(specifier: string, kind: ParsedImport["kind"], symbols: ImportedSymbol[]) {
    const key = `${kind}:${specifier}`;
    if (!seen.has(key)) {
      seen.add(key);
      imports.push({ specifier, kind, symbols });
    }
  }

  visit(t.rootNode, add);
  return imports;
}

function visit(
  node: Node,
  add: (specifier: string, kind: ParsedImport["kind"], symbols: ImportedSymbol[]) => void
): void {
  switch (node.type) {
    case "import_statement": {
      const source = node.childForFieldName("source");
      if (source) {
        const symbols = extractImportedSymbols(node);
        add(stripQuotes(source.text), "static", symbols);
      }
      break;
    }

    case "export_statement": {
      const source = node.childForFieldName("source");
      if (source) {
        add(stripQuotes(source.text), "static", []);
      }
      break;
    }

    case "call_expression": {
      const fn = node.childForFieldName("function");
      const args = node.childForFieldName("arguments");
      if (fn && args) {
        const firstArg = args.namedChildren[0];
        if (fn.type === "identifier" && fn.text === "require") {
          if (firstArg && firstArg.type === "string") {
            add(stripQuotes(firstArg.text), "require", []);
          }
        } else if (fn.type === "import") {
          if (firstArg && firstArg.type === "string") {
            add(stripQuotes(firstArg.text), "dynamic", []);
          }
        }
      }
      break;
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) visit(child, add);
  }
}

function extractImportedSymbols(importNode: Node): ImportedSymbol[] {
  const symbols: ImportedSymbol[] = [];

  for (let i = 0; i < importNode.childCount; i++) {
    const child = importNode.child(i);
    if (!child) continue;

    if (child.type === "import_clause") {
      for (let j = 0; j < child.childCount; j++) {
        const clause = child.child(j);
        if (!clause) continue;

        // Default import: import foo from "x"
        if (clause.type === "identifier") {
          symbols.push({ name: clause.text, originalName: "default" });
        }

        // Named imports: import { a, b as c } from "x"
        if (clause.type === "named_imports") {
          for (const specifier of clause.namedChildren) {
            if (specifier.type === "import_specifier") {
              const name = specifier.childForFieldName("name");
              const alias = specifier.childForFieldName("alias");
              if (name) {
                symbols.push({
                  name: alias?.text ?? name.text,
                  originalName: name.text,
                });
              }
            }
          }
        }

        // Namespace import: import * as ns from "x"
        if (clause.type === "namespace_import") {
          const id = clause.namedChildren.find((c) => c.type === "identifier");
          if (id) {
            symbols.push({ name: id.text, originalName: "*" });
          }
        }
      }
    }
  }

  return symbols;
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
