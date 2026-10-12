/**
 * Starts the API server (restarts on change) and the Vite dev server together.
 * Ctrl+C stops both.
 */
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
