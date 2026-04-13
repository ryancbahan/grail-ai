import type { Node, Tree } from "web-tree-sitter";
import type { Symbol, SymbolKind } from "@grail/core";

export function parseJavaScriptSymbols(
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

function visitSymbols(
  node: Node,
  add: (sym: Symbol) => void
): void {
  if (node.type === "export_statement") {
    const source = node.childForFieldName("source");
    if (source) return; // re-export — skip

    const declaration = node.childForFieldName("declaration");
    if (declaration) {
      handleDeclaration(declaration, add);
      return;
    }

    const value = node.childForFieldName("value");
    if (value) {
      add({ name: "default", kind: "default", signature: "default", visibility: "public" });
      return;
    }

    // export { a, b }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === "export_clause") {
        for (const specifier of child.namedChildren) {
          const alias = specifier.childForFieldName("alias");
          const name = specifier.childForFieldName("name");
          const exportedName = alias?.text ?? name?.text ?? specifier.text;
          add({
            name: exportedName,
            kind: "unknown",
            signature: exportedName,
            visibility: "public",
          });
        }
      }
    }
    return;
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) visitSymbols(child, add);
  }
}

function extractSignature(node: Node, bodyType: string): string {
  // Find the body child and take text before it
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === bodyType) {
      const beforeBody = node.text.slice(0, child.startIndex - node.startIndex).trim();
      return beforeBody;
    }
  }
  // No body found — use full text (e.g., abstract methods, type declarations)
  return node.text.replace(/;$/, "").trim();
}

function handleDeclaration(
  declaration: Node,
  add: (sym: Symbol) => void
): void {
  switch (declaration.type) {
    case "function_declaration":
    case "generator_function_declaration": {
      const name = declaration.childForFieldName("name");
      const sig = extractSignature(declaration, "statement_block");
      if (name) {
        add({ name: name.text, kind: "function", signature: sig, visibility: "public" });
      } else {
        add({ name: "default", kind: "default", signature: sig, visibility: "public" });
      }
      break;
    }

    case "class_declaration": {
      const name = declaration.childForFieldName("name");
      const className = name?.text ?? "default";
      const sig = extractSignature(declaration, "class_body");
      const kind: SymbolKind = name ? "class" : "default";
      add({ name: className, kind, signature: sig, visibility: "public" });

      // Extract class members
      const body = declaration.childForFieldName("body");
      if (body && name) {
        extractClassMembers(body, className, add);
      }
      break;
    }

    case "lexical_declaration": {
      for (const child of declaration.namedChildren) {
        if (child.type === "variable_declarator") {
          const name = child.childForFieldName("name");
          if (name) {
            // Signature: text before = assignment
            const eqIndex = child.text.indexOf("=");
            const sig = eqIndex > 0
              ? child.text.slice(0, eqIndex).trim()
              : child.text;
            add({ name: name.text, kind: "variable", signature: sig, visibility: "public" });
          }
        }
      }
      break;
    }

    case "type_alias_declaration": {
      const name = declaration.childForFieldName("name");
      if (name) {
        add({ name: name.text, kind: "type", signature: declaration.text.replace(/;$/, "").trim(), visibility: "public" });
      }
      break;
    }

    case "interface_declaration": {
      const name = declaration.childForFieldName("name");
      if (name) {
        add({ name: name.text, kind: "interface", signature: declaration.text.replace(/;$/, "").trim(), visibility: "public" });
      }
      break;
    }

    case "enum_declaration": {
      const name = declaration.childForFieldName("name");
      if (name) {
        add({ name: name.text, kind: "enum", signature: declaration.text.replace(/;$/, "").trim(), visibility: "public" });
      }
      break;
    }

    default: {
      add({ name: "default", kind: "default", signature: "default", visibility: "public" });
      break;
    }
  }
}

function extractClassMembers(
  body: Node,
  className: string,
  add: (sym: Symbol) => void
): void {
  for (const member of body.namedChildren) {
    if (member.type === "method_definition") {
      const name = member.childForFieldName("name");
      if (!name) continue;

      const visibility = getVisibility(member);
      const sig = extractSignature(member, "statement_block");

      add({
        name: name.text,
        kind: "method",
        signature: sig,
        visibility,
        parent: className,
      });
    } else if (
      member.type === "public_field_definition" ||
      member.type === "property_definition"
    ) {
      const name = member.childForFieldName("name");
      if (!name) continue;

      const visibility = getVisibility(member);
      add({
        name: name.text,
        kind: "variable",
        signature: member.text.replace(/;$/, "").trim(),
        visibility,
        parent: className,
      });
    }
  }
}

function getVisibility(node: Node): Symbol["visibility"] {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "accessibility_modifier") {
      const text = child.text;
      if (text === "private") return "private";
      if (text === "protected") return "protected";
    }
  }
  return "public";
}
