import http from "http";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import * as esbuild from "esbuild";
import { analyze, registerLanguage } from "@grail-ai/core";
import type { RootNode } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import { ruby } from "@grail-ai/lang-ruby";
import { rust } from "@grail-ai/lang-rust";

registerLanguage(javascript);
registerLanguage(ruby);
registerLanguage(rust);

export function parseArgs(argv: string[]): string | null {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--path" && args[i + 1]) {
      return args[i + 1];
    }
  }
  return args.find((a) => !a.startsWith("--")) ?? null;
}

export function createRequestHandler(
  root: RootNode,
  bundleJs: string,
  indexHtml: string
): http.RequestListener {
  return (req, res) => {
    if (req.url === "/api/tree") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(root));
    } else if (req.url === "/bundle.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(bundleJs);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(indexHtml);
    }
  };
}

async function main() {
  const targetPath = parseArgs(process.argv);
  if (!targetPath) {
    console.error("Usage: npm run ui -- --path <directory>");
    process.exit(1);
  }

  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    console.error(`Error: ${resolved} is not a valid directory`);
    process.exit(1);
  }

  const { root, language } = await analyze(resolved);
  if (language) console.log(`Detected language: ${language.descriptor.name}`);

  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, "app.tsx")],
    bundle: true,
    write: false,
    format: "esm",
    jsx: "automatic",
    jsxImportSource: "preact",
    absWorkingDir: path.join(__dirname, "../.."),
  });

  const bundleJs = result.outputFiles![0].text;
  const indexHtml = fs.readFileSync(
    path.join(__dirname, "index.html"),
    "utf-8"
  );

  const PORT = 3000;
  const handler = createRequestHandler(root, bundleJs, indexHtml);
  const server = http.createServer(handler);

  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\nGrail running at ${url}\n`);
    exec(`open "${url}"`);
  });
}

if (require.main === module) {
  main();
}
