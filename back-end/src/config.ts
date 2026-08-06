import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }

  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

const chatModel = optional("OPENAI_MODEL", "gpt-4o-mini");

export const config = {
  port: Number.parseInt(optional("PORT", "4000"), 10),
  openaiApiKey: required("OPENAI_API_KEY"),
  openaiModel: chatModel,
  // Summaries are a trivial one-sentence job, so they can stay on a small model
  // even when the conversation itself is pointed at a larger one.
  openaiSummaryModel: optional("OPENAI_SUMMARY_MODEL", chatModel),
  // Where session JSON lives. Electron will point this at app.getPath("userData");
  // the default keeps dev self-contained.
  dataDir: optional("DATA_DIR", "./data"),
  corsOrigins: optional("CORS_ORIGIN", "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ""),
} as const;

if (Number.isNaN(config.port)) {
  throw new Error("PORT must be a number.");
}
