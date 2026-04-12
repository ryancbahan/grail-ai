import { RootNode, Import } from "./types";
import {
  dependenciesOf,
  dependentsOf,
  allExternals,
  externalsOf,
  findEntryPoints,
  findCircularDependencies,
} from "./queries";

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
  it("returns only resolved local paths, excludes externals", () => {
    const root = makeRoot([
      {
        name: "a.ts",
        imports: [
          imp("./b", "/project/b.ts"),
          imp("lodash", null, true),
          imp("./c", "/project/c.ts"),
        ],
      },
      { name: "b.ts", imports: [] },
      { name: "c.ts", imports: [] },
    ]);
    expect(dependenciesOf(root, "/project/a.ts")).toEqual([
      "/project/b.ts",
      "/project/c.ts",
    ]);
  });

  it("returns empty array for leaf files", () => {
    const root = makeRoot([{ name: "a.ts", imports: [] }]);
    expect(dependenciesOf(root, "/project/a.ts")).toEqual([]);
  });

  it("returns empty array for unknown files", () => {
    const root = makeRoot([{ name: "a.ts", imports: [] }]);
    expect(dependenciesOf(root, "/project/unknown.ts")).toEqual([]);
  });

  it("excludes unresolved relative imports", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./missing", null)] },
    ]);
    expect(dependenciesOf(root, "/project/a.ts")).toEqual([]);
  });
});

describe("dependentsOf", () => {
  it("returns exactly the files that import the given file", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [] },
      { name: "c.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "d.ts", imports: [imp("./a", "/project/a.ts")] },
    ]);
    const deps = dependentsOf(root, "/project/b.ts").sort();
    expect(deps).toEqual(["/project/a.ts", "/project/c.ts"]);
  });

  it("returns empty array for files nothing imports", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [] },
    ]);
    expect(dependentsOf(root, "/project/a.ts")).toEqual([]);
  });

  it("does not include the file itself", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./a", "/project/a.ts")] },
    ]);
    // a imports itself — dependentsOf should still return a as a dependent
    expect(dependentsOf(root, "/project/a.ts")).toEqual(["/project/a.ts"]);
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
  it("returns only external specifiers, excludes local", () => {
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

  it("returns empty for file with no external imports", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
    ]);
    expect(externalsOf(root, "/project/a.ts")).toEqual([]);
  });

  it("returns empty for unknown file", () => {
    const root = makeRoot([]);
    expect(externalsOf(root, "/project/nope.ts")).toEqual([]);
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
    const entries = findEntryPoints(root).sort();
    expect(entries).toEqual(["/project/a.ts", "/project/b.ts"]);
  });

  it("returns empty when every file is imported", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [imp("./a", "/project/a.ts")] },
    ]);
    expect(findEntryPoints(root)).toEqual([]);
  });
});

describe("findCircularDependencies", () => {
  it("finds simple A -> B -> A cycle with correct members", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [imp("./a", "/project/a.ts")] },
    ]);
    const cycles = findCircularDependencies(root);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].sort()).toEqual(["/project/a.ts", "/project/b.ts"]);
  });

  it("finds longer cycle with all members", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [imp("./c", "/project/c.ts")] },
      { name: "c.ts", imports: [imp("./a", "/project/a.ts")] },
    ]);
    const cycles = findCircularDependencies(root);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].sort()).toEqual([
      "/project/a.ts",
      "/project/b.ts",
      "/project/c.ts",
    ]);
  });

  it("finds multiple independent cycles", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [imp("./a", "/project/a.ts")] },
      { name: "x.ts", imports: [imp("./y", "/project/y.ts")] },
      { name: "y.ts", imports: [imp("./x", "/project/x.ts")] },
      { name: "standalone.ts", imports: [] },
    ]);
    const cycles = findCircularDependencies(root);
    expect(cycles).toHaveLength(2);
    const allMembers = cycles.flat().sort();
    expect(allMembers).toEqual([
      "/project/a.ts",
      "/project/b.ts",
      "/project/x.ts",
      "/project/y.ts",
    ]);
  });

  it("returns empty array when no cycles", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [imp("./c", "/project/c.ts")] },
      { name: "c.ts", imports: [] },
    ]);
    expect(findCircularDependencies(root)).toEqual([]);
  });

  it("ignores external imports", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("lodash", null, true)] },
    ]);
    expect(findCircularDependencies(root)).toEqual([]);
  });

  it("does not report single-node non-cycles", () => {
    const root = makeRoot([
      { name: "a.ts", imports: [imp("./b", "/project/b.ts")] },
      { name: "b.ts", imports: [] },
    ]);
    expect(findCircularDependencies(root)).toEqual([]);
  });
});
