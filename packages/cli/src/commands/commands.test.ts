import fs from "fs";
import path from "path";
import os from "os";

// Capture output and errors from commands
let captured: unknown[] = [];
let exitCode: number | undefined;

const originalLog = console.log;
const originalExit = process.exit;

beforeEach(() => {
  captured = [];
  exitCode = undefined;
  console.log = (...args: unknown[]) => { captured.push(...args); };
  process.exit = ((code?: number) => { exitCode = code ?? 0; throw new Error(`EXIT_${code}`); }) as never;
});

afterEach(() => {
  console.log = originalLog;
  process.exit = originalExit;
});

function getOutput(): any {
  const last = captured[captured.length - 1];
  return typeof last === "string" ? JSON.parse(last) : last;
}

// Build a temp fixture that mirrors the e2e sample-app
let tmpDir: string;

function writeFixture(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-cmd-test-"));

  writeFixture("package.json", "{}");

  writeFixture("src/types.ts", `
export interface User {
  id: number;
  name: string;
  email: string;
}

export type UserRole = "admin" | "member" | "guest";
`.trimStart());

  writeFixture("src/utils.ts", `
import { User } from "./types";

function validateEmail(email: string): boolean {
  return email.includes("@");
}

export function createUser(name: string, email: string): User {
  if (!validateEmail(email)) {
    throw new Error("Invalid email");
  }
  return { id: Date.now(), name, email };
}

export function formatUser(user: User): string {
  return \`\${user.name} <\${user.email}>\`;
}
`.trimStart());

  writeFixture("src/index.ts", `
import { createUser, formatUser } from "./utils";
import type { User } from "./types";

export function main(): void {
  const user = createUser("Alice", "alice@example.com");
  console.log(formatUser(user));
}
`.trimStart());
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── tree ────────────────────────────────────────────────────

import { tree } from "./tree";

describe("tree command", () => {
  it("outputs root, language, and tree structure", async () => {
    await tree.run({ path: tmpDir, transitive: false });
    const result = getOutput();
    expect(result.root).toBe(tmpDir);
    expect(result.language).toBe("javascript");
    expect(result.tree.type).toBe("directory");
  });

  it("tree nodes have correct shapes", async () => {
    await tree.run({ path: tmpDir, transitive: false });
    const result = getOutput();
    const src = result.tree.children.find((c: any) => c.name === "src");
    expect(src.type).toBe("directory");
    expect(Array.isArray(src.children)).toBe(true);

    const indexFile = src.children.find((c: any) => c.name === "index.ts");
    expect(indexFile.type).toBe("file");
    expect(indexFile.extension).toBe(".ts");
  });

  it("respects depth flag", async () => {
    await tree.run({ path: tmpDir, depth: 1, transitive: false });
    const result = getOutput();
    const src = result.tree.children.find((c: any) => c.name === "src");
    expect(src.type).toBe("directory");
    expect(src.children).toEqual([]);
  });
});

// ── summary ─────────────────────────────────────────────────

import { summary } from "./summary";

describe("summary command", () => {
  it("lists all files when no file arg given", async () => {
    await summary.run({ path: tmpDir, transitive: false });
    const result = getOutput();
    expect(Array.isArray(result)).toBe(true);
    const files = result.map((f: any) => f.file);
    expect(files).toContain("src/index.ts");
    expect(files).toContain("src/utils.ts");
    expect(files).toContain("src/types.ts");
  });

  it("each entry has symbols, dependencies, externals", async () => {
    await summary.run({ path: tmpDir, transitive: false });
    const result = getOutput();
    for (const entry of result) {
      expect(Array.isArray(entry.symbols)).toBe(true);
      expect(typeof entry.dependencies).toBe("number");
      expect(Array.isArray(entry.externals)).toBe(true);
    }
  });

  it("single file summary shows symbols and imports", async () => {
    await summary.run({ path: tmpDir, file: "src/utils.ts", transitive: false });
    const result = getOutput();
    expect(result.file).toBe("src/utils.ts");
    expect(result.symbols.length).toBeGreaterThan(0);
    expect(result.imports.length).toBe(1);
    expect(result.imports[0].specifier).toBe("./types");
  });

  it("fails for nonexistent file", async () => {
    await expect(
      summary.run({ path: tmpDir, file: "src/nope.ts", transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("not found"))).toBe(true);
  });

  it("uses source-aware depth traversal", async () => {
    await summary.run({ path: tmpDir, depth: 1, transitive: false });
    const result = getOutput();
    const files = result.map((f: any) => f.file);
    expect(files).toContain("src/index.ts");
    expect(files).toContain("src/utils.ts");
    expect(files).toContain("src/types.ts");
  });
});

// ── files ───────────────────────────────────────────────────

import { files } from "./files";

describe("files command", () => {
  it("returns all file paths", async () => {
    await files.run({ path: tmpDir, transitive: false });
    const result = getOutput();
    expect(result.files).toContain("src/index.ts");
    expect(result.files).toContain("src/utils.ts");
    expect(result.files).toContain("src/types.ts");
  });

  it("uses source-aware depth traversal", async () => {
    await files.run({ path: tmpDir, depth: 1, transitive: false });
    const result = getOutput();
    expect(result.files).toContain("src/index.ts");
    expect(result.files).toContain("src/utils.ts");
    expect(result.files).toContain("src/types.ts");
  });
});

// ── dependencies ────────────────────────────────────────────

import { dependencies } from "./dependencies";

describe("dependencies command", () => {
  it("shows imports for a file", async () => {
    await dependencies.run({ path: tmpDir, file: "src/index.ts", transitive: false });
    const result = getOutput();
    expect(result.file).toBe("src/index.ts");
    expect(result.dependencies.length).toBeGreaterThan(0);

    const utilsDep = result.dependencies.find((d: any) => d.specifier === "./utils");
    expect(utilsDep).toBeDefined();
    expect(utilsDep.resolvedPath).toBe("src/utils.ts");
    expect(utilsDep.isExternal).toBe(false);
  });

  it("resolved symbols include kind and signature", async () => {
    await dependencies.run({ path: tmpDir, file: "src/index.ts", transitive: false });
    const result = getOutput();
    const utilsDep = result.dependencies.find((d: any) => d.specifier === "./utils");
    const createUser = utilsDep.symbols.find((s: any) => s.name === "createUser");
    expect(createUser.kind).toBe("function");
    expect(createUser.signature).toContain("createUser");
  });

  it("fails when file arg is missing", async () => {
    await expect(
      dependencies.run({ path: tmpDir, transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("Missing"))).toBe(true);
  });

  it("fails for nonexistent file", async () => {
    await expect(
      dependencies.run({ path: tmpDir, file: "src/nope.ts", transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("not found"))).toBe(true);
  });

  it("file with no imports returns empty dependencies", async () => {
    await dependencies.run({ path: tmpDir, file: "src/types.ts", transitive: false });
    const result = getOutput();
    expect(result.dependencies).toEqual([]);
  });
});

// ── dependents ──────────────────────────────────────────────

import { dependents } from "./dependents";

describe("dependents command", () => {
  it("shows consumers of a file", async () => {
    await dependents.run({ path: tmpDir, file: "src/utils.ts", transitive: false });
    const result = getOutput();
    expect(result.file).toBe("src/utils.ts");
    expect(result.dependents.length).toBeGreaterThan(0);

    const indexDep = result.dependents.find((d: any) => d.file === "src/index.ts");
    expect(indexDep).toBeDefined();
    expect(indexDep.symbols.length).toBeGreaterThan(0);
  });

  it("consumed symbols have SymbolRef shape", async () => {
    await dependents.run({ path: tmpDir, file: "src/utils.ts", transitive: false });
    const result = getOutput();
    const indexDep = result.dependents.find((d: any) => d.file === "src/index.ts");
    for (const sym of indexDep.symbols) {
      expect(sym.file).toBe("src/utils.ts");
      expect(typeof sym.name).toBe("string");
      expect(typeof sym.kind).toBe("string");
      expect(typeof sym.signature).toBe("string");
    }
  });

  it("fails when file arg is missing", async () => {
    await expect(
      dependents.run({ path: tmpDir, transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("Missing"))).toBe(true);
  });

  it("file with no dependents returns empty array", async () => {
    await dependents.run({ path: tmpDir, file: "src/index.ts", transitive: false });
    const result = getOutput();
    expect(result.dependents).toEqual([]);
  });
});

// ── externals ───────────────────────────────────────────────

import { externals } from "./externals";

describe("externals command", () => {
  it("returns project-wide externals", async () => {
    await externals.run({ path: tmpDir, transitive: false });
    const result = getOutput();
    expect(Array.isArray(result.externals)).toBe(true);
  });

  it("returns per-file externals when file arg given", async () => {
    await externals.run({ path: tmpDir, file: "src/index.ts", transitive: false });
    const result = getOutput();
    expect(result.file).toBe("src/index.ts");
    expect(Array.isArray(result.externals)).toBe(true);
  });

  it("fails for nonexistent file", async () => {
    await expect(
      externals.run({ path: tmpDir, file: "src/nope.ts", transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("not found"))).toBe(true);
  });
});

// ── entry-points ────────────────────────────────────────────

import { entryPoints } from "./entry-points";

describe("entry-points command", () => {
  it("identifies entry point files", async () => {
    await entryPoints.run({ path: tmpDir, transitive: false });
    const result = getOutput();
    expect(Array.isArray(result.entryPoints)).toBe(true);
    expect(result.entryPoints).toContain("src/index.ts");
    expect(result.entryPoints).not.toContain("src/utils.ts");
  });
});

// ── cycles ──────────────────────────────────────────────────

import { cycles } from "./cycles";

describe("cycles command", () => {
  it("returns empty for acyclic project", async () => {
    await cycles.run({ path: tmpDir, transitive: false });
    const result = getOutput();
    expect(result.cycles).toEqual([]);
  });
});

// ── json ────────────────────────────────────────────────────

import { jsonCmd } from "./json";

describe("json command", () => {
  it("returns full AST root node", async () => {
    await jsonCmd.run({ path: tmpDir, transitive: false });
    const result = getOutput();
    expect(result.type).toBe("root");
    expect(result.absolutePath).toBe(tmpDir);
    expect(result.tree.type).toBe("directory");
    expect(Array.isArray(result.externals)).toBe(true);
  });
});

// ── calls ───────────────────────────────────────────────────

import { calls } from "./calls";

describe("calls command", () => {
  it("shows outward calls for a function", async () => {
    await calls.run({ path: tmpDir, file: "src/index.ts", symbol: "main", transitive: false });
    const result = getOutput();
    expect(result.file).toBe("src/index.ts");
    expect(result.name).toBe("main");
    const names = result.calls.map((c: any) => c.name);
    expect(names).toContain("createUser");
    expect(names).toContain("formatUser");
  });

  it("call results include SymbolRef fields", async () => {
    await calls.run({ path: tmpDir, file: "src/index.ts", symbol: "main", transitive: false });
    const result = getOutput();
    const cu = result.calls.find((c: any) => c.name === "createUser");
    expect(cu.file).toBe("src/utils.ts");
    expect(cu.kind).toBe("function");
    expect(typeof cu.signature).toBe("string");
    expect(cu.range).toBeDefined();
    expect(typeof cu.range.start.line).toBe("number");
    expect(typeof cu.range.start.column).toBe("number");
    expect(typeof cu.context).toBe("string");
  });

  it("transitive follows the full chain", async () => {
    await calls.run({ path: tmpDir, file: "src/index.ts", symbol: "main", transitive: true });
    const result = getOutput();
    const names = result.calls.map((c: any) => c.name);
    expect(names).toContain("createUser");
    expect(names).toContain("validateEmail");
  });

  it("transitive with depth 1 limits to direct calls", async () => {
    await calls.run({ path: tmpDir, file: "src/index.ts", symbol: "main", depth: 1, transitive: true });
    const result = getOutput();
    const names = result.calls.map((c: any) => c.name);
    expect(names).toContain("createUser");
    expect(names).not.toContain("validateEmail");
  });

  it("fails when file or symbol arg is missing", async () => {
    await expect(
      calls.run({ path: tmpDir, transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("Missing"))).toBe(true);
  });
});

// ── callers ─────────────────────────────────────────────────

import { callers } from "./callers";

describe("callers command", () => {
  it("shows inward callers for a function", async () => {
    await callers.run({ path: tmpDir, file: "src/utils.ts", symbol: "createUser", transitive: false });
    const result = getOutput();
    expect(result.file).toBe("src/utils.ts");
    expect(result.name).toBe("createUser");
    expect(result.callers.length).toBeGreaterThan(0);

    const mainCaller = result.callers.find((c: any) => c.name === "main");
    expect(mainCaller).toBeDefined();
    expect(mainCaller.file).toBe("src/index.ts");
  });

  it("caller results include SymbolRef fields", async () => {
    await callers.run({ path: tmpDir, file: "src/utils.ts", symbol: "createUser", transitive: false });
    const result = getOutput();
    const mainCaller = result.callers.find((c: any) => c.name === "main");
    expect(mainCaller.kind).toBe("function");
    expect(typeof mainCaller.signature).toBe("string");
    expect(mainCaller.range).toBeDefined();
    expect(typeof mainCaller.range.start.line).toBe("number");
    expect(typeof mainCaller.range.start.column).toBe("number");
    expect(typeof mainCaller.context).toBe("string");
  });

  it("transitive follows the full caller chain", async () => {
    await callers.run({ path: tmpDir, file: "src/utils.ts", symbol: "validateEmail", transitive: true });
    const result = getOutput();
    const names = result.callers.map((c: any) => c.name);
    expect(names).toContain("createUser");
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it("transitive with depth 1 limits to direct callers", async () => {
    await callers.run({ path: tmpDir, file: "src/utils.ts", symbol: "validateEmail", depth: 1, transitive: true });
    const result = getOutput();
    expect(result.callers).toHaveLength(1);
    expect(result.callers[0].name).toBe("createUser");
  });

  it("fails when file or symbol arg is missing", async () => {
    await expect(
      callers.run({ path: tmpDir, transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("Missing"))).toBe(true);
  });

  it("function with no callers returns empty array", async () => {
    await callers.run({ path: tmpDir, file: "src/index.ts", symbol: "main", transitive: false });
    const result = getOutput();
    expect(result.callers).toEqual([]);
  });
});

// ── read ────────────────────────────────────────────────────

import { read } from "./read";

describe("read command", () => {
  it("reads function source with full shape", async () => {
    await read.run({ path: tmpDir, file: "src/utils.ts", symbol: "createUser", transitive: false });
    const result = getOutput();
    expect(result.file).toBe("src/utils.ts");
    expect(result.name).toBe("createUser");
    expect(result.kind).toBe("function");
    expect(result.visibility).toBe("public");
    expect(result.range).toBeDefined();
    expect(typeof result.range.start.line).toBe("number");
    expect(typeof result.range.end.line).toBe("number");
    expect(typeof result.range.start.column).toBe("number");
    expect(result.source).toContain("export function createUser");
  });

  it("reads internal function", async () => {
    await read.run({ path: tmpDir, file: "src/utils.ts", symbol: "validateEmail", transitive: false });
    const result = getOutput();
    expect(result.name).toBe("validateEmail");
    expect(result.kind).toBe("function");
    expect(result.source).toContain("includes");
  });

  it("reads interface", async () => {
    await read.run({ path: tmpDir, file: "src/types.ts", symbol: "User", transitive: false });
    const result = getOutput();
    expect(result.name).toBe("User");
    expect(result.kind).toBe("interface");
    expect(result.source).toContain("id: number");
  });

  it("reads type alias", async () => {
    await read.run({ path: tmpDir, file: "src/types.ts", symbol: "UserRole", transitive: false });
    const result = getOutput();
    expect(result.name).toBe("UserRole");
    expect(result.kind).toBe("type");
    expect(result.source).toContain("admin");
  });

  it("fails when file arg is missing", async () => {
    await expect(
      read.run({ path: tmpDir, transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("Missing"))).toBe(true);
  });

  it("fails when symbol arg is missing", async () => {
    await expect(
      read.run({ path: tmpDir, file: "src/utils.ts", transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("Missing"))).toBe(true);
  });

  it("fails for nonexistent symbol", async () => {
    await expect(
      read.run({ path: tmpDir, file: "src/utils.ts", symbol: "nope", transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("not found"))).toBe(true);
  });

  it("reads symbol by --line number using range", async () => {
    // createUser starts at line 7 in the test fixture
    await read.run({ path: tmpDir, file: "src/utils.ts", line: 9, transitive: false });
    const result = getOutput();
    expect(result.name).toBe("createUser");
    expect(result.source).toContain("export function createUser");
  });

  it("reads symbol by --line at boundary (first line)", async () => {
    // validateEmail starts at line 3
    await read.run({ path: tmpDir, file: "src/utils.ts", line: 3, transitive: false });
    const result = getOutput();
    expect(result.name).toBe("validateEmail");
  });

  it("fails for --line outside any symbol", async () => {
    await expect(
      read.run({ path: tmpDir, file: "src/utils.ts", line: 999, transitive: false })
    ).rejects.toThrow("EXIT_1");
    expect(captured.some((c) => typeof c === "string" && c.includes("No symbol found"))).toBe(true);
  });
});

// ── help ────────────────────────────────────────────────────

import { help } from "./help";

describe("help command", () => {
  it("outputs usage text and exits", async () => {
    await expect(
      help.run({ transitive: false })
    ).rejects.toThrow("EXIT_0");
    expect(exitCode).toBe(0);
    expect(captured.some((c) => typeof c === "string" && c.includes("grail - codebase analyzer"))).toBe(true);
    expect(captured.some((c) => typeof c === "string" && c.includes("--depth"))).toBe(true);
    expect(captured.some((c) => typeof c === "string" && c.includes("--transitive"))).toBe(true);
  });
});
