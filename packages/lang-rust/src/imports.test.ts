import { parseRustImports } from "./imports";
import { registerLanguage, loadLanguage, parseFile } from "@grail-ai/core";
import { rust } from "./index";

function parse(content: string) {
  const tree = parseFile("test.rs", content);
  const result = parseRustImports("test.rs", content, tree);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

beforeAll(async () => {
  registerLanguage(rust);
  await loadLanguage(rust);
});

describe("parseRustImports", () => {
  it("parses use declarations", () => {
    const result = parse("use std::collections::{HashMap, BTreeMap};");
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("std::collections::{HashMap, BTreeMap}");
    expect(result[0].kind).toBe("static");
    expect(result[0].symbols.map((s) => s.name)).toEqual(["HashMap", "BTreeMap"]);
  });

  it("does not report intermediate path components as imported symbols", () => {
    const result = parse("use symphonia::core::audio::{AudioBufferRef, Signal};");
    expect(result[0].symbols.map((s) => s.name)).toEqual(["AudioBufferRef", "Signal"]);
  });

  it("parses use aliases and wildcards", () => {
    const result = parse("use serde::Serialize as Ser;\nuse crate::models::*;");
    expect(result).toHaveLength(2);
    expect(result[0].symbols).toContainEqual({ name: "Ser", originalName: "Serialize" });
    expect(result[1].symbols).toContainEqual({ name: "*", originalName: "*" });
  });

  it("parses file module declarations as dependencies", () => {
    const result = parse("mod service;\npub mod inline { pub fn run() {} }");
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("service");
  });

  it("deduplicates identical imports and includes ranges", () => {
    const result = parse("use crate::service;\nuse crate::service;");
    expect(result).toHaveLength(1);
    expect(result[0].range!.start.line).toBe(1);
  });
});
