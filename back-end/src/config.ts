import "dotenv/config";

/**
 * Everything the back-end needs from its environment.
 *
 * Resolved on first use rather than at import, and overridable before then. Both
 * matter to the Electron shell, which imports these modules into its main process
 * rather than running the server: the key comes out of the OS keychain instead of
 * a `.env`, and the data directory is `app.getPath("userData")` instead of a path
 * relative to the working directory — which for a packaged app is wherever the
 * user happened to launch it from.
 *
 * Resolving at import made that impossible in the sharpest way. `required()` threw
 * while the module was being loaded, so importing anything that reached config
 * failed before the shell had a chance to supply one.
 */
export interface Runtime {
  port: number;
  openaiApiKey: string;
  openaiModel: string;
  openaiSummaryModel: string;
  dataDir: string;
  corsOrigins: string[];
}

let overrides: Partial<Runtime> = {};
let resolved: Runtime | null = null;

/**
 * Supplies values the environment does not have.
 *
 * Anything omitted still falls back to `process.env`, so the standalone server
 * keeps reading `.env` and nothing about `npm run dev` changes. Callable more than
 * once — the shell reconfigures when the user changes their key — and the next
 * read picks it up.
 */
export function configure(next: Partial<Runtime>): void {
  overrides = { ...overrides, ...next };
  resolved = null;
}

function required(name: string, override: string | undefined): string {
  const value = override ?? process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }

  return value.trim();
}

function optional(
  name: string,
  override: string | undefined,
  fallback: string,
): string {
  const value = override ?? process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

function resolveRuntime(): Runtime {
  const chatModel = optional(
    "OPENAI_MODEL",
    overrides.openaiModel,
    "gpt-4o-mini",
  );

  const port =
    overrides.port ?? Number.parseInt(optional("PORT", undefined, "4000"), 10);

  if (Number.isNaN(port)) {
    throw new Error("PORT must be a number.");
  }

  return {
    port,
    openaiApiKey: required("OPENAI_API_KEY", overrides.openaiApiKey),
    openaiModel: chatModel,
    // Summaries are a trivial one-sentence job, so they can stay on a small model
    // even when the conversation itself is pointed at a larger one.
    openaiSummaryModel: optional(
      "OPENAI_SUMMARY_MODEL",
      overrides.openaiSummaryModel,
      chatModel,
    ),
    // Where session JSON lives. The shell points this at app.getPath("userData");
    // the default keeps dev self-contained.
    dataDir: optional("DATA_DIR", overrides.dataDir, "./data"),
    corsOrigins:
      overrides.corsOrigins ??
      optional("CORS_ORIGIN", undefined, "http://localhost:3000")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ""),
  };
}

/**
 * The resolved configuration.
 *
 * Throws on the first call if the key is missing — late enough for the shell to
 * have injected one, and early enough that no request gets halfway.
 */
export function config(): Runtime {
  resolved ??= resolveRuntime();
  return resolved;
}

/**
 * Whether a key is available, without throwing to find out.
 *
 * The shell asks before opening a window. No key is a first-run state to be
 * handled, not a failure to report.
 */
export function hasApiKey(): boolean {
  const value = overrides.openaiApiKey ?? process.env.OPENAI_API_KEY;
  return value !== undefined && value.trim() !== "";
}
