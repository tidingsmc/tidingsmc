import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";

// Throwaway keys
const OWNER: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "e7EdYk0k8eFrEekTa4nIefl9e5gyI-hCbUDrZAT47eI",
  y: "P9VQDSMHdofkBne90JNP11cSagJFY-R64JKAVZjJ2Qc",
  d: "sQxrqa8pYbI0iXuxjvaCcjWpjseB1MqDooa1IpzZgdQ", // gitleaks:allow (test key)
};
const STRANGER: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "Xf08uvv10v0e6PwMUlIb2abavlYMFZxg2acjl5GY5Jc",
  y: "zHtfubhXswsZ_cT_LDPisLQcEaif2DbtvrMukAwEmb4",
  d: "dhd1FeDHsp83JmQ0y9q-z9JYpQAKSw7uGEnJ0lC0HGc", // gitleaks:allow (test key)
};

const RELAY = "https://relay.example.dev";

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function publicKeyOf(jwk: JsonWebKey): Promise<string> {
  const { d: _, ...publicJwk } = jwk;
  const key = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  return base64Url((await crypto.subtle.exportKey("raw", key)) as ArrayBuffer);
}

interface Connection {
  key?: JsonWebKey;
  host?: string;
  time?: number;
  protocol?: string;
  upgrade?: boolean;
}

async function connect({
  key = OWNER,
  host = "relay.example.dev",
  time = Math.floor(Date.now() / 1000),
  protocol = "1",
  upgrade = true,
}: Connection = {}): Promise<Response> {
  const signer = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signer,
    new TextEncoder().encode(`tidings-relay\n${host}\n${time}`),
  );
  const headers: Record<string, string> = {
    "X-Tidings-Protocol": protocol,
    "X-Tidings-Key": await publicKeyOf(key),
    "X-Tidings-Time": String(time),
    "X-Tidings-Signature": base64Url(signature),
  };
  if (upgrade) headers.Upgrade = "websocket";
  return exports.default.fetch(`${RELAY}/connect`, { headers });
}

interface RequestFrame {
  id: string;
  method: string;
  path: string;
  authorization?: string;
  client: string;
  body?: string;
}

const open: { socket: WebSocket; closed: Promise<CloseEvent> }[] = [];

function accept(socket: WebSocket): Promise<CloseEvent> {
  socket.accept();
  const closed = new Promise<CloseEvent>((resolve) =>
    socket.addEventListener("close", resolve),
  );
  open.push({ socket, closed });
  return closed;
}

async function mod(
  answer: (
    frame: RequestFrame,
  ) => { status: number; body?: string } | undefined = () => ({
    status: 204,
  }),
) {
  const response = await connect();
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  const closed = accept(socket);
  const frames: RequestFrame[] = [];
  socket.addEventListener("message", (event) => {
    if (event.data === "pong") return;
    const frame = JSON.parse(event.data as string) as RequestFrame;
    frames.push(frame);
    const reply = answer(frame);
    if (reply) socket.send(JSON.stringify({ id: frame.id, ...reply }));
  });
  return { socket, frames, closed };
}

const app = (path: string, init?: RequestInit) =>
  exports.default.fetch(`${RELAY}${path}`, init);

afterEach(async () => {
  const sockets = open.splice(0);
  for (const { socket } of sockets) {
    try {
      socket.close(1000, "Test over");
    } catch {
      // Closed
    }
  }
  await Promise.all(sockets.map(({ closed }) => closed));
});

describe("the app's requests", () => {
  it("are refused while the server isn't connected", async () => {
    const response = await app("/api/online");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "The server is offline" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("go down to the mod, and its answer comes back", async () => {
    const { frames } = await mod(() => ({
      status: 200,
      body: JSON.stringify({ players: [] }),
    }));

    const response = await app("/api/devices/me/settings", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token",
        "CF-Connecting-IP": "203.0.113.7",
      },
      body: '{"notifyLeaves":true}',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ players: [] });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(frames).toEqual([
      {
        id: expect.any(String),
        method: "PATCH",
        path: "/api/devices/me/settings",
        authorization: "Bearer token",
        client: "203.0.113.7",
        body: '{"notifyLeaves":true}',
      },
    ]);
  });

  it("keep the mod's errors as they are", async () => {
    await mod(() => ({
      status: 401,
      body: JSON.stringify({ error: "Unpaired", reason: "unpaired" }),
    }));

    const response = await app("/api/info");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unpaired",
      reason: "unpaired",
    });
  });

  it("get an empty answer when the mod has nothing to say", async () => {
    await mod(() => ({ status: 204 }));

    const response = await app("/api/devices/me", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("send no body for GET", async () => {
    const { frames } = await mod();

    await app("/api/online", { headers: { Authorization: "Bearer token" } });

    expect(frames[0].body).toBeUndefined();
  });

  it("are refused when too large, before reaching the mod", async () => {
    const { frames } = await mod();

    const response = await app("/api/pair", {
      method: "POST",
      body: "x".repeat(64 * 1024 + 1),
    });

    expect(response.status).toBe(413);
    expect(frames).toEqual([]);
  });

  it("fail if the mod disconnects before answering", async () => {
    const { socket } = await mod(() => {
      socket.close(1011, "Crashed");
      return undefined;
    });

    const response = await app("/api/online");

    expect(response.status).toBe(502);
  });

  it("get CORS preflights answered by the relay", async () => {
    const response = await app("/api/devices/me/settings", {
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "authorization, content-type",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "PATCH",
    );
  });

  it("outside /api/ are not found", async () => {
    expect((await app("/admin")).status).toBe(404);
  });
});

describe("the relay's own page", () => {
  it("says what the address is for", async () => {
    const response = await app("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("relay-url");
  });
});

describe("the mod's connection", () => {
  it("is accepted from the owner's key", async () => {
    const response = await connect();

    expect(response.status).toBe(101);
    accept(response.webSocket!);
  });

  it("is refused from another server's key", async () => {
    const response = await connect({ key: STRANGER });

    expect(response.status).toBe(403);
  });

  it("is refused with a signature for another relay", async () => {
    const response = await connect({ host: "other-relay.example.dev" });

    expect(response.status).toBe(401);
  });

  it("is refused with an old signature", async () => {
    const response = await connect({
      time: Math.floor(Date.now() / 1000) - 10 * 60,
    });

    expect(response.status).toBe(401);
  });

  it("is refused without a signature", async () => {
    const response = await exports.default.fetch(`${RELAY}/connect`, {
      headers: { Upgrade: "websocket", "X-Tidings-Protocol": "1" },
    });

    expect(response.status).toBe(401);
  });

  it("is refused from a mod speaking another protocol", async () => {
    const response = await connect({ protocol: "2" });

    expect(response.status).toBe(426);
  });

  it("must be a WebSocket", async () => {
    const response = await connect({ upgrade: false });

    expect(response.status).toBe(400);
  });

  it("answers the mod's pings", async () => {
    const { socket } = await mod();
    const pong = new Promise((resolve) =>
      socket.addEventListener("message", (event) => resolve(event.data)),
    );

    socket.send("ping");

    expect(await pong).toBe("pong");
  });

  it("replaces the previous one", async () => {
    const first = await mod(() => ({ status: 200, body: '"first"' }));
    const second = await mod(() => ({ status: 200, body: '"second"' }));

    expect((await first.closed).code).toBe(4000);
    expect(await (await app("/api/info")).json()).toBe("second");
    expect(second.frames).toHaveLength(1);
  });
});
