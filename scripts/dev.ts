/**
 * Starts the API server (restarts on change) and the Vite dev server together.
 * Ctrl+C stops both.
 */
const apiPort = Number(process.env.LT_API_PORT ?? 3001);

/**
 * `bun --watch` keeps running after the server fails to bind, so a busy port would go unnoticed
 * and the UI would talk to whatever already listens there. Check up front instead.
 * (Vite's own port is guarded by strictPort in vite.config.ts.)
 */
function portIsFree(port: number): boolean {
  try {
    Bun.serve({ port, fetch: () => new Response() }).stop(true);
    return true;
  } catch {
    return false;
  }
}

if (!portIsFree(apiPort)) {
  console.error(`Port ${apiPort} is already in use, probably by another \`bun run dev\`. Stop it first:`);
  console.error(`  lsof -nP -iTCP:${apiPort} -sTCP:LISTEN`);
  process.exit(1);
}

const procs = [
  Bun.spawn(["bun", "--watch", "src/server/main.ts"], { stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "--bun", "vite"], { stdout: "inherit", stderr: "inherit" }),
];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill();
  process.exit(code);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

// If either process dies, take the other one down too.
const code = await Promise.race(procs.map((p) => p.exited));
stopAll(code);

export {};
