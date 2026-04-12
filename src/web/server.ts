import http from "http";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import * as esbuild from "esbuild";
import { analyze, initAnalyzer } from "../core/analyze";

function getTargetPath(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--path" && args[i + 1]) {
      return args[i + 1];
    }
  }
  const positional = args.find((a) => !a.startsWith("--"));
  if (positional) return positional;

  console.error("Usage: npm run dev -- --path <directory>");
  process.exit(1);
}

async function main() {
  const targetPath = path.resolve(getTargetPath());

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
    console.error(`Error: ${targetPath} is not a valid directory`);
    process.exit(1);
  }

  await initAnalyzer();
  const { root, language } = analyze(targetPath);
  if (language) console.log(`Detected language: ${language.name}`);

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

  const server = http.createServer((req, res) => {
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
  });

  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\nGrail running at ${url}\n`);
    exec(`open "${url}"`);
  });
}

main();
