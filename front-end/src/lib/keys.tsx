"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { getDesktop } from "./desktop";

/**
 * Whether the app has an OpenAI key, and how to change it.
 *
 * Only the desktop build manages one. In a browser the key belongs to the server
 * the renderer is talking to — it is in `back-end/.env` and the front-end has no
 * business knowing it — so `managed` is false and nothing here gates anything.
 *
 * The value itself is never held. `stored` says whether one exists, `save` sends
 * a new one to the keychain, and that is the whole surface: main reads it back
 * when it needs it, so the renderer never has it in memory after the form closes.
 */
export interface KeysValue {
  /** The store has been read. Until then there is nothing true to render. */
  ready: boolean;
  /** There is a keychain to write to at all — that is, this is the desktop app. */
  managed: boolean;
  /** A key is available. Always true in the browser, where the server holds it. */
  stored: boolean;
  save: (value: string) => Promise<void>;
  clear: () => Promise<void>;
}

const KeysContext = createContext<KeysValue | null>(null);

export function KeysProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [managed, setManaged] = useState(false);
  const [stored, setStored] = useState(false);

  /**
   * Read once on mount rather than derived at render.
   *
   * `window.desktop` cannot be consulted while rendering: the page is
   * prerendered, so the server would decide there is no bridge and the client
   * would disagree the moment it hydrated.
   */
  useEffect(() => {
    let cancelled = false;

    async function read(): Promise<void> {
      const bridge = getDesktop();
      const has = bridge === null ? true : await bridge.key.status();

      if (cancelled) {
        return;
      }

      setManaged(bridge !== null);
      setStored(has);
      setReady(true);
    }

    void read();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (value: string): Promise<void> => {
    const bridge = getDesktop();

    if (bridge === null) {
      throw new Error(
        "Secure storage is unavailable — this is the browser build, which reads the key from the server.",
      );
    }

    await bridge.key.save(value);
    setStored(true);
  }, []);

  const clear = useCallback(async (): Promise<void> => {
    const bridge = getDesktop();

    if (bridge === null) {
      return;
    }

    await bridge.key.clear();
    setStored(false);
  }, []);

  const value = useMemo<KeysValue>(
    () => ({ ready, managed, stored, save, clear }),
    [ready, managed, stored, save, clear],
  );

  return <KeysContext.Provider value={value}>{children}</KeysContext.Provider>;
}

export function useKeys(): KeysValue {
  const value = useContext(KeysContext);

  if (value === null) {
    throw new Error("useKeys must be used inside a KeysProvider.");
  }

  return value;
}
