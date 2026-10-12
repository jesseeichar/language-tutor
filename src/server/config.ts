import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");

export interface ServerConfig {
  dataDir: string;
  progressPath: string;
  port: number;
  typesafeApiKey?: string;
  typesafeModel?: string;
}

/** Reads settings from the environment. Bun loads .env automatically. */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  if (env.LT_DB_PATH !== undefined) {
    throw new Error("LT_DB_PATH is no longer supported. Remove it and use LT_PROGRESS_PATH (default: data/progress.json). SQLite progress is not imported.");
  }
  return {
    dataDir: resolve(projectRoot, env.LT_DATA_DIR ?? "data"),
    progressPath: resolve(projectRoot, env.LT_PROGRESS_PATH ?? "data/progress.json"),
    typesafeApiKey: env.TYPESAFE_API_KEY?.trim() || undefined,
    typesafeModel: env.TYPESAFE_MODEL?.trim() || "jev-latest",
    port: Number(env.LT_API_PORT ?? 3001),
  };
}

export { projectRoot };
