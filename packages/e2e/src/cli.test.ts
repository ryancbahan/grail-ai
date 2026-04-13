import path from "path";
import { grail, json, jsonError } from "./util/cli";

const TS_APP = path.resolve(__dirname, "../test-examples/ts/sample-app");
const JS_APP = path.resolve(__dirname, "../test-examples/js/sample-app");

// ── Basic Commands ──────────────────────────────────────────────

describe("e2e: tree", () => {
  it("outputs correct file structure with connectors", () => {
    const output = grail(`${TS_APP} tree`);
    expect(output).toContain("sample-app/");
    expect(output).toContain("├──");
    expect(output).toContain("└──");
    expect(output).toContain("src/");
    expect(output).toContain("index.ts");
    expect(output).toContain("utils.ts");
    expect(output).toContain("types.ts");
    expect(output).toContain("service.ts");
    expect(output).toContain("package.json");
  });

  it("does not include node_modules or .git", () => {
    const output = grail(`${TS_APP} tree`);
    expect(output).not.toContain("node_modules");
    expect(output).not.toContain(".git");
  });
});

describe("e2e: summary", () => {
  it("lists all files with correct structure per entry", () => {
    const result = json(`${TS_APP} summary`);
    expect(Array.isArray(result)).toBe(true);

    for (const entry of result) {
      expect(typeof entry.file).toBe("string");
      expect(Array.isArray(entry.symbols)).toBe(true);
      expect(typeof entry.dependencies).toBe("number");
      expect(Array.isArray(entry.externals)).toBe(true);
    }
  });

  it("contains exactly the expected files", () => {
    const result = json(`${TS_APP} summary`);
    const files = result.map((f: any) => f.file).sort();
    expect(files).toEqual([
      "package.json",
      "src/index.ts",
      "src/service.ts",
      "src/types.ts",
      "src/utils.ts",
    ]);
  });

  it("symbols have unified SymbolRef shape with file, name, kind, signature, visibility", () => {
    const result = json(`${TS_APP} summary`);
    const utils = result.find((f: any) => f.file === "src/utils.ts");
    expect(utils.symbols.length).toBe(3); // createUser, formatUser, validateEmail

    for (const sym of utils.symbols) {
      expect(typeof sym.file).toBe("string");
      expect(typeof sym.name).toBe("string");
      expect(typeof sym.kind).toBe("string");
      expect(typeof sym.signature).toBe("string");
      expect(typeof sym.visibility).toBe("string");
    }
  });

  it("single file summary includes symbols and imports", () => {
    const result = json(`${TS_APP} summary src/utils.ts`);
    expect(result.file).toBe("src/utils.ts");

    const names = result.symbols.map((s: any) => s.name);
    expect(names).toContain("createUser");
    expect(names).toContain("formatUser");
    expect(names).toContain("validateEmail");

    expect(result.imports.length).toBe(1);
    expect(result.imports[0].specifier).toBe("./types");
    expect(result.imports[0].resolvedPath).toBe("src/types.ts");
    expect(result.imports[0].isExternal).toBe(false);
  });

  it("types-only file has correct symbol kinds", () => {
    const result = json(`${TS_APP} summary src/types.ts`);
    const kinds = result.symbols.map((s: any) => s.kind);
    expect(kinds).toContain("interface");
    expect(kinds).toContain("type");
    expect(kinds).not.toContain("function");
  });
});

describe("e2e: files", () => {
  it("returns exact file list", () => {
    const result = json(`${TS_APP} files`);
    expect(result.files.sort()).toEqual([
      "package.json",
      "src/index.ts",
      "src/service.ts",
      "src/types.ts",
      "src/utils.ts",
    ]);
  });
});

describe("e2e: json", () => {
  it("returns valid root node", () => {
    const result = json(`${TS_APP} json`);
    expect(result.type).toBe("root");
    expect(result.absolutePath).toBe(TS_APP);
    expect(result.tree.type).toBe("directory");
    expect(result.tree.name).toBe("sample-app");
    expect(Array.isArray(result.externals)).toBe(true);
  });
});

// ── File-Level Analysis ─────────────────────────────────────────

