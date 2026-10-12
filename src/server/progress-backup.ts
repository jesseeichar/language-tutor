import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { env } from "node:process";
import { modes, type BackupProgressResponse } from "../shared";
import { loadContent } from "./content";
import { parseProgress } from "./progress-schema";

export class ProgressBackupError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

/** Git arguments are fixed by the server; the browser supplies no paths or commands. */
export class ProgressBackup {
  private busy = false;

  constructor(private readonly repository: string, private readonly progressPath: string | null, private readonly dataDir?: string) {}

  private async git(args: string[], failure: string, allowed = [0]): Promise<string> {
    let process;
    try {
      process = Bun.spawn(["git", "--literal-pathspecs", ...args], {
        cwd: this.repository,
        env: { ...env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" },
        stdin: "ignore", stdout: "pipe", stderr: "pipe",
      });
    } catch {
      throw new ProgressBackupError("Git could not start. Install Git on the server and try again.", 500);
    }
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; process.kill("SIGKILL"); }, 30_000);
    try {
      const [code, stdout, stderr] = await Promise.all([
        process.exited, new Response(process.stdout).text(), new Response(process.stderr).text(),
      ]);
      if (timedOut) throw new ProgressBackupError(`${failure} Git timed out; check connectivity and authentication, then retry.`, 502);
      if (!allowed.includes(code)) {
        // Remote URLs and credential helpers can print secrets; never send raw Git output to the browser.
        let hint = "Check the repository's Git setup and try again.";
        if (/keychain|Device not configured|-25308/i.test(stderr)) {
          hint = "The login keychain is locked. Run your keychain unlock script on the server, then retry.";
        } else if (/authenticat|could not read|permission denied|terminal prompts disabled/i.test(stderr)) {
          hint = "Check Git authentication on the server, then retry.";
        } else if (/non-fast-forward|fetch first|\[rejected\]/i.test(stderr)) {
          hint = "The remote has changes. Stop the app, reconcile the branch with Git, restart, and retry. Nothing was force-pushed.";
        } else if (/identity unknown|unable to auto-detect email/i.test(stderr)) {
          hint = "Configure Git user.name and user.email on the server, then retry.";
        }
        throw new ProgressBackupError(`${failure} ${hint}`, 502);
      }
      return stdout.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async backup(): Promise<BackupProgressResponse> {
    if (this.busy) throw new ProgressBackupError("A progress backup is already running. Wait for it to finish.");
    this.busy = true;
    try {
      return await this.performBackup();
    } finally {
      this.busy = false;
    }
  }

  private async performBackup(): Promise<BackupProgressResponse> {
    const files: string[] = [];
    if (this.progressPath && existsSync(this.progressPath)) {
      try { parseProgress(JSON.parse(readFileSync(this.progressPath, "utf8"))); }
      catch { throw new ProgressBackupError("The progress file is invalid. Fix it or restore it from Git before backing up."); }
      files.push(this.progressPath);
    }
    if (this.dataDir) {
      await loadContent(this.dataDir);
      files.push(join(this.dataDir, "categories.json"));
      files.push(...modes.map((m) => join(this.dataDir!, "questions", `${m.id}.json`)).filter(existsSync));
    }
    if (!files.length) throw new ProgressBackupError("No saved progress to back up yet. Start a study session first.");
    const root = realpathSync(await this.git(["rev-parse", "--show-toplevel"], "The app is not inside a Git repository."));
    const paths = files.map((file) => {
      if (lstatSync(file).isSymbolicLink()) throw new ProgressBackupError("Backup files must not be symbolic links.");
      const path = relative(root, realpathSync(file));
      if (path.startsWith("../") || isAbsolute(path) || path.split("/").includes(".git")) {
        throw new ProgressBackupError("Backup files must be inside this Git repository.");
      }
      return relative(realpathSync(this.repository), realpathSync(file));
    });
    const branch = await this.git(["symbolic-ref", "--quiet", "--short", "HEAD"], "Check out a branch before backing up.");
    await this.git(["rev-parse", "--verify", "HEAD"], "Commit the project before backing up progress.");
    if (await this.git(["ls-files", "--unmerged"], "Could not inspect Git conflicts.")) {
      throw new ProgressBackupError("Resolve Git conflicts before backing up progress.");
    }
    for (const state of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"]) {
      const statePath = await this.git(["rev-parse", "--git-path", state], "Could not inspect Git state.");
      if (existsSync(resolve(this.repository, statePath))) throw new ProgressBackupError("Finish the current Git merge or rebase before backing up progress.");
    }
    const remote = await this.git(["config", "--get", `branch.${branch}.remote`], "Could not read the upstream remote.", [0, 1]) || "origin";
    const target = await this.git(["config", "--get", `branch.${branch}.merge`], "Could not read the upstream branch.", [0, 1]) || `refs/heads/${branch}`;
    if (remote === "." || remote.startsWith("-") || !target.startsWith("refs/heads/")) {
      throw new ProgressBackupError("Configure a remote branch as this branch's upstream before backing up.");
    }
    await this.git(["remote", "get-url", "--push", remote], `No usable ${remote} remote is configured.`);
    await this.git(["check-ref-format", target], "The upstream branch name is invalid.");
    await this.git(["add", "--", ...paths], "Could not stage progress. Ensure the progress file is not ignored.");
    const changes = await this.git(["diff", "--cached", "--name-only", "HEAD", "--", ...paths], "Could not inspect progress changes.");
    const createdCommit = changes.length > 0;
    if (createdCommit) {
      await this.git(["commit", "--only", "-m", "Save study data", "--", ...paths], "Could not commit progress.");
    }
    const commit = await this.git(["rev-parse", "HEAD"], "Could not read the progress commit.");
    // An explicit refspec avoids push.default or remote push rules sending other branches/tags.
    await this.git(["-c", "push.followTags=false", "push", remote, `${commit}:${target}`],
      "Changes are committed locally, but pushing failed. You can retry the backup.");
    return { commit, remote, branch: target.slice("refs/heads/".length), createdCommit };
  }
}
