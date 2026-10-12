import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { emptyProgress, parseProgress, type ProgressData } from "./progress-schema";

function read(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** One active writer per file. null provides isolated, in-memory storage for tests. */
export class ProgressFile {
  private previous: string | null;
  private changedExternally = false;

  constructor(private readonly path: string | null) {
    this.previous = path === null ? null : read(path);
  }

  load(): ProgressData {
    if (this.previous === null) return emptyProgress();
    try {
      return parseProgress(JSON.parse(this.previous));
    } catch (error) {
      throw new Error(`Invalid progress file ${this.path}. Fix the file or restore it from Git before restarting. ${error}`);
    }
  }

  private checkUnchanged(): void {
    if (this.path !== null && read(this.path) !== this.previous) this.changedExternally = true;
    if (this.changedExternally) {
      throw new Error(`Progress file ${this.path} changed outside this server. Restart the server before saving more progress.`);
    }
  }

  save(data: ProgressData): void {
    if (this.path === null) return;
    this.checkUnchanged();
    const text = `${JSON.stringify(data, null, 2)}\n`;
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${crypto.randomUUID()}.tmp`;
    const fd = openSync(temporary, "wx", 0o600);
    let closed = false;
    try {
      writeFileSync(fd, text, "utf8");
      fsyncSync(fd);
      closeSync(fd);
      closed = true;
      this.checkUnchanged();
      renameSync(temporary, this.path);
      this.previous = text;
    } finally {
      if (!closed) closeSync(fd);
      try {
        unlinkSync(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}