describe("e2e: dependencies", () => {
  it("shows exact imports for index.ts", () => {
    const result = json(`${TS_APP} dependencies src/index.ts`);
    expect(result.file).toBe("src/index.ts");
    expect(result.dependencies.length).toBe(2); // ./utils and ./types

    const utilsDep = result.dependencies.find((d: any) => d.specifier === "./utils");
    expect(utilsDep).toBeDefined();
    expect(utilsDep.resolvedPath).toBe("src/utils.ts");
    expect(utilsDep.isExternal).toBe(false);
    expect(utilsDep.symbols.length).toBe(2); // createUser, formatUser

    const createUserSym = utilsDep.symbols.find((s: any) => s.name === "createUser");
    expect(createUserSym.file).toBe("src/utils.ts");
    expect(createUserSym.kind).toBe("function");
    expect(createUserSym.signature).toContain("name: string");
    expect(createUserSym.signature).toContain("email: string");
    expect(createUserSym.signature).toContain("User");
  });

  it("marks type-only imports correctly", () => {
    const result = json(`${TS_APP} dependencies src/index.ts`);
    const typesDep = result.dependencies.find((d: any) => d.specifier === "./types");
    expect(typesDep).toBeDefined();
    expect(typesDep.resolvedPath).toBe("src/types.ts");
  });

  it("file with no imports returns empty dependencies", () => {
    const result = json(`${TS_APP} dependencies src/types.ts`);
    expect(result.dependencies).toEqual([]);
  });
});

describe("e2e: dependents", () => {
  it("shows exact consumers of utils.ts", () => {
    const result = json(`${TS_APP} dependents src/utils.ts`);
    expect(result.file).toBe("src/utils.ts");
    expect(result.dependents.length).toBe(1);

    const dep = result.dependents[0];
    expect(dep.file).toBe("src/index.ts");
    expect(dep.symbols.length).toBe(2);

    const symNames = dep.symbols.map((s: any) => s.name).sort();
    expect(symNames).toEqual(["createUser", "formatUser"]);
    // Each consumed symbol has proper SymbolRef shape
    for (const sym of dep.symbols) {
      expect(sym.file).toBe("src/utils.ts");
      expect(sym.kind).toBe("function");
      expect(typeof sym.signature).toBe("string");
    }
  });

  it("file with no dependents returns empty array", () => {
    const result = json(`${TS_APP} dependents src/index.ts`);
    expect(result.dependents).toEqual([]);
  });

  it("types.ts is depended on by multiple files", () => {
    const result = json(`${TS_APP} dependents src/types.ts`);
    const depFiles = result.dependents.map((d: any) => d.file).sort();
    expect(depFiles).toContain("src/utils.ts");
    expect(depFiles).toContain("src/service.ts");
  });
});

describe("e2e: externals", () => {
  it("returns empty for project with no npm imports", () => {
    const result = json(`${TS_APP} externals`);
    expect(result.externals).toEqual([]);
  });
});

describe("e2e: entry-points", () => {
  it("index.ts is an entry point (nothing imports it)", () => {
    const result = json(`${TS_APP} entry-points`);
    expect(result.entryPoints).toContain("src/index.ts");
  });

  it("utils.ts is NOT an entry point (index.ts imports it)", () => {
    const result = json(`${TS_APP} entry-points`);
    expect(result.entryPoints).not.toContain("src/utils.ts");
  });
});

describe("e2e: cycles", () => {
  it("returns empty for acyclic project", () => {
    const result = json(`${TS_APP} cycles`);
    expect(result.cycles).toEqual([]);
  });
});

// ── Symbol-Level Analysis ───────────────────────────────────────

describe("e2e: calls", () => {
  it("main() calls createUser and formatUser with full SymbolRef", () => {
    const result = json(`${TS_APP} calls src/index.ts main`);
    expect(result.file).toBe("src/index.ts");
    expect(result.name).toBe("main");

    const createUserCall = result.calls.find((c: any) => c.name === "createUser");
    expect(createUserCall).toBeDefined();
    expect(createUserCall.file).toBe("src/utils.ts");
    expect(createUserCall.kind).toBe("function");
    expect(createUserCall.signature).toContain("createUser");
    expect(typeof createUserCall.line).toBe("number");
    expect(createUserCall.line).toBeGreaterThan(0);
    expect(typeof createUserCall.context).toBe("string");
    expect(createUserCall.context).toContain("createUser");

    const formatUserCall = result.calls.find((c: any) => c.name === "formatUser");
    expect(formatUserCall).toBeDefined();
    expect(formatUserCall.file).toBe("src/utils.ts");
  });

  it("createUser() calls internal validateEmail", () => {
    const result = json(`${TS_APP} calls src/utils.ts createUser`);
    const validateCall = result.calls.find((c: any) => c.name === "validateEmail");
    expect(validateCall).toBeDefined();
    expect(validateCall.file).toBe("src/utils.ts");
    expect(validateCall.signature).toContain("validateEmail");
    expect(validateCall.signature).toContain("boolean");
  });

  it("function with no project calls returns empty array", () => {
    const result = json(`${TS_APP} calls src/utils.ts formatUser`);
    // formatUser only calls template literal methods — no project calls
    expect(result.calls).toEqual([]);
  });

  it("does not include external stdlib calls", () => {
    const result = json(`${TS_APP} calls src/index.ts main`);
    const callNames = result.calls.map((c: any) => c.name);
    expect(callNames).not.toContain("log"); // console.log is external
    expect(callNames).not.toContain("console");
  });
});

