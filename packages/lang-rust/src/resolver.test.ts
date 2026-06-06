import fs from "fs";
import os from "os";
import path from "path";
import { isRustExternalImport, resolveRustImport, rustExternalPackageName } from "./resolver";
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

  it("resolves crate-qualified paths from the containing workspace package", () => {
    writeFile("Cargo.toml", "[workspace]\nmembers = [\"crates/*\"]\n");
    writeFile("crates/app/Cargo.toml", "[package]\nname = \"demo-app\"\n");
    writeFile("crates/app/src/convert.rs");

    expect(resolveRustImport("crate::convert::*", context("crates/app/src/render.rs"))).toBe(path.join(tmpDir, "crates/app/src/convert.rs"));
  });

  it("resolves sibling workspace crates by Rust crate name", () => {
    writeFile("Cargo.toml", "[workspace]\nmembers = [\"crates/*\"]\n");
    writeFile("crates/engine/Cargo.toml", "[package]\nname = \"demo-engine\"\n");
    writeFile("crates/engine/src/lib.rs");
    writeFile("crates/engine/src/composition.rs");
    writeFile("crates/app/Cargo.toml", "[package]\nname = \"demo-app\"\n");

    expect(resolveRustImport("demo_engine::{Composition}", context("crates/app/src/app.rs"))).toBe(path.join(tmpDir, "crates/engine/src/lib.rs"));
    expect(resolveRustImport("demo_engine::composition::mix", context("crates/app/src/app.rs"))).toBe(path.join(tmpDir, "crates/engine/src/composition.rs"));
  });

  it("resolves aliased sibling workspace crates", () => {
    writeFile("Cargo.toml", "[workspace]\nmembers = [\"crates/*\"]\n");
    writeFile("crates/engine/Cargo.toml", "[package]\nname = \"demo-engine\"\n");
    writeFile("crates/engine/src/lib.rs");
    writeFile("crates/app/Cargo.toml", "[package]\nname = \"demo-app\"\n");

    expect(resolveRustImport("demo_engine as eng", context("crates/app/src/app.rs"))).toBe(path.join(tmpDir, "crates/engine/src/lib.rs"));
  });

  it("returns null for standard library crates and external crates", () => {
    expect(resolveRustImport("std::collections::HashMap", context("src/lib.rs"))).toBeNull();
    expect(resolveRustImport("serde::Serialize", context("src/lib.rs"))).toBeNull();
  });

  it("classifies standard and relative Rust imports as non-external", () => {
    expect(isRustExternalImport("std::collections::HashMap", context("src/lib.rs"))).toBe(false);
    expect(isRustExternalImport("core::fmt::Debug", context("src/lib.rs"))).toBe(false);
    expect(isRustExternalImport("super::*", context("src/lib.rs"))).toBe(false);
    expect(isRustExternalImport("crate::models::User", context("src/lib.rs"))).toBe(false);
  });

  it("classifies third-party crates as external", () => {
    expect(isRustExternalImport("serde::Serialize", context("src/lib.rs"))).toBe(true);
    expect(isRustExternalImport("anyhow::{Context, Result}", context("src/lib.rs"))).toBe(true);
  });

  it("extracts external Rust crate names", () => {
    expect(rustExternalPackageName("serde::Serialize")).toBe("serde");
    expect(rustExternalPackageName("anyhow::{Context, Result}")).toBe("anyhow");
    expect(rustExternalPackageName("symphonia::core::audio::{AudioBufferRef, Signal}")).toBe("symphonia");
  });
});
