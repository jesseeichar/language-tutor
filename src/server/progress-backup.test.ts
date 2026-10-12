import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProgressBackup } from "./progress-backup";
import { emptyProgress } from "./progress-schema";

let dir: string;
let repo: string;
let remote: string;
let progress: string;
let backup: ProgressBackup;

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, env: {
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
  } });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lt-git-backup-"));
  repo = join(dir, "app");
  remote = join(dir, "remote.git");
  mkdirSync(repo);
  git(dir, "init", "--bare", remote);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Backup Test");
  git(repo, "config", "user.email", "backup@example.invalid");
  git(repo, "config", "commit.gpgSign", "false");
  git(repo, "config", "core.hooksPath", join(repo, ".git", "hooks"));
  writeFileSync(join(repo, "code.txt"), "original\n");
  git(repo, "add", "code.txt");
  git(repo, "commit", "-m", "Initial project");
  git(repo, "remote", "add", "origin", remote);
  mkdirSync(join(repo, "data"));
  progress = join(repo, "data", "progress.json");
  writeFileSync(progress, JSON.stringify(emptyProgress()));
  backup = new ProgressBackup(repo, progress);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("progress Git backup", () => {
  test("commits and pushes only progress while preserving staged and unstaged work", async () => {
    writeFileSync(join(repo, "code.txt"), "staged code\n");
    git(repo, "add", "code.txt");
    writeFileSync(join(repo, "code.txt"), "unstaged code\n");
    writeFileSync(join(repo, "untracked.txt"), "untracked\n");
    const result = await backup.backup();
    expect(result).toMatchObject({ remote: "origin", branch: "main", createdCommit: true });
    expect(git(remote, "rev-parse", "main")).toBe(result.commit);
    expect(git(remote, "show", "main:data/progress.json")).toBe(readFileSync(progress, "utf8"));
    expect(git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")).toBe("data/progress.json");
    expect(git(repo, "show", ":code.txt")).toBe("staged code");
    expect(readFileSync(join(repo, "code.txt"), "utf8")).toBe("unstaged code\n");
    expect(git(repo, "show", "HEAD:code.txt")).toBe("original");
    expect(git(repo, "status", "--short")).toContain("?? untracked.txt");
    const again = await backup.backup();
    expect(again).toMatchObject({ commit: result.commit, createdCommit: false });
  });

  test("uses the configured upstream branch, including a different name", async () => {
    git(repo, "push", "origin", "HEAD:refs/heads/study");
    git(repo, "config", "branch.main.remote", "origin");
    git(repo, "config", "branch.main.merge", "refs/heads/study");
    const result = await backup.backup();
    expect(result.branch).toBe("study");
    expect(git(remote, "rev-parse", "study")).toBe(result.commit);
  });

  test("keeps a local commit after push rejection and retries without another commit", async () => {
    const hook = join(remote, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    await expect(backup.backup()).rejects.toThrow("Progress is committed locally, but pushing failed");
    const commit = git(repo, "rev-parse", "HEAD");
    rmSync(hook);
    const result = await backup.backup();
    expect(result).toMatchObject({ commit, createdCommit: false });
    expect(git(remote, "rev-parse", "main")).toBe(commit);
  });

  test("does not force push a diverged remote", async () => {
    await backup.backup();
    const other = join(dir, "other");
    git(dir, "clone", "--branch", "main", remote, other);
    git(other, "config", "user.name", "Other Test");
    git(other, "config", "user.email", "other@example.invalid");
    writeFileSync(join(other, "other.txt"), "other work\n");
    git(other, "add", ".");
    git(other, "commit", "-m", "Remote change");
    git(other, "push", "origin", "main");
    const remoteCommit = git(remote, "rev-parse", "main");
    writeFileSync(progress, `${JSON.stringify(emptyProgress(), null, 2)}\n`);
    await expect(backup.backup()).rejects.toThrow("The remote has changes");
    expect(git(remote, "rev-parse", "main")).toBe(remoteCommit);
  });

  test("rejects overlapping backups", async () => {
    const first = backup.backup();
    await expect(backup.backup()).rejects.toThrow("already running");
    await first;
  });

  test("handles a literal filename containing Git pathspec syntax", async () => {
    const special = join(repo, "data", "[progress].json");
    writeFileSync(special, JSON.stringify(emptyProgress()));
    await new ProgressBackup(repo, special).backup();
    expect(git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")).toBe("data/[progress].json");
  });

  test("missing and invalid progress do not create commits", async () => {
    const before = git(repo, "rev-parse", "HEAD");
    await expect(new ProgressBackup(repo, null).backup()).rejects.toThrow("No saved progress");
    writeFileSync(progress, "{broken");
    await expect(backup.backup()).rejects.toThrow("progress file is invalid");
    expect(git(repo, "rev-parse", "HEAD")).toBe(before);
  });

  test("ignored progress is not force-added", async () => {
    const before = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo, ".gitignore"), "data/progress.json\n");
    await expect(backup.backup()).rejects.toThrow("Ensure the progress file is not ignored");
    expect(git(repo, "rev-parse", "HEAD")).toBe(before);
  });

  test("rejects files outside the repository and symbolic links", async () => {
    const outside = join(dir, "outside.json");
    writeFileSync(outside, JSON.stringify(emptyProgress()));
    await expect(new ProgressBackup(repo, outside).backup()).rejects.toThrow("inside this Git repository");
    rmSync(progress);
    symlinkSync(outside, progress);
    await expect(backup.backup()).rejects.toThrow("symbolic link");
  });

  test("missing remote, detached HEAD and ongoing Git operations fail before committing", async () => {
    const before = git(repo, "rev-parse", "HEAD");
    git(repo, "remote", "remove", "origin");
    await expect(backup.backup()).rejects.toThrow("No usable origin remote");
    git(repo, "remote", "add", "origin", remote);
    git(repo, "checkout", "--detach");
    await expect(backup.backup()).rejects.toThrow("Check out a branch");
    git(repo, "checkout", "main");
    writeFileSync(join(repo, ".git", "MERGE_HEAD"), before);
    await expect(backup.backup()).rejects.toThrow("Finish the current Git merge or rebase");
    expect(git(repo, "rev-parse", "HEAD")).toBe(before);
  });

  test("commit hook failures leave unrelated staged files intact and allow retry", async () => {
    writeFileSync(join(repo, "code.txt"), "staged\n");
    git(repo, "add", "code.txt");
    const before = git(repo, "rev-parse", "HEAD");
    const hook = join(repo, ".git", "hooks", "pre-commit");
    writeFileSync(hook, "#!/bin/sh\necho 'secret-token' >&2\nexit 1\n", { mode: 0o755 });
    const error = await backup.backup().catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("Could not commit progress");
    expect(String(error)).not.toContain("secret-token");
    expect(git(repo, "rev-parse", "HEAD")).toBe(before);
    expect(git(repo, "show", ":code.txt")).toBe("staged");
    rmSync(hook);
    expect((await backup.backup()).createdCommit).toBe(true);
  });
});
