import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorSnapshot } from "../../shared";
import { api, ApiRequestError } from "../api";

export interface MembershipIntent {
  modeId: string;
  questionId: string;
  categoryId: string;
  /** true adds the direct assignment, false removes it. */
  member: boolean;
}

export interface ListMembership {
  /** The saved content, kept current through every successful save. null until loaded. */
  snapshot: EditorSnapshot | null;
  pending: boolean;
  error: unknown;
  /** Repeats whatever failed last: the initial load or a membership change. */
  retry: (() => void) | null;
  setMembership: (intent: MembershipIntent) => void;
}

/**
 * Loads the editor snapshot once and applies list membership changes to it. A change is an
 * explicit add or remove, so when the content moved on since the snapshot was taken (409) the
 * same intent is applied to the reloaded content instead of failing. Nothing is fetched while
 * `enabled` is false, so modes without lists cost nothing.
 */
export function useListMembership(enabled: boolean): ListMembership {
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ error: unknown; retry: () => void } | null>(null);
  const busy = useRef(false);
  const current = useRef<EditorSnapshot | null>(null);

  const publish = useCallback((next: EditorSnapshot) => {
    current.current = next;
    setSnapshot(next);
  }, []);

  const load = useCallback(() => {
    setFailure(null);
    api.editor().then(publish, (error: unknown) => setFailure({ error, retry: load }));
  }, [publish]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const setMembership = useCallback((intent: MembershipIntent) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure(null);
    const change = { kind: "set-list-membership" as const, ...intent };
    const save = async (): Promise<EditorSnapshot> => {
      const base = current.current ?? (await api.editor());
      try {
        return await api.editContent({ revision: base.revision, change });
      } catch (e) {
        if (!(e instanceof ApiRequestError && e.status === 409)) throw e;
        const reloaded = await api.editor();
        return await api.editContent({ revision: reloaded.revision, change });
      }
    };
    save()
      .then(publish, (error: unknown) => setFailure({ error, retry: () => setMembership(intent) }))
      .finally(() => {
        busy.current = false;
        setPending(false);
      });
  }, [publish]);

  return { snapshot, pending, error: failure?.error ?? null, retry: failure?.retry ?? null, setMembership };
}
