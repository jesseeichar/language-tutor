import { expect, mock, test } from "bun:test";
import { shareApp } from "./tailscale";

const config = { dataDir: "/fixture", progressPath: "/progress", port: 3001 };
function harness(settings: { serving?: unknown; state?: string; buildCode?: number; startError?: boolean; holdBuild?: boolean } = {}) {
  const commands: string[][] = [];
  const killed: string[] = [];
  let finishServe!: (code: number) => void;
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  const stop = mock(() => {});
  const start = mock(() => {
    if (settings.startError) throw new Error("port occupied");
    return { port: 3001, stop };
  });
  const spawn = (args: string[], capture = false) => {
    commands.push(args);
    const name = args.join(" ");
    if (capture) {
      const value = args[1] === "status" ? { BackendState: settings.state ?? "Running" } : settings.serving ?? {};
      return { exited: Promise.resolve(0), kill: () => {}, stdout: new Blob([JSON.stringify(value)]).stream() };
    }
    if (args[0] === "bun" && !settings.holdBuild) return { exited: Promise.resolve(settings.buildCode ?? 0), kill: () => {} };
    const exited = new Promise<number>(resolve => { finishServe = resolve; });
    ready();
    return { exited, kill: () => { killed.push(name); finishServe(0); } };
  };
  const deps = { spawn, start, validate: mock(async () => ({})) } as unknown as NonNullable<Parameters<typeof shareApp>[3]>;
  return { deps, commands, killed, started, stop, start, endServe: (code: number) => finishServe(code) };
}

test("builds then publishes a loopback server; abort stops Serve and the app", async () => {
  const h = harness(); const controller = new AbortController();
  const sharing = shareApp(config, controller.signal, 8443, h.deps);
  await h.started;
  expect(h.commands).toEqual([
    ["tailscale", "status", "--json"], ["tailscale", "serve", "status", "--json"],
    ["bun", "--bun", "vite", "build"], ["tailscale", "serve", "--https=8443", "http://127.0.0.1:3001"],
  ]);
  expect(h.start).toHaveBeenCalledWith(expect.objectContaining({ hostname: "127.0.0.1", staticDir: expect.stringContaining("dist") }));
  controller.abort();
  await expect(sharing).rejects.toThrow("Sharing stopped");
  expect(h.killed).toEqual(["tailscale serve --https=8443 http://127.0.0.1:3001"]);
  expect(h.stop).toHaveBeenCalledTimes(1);
});

test.each([0, 1])("Serve exiting with code %s always stops the server", async code => {
  const h = harness(); const sharing = shareApp(config, new AbortController().signal, 443, h.deps);
  await h.started; h.endServe(code);
  if (code) await expect(sharing).rejects.toThrow("Tailscale Serve stopped"); else await sharing;
  expect(h.stop).toHaveBeenCalledTimes(1);
});

test.each([
  { TCP: { "443": { HTTPS: true } } },
  { Foreground: { session: { Web: { "host:443": { Handlers: {} } } } } },
  { AllowFunnel: { "host:443": true } },
])("does not overwrite existing Serve or Funnel configuration", async serving => {
  const h = harness({ serving });
  await expect(shareApp(config, new AbortController().signal, 443, h.deps)).rejects.toThrow("already in use");
  expect(h.start).not.toHaveBeenCalled();
  expect(h.commands).toHaveLength(2);
});

test.each([
  [{ state: "NeedsLogin" }, "Connect this machine"], [{ buildCode: 1 }, "Build failed"], [{ startError: true }, "port occupied"],
] as const)("startup failure does not publish the app", async (settings, message) => {
  const h = harness(settings);
  await expect(shareApp(config, new AbortController().signal, 443, h.deps)).rejects.toThrow(message);
  expect(h.commands.some(args => args[2]?.startsWith("--https"))).toBe(false);
});

test("aborting a build stops it and never starts the app", async () => {
  const h = harness({ holdBuild: true }); const controller = new AbortController();
  const sharing = shareApp(config, controller.signal, 443, h.deps);
  await h.started; controller.abort();
  await expect(sharing).rejects.toThrow("Sharing stopped");
  expect(h.killed).toEqual(["bun --bun vite build"]);
  expect(h.start).not.toHaveBeenCalled();
});