describe("e2e: callers", () => {
  it("createUser is called by main and App.addUser with full SymbolRef", () => {
    const result = json(`${TS_APP} callers src/utils.ts createUser`);
    expect(result.file).toBe("src/utils.ts");
    expect(result.name).toBe("createUser");
    expect(result.callers.length).toBeGreaterThanOrEqual(1);

    const mainCaller = result.callers.find((c: any) => c.name === "main");
    expect(mainCaller).toBeDefined();
    expect(mainCaller.file).toBe("src/index.ts");
    expect(mainCaller.kind).toBe("function");
    expect(typeof mainCaller.signature).toBe("string");
    expect(mainCaller.signature).toContain("main");
    expect(typeof mainCaller.line).toBe("number");
    expect(typeof mainCaller.context).toBe("string");
  });

  it("function with no callers returns empty array", () => {
    const result = json(`${TS_APP} callers src/index.ts main`);
    expect(result.callers).toEqual([]);
  });
});

describe("e2e: read", () => {
  it("reads function with complete unified shape", () => {
    const result = json(`${TS_APP} read src/utils.ts createUser`);
    expect(result.file).toBe("src/utils.ts");
    expect(result.name).toBe("createUser");
    expect(result.kind).toBe("function");
    expect(result.signature).toContain("createUser");
    expect(result.signature).toContain("name: string");
    expect(result.visibility).toBe("public");
    expect(result.line).toBe(7);
    expect(result.endLine).toBe(12);
    expect(result.source).toContain("export function createUser");
    expect(result.source).toContain("validateEmail");
    expect(result.source).toContain("return {");
  });

  it("reads internal function", () => {
    const result = json(`${TS_APP} read src/utils.ts validateEmail`);
    expect(result.name).toBe("validateEmail");
    expect(result.kind).toBe("function");
    expect(result.line).toBe(3);
    expect(result.endLine).toBe(5);
    expect(result.source).toContain("includes");
  });

  it("reads interface", () => {
    const result = json(`${TS_APP} read src/types.ts User`);
    expect(result.name).toBe("User");
    expect(result.kind).toBe("interface");
    expect(result.source).toContain("id: number");
    expect(result.source).toContain("email: string");
  });

  it("reads class method with parent", () => {
    const result = json(`${TS_APP} read src/service.ts findByEmail UserService`);
    expect(result.name).toBe("findByEmail");
    expect(result.kind).toBe("method");
    expect(result.source).toContain("email");
    expect(result.source).not.toContain("class UserService");
  });

  it("reads type alias", () => {
    const result = json(`${TS_APP} read src/types.ts UserRole`);
    expect(result.name).toBe("UserRole");
    expect(result.kind).toBe("type");
    expect(result.source).toContain("admin");
    expect(result.source).toContain("guest");
  });
});

// ── Internal Symbols ────────────────────────────────────────────

describe("e2e: internal symbols", () => {
  it("validateEmail appears as internal in summary", () => {
    const result = json(`${TS_APP} summary src/utils.ts`);
    const validateEmail = result.symbols.find((s: any) => s.name === "validateEmail");
    expect(validateEmail.visibility).toBe("internal");
    expect(validateEmail.kind).toBe("function");
    expect(validateEmail.signature).toContain("email: string");
  });

  it("exported symbols appear as public", () => {
    const result = json(`${TS_APP} summary src/utils.ts`);
    const createUser = result.symbols.find((s: any) => s.name === "createUser");
    expect(createUser.visibility).toBe("public");
  });
});

// ── Depth Flag ──────────────────────────────────────────────────

describe("e2e: depth", () => {
  it("--depth 1 shows only top-level entries", () => {
    const result = json(`${TS_APP} summary --depth 1`);
    const files = result.map((f: any) => f.file);
    expect(files).toContain("package.json");
    expect(files.every((f: string) => !f.includes("/"))).toBe(true);
    expect(files).not.toContain("src/index.ts");
  });

  it("tree --depth 1 shows directories without contents", () => {
    const output = grail(`${TS_APP} tree --depth 1`);
    expect(output).toContain("src/");
    expect(output).not.toContain("index.ts");
    expect(output).not.toContain("utils.ts");
  });

  it("no depth flag shows full depth", () => {
    const result = json(`${TS_APP} files`);
    expect(result.files.some((f: string) => f.includes("/"))).toBe(true);
  });
});

