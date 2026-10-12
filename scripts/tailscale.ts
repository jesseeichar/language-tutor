import { join } from "node:path";
import { loadConfig, loadContent, projectRoot, startServer, type ServerConfig } from "../src/server";

interface Child {
  exited: Promise<number>;
  kill(signal?: number | NodeJS.Signals): void;
  stdout?: ReadableStream<Uint8Array> | null;
}
interface Runtime {
  spawn(args: string[], capture?: boolean): Child;
  start: typeof startServer;
  validate: typeof loadContent;
}
const runtime: Runtime = {
  spawn: (args, capture = false) => Bun.spawn(args, { cwd: projectRoot, stdin: "inherit", stdout: capture ? "pipe" : "inherit", stderr: "inherit" }),
  start: startServer,
  validate: loadContent,
};

function hasPort(config: unknown, port: string): boolean {
  if (!config || typeof config !== "object") return false;
  const node = config as Record<string, unknown>;
  for (const key of ["TCP", "Web", "AllowFunnel"]) {
    const entries = node[key];
    if (entries && typeof entries === "object" && Object.keys(entries).some(k => k === port || k.endsWith(`:${port}`))) return true;
  }
  return Object.values(node).some(value => typeof value === "object" && hasPort(value, port));
}

async function stopChildren(children: Iterable<Child>) {
  const active = [...children];
  for (const child of active) child.kill("SIGINT");
  await Promise.all(active.map(async child => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    try { await child.exited; } finally { clearTimeout(timer); }
  }));
}

/** Foreground Serve owns an ephemeral registration; stopping that child removes only this app. */
export async function shareApp(config: ServerConfig, signal: AbortSignal, port = 443, deps: Runtime = runtime) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("LT_TAILSCALE_PORT must be a port from 1 to 65535.");
  signal.throwIfAborted();
  const children = new Set<Child>();
  let server: ReturnType<typeof startServer> | undefined;
  let onAbort!: () => void;
  const stopped = new Promise<never>((_, reject) => { onAbort = () => reject(new Error("Sharing stopped.")); });
  signal.addEventListener("abort", onAbort, { once: true });
  const spawn = (args: string[], capture = false) => {
    signal.throwIfAborted();
    const child = deps.spawn(args, capture);
    children.add(child);
    void child.exited.then(() => children.delete(child));
    return child;
  };
  const command = async (args: string[]) => {
    const child = spawn(args, true);
    const output = new Response(child.stdout).text();
    const [code, text] = await Promise.race([Promise.all([child.exited, output]), stopped]);
    if (code !== 0) throw new Error(`${args.slice(0, 2).join(" ")} failed (exit ${code}).`);
    return text;
  };
  try {
    const status = JSON.parse(await command(["tailscale", "status", "--json"]));
    if (status.BackendState !== "Running") throw new Error("Connect this machine to Tailscale before running bun run share.");
    const serving = JSON.parse(await command(["tailscale", "serve", "status", "--json"]));
    if (hasPort(serving, String(port))) throw new Error(`Tailscale port ${port} is already in use. Choose LT_TAILSCALE_PORT; existing services were not changed.`);
    await Promise.race([deps.validate(config.dataDir), stopped]);
    const build = spawn(["bun", "--bun", "vite", "build"]);
    if (await Promise.race([build.exited, stopped]) !== 0) throw new Error("Build failed; the app was not published.");
    signal.throwIfAborted();
    server = deps.start({ ...config, hostname: "127.0.0.1", staticDir: join(projectRoot, "dist") });
    const serve = spawn(["tailscale", "serve", `--https=${port}`, `http://127.0.0.1:${server.port}`]);
    console.log("Tailscale Serve will print the HTTPS address. Press Ctrl+C to stop the app and remove its registration.");
    const code = await Promise.race([serve.exited, stopped]);
    if (code !== 0) throw new Error(`Tailscale Serve stopped (exit ${code}).`);
  } finally {
    signal.removeEventListener("abort", onAbort);
    // Stop publishing before stopping the server. Do not reset other Serve routes or log out the device.
    await stopChildren(children);
    server?.stop(true);
  }
}

if (import.meta.main) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);
  try { await shareApp(loadConfig(), controller.signal, Number(process.env.LT_TAILSCALE_PORT ?? 443)); }
  catch (error) { if (!controller.signal.aborted) { console.error((error as Error).message); process.exitCode = 1; } }
}
