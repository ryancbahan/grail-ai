import { formatTree, formatDependencyGraph } from "./formatter";
import type { ASTNode, DirectoryNode, FileNode, RootNode, Import } from "../core/ast/types";

function file(name: string, extension: string | null = null, imports: Import[] = []): FileNode {
  return { type: "file", name, extension, imports, symbols: [] };
}

function dir(name: string, children: ASTNode[] = []): DirectoryNode {
  return { type: "directory", name, children };
}

function imp(specifier: string, resolvedPath: string | null, isExternal = false): Import {
  return { specifier, kind: "static", resolvedPath, isExternal, symbols: [] };
}

function makeRoot(tree: DirectoryNode, externals: string[] = []): RootNode {
  return { type: "root", absolutePath: "/project", tree, externals };
}

describe("formatTree", () => {
  it("formats a single directory with no children", () => {
    const result = formatTree(dir("project"));
    expect(result).toBe("project/");
  });

  it("formats a flat list of files", () => {
    const tree = dir("src", [
      file("a.ts", ".ts"),
      file("b.ts", ".ts"),
      file("c.ts", ".ts"),
    ]);

    const result = formatTree(tree);
    expect(result).toBe(
      "src/\n├── a.ts\n├── b.ts\n└── c.ts"
    );
  });

  it("formats nested directories with correct indentation", () => {
    const tree = dir("root", [
      dir("src", [file("index.ts", ".ts")]),
      file("readme.md", ".md"),
    ]);

    const result = formatTree(tree);
    expect(result).toBe(
      "root/\n├── src/\n│   └── index.ts\n└── readme.md"
    );
  });

  it("formats deeply nested structures with all lines correct", () => {
    const tree = dir("a", [
      dir("b", [
        dir("c", [file("deep.txt", ".txt")]),
      ]),
    ]);

    const result = formatTree(tree);
    expect(result).toBe(
      "a/\n└── b/\n    └── c/\n        └── deep.txt"
    );
  });

  it("uses correct connectors: last child gets └──, others get ├──", () => {
    const tree = dir("project", [
      dir("src", [
        file("app.ts", ".ts"),
        file("util.ts", ".ts"),
      ]),
      dir("test", [file("app.test.ts", ".ts")]),
      file("package.json", ".json"),
    ]);

    const lines = formatTree(tree).split("\n");
    expect(lines[1]).toBe("├── src/");
    expect(lines[4]).toBe("├── test/");
    expect(lines[6]).toBe("└── package.json");
  });

  it("handles a single file", () => {
    expect(formatTree(file("lonely.ts", ".ts"))).toBe("lonely.ts");
  });

  it("handles empty directories", () => {
    const tree = dir("project", [dir("empty"), file("readme.md", ".md")]);
    expect(formatTree(tree)).toBe(
      "project/\n├── empty/\n└── readme.md"
    );
  });
});

describe("formatDependencyGraph", () => {
  it("formats files with local dependencies", () => {
    const root = makeRoot(
      dir("project", [
        file("index.ts", ".ts", [imp("./utils", "/project/utils.ts")]),
        file("utils.ts", ".ts"),
      ])
    );

    const output = formatDependencyGraph(root);
    expect(output).toContain("index.ts");
    expect(output).toContain("./utils → utils.ts");
  });

  it("formats external imports with marker", () => {
    const root = makeRoot(
      dir("project", [
        file("index.ts", ".ts", [imp("lodash", null, true)]),
      ]),
      ["lodash"]
    );

    const output = formatDependencyGraph(root);
    expect(output).toContain("lodash (external)");
  });

  it("formats unresolved imports with marker", () => {
    const root = makeRoot(
      dir("project", [
        file("index.ts", ".ts", [imp("./missing", null, false)]),
      ])
    );

    const output = formatDependencyGraph(root);
    expect(output).toContain("./missing (unresolved)");
  });

  it("shows (no imports) for files with empty imports", () => {
    const root = makeRoot(
      dir("project", [file("standalone.ts", ".ts")])
    );

    const output = formatDependencyGraph(root);
    expect(output).toContain("(no imports)");
  });

  it("lists all externals at the bottom", () => {
    const root = makeRoot(
      dir("project", [
        file("index.ts", ".ts", [
          imp("fs", null, true),
          imp("lodash", null, true),
        ]),
      ]),
      ["fs", "lodash"]
    );

    const output = formatDependencyGraph(root);
    expect(output).toContain("Externals: fs, lodash");
  });

  it("uses correct connectors for import lists", () => {
    const root = makeRoot(
      dir("project", [
        file("index.ts", ".ts", [
          imp("./a", "/project/a.ts"),
          imp("./b", "/project/b.ts"),
        ]),
        file("a.ts", ".ts"),
        file("b.ts", ".ts"),
      ])
    );

    const output = formatDependencyGraph(root);
    const lines = output.split("\n");
    const indexImports = lines.filter((l) => l.includes("./a") || l.includes("./b"));
    expect(indexImports[0]).toContain("├──");
    expect(indexImports[1]).toContain("└──");
  });

  it("reports circular dependencies", () => {
    const root = makeRoot(
      dir("project", [
        file("a.ts", ".ts", [imp("./b", "/project/b.ts")]),
        file("b.ts", ".ts", [imp("./a", "/project/a.ts")]),
      ])
    );

    const output = formatDependencyGraph(root);
    expect(output).toContain("Circular dependencies:");
    expect(output).toContain("a.ts");
    expect(output).toContain("b.ts");
  });

  it("omits circular section when no cycles", () => {
    const root = makeRoot(
      dir("project", [
        file("a.ts", ".ts", [imp("./b", "/project/b.ts")]),
        file("b.ts", ".ts"),
      ])
    );

    const output = formatDependencyGraph(root);
    expect(output).not.toContain("Circular");
  });

  it("omits externals section when none exist", () => {
    const root = makeRoot(
      dir("project", [file("a.ts", ".ts")])
    );

    const output = formatDependencyGraph(root);
    expect(output).not.toContain("Externals:");
  });
});
