import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";

/**
 * Serves the built renderer over http://127.0.0.1.
 *
 * The point is the origin, not the transport. `file://` is an opaque origin, and
 * the renderer needs a real one for the things a normal page takes for granted —
 * fetch, storage, and a `Origin` header that isn't `null`. Data does not come this
 * way: every request travels over IPC, so this serves static assets and nothing
 * else. No API routes, no credentials, nothing here worth attacking.
 *
 * Bound explicitly to the loopback interface, never 0.0.0.0, so the app is not
 * published to the local network.
 */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

export interface StaticServer {
  url: string;
  close: () => Promise<void>;
}

/** Resolves a request path to a file inside root, or null if it escapes. */
async function resolveFile(
  root: string,
  urlPath: string,
): Promise<string | null> {
  let decoded: string;

  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    // Malformed percent-encoding.
    return null;
  }

  const target = path.resolve(root, "." + path.posix.normalize(decoded));

  // Traversal guard: the resolved path must stay inside root.
  if (target !== root && !target.startsWith(root + path.sep)) {
    return null;
  }

  const candidates = decoded.endsWith("/")
    ? [path.join(target, "index.html")]
    : // A Next export writes /about as about.html, with about/index.html for
      // trailing-slash builds — try the file, then both directory forms.
      [target, `${target}.html`, path.join(target, "index.html")];

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);

      if (info.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next shape.
    }
  }

  return null;
}

function send(res: ServerResponse, status: number, file: string): void {
  res.writeHead(status, {
    "Content-Type":
      MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    // Assets are content-hashed by Next and the window is short-lived; skip
    // caching so a rebuilt renderer is never stale.
    "Cache-Control": "no-store",
  });

  createReadStream(file).pipe(res);
}

export async function serveRenderer(root: string): Promise<StaticServer> {
  const rootDir = path.resolve(root);

  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }

    const { pathname } = new URL(req.url ?? "/", "http://127.0.0.1");
    const file = await resolveFile(rootDir, pathname);

    if (file === null) {
      const notFound = await resolveFile(rootDir, "/404.html");

      if (notFound === null) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      } else {
        send(res, 404, notFound);
      }

      return;
    }

    send(res, 200, file);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500).end();
      }
    });
  });

  // Port 0: let the OS pick a free one, so nothing collides and the port is not
  // guessable from outside.
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
