import http from "http";
import { parseArgs, createRequestHandler } from "./server";
import type { RootNode } from "@grail-ai/core";

describe("parseArgs", () => {
  it("parses --path flag", () => {
    expect(parseArgs(["node", "script", "--path", "./src"])).toBe("./src");
  });

  it("parses positional argument", () => {
    expect(parseArgs(["node", "script", "./src"])).toBe("./src");
  });

  it("prefers --path over positional", () => {
    expect(parseArgs(["node", "script", "./other", "--path", "./src"])).toBe("./src");
  });

  it("returns null when no path given", () => {
    expect(parseArgs(["node", "script"])).toBeNull();
  });

  it("ignores flags that are not --path", () => {
    expect(parseArgs(["node", "script", "--verbose"])).toBeNull();
  });
});

describe("createRequestHandler", () => {
  const mockRoot: RootNode = {
    type: "root",
    absolutePath: "/test",
    tree: { type: "directory", name: "test", children: [] },
    externals: [],
  };
  const mockBundle = "console.log('bundle')";
  const mockHtml = "<html>test</html>";

  function makeRequest(url: string): Promise<{ contentType: string; body: string }> {
    return new Promise((resolve) => {
      const handler = createRequestHandler(mockRoot, mockBundle, mockHtml);
      const req = { url } as http.IncomingMessage;
      let capturedContentType = "";
      const res = {
        writeHead: (_status: number, headers?: Record<string, string>) => {
          capturedContentType = headers?.["Content-Type"] ?? "";
        },
        end: (data: string) => {
          resolve({ contentType: capturedContentType, body: data });
        },
      } as unknown as http.ServerResponse;
      handler(req, res);
    });
  }

  it("serves tree JSON at /api/tree", async () => {
    const { contentType, body } = await makeRequest("/api/tree");
    expect(contentType).toBe("application/json");
    const data = JSON.parse(body);
    expect(data.type).toBe("root");
    expect(data.absolutePath).toBe("/test");
  });

  it("serves bundle at /bundle.js", async () => {
    const { contentType, body } = await makeRequest("/bundle.js");
    expect(contentType).toBe("application/javascript");
    expect(body).toBe(mockBundle);
  });

  it("serves HTML at root", async () => {
    const { contentType, body } = await makeRequest("/");
    expect(contentType).toBe("text/html");
    expect(body).toBe(mockHtml);
  });

  it("serves HTML for unknown routes", async () => {
    const { contentType, body } = await makeRequest("/unknown");
    expect(contentType).toBe("text/html");
    expect(body).toBe(mockHtml);
  });
});
