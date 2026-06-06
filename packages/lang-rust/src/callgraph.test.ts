import fs from "fs";
import os from "os";
import path from "path";
import { analyze, collectFiles, loadLanguage, registerLanguage } from "@grail-ai/core";
import type { FileEntry } from "@grail-ai/core";
import { rust } from "./index";

let tmpDir: string;

beforeAll(async () => {
  registerLanguage(rust);
  await loadLanguage(rust);
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-rust-callgraph-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

async function analyzeAndBuildCallGraph() {
  const { root, language } = await analyze(tmpDir);
  if (language?.implementation.buildCallGraph) {
    const files = collectFiles(root);
    await language.implementation.buildCallGraph(root.absolutePath, files);
  }
  return root;
}

function findSymbol(root: Awaited<ReturnType<typeof analyzeAndBuildCallGraph>>, fileName: string, symName: string, parent?: string) {
  const files = collectFiles(root) as FileEntry[];
  const file = files.find((f) => f.filePath.endsWith(fileName));
  return file?.node.symbols.find((s) => s.name === symName && (parent === undefined || s.parent === parent));
}

describe("buildRustCallGraph", () => {
  it("resolves local function calls", async () => {
    writeFile("Cargo.toml", "[package]\nname = \"demo\"\n");
    writeFile("src/lib.rs", "pub fn run() { helper(); }\nfn helper() {}\n");

    const root = await analyzeAndBuildCallGraph();
    const run = findSymbol(root, "lib.rs", "run");
    expect(run!.calls).toHaveLength(1);
    expect(run!.calls![0].name).toBe("helper");
    expect(run!.calls![0].file).toContain("lib.rs");
  });

  it("resolves self methods and associated function calls", async () => {
    writeFile("Cargo.toml", "[package]\nname = \"demo\"\n");
    writeFile("src/lib.rs", `
pub struct Store;

impl Store {
  pub fn run(&self) {
    self.load();
    Store::build();
  }

  fn load(&self) {}
  fn build() {}
}
`);

    const root = await analyzeAndBuildCallGraph();
    const run = findSymbol(root, "lib.rs", "run", "Store");
    expect(run!.calls!.map((c) => c.name).sort()).toEqual(["build", "load"]);
    expect(run!.calls!.every((c) => c.parent === "Store")).toBe(true);
  });

  it("resolves module-scoped calls across files", async () => {
    writeFile("Cargo.toml", "[package]\nname = \"demo\"\n");
    writeFile("src/lib.rs", "mod service;\npub fn run() { service::fetch(); }\n");
    writeFile("src/service.rs", "pub fn fetch() {}\n");

    const root = await analyzeAndBuildCallGraph();
    const run = findSymbol(root, "lib.rs", "run");
    expect(run!.calls).toHaveLength(1);
    expect(run!.calls![0].name).toBe("fetch");
    expect(run!.calls![0].file).toContain("service.rs");
  });

  it("resolves local macro definitions and ignores std macros", async () => {
    writeFile("Cargo.toml", "[package]\nname = \"demo\"\n");
    writeFile("src/lib.rs", "macro_rules! route { () => {} }\npub fn run() { route!(); println!(\"hi\"); }\n");

    const root = await analyzeAndBuildCallGraph();
    const run = findSymbol(root, "lib.rs", "run");
    expect(run!.calls).toHaveLength(1);
    expect(run!.calls![0].name).toBe("route");
  });
});
