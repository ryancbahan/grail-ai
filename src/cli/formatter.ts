import { ASTNode } from "../tree";

export function formatTree(tree: ASTNode): string {
  const lines: string[] = [];
  walk(tree, "", true, lines);
  return lines.join("\n");
}

function walk(
  entry: ASTNode,
  prefix: string,
  isLast: boolean,
  lines: string[]
): void {
  const connector = lines.length === 0 ? "" : isLast ? "└── " : "├── ";
  const display = entry.type === "directory" ? `${entry.name}/` : entry.name;
  lines.push(`${prefix}${connector}${display}`);

  if (!entry.children) return;

  const childPrefix =
    lines.length === 1 ? "" : prefix + (isLast ? "    " : "│   ");

  entry.children.forEach((child, i) => {
    const last = i === entry.children!.length - 1;
    walk(child, childPrefix, last, lines);
  });
}
