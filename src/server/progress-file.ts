import { readFileSync } from "node:fs";
import { replaceFile } from "./atomic-file";
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
    replaceFile(this.path, text, () => this.checkUnchanged());
    this.previous = text;
  }
}
