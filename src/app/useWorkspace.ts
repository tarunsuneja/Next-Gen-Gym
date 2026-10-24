import { clearPhotoCache } from "../data/photos";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  liveAction,
  liveLoad,
  liveRefresh,
  sendWhatsApp,
  supabase,
  type Action,
} from "../api";
import { id, type Data, type StaffRole } from "../domain";
import { friendlyError } from "../errors";
import { CommittedRefreshError } from "../data/commandResult";

type Callbacks = {
  onSignedOut: () => void;
  onSaved: () => void;
  flash: (message: string) => void;
};
/** Owns server state and rejects responses from superseded requests or sessions. */
export function useWorkspace(online: boolean, callbacks: Callbacks) {
  const effects = useRef(callbacks);
  effects.current = callbacks;
  const [data, setData] = useState<Data | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole>("reception");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshed, setRefreshed] = useState("");
  const epoch = useRef(0),
    generation = useRef(0),
    locked = useRef(false),
    identity = useRef<string | null>(null);
  const sendRequests = useRef(new Map<string, string>());
  const alive = useRef(true);
  const loadController = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      loadController.current?.abort();
      epoch.current++;
    };
  }, []);
  const readWorkspace = useCallback(async (full: boolean) => {
    if (locked.current) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const auth = epoch.current,
      request = ++generation.current;
    const deadline = setTimeout(
      () =>
        controller.abort(
          new DOMException(
            "Workspace loading timed out. Please retry.",
            "TimeoutError",
          ),
        ),
      30000,
    );
    setBusy(true);
    try {
      const [workspace, access] = await Promise.all([
        liveLoad(controller.signal, full),
        supabase!.rpc("my_role").abortSignal(controller.signal),
      ]);
      if (
        !alive.current ||
        auth !== epoch.current ||
        request !== generation.current
      )
        return;
      if (access.error) throw access.error;
      if (access.data !== "owner" && access.data !== "reception") {
        setData(null);
        setRole("reception");
        effects.current.onSignedOut();
        throw Error("No active gym access.");
      }
      setRole(access.data);
      setData(workspace);
      setRefreshed(new Date().toISOString());
      setError("");
    } catch (e) {
      if (
        alive.current &&
        auth === epoch.current &&
        request === generation.current
      ) {
        setData(null);
        setRole("reception");
        setError(
          (controller.signal as any).reason?.name === "TimeoutError"
            ? "Workspace loading timed out. Please retry."
            : friendlyError(e),
        );
      }
    } finally {
      clearTimeout(deadline);
      if (
        alive.current &&
        auth === epoch.current &&
        request === generation.current
      )
        setBusy(false);
    }
  }, []);
  const load = useCallback(() => readWorkspace(!!data && !data.dashboard), [data, readWorkspace]);
  const hydrate = useCallback(() => readWorkspace(true), [readWorkspace]);
  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    const update = (userId: string | null) => {
      if (disposed) return;
      if (identity.current !== userId) {
        loadController.current?.abort();
        epoch.current++;
        generation.current++;
        identity.current = userId;
        sendRequests.current.clear();
        clearPhotoCache();
        setData(null);
        setRole("reception");
        setError("");
        setBusy(false);
        effects.current.onSignedOut();
      }
      setSession(userId);
    };
    let receivedEvent = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      receivedEvent = true;
      update(s?.user.id ?? null);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!receivedEvent && !error) update(data.session?.user.id ?? null);
    });
    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (session) void load();
  }, [session]);
  const mutate = useCallback(
    async (action: Action, message = "Saved successfully"): Promise<Data | false> => {
      if (locked.current) return false;
      locked.current = true;
      loadController.current?.abort();
      const auth = epoch.current;
      const request = ++generation.current;
      setBusy(true);
      setError("");
      try {
        if (!online)
          throw Error("You are offline. Reconnect before saving changes.");
        const updated = await liveAction(action, data ?? undefined);
        if (
          !alive.current ||
          auth !== epoch.current ||
          request !== generation.current
        )
          return false;
        setData(updated);
        setRefreshed(new Date().toISOString());
        effects.current.onSaved();
        effects.current.flash(message);
        return updated;
      } catch (e) {
        if (alive.current && auth === epoch.current) {
          if (e instanceof CommittedRefreshError) {
            effects.current.onSaved();
            effects.current.flash(e.message);
          }
          setError(friendlyError(e));
        }
        return false;
      } finally {
        locked.current = false;
        if (alive.current && auth === epoch.current) setBusy(false);
      }
    },
    [online, data],
  );
  const sendMessage = useCallback(async (memberId: string, templateName: string) => {
    if (locked.current) return false;
    locked.current = true;
    loadController.current?.abort();
    const auth = epoch.current;
    ++generation.current;
    setBusy(true);
    setError("");
    try {
      if (!online)
        throw Error("You are offline. Reconnect before sending messages.");
      const key = memberId + ":" + templateName;
      const requestId = sendRequests.current.get(key) ?? id();
      sendRequests.current.set(key, requestId);
      await sendWhatsApp({ memberId, templateName, requestId });
      sendRequests.current.delete(key);
      if (!alive.current || auth !== epoch.current) return false;
      effects.current.flash("Message sent");
      try {
        const updated = data
          ? await liveRefresh(data, ["whatsapp"])
          : await liveLoad();
        if (alive.current && auth === epoch.current) {
          setData(updated);
          setRefreshed(new Date().toISOString());
        }
      } catch {
        if (auth === epoch.current)
          setError(
            "Message accepted, but the delivery log could not be refreshed. Refresh to see its status.",
          );
      }
      return true;
    } catch (e) {
      if (alive.current && auth === epoch.current) setError(friendlyError(e));
      return false;
    } finally {
      locked.current = false;
      if (alive.current && auth === epoch.current) setBusy(false);
    }
  }, [online, data]);
  return useMemo(
    () => ({
      data,
      session,
      role,
      busy,
      setBusy,
      error,
      setError,
      refreshed,
      load,
      hydrate,
      mutate,
      sendMessage,
    }),
    [data, session, role, busy, error, refreshed, load, hydrate, mutate, sendMessage],
  );
}
