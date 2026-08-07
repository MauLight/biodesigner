import { app, safeStorage } from "electron";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

/**
 * The user's OpenAI key, encrypted at rest by the OS keychain.
 *
 * The only place the key is persisted. It never travels over the bridge during a
 * request — main reads it here and hands it to the back-end's config — so the
 * renderer touches it only while a settings form is open, and never at all once
 * one is saved.
 */

/** Ciphertext, so the extension should not suggest anything readable. */
const FILE = "credentials.bin";

function storePath(): string {
  return path.join(app.getPath("userData"), FILE);
}

function assertEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "This system's secure storage is unavailable, so the key can't be saved safely.",
    );
  }
}

/**
 * Returns the stored key, or null when there is none.
 *
 * Deliberately forgiving: a missing file, a failed decrypt (keychain reset, or
 * the file copied to another machine) and corrupt contents all mean "no key",
 * which is a first-run state rather than an error.
 */
export async function loadKey(): Promise<string | null> {
  try {
    const encrypted = await readFile(storePath());
    const decrypted = safeStorage.decryptString(encrypted).trim();

    return decrypted === "" ? null : decrypted;
  } catch {
    return null;
  }
}

export async function saveKey(value: unknown): Promise<void> {
  if (typeof value !== "string" || value.trim() === "" || value.length > 512) {
    throw new Error("An OpenAI API key is required.");
  }

  assertEncryption();

  await writeFile(storePath(), safeStorage.encryptString(value.trim()), {
    mode: 0o600,
  });
}

export async function clearKey(): Promise<void> {
  await rm(storePath(), { force: true });
}
