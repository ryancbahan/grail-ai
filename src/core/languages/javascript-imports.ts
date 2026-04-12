import { ParsedImport } from "./types";

function stripComments(source: string): string {
  // Remove single-line comments
  // Remove multi-line comments
  return source
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

export function parseJavaScriptImports(
  _filePath: string,
  content: string
): ParsedImport[] {
  const stripped = stripComments(content);
  const imports: ParsedImport[] = [];
  const seen = new Set<string>();

  const patterns: { regex: RegExp; kind: ParsedImport["kind"] }[] = [
    // import ... from "specifier"  /  import "specifier"
    { regex: /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g, kind: "static" },
    // export ... from "specifier"
    { regex: /export\s+(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g, kind: "static" },
    // require("specifier")
    { regex: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, kind: "require" },
    // import("specifier")
    { regex: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, kind: "dynamic" },
  ];

  for (const { regex, kind } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(stripped)) !== null) {
      const specifier = match[1];
      const key = `${kind}:${specifier}`;
      if (!seen.has(key)) {
        seen.add(key);
        imports.push({ specifier, kind });
      }
    }
  }

  return imports;
}
