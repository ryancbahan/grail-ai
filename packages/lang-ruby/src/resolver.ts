import fs from "fs";
import path from "path";
import { ResolveContext } from "@grail-ai/core";

const RUBY_EXTENSIONS = [".rb"];

const RUBY_STDLIB = new Set([
  "abbrev", "base64", "benchmark", "bigdecimal", "bundler", "cgi", "csv",
  "date", "delegate", "digest", "drb", "english", "erb", "etc", "fcntl",
  "fiddle", "fileutils", "find", "forwardable", "io/console", "io/nonblock",
  "io/wait", "ipaddr", "irb", "json", "logger", "matrix", "minitest",
  "monitor", "mutex_m", "net/ftp", "net/http", "net/imap", "net/pop",
  "net/smtp", "nkf", "objspace", "observer", "open-uri", "open3",
  "openssl", "optparse", "ostruct", "pathname", "pp", "prettyprint",
  "prime", "pstore", "psych", "racc", "rake", "rdoc", "readline",
  "reline", "resolv", "ripper", "rss", "ruby2_keywords", "securerandom",
  "set", "shellwords", "singleton", "socket", "stringio", "strscan",
  "syslog", "tempfile", "time", "timeout", "tmpdir", "tsort", "un",
  "uri", "weakref", "webrick", "yaml", "zlib",
]);

function tryResolveFile(filePath: string): string | null {
  // Try exact path
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return filePath;
  }

  // Try adding .rb extension
  for (const ext of RUBY_EXTENSIONS) {
    const withExt = filePath + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return withExt;
    }
  }

  return null;
}

export function resolveRubyImport(
  specifier: string,
  context: ResolveContext
): string | null {
  // Standard library modules
  if (RUBY_STDLIB.has(specifier) || RUBY_STDLIB.has(specifier.split("/")[0])) {
    return null;
  }

  // require_relative: always relative to the containing file
  // We encode require_relative as "static" kind, and these specifiers
  // start with "./" or "../" or are bare relative paths
  if (specifier.startsWith(".")) {
    const dir = path.dirname(context.containingFile);
    const target = path.resolve(dir, specifier);
    return tryResolveFile(target);
  }

  // require: try common Ruby project layouts
  // Search in lib/, app/, then project root
  const searchDirs = [
    path.join(context.projectRoot, "lib"),
    path.join(context.projectRoot, "app"),
    path.join(context.projectRoot, "app", "models"),
    path.join(context.projectRoot, "app", "controllers"),
    path.join(context.projectRoot, "app", "services"),
    context.projectRoot,
  ];

  for (const dir of searchDirs) {
    const target = path.join(dir, specifier);
    const resolved = tryResolveFile(target);
    if (resolved) return resolved;
  }

  // Everything else is external (gems)
  return null;
}
