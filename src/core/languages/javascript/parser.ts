import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TreeSitter = require("web-tree-sitter");

let initialized = false;
let initPromise: Promise<void> | null = null;

let jsParser: any;
let tsParser: any;
let tsxParser: any;

const TS_EXTENSIONS = new Set([".ts", ".mts", ".cts"]);
const TSX_EXTENSIONS = new Set([".tsx"]);

function loadWasm(packageName: string, wasmFile: string): Uint8Array {
  const dir = path.dirname(require.resolve(`${packageName}/package.json`));
  return fs.readFileSync(path.join(dir, wasmFile));
}

export async function initJavaScriptParsers(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await TreeSitter.Parser.init({
      locateFile: (scriptName: string) =>
        path.join(
          path.dirname(require.resolve("web-tree-sitter")),
          scriptName
        ),
    });

    const [jsLang, tsLang, tsxLang] = await Promise.all([
      TreeSitter.Language.load(loadWasm("tree-sitter-javascript", "tree-sitter-javascript.wasm")),
      TreeSitter.Language.load(loadWasm("tree-sitter-typescript", "tree-sitter-typescript.wasm")),
      TreeSitter.Language.load(loadWasm("tree-sitter-typescript", "tree-sitter-tsx.wasm")),
    ]);

    jsParser = new TreeSitter.Parser();
    jsParser.setLanguage(jsLang);

    tsParser = new TreeSitter.Parser();
    tsParser.setLanguage(tsLang);

    tsxParser = new TreeSitter.Parser();
    tsxParser.setLanguage(tsxLang);

    initialized = true;
  })();

  return initPromise;
}

export function getParser(filePath: string): any {
  if (!initialized) {
    throw new Error(
      "Tree-sitter parsers not initialized. Call initJavaScriptParsers() first."
    );
  }
  const ext = path.extname(filePath);
  if (TSX_EXTENSIONS.has(ext)) return tsxParser;
  if (TS_EXTENSIONS.has(ext)) return tsParser;
  return jsParser;
}
