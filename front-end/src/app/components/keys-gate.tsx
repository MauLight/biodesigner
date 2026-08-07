"use client";

import type { ReactNode } from "react";

import { useKeys } from "@/lib/keys";
import KeyForm from "./key-form";

/**
 * Holds the app back until there is a key to work with.
 *
 * Nothing downstream has to check for one, because no request can be made from
 * behind this. Only the desktop build is gated: in a browser the key belongs to
 * the server, and gating there would demand something the user has no way to
 * give.
 */
export default function KeysGate({ children }: { children: ReactNode }) {
  const { ready, managed, stored } = useKeys();

  // Reading the keychain takes a tick. Render nothing rather than flashing the
  // setup form at someone who set their key up months ago.
  if (!ready) {
    return null;
  }

  if (managed && !stored) {
    return <KeyForm />;
  }

  return <>{children}</>;
}
