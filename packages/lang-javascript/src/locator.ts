import type { Node, Tree } from "web-tree-sitter";
import type { SymbolLocation } from "@grail-ai/core";

export function locateJavaScriptSymbol(
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
  // If parentName is provided, find the class first, then the method
  if (parentName) {
    const classNode = findDeclaration(root, parentName);
    if (!classNode) return null;
    const body = classNode.childForFieldName("body");
    if (!body) return null;
    return findMemberByName(body, symbolName);
  }

  // Top-level: look for exported declarations
  return findExportedDeclaration(root, symbolName) ?? findDeclaration(root, symbolName);
}

function findExportedDeclaration(node: Node, name: string): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (child.type === "export_statement") {
      const declaration = child.childForFieldName("declaration");
      if (declaration) {
        const declName = getDeclarationName(declaration);
        if (declName === name) return declaration;

        // lexical_declaration can have multiple declarators
        if (declaration.type === "lexical_declaration") {
          for (const sub of declaration.namedChildren) {
            if (sub.type === "variable_declarator") {
              const n = sub.childForFieldName("name");
              if (n?.text === name) return declaration;
            }
          }
        }
      }
    }
  }
  return null;
}

function findDeclaration(node: Node, name: string): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    const declName = getDeclarationName(child);
    if (declName === name) return child;

    if (child.type === "lexical_declaration" || child.type === "variable_declaration") {
      for (const sub of child.namedChildren) {
        if (sub.type === "variable_declarator") {
          const n = sub.childForFieldName("name");
          if (n?.text === name) return child;
        }
      }
    }

    // Check inside export_statement
    if (child.type === "export_statement") {
      const declaration = child.childForFieldName("declaration");
      if (declaration) {
        const dName = getDeclarationName(declaration);
        if (dName === name) return declaration;

        if (declaration.type === "lexical_declaration") {
          for (const sub of declaration.namedChildren) {
            if (sub.type === "variable_declarator") {
              const n = sub.childForFieldName("name");
              if (n?.text === name) return declaration;
            }
          }
        }
      }
    }
  }
  return null;
}

function findMemberByName(classBody: Node, name: string): Node | null {
  for (const member of classBody.namedChildren) {
    const memberName = member.childForFieldName("name");
    if (memberName?.text === name) return member;
  }
  return null;
}

function getDeclarationName(node: Node): string | null {
  const name = node.childForFieldName("name");
  return name?.text ?? null;
}

function inferKind(node: Node): SymbolLocation["kind"] {
  switch (node.type) {
    case "function_declaration":
    case "generator_function_declaration":
      return "function";
    case "class_declaration":
      return "class";
    case "method_definition":
      return "method";
    case "lexical_declaration":
    case "variable_declaration":
      return "variable";
    case "type_alias_declaration":
      return "type";
    case "interface_declaration":
      return "interface";
    case "enum_declaration":
      return "enum";
    default:
      return "unknown";
  }
}
