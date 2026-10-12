import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

/** Serve only built assets, never the repository or its data and credentials. */
export function staticFiles(directory?: string) {
  return async (request: Request): Promise<Response> => {
    if (!directory) return new Response("Not found", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    let path: string;
    try { path = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response("Invalid path", { status: 400 }); }
    if (path.split("/").some(part => part.startsWith(".")) || path.includes("\\") || path.includes("\0")) return new Response("Not found", { status: 404 });
    try {
      const root = await realpath(directory);
      const file = await realpath(resolve(root, `.${path === "/" ? "/index.html" : path}`));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) return new Response("Not found", { status: 404 });
      const asset = Bun.file(file);
      return new Response(request.method === "HEAD" ? null : asset, { headers: {
        "Content-Type": asset.type, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff",
      } });
    } catch { return new Response("Not found", { status: 404 }); }
  };
}
