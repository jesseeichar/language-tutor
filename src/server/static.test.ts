import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { staticFiles } from "./static";
import { startServer } from "./app";
import { FIXTURE_DATA_DIR } from "../../tests/support/fixtures";

test("built assets and API share a loopback server without exposing repository files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lt-static-"));
  await Bun.write(join(dir, "dist/index.html"), "<h1>Language Tutor</h1>");
  await Bun.write(join(dir, "dist/assets/app.js"), "console.log('app')");
  await Bun.write(join(dir, "secret.txt"), "secret");
  symlinkSync(join(dir, "secret.txt"), join(dir, "dist/leak.txt"));
  const server = startServer({ dataDir: FIXTURE_DATA_DIR, progressPath: null, port: 0, hostname: "127.0.0.1", staticDir: join(dir, "dist") });
  const get = (path: string, method = "GET") => fetch(`http://127.0.0.1:${server.port}${path}`, { method });
  try {
    expect(await (await get("/")).text()).toContain("Language Tutor");
    const asset = await get("/assets/app.js");
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect(await asset.text()).toContain("console.log");
    expect(await (await get("/api/health")).json()).toEqual({ ok: true });
    expect((await get("/api/unknown")).status).toBe(404);
    expect((await get("/", "POST")).status).toBe(405);
    expect(await (await get("/", "HEAD")).text()).toBe("");
    for (const path of ["/.env", "/data/progress.json", "/leak.txt", "/%2e%2e%2fsecret.txt", "/assets/missing.js", "/assets/"]) {
      expect((await get(path)).status).toBe(404);
    }
  } finally { server.stop(true); rmSync(dir, { recursive: true, force: true }); }
});

test("dev servers do not serve static files; malformed paths are rejected", async () => {
  expect((await staticFiles()(new Request("http://local/"))).status).toBe(404);
  expect((await staticFiles("dist")(new Request("http://local/%ZZ"))).status).toBe(400);
});
