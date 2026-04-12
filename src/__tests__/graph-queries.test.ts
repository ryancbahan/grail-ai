import { RootNode, Import } from "../core/ast/types";
import {
  dependenciesOf,
  dependentsOf,
  allExternals,
  externalsOf,
  findEntryPoints,
  findCircularDependencies,
} from "../core/ast/queries";

function imp(
  specifier: string,
  resolvedPath: string | null,
  isExternal = false
): Import {
  return { specifier, kind: "static", resolvedPath, isExternal };
}

function makeRoot(
  files: { name: string; imports: Import[] }[],
  externals: string[] = []
): RootNode {
  return {
    type: "root",
    absolutePath: "/project",
    externals,
    tree: {
      type: "directory",
      name: "project",
      children: files.map((f) => ({
        type: "file" as const,
        name: f.name,
        extension: ".ts",
        imports: f.imports,
      })),
    },
  };
}

describe("dependenciesOf", () => {
  it("returns resolved paths of imports", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts"), imp("lodash", null, true)] },
      { name: "b.ts", imports: [] },
    ]);
    expect(dependenciesOf(root, "/project/a.ts")).toEqual(["/project/b.ts"]);
  });

  it("returns empty array for leaf files", () => {
    const root = makeRoot([{ name: "a.ts", imports: [] }]);
    expect(dependenciesOf(root, "/project/a.ts")).toEqual([]);
  });

  it("returns empty array for unknown files", () => {
    const root = makeRoot([{ name: "a.ts", imports: [] }]);
    expect(dependenciesOf(root, "/project/unknown.ts")).toEqual([]);
  });
});

describe("dependentsOf", () => {
  it("returns files that import the given file", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [] },
      { name: "c.ts", imports: [imp("./b", "/project/b.ts")] },
    ]);
    const deps = dependentsOf(root, "/project/b.ts");
    expect(deps).toContain("/project/a.ts");
    expect(deps).toContain("/project/c.ts");
    expect(deps).toHaveLength(2);
  });

  it("returns empty array for entry-point files", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [] },
    ]);
    expect(dependentsOf(root, "/project/a.ts")).toEqual([]);
  });
});

describe("allExternals", () => {
  it("returns externals from root", () => {
    const root = makeRoot([], ["d3", "lodash", "preact"]);
    expect(allExternals(root)).toEqual(["d3", "lodash", "preact"]);
  });

  it("returns empty array when no externals", () => {
    const root = makeRoot([]);
    expect(allExternals(root)).toEqual([]);
  });
});

describe("externalsOf", () => {
  it("returns external specifiers for a file", () => {
    const root = makeRoot([
      {
        name: "a.ts",
        imports: [
          imp("./b", "/project/b.ts"),
          imp("lodash", null, true),
          imp("fs", null, true),
        ],
      },
    ]);
    expect(externalsOf(root, "/project/a.ts")).toEqual(["lodash", "fs"]);
  });
});

describe("findEntryPoints", () => {
  it("returns files that nothing imports", () => {
    const root = makeRoot([
      { name: "entry.ts", imports: [imp("./lib", "/project/lib.ts")] },
      { name: "lib.ts", imports: [] },
    ]);
    expect(findEntryPoints(root)).toEqual(["/project/entry.ts"]);
  });

  it("returns all files when nothing imports anything", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [] },
      { name: "b.ts", imports: [] },
    ]);
    expect(findEntryPoints(root)).toHaveLength(2);
  });
});

describe("findCircularDependencies", () => {
  it("finds simple A -> B -> A cycle", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [imp("./a", "/project/a.ts")] },
    ]);
    const cycles = findCircularDependencies(root);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toContain("/project/a.ts");
    expect(cycles[0]).toContain("/project/b.ts");
  });

  it("finds longer A -> B -> C -> A cycle", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [imp("./c", "/project/c.ts")] },
      { name: "c.ts", imports: [imp("./a", "/project/a.ts")] },
    ]);
    const cycles = findCircularDependencies(root);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toHaveLength(3);
  });

  it("returns empty array when no cycles", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [imp("./c", "/project/c.ts")] },
      { name: "c.ts", imports: [] },
    ]);
    expect(findCircularDependencies(root)).toEqual([]);
  });

  it("ignores external imports when finding cycles", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("lodash", null, true)] },
    ]);
    expect(findCircularDependencies(root)).toEqual([]);
  });
});
