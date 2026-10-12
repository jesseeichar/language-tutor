import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Flush before publishing; failed writes leave the destination intact. */
export function replaceFile(path: string, text: string, checkUnchanged: () => void): void {
  checkUnchanged();
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  let closed = false;
  try {
    writeFileSync(fd, text, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    closed = true;
    checkUnchanged();
    renameSync(temporary, path);
  } finally {
    if (!closed) closeSync(fd);
    try { unlinkSync(temporary); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