// ── File Path as Input ──────────────────────────────────────────

describe("e2e: file path as input", () => {
  it("finds project root from a file path", () => {
    const result = json(`${TS_APP}/src/index.ts summary`);
    expect(Array.isArray(result)).toBe(true);
    const files = result.map((f: any) => f.file);
    expect(files).toContain("src/index.ts");
    expect(files).toContain("src/utils.ts");
    expect(files).toContain("src/types.ts");
  });
});

// ── Error Handling ──────────────────────────────────────────────

describe("e2e: errors", () => {
  it("nonexistent path returns JSON with error and suggestion", () => {
    const result = jsonError("/nonexistent/path summary");
    expect(typeof result.error).toBe("string");
    expect(typeof result.suggestion).toBe("string");
    expect(result.error.toLowerCase()).toContain("not found");
  });

  it("nonexistent file returns JSON error", () => {
    const result = jsonError(`${TS_APP} dependencies nonexistent.ts`);
    expect(result.error).toContain("not found");
    expect(result.suggestion).toBeDefined();
  });

  it("nonexistent symbol returns JSON error", () => {
    const result = jsonError(`${TS_APP} read src/utils.ts nonexistent_fn`);
    expect(result.error).toContain("not found");
    expect(result.error).toContain("nonexistent_fn");
  });

  it("unknown command returns JSON error with help suggestion", () => {
    const result = jsonError(`${TS_APP} foobar`);
    expect(result.error).toContain("Unknown command");
    expect(result.error).toContain("foobar");
    expect(result.suggestion).toContain("--help");
  });

  it("missing file argument returns JSON error with usage", () => {
    const result = jsonError(`${TS_APP} dependencies`);
    expect(result.error).toContain("Missing");
    expect(result.suggestion).toContain("Usage");
  });

  it("missing symbol argument returns JSON error with usage", () => {
    const result = jsonError(`${TS_APP} read src/utils.ts`);
    expect(result.error).toContain("Missing");
    expect(result.suggestion).toContain("Usage");
  });

  it("missing both file and symbol for calls returns JSON error", () => {
    const result = jsonError(`${TS_APP} calls`);
    expect(result.error).toContain("Missing");
  });

  it("error output never contains stack traces", () => {
    const result = jsonError("/nonexistent/path summary");
    expect(JSON.stringify(result)).not.toContain("at Object");
    expect(JSON.stringify(result)).not.toContain("at Module");
    expect(JSON.stringify(result)).not.toContain(".js:");
  });
});

// ── JS File Support ─────────────────────────────────────────────

describe("e2e: JS files", () => {
  it("detects language from package.json", () => {
    const output = grail(`${JS_APP} tree`);
    expect(output).toContain("Detected language: javascript");
  });

  it("summary shows JS symbols", () => {
    const result = json(`${JS_APP} summary helper.js`);
    expect(result.file).toBe("helper.js");
    const names = result.symbols.map((s: any) => s.name);
    expect(names).toContain("greet");
    expect(names).toContain("farewell");
  });

  it("reads JS function source", () => {
    const result = json(`${JS_APP} read helper.js greet`);
    expect(result.name).toBe("greet");
    expect(result.kind).toBe("function");
    expect(result.source).toContain("Hello");
    expect(result.source).toContain("return");
  });
});

// ── TS Class Support ────────────────────────────────────────────

describe("e2e: TS classes", () => {
  it("class and methods appear in summary", () => {
    const result = json(`${TS_APP} summary src/service.ts`);
    const names = result.symbols.map((s: any) => s.name);
    expect(names).toContain("UserService");
    expect(names).toContain("add");
    expect(names).toContain("findByEmail");
    expect(names).toContain("count");
  });

  it("methods have correct parent", () => {
    const result = json(`${TS_APP} summary src/service.ts`);
    const findByEmail = result.symbols.find((s: any) => s.name === "findByEmail");
    expect(findByEmail.parent).toBe("UserService");
    expect(findByEmail.kind).toBe("method");
  });

  it("cross-file import resolves with signature", () => {
    const result = json(`${TS_APP} dependencies src/service.ts`);
    const typesImport = result.dependencies.find((d: any) => d.specifier === "./types");
    expect(typesImport.resolvedPath).toBe("src/types.ts");
    expect(typesImport.symbols.length).toBe(1);
    expect(typesImport.symbols[0].name).toBe("User");
    expect(typesImport.symbols[0].kind).toBe("interface");
    expect(typesImport.symbols[0].signature).toContain("id: number");
  });
});
