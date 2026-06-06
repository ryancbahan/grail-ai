import type { Node, Tree } from "web-tree-sitter";
import type { Symbol, SymbolKind, Range } from "@grail-ai/core";

export function parseRubySymbols(
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

  visitSymbols(t.rootNode, add, undefined);
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

function extractMethodSignature(node: Node): string {
  const name = node.childForFieldName("name");
  const params = node.childForFieldName("parameters");
  if (!name) return "";
  if (params) {
    return `def ${name.text}${params.text}`;
  }
  return `def ${name.text}`;
}

function extractSingletonMethodSignature(node: Node): string {
  const object = node.childForFieldName("object");
  const name = node.childForFieldName("name");
  const params = node.childForFieldName("parameters");
  if (!name) return "";
  const prefix = object ? `${object.text}.` : "self.";
  if (params) {
    return `def ${prefix}${name.text}${params.text}`;
  }
  return `def ${prefix}${name.text}`;
}

function singletonSignatureFromMethod(node: Node): string {
  const name = node.childForFieldName("name");
  const params = node.childForFieldName("parameters");
  if (!name) return "";
  if (params) {
    return `def self.${name.text}${params.text}`;
  }
  return `def self.${name.text}`;
}

function qualifiedName(parent: string | undefined, name: string): string {
  return parent ? `${parent}::${name}` : name;
}

function isNoArgModuleFunctionCall(node: Node): boolean {
  if (node.type === "identifier" && node.text === "module_function") return true;
  if (node.type !== "call") return false;
  const method = node.childForFieldName("method");
  if (method?.text !== "module_function") return false;
  const args = node.childForFieldName("arguments");
  return !args || args.namedChildCount === 0;
}

function visitBodySymbols(
  body: Node,
  add: (sym: Symbol) => void,
  parent: string | undefined
): void {
  let moduleFunctionActive = false;
  for (let i = 0; i < body.childCount; i++) {
    const child = body.child(i);
    if (!child) continue;
    if (isNoArgModuleFunctionCall(child)) {
      moduleFunctionActive = true;
      continue;
    }
    visitSymbols(child, add, parent, moduleFunctionActive);
  }
}

function visitSymbols(
  node: Node,
  add: (sym: Symbol) => void,
  parent: string | undefined,
  moduleFunctionActive = false
): void {
  switch (node.type) {
    case "class": {
      const name = node.childForFieldName("name");
      if (!name) break;
      const className = qualifiedName(parent, name.text);
      const superclass = node.childForFieldName("superclass");
      let sig = `class ${name.text}`;
      if (superclass) {
        // superclass node includes the "< " prefix in some grammars, normalize it
        const superText = superclass.text.replace(/^<\s*/, "");
        sig += ` < ${superText}`;
      }
      add({ name: name.text, kind: "class", signature: sig, visibility: "public", parent, ...rangeOf(node) });

      // Visit class body for methods
      const body = node.childForFieldName("body");
      if (body) {
        visitBodySymbols(body, add, className);
      }
      return;
    }

    case "module": {
      const name = node.childForFieldName("name");
      if (!name) break;
      const moduleName = qualifiedName(parent, name.text);
      add({ name: name.text, kind: "module", signature: `module ${name.text}`, visibility: "public", parent, ...rangeOf(node) });

      const body = node.childForFieldName("body");
      if (body) {
        visitBodySymbols(body, add, moduleName);
      }
      return;
    }

    case "method": {
      const name = node.childForFieldName("name");
      if (!name) break;
      const sig = extractMethodSignature(node);
      const visibility = name.text.startsWith("_") ? "private" : "public";
      add({ name: name.text, kind: "method", signature: sig, visibility, parent, ...rangeOf(node) });
      if (moduleFunctionActive) {
        add({
          name: name.text,
          kind: "function",
          signature: singletonSignatureFromMethod(node),
          visibility: "public",
          parent,
          ...rangeOf(node),
        });
      }
      return;
    }

    case "singleton_method": {
      const name = node.childForFieldName("name");
      if (!name) break;
      const sig = extractSingletonMethodSignature(node);
      add({ name: name.text, kind: "function", signature: sig, visibility: "public", parent, ...rangeOf(node) });
      return;
    }

    case "assignment": {
      // Constant assignment: FOO = ...
      const left = node.childForFieldName("left");
      if (left && left.type === "constant") {
        const right = node.childForFieldName("right");
        const sig = right ? `${left.text} = ${right.text.split("\n")[0]}` : left.text;
        add({ name: left.text, kind: "variable", signature: sig, visibility: "public", parent, ...rangeOf(node) });
      }
      return;
    }

    case "call": {
      // Detect attr_reader, attr_writer, attr_accessor
      const method = node.childForFieldName("method");
      if (method && ["attr_reader", "attr_writer", "attr_accessor"].includes(method.text)) {
        const args = node.childForFieldName("arguments");
        if (args) {
          for (const arg of args.namedChildren) {
            if (arg.type === "simple_symbol") {
              const attrName = arg.text.replace(/^:/, "");
              add({
                name: attrName,
                kind: "method",
                signature: `${method.text} :${attrName}`,
                visibility: "public",
                parent,
                ...rangeOf(node),
              });
            }
          }
        }
      } else if (method?.text === "scope") {
        const args = node.childForFieldName("arguments");
        const scopeName = args?.namedChildren.find((arg) => arg.type === "simple_symbol");
        if (scopeName) {
          const name = scopeName.text.replace(/^:/, "");
          add({
            name,
            kind: "function",
            signature: `scope :${name}`,
            visibility: "public",
            parent,
            ...rangeOf(node),
          });
        }
      }
      break;
    }
  }

  // Recurse into children for top-level and body nodes
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      visitSymbols(child, add, parent, moduleFunctionActive);
    }
  }
}
