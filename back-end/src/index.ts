import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { APIError } from "openai";

import { config } from "./config.js";
import { chatRouter } from "./routes/chat.js";
import { summarizeRouter } from "./routes/summarize.js";
import { sessionsRouter } from "./routes/sessions.js";

const app = express();

app.use(cors({ origin: config.corsOrigins }));
// Generous enough for a long session document, which is the biggest thing the
// client ever sends.
app.use(express.json({ limit: "8mb" }));

app.get("/health", function health(_req: Request, res: Response): void {
  res.json({
    status: "ok",
    model: config.openaiModel,
    summaryModel: config.openaiSummaryModel,
  });
});

app.use("/api", chatRouter);
app.use("/api", summarizeRouter);
app.use("/api", sessionsRouter);

app.use(function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found." });
});

app.use(function onError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof APIError) {
    console.error(`OpenAI error ${error.status ?? "?"}:`, error.message);
    res.status(error.status ?? 502).json({ error: error.message });
    return;
  }

  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(config.port, function onListen(): void {
  console.log(`BioDesigner API listening on http://localhost:${config.port}`);
  console.log(`Model: ${config.openaiModel}`);
});
