import { DurableObject } from "cloudflare:workers";

interface Env {
  RELAY: DurableObjectNamespace<Relay>;
  /**
   * The only server allowed to connect: its key, as the mod logs it. A secret, so redeploying keeps
   * it. Until it's set, the relay refuses every server
   */
  OWNER_KEY?: string;
}

const PROTOCOL = "1";
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 64 * 1024;
// Refuses a server while OWNER_KEY isn't set so the mod can tell the owner what to set it to
const NOT_SET_UP = 428;
// WebSocket close code for a connection replaced by a newer one from the same server
const REPLACED = 4000;

const CORS = { "Access-Control-Allow-Origin": "*" };

interface RequestFrame {
  id: string;
  method: string;
  path: string;
  authorization?: string;
  client: string;
  body?: string;
}

interface ResponseFrame {
  id: string;
  status: number;
  body?: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function base64UrlDecode(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/connect" || url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...CORS,
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
            "Access-Control-Allow-Headers": "authorization, content-type",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      return env.RELAY.get(env.RELAY.idFromName("relay")).fetch(request);
    }
    if (url.pathname === "/") {
      return new Response(
        "Tidings relay. Put this address in the mod's relay-url setting.\n",
        {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }
    return json(404, { error: "Not found" });
  },
} satisfies ExportedHandler<Env>;

interface Waiting {
  connection: string;
  answer: (frame: ResponseFrame) => void;
}

interface Attachment {
  connection: string;
}

export class Relay extends DurableObject<Env> {
  private readonly waiting = new Map<string, Waiting>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    return url.pathname === "/connect"
      ? this.acceptServer(request, url)
      : this.forward(request, url);
  }

  private async acceptServer(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket\n", { status: 400 });
    }
    if (request.headers.get("X-Tidings-Protocol") !== PROTOCOL) {
      return new Response(
        `This relay speaks protocol ${PROTOCOL}: update it or the mod\n`,
        {
          status: 426,
        },
      );
    }
    const key = request.headers.get("X-Tidings-Key");
    const time = Number(request.headers.get("X-Tidings-Time"));
    const signature = request.headers.get("X-Tidings-Signature");
    if (!key || !signature || !Number.isInteger(time)) {
      return new Response("Missing signature\n", { status: 401 });
    }
    if (Math.abs(Date.now() / 1000 - time) > MAX_CLOCK_SKEW_SECONDS) {
      return new Response("Signature too old: is the server's clock right?\n", {
        status: 401,
      });
    }
    let valid = false;
    try {
      const publicKey = await crypto.subtle.importKey(
        "raw",
        base64UrlDecode(key),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      valid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        base64UrlDecode(signature),
        new TextEncoder().encode(`tidings-relay\n${url.host}\n${time}`),
      );
    } catch {
      // Malformed
    }
    if (!valid) return new Response("Invalid signature\n", { status: 401 });

    // Checked once the signature is: only the key's holder learns the relay isn't set up
    const owner = this.env.OWNER_KEY?.trim();
    if (!owner) {
      return new Response(
        "Set this relay's OWNER_KEY secret to the key the mod logs\n",
        { status: NOT_SET_UP },
      );
    }
    if (owner !== key) {
      return new Response("This relay belongs to another server\n", {
        status: 403,
      });
    }

    for (const old of this.ctx.getWebSockets()) {
      old.close(REPLACED, "Replaced by a newer connection");
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      connection: crypto.randomUUID(),
    } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async forward(request: Request, url: URL): Promise<Response> {
    const [socket] = this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === WebSocket.OPEN);
    if (!socket) return json(502, { error: "The server is offline" });

    let body: string | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.text();
      if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
        return json(413, { error: "Request too large" });
      }
    }
    const frame: RequestFrame = {
      id: crypto.randomUUID(),
      method: request.method,
      path: url.pathname,
      authorization: request.headers.get("Authorization") ?? undefined,
      client: request.headers.get("CF-Connecting-IP") ?? "unknown",
      body,
    };
    const { connection } = socket.deserializeAttachment() as Attachment;
    const reply = await new Promise<ResponseFrame | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.waiting.delete(frame.id);
        resolve(null);
      }, REQUEST_TIMEOUT_MS);
      this.waiting.set(frame.id, {
        connection,
        answer: (reply) => {
          clearTimeout(timeout);
          this.waiting.delete(frame.id);
          resolve(reply);
        },
      });
      try {
        socket.send(JSON.stringify(frame));
      } catch {
        this.waiting.get(frame.id)?.answer({ id: frame.id, status: 502 });
      }
    });
    if (!reply) return json(504, { error: "The server didn't answer in time" });
    if (reply.body === undefined) {
      return reply.status === 502
        ? json(502, { error: "The server is offline" })
        : new Response(null, { status: reply.status, headers: CORS });
    }
    return new Response(reply.body, {
      status: reply.status,
      headers: {
        ...CORS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  override async webSocketMessage(
    _ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== "string") return;
    let reply: ResponseFrame;
    try {
      reply = JSON.parse(message) as ResponseFrame;
    } catch {
      return;
    }
    this.waiting.get(reply.id)?.answer(reply);
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    const { connection } = ws.deserializeAttachment() as Attachment;
    for (const [id, waiting] of this.waiting) {
      if (waiting.connection === connection)
        waiting.answer({ id, status: 502 });
    }
    try {
      ws.close(code, reason);
    } catch {
      // Closed already
    }
  }
}
