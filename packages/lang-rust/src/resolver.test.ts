import fs from "fs";
import os from "os";
import path from "path";
import { resolveRustImport } from "./resolver";
import type { ResolveContext } from "@grail-ai/core";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-rust-resolver-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content = "") {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function context(containingFile: string): ResolveContext {
  return {
    containingFile: path.join(tmpDir, containingFile),
    projectRoot: tmpDir,
  };
}

describe("resolveRustImport", () => {
  it("resolves file module declarations next to the containing file", () => {
    writeFile("src/service.rs");
    expect(resolveRustImport("service", context("src/lib.rs"))).toBe(path.join(tmpDir, "src/service.rs"));
  });

  it("resolves module directories through mod.rs", () => {
    writeFile("src/api/mod.rs");
    expect(resolveRustImport("api", context("src/lib.rs"))).toBe(path.join(tmpDir, "src/api/mod.rs"));
  });

  it("resolves crate-qualified use paths and strips symbol suffixes", () => {
    writeFile("src/models/user.rs");
    expect(resolveRustImport("crate::models::user::User", context("src/lib.rs"))).toBe(path.join(tmpDir, "src/models/user.rs"));
  });

  it("returns null for standard library crates and external crates", () => {
    expect(resolveRustImport("std::collections::HashMap", context("src/lib.rs"))).toBeNull();
    expect(resolveRustImport("serde::Serialize", context("src/lib.rs"))).toBeNull();
  });
});
