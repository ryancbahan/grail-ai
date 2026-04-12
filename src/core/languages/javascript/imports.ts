import { ParsedImport } from "../types";
import { getParser } from "./parser";

export function parseJavaScriptImports(
  filePath: string,
  content: string
): ParsedImport[] {
  const parser = getParser(filePath);
  const tree = parser.parse(content);
  if (!tree) return [];

  const imports: ParsedImport[] = [];
  const seen = new Set<string>();

  function add(specifier: string, kind: ParsedImport["kind"]) {
    const key = `${kind}:${specifier}`;
    if (!seen.has(key)) {
      seen.add(key);
      imports.push({ specifier, kind });
    }
  }

  visit(tree.rootNode, add);
  tree.delete();

  return imports;
}

function visit(
  node: any,
  add: (specifier: string, kind: ParsedImport["kind"]) => void
): void {
  switch (node.type) {
    case "import_statement": {
      const source = node.childForFieldName("source");
      if (source) {
        add(stripQuotes(source.text), "static");
      }
      break;
    }

    case "export_statement": {
      const source = node.childForFieldName("source");
      if (source) {
        add(stripQuotes(source.text), "static");
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
            add(stripQuotes(firstArg.text), "require");
          }
        } else if (fn.type === "import") {
          if (firstArg && firstArg.type === "string") {
            add(stripQuotes(firstArg.text), "dynamic");
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

function stripQuotes(text: string): string {
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}
