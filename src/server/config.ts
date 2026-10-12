import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");

export interface ServerConfig {
  dataDir: string;
  dbPath: string;
  port: number;
}

/** Reads settings from the environment. Bun loads .env automatically. */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    dataDir: resolve(projectRoot, env.LT_DATA_DIR ?? "data"),
    dbPath: resolve(projectRoot, env.LT_DB_PATH ?? "storage/progress.sqlite"),
    port: Number(env.LT_API_PORT ?? 3001),
  };
}

export { projectRoot };
