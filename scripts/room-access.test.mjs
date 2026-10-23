import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createHmac, createHash, randomBytes } from "node:crypto";

// Exercise the real Worker router and room object; only storage and bindings are in memory.
const bundled = await build({
  stdin: {
    contents: `export { default as worker } from './worker-index';
      export { RoomDurableObject } from './worker-room-object';
      export { copyViewerLink } from './src/lib/roomSharing';
      export { DEFAULT_ROOM_INPUT } from './src/shared/defaults';`,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { worker, RoomDurableObject, DEFAULT_ROOM_INPUT, copyViewerLink } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const origin = "https://room-access.test";

test("sharing before the viewer link loads does not write to the clipboard", async () => {
  let writes = 0;
  const message = await copyViewerLink(undefined, async () => { writes++; });
  assert.equal(writes, 0);
  assert.equal(message, "观众链接尚未加载，请稍后重试。");
});

test("sharing copies exactly the viewer link", async () => {
  const link = `${origin}/room/test?role=viewer&token=viewer-token`;
  const copied = [];
  await copyViewerLink(link, async (value) => { copied.push(value); });
  assert.deepEqual(copied, [link]);
});

test("clipboard failure offers only the viewer link for manual copying", async () => {
  const link = `${origin}/room/test?role=viewer&token=viewer-token`;
  const message = await copyViewerLink(link, async () => { throw new Error("clipboard denied"); });
  assert.equal(message, `复制失败，请手动复制：${link}`);
});

function fixture() {
  const rooms = new Map();
  const directory = new Map();
  const forwarded = [];
  const env = {
    HOST_ADMIN_PASSWORD: "test-only-password",
    ADMIN_SESSION_SECRET: "test-only-session-signing-secret",
    ROOM_DIRECTORY: {
      put: async (key, value) => { directory.set(key, value); },
      delete: async (key) => directory.delete(key),
    },
    ROOMS: {
      idFromName: (name) => name,
      get(name) {
        if (!rooms.has(name)) {
          const values = new Map();
          let ready;
          const state = {
            storage: {
              get: async (key) => structuredClone(values.get(key)),
              put: async (key, value) => { values.set(key, structuredClone(value)); },
              delete: async (key) => values.delete(key),
              setAlarm: async () => {},
              deleteAlarm: async () => {},
            },
            blockConcurrencyWhile(fn) { ready = fn(); return ready; },
          };
          const object = new RoomDurableObject(state, env);
          rooms.set(name, { object, values, ready });
        }
        return {
          async fetch(request) {
            forwarded.push(new URL(request.url).pathname);
            const entry = rooms.get(name);
            await entry.ready;
            return entry.object.fetch(request);
          },
        };
      },
    },
  };
  const request = (path, method = "GET", body, token) => new Request(`${origin}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const call = (path, method, body, token) => worker.fetch(request(path, method, body, token), env, {});
  async function login() {
    const response = await call("/api/admin/login", "POST", { password: env.HOST_ADMIN_PASSWORD });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  }
  async function create() {
    const token = await login();
    const response = await call("/api/admin/rooms", "POST", DEFAULT_ROOM_INPUT, token);
    assert.equal(response.status, 200);
    return { token, room: (await response.json()).room };
  }
  return { env, rooms, directory, forwarded, request, call, login, create };
}

async function voiceFixture() {
  const f = fixture();
  const { room } = await f.create();
  const identity = (role) => {
    const clientKey = randomBytes(32).toString("hex");
    const clientId = createHash("sha256").update(JSON.stringify(["voice-client-v1", room.roomId, role, clientKey])).digest("hex");
    return { role, clientKey, clientId, token: new URL(room.links[role]).searchParams.get("token") };
  };
  const host = identity("host"), viewer = identity("viewer"), other = identity("viewer");
  const base = `/api/rooms/${room.roomId}`;
  const command = (who, type, extra = {}) => f.call(`${base}/command`, "POST", {
    ...who, command: { type, clientId: who.clientId, nickname: who.role, ...extra },
  });
  const signal = (who, targetClientId) => f.call(`${base}/signal`, "POST", {
    ...who, targetClientId, nickname: who.role, signal: { type: "leave" },
  });
  const poll = (who) => f.call(`${base}/signals?${new URLSearchParams(who)}`);
  for (const who of [host, viewer, other]) assert.equal((await command(who, "join-voice")).status, 200);
  return { ...f, room, host, viewer, other, command, signal, poll, base };
}

test("voice identity prevents a viewer replacing the host or another viewer", async () => {
  const f = await voiceFixture();
  for (const victim of [f.host, f.other]) {
    assert.equal((await f.command(f.viewer, "join-voice", { clientId: victim.clientId })).status, 403);
  }
  const state = (await (await f.call(`${f.base}/access?role=host&token=${f.host.token}`)).json()).room;
  assert.equal(state.voice.participants.length, 3);
  assert.equal(state.voice.participants.find(p => p.clientId === f.host.clientId).role, "host");
  assert.ok(!JSON.stringify(state).includes(f.host.clientKey));
  assert.ok(!JSON.stringify(state).includes(f.viewer.clientKey));
});

test("voice identity prevents same-role mute, leave and mic-request impersonation", async () => {
  const f = await voiceFixture();
  for (const type of ["set-voice-muted", "leave-voice", "request-public-voice"]) {
    assert.equal((await f.command(f.viewer, type, { clientId: f.other.clientId, muted: true })).status, 403);
  }
  assert.equal((await f.command(f.viewer, "set-voice-muted", { muted: true })).status, 200);
  assert.equal((await f.command(f.viewer, "request-public-voice")).status, 200);
  assert.equal((await f.command(f.host, "approve-public-voice", { clientId: f.viewer.clientId })).status, 200);
});

test("voice identity prevents forged senders and queue theft without consuming legitimate signals", async () => {
  const f = await voiceFixture();
  assert.equal((await f.signal({ ...f.viewer, clientId: f.other.clientId }, f.viewer.clientId)).status, 403);
  assert.equal((await f.signal(f.other, f.viewer.clientId)).status, 200);
  assert.equal((await f.poll({ ...f.other, clientId: f.viewer.clientId })).status, 403);
  const response = await f.poll(f.viewer);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.signals.length, 1);
  assert.equal(payload.signals[0].fromClientId, f.other.clientId);
  assert.equal((await (await f.poll(f.viewer)).json()).signals.length, 0);
});

test("voice identity requires its secret and is bound to room and role", async () => {
  const f = await voiceFixture();
  for (const fake of [
    { ...f.viewer, clientKey: undefined },
    { ...f.viewer, clientKey: "a".repeat(64) },
    { ...f.host, clientId: f.viewer.clientId, clientKey: f.viewer.clientKey },
  ]) assert.equal((await f.command(fake, "join-voice")).status, 403);
  const second = await f.create();
  assert.equal((await f.call(`/api/rooms/${second.room.roomId}/command`, "POST", {
    ...f.viewer, token: new URL(second.room.links.viewer).searchParams.get("token"),
    command: { type: "join-voice", clientId: f.viewer.clientId, nickname: "test" },
  })).status, 403);
});

test("voice identity supports leave, rejoin and room-object restart", async () => {
  const f = await voiceFixture();
  assert.equal((await f.command(f.viewer, "leave-voice")).status, 200);
  assert.equal((await f.command(f.viewer, "join-voice")).status, 200);
  const entry = f.rooms.get(f.room.roomId);
  const state = {
    storage: {
      get: async key => structuredClone(entry.values.get(key)),
      put: async (key, value) => { entry.values.set(key, structuredClone(value)); },
      delete: async key => entry.values.delete(key), setAlarm: async () => {}, deleteAlarm: async () => {},
    },
    blockConcurrencyWhile(fn) { entry.ready = fn(); return entry.ready; },
  };
  entry.object = new RoomDurableObject(state, f.env);
  assert.equal((await f.command(f.viewer, "set-voice-muted", { muted: true })).status, 200);
  assert.equal((await f.signal(f.other, f.viewer.clientId)).status, 200);
  assert.equal((await (await f.poll(f.viewer)).json()).signals.length, 1);
});

test("room state version survives a Durable Object restart and remains monotonic", async () => {
  const f = fixture();
  const { room } = await f.create();
  const hostToken = new URL(room.links.host).searchParams.get("token");
  const base = `/api/rooms/${room.roomId}`;
  const access = async () => (await f.call(`${base}/access?role=host&token=${hostToken}`)).json();

  await f.call(`${base}/command`, "POST", {
    role: "host", token: hostToken, command: { type: "set-topic", topic: "before restart" },
  });
  const beforeRestart = await access();
  assert.ok(beforeRestart.stateVersion >= 2);

  const entry = f.rooms.get(room.roomId);
  const state = {
    storage: {
      get: async key => structuredClone(entry.values.get(key)),
      put: async (key, value) => { entry.values.set(key, structuredClone(value)); },
      delete: async key => entry.values.delete(key), setAlarm: async () => {}, deleteAlarm: async () => {},
    },
    blockConcurrencyWhile(fn) { entry.ready = fn(); return entry.ready; },
  };
  entry.object = new RoomDurableObject(state, f.env);

  const afterRestart = await access();
  assert.equal(afterRestart.stateVersion, beforeRestart.stateVersion);
  await f.call(`${base}/command`, "POST", {
    role: "host", token: hostToken, command: { type: "set-topic", topic: "after restart" },
  });
  const afterMutation = await access();
  assert.ok(afterMutation.stateVersion > afterRestart.stateVersion);
});

test("host can end an active match with an explicit winner, and reset clears the result", async () => {
  const f = fixture();
  const { room } = await f.create();
  const hostToken = new URL(room.links.host).searchParams.get("token");
  const viewerToken = new URL(room.links.viewer).searchParams.get("token");
  const base = `/api/rooms/${room.roomId}`;
  const command = (role, token, value) => f.call(`${base}/command`, "POST", {
    role, token, command: value,
  });

  assert.equal((await command("viewer", viewerToken, { type: "declare-winner", side: "negative" })).status, 403);
  assert.equal((await command("host", hostToken, { type: "declare-winner", side: "other" })).status, 403);
  assert.equal((await command("host", hostToken, { type: "resume" })).status, 200);

  const declared = await command("host", hostToken, { type: "declare-winner", side: "negative" });
  assert.equal(declared.status, 200);
  const result = await declared.json();
  assert.equal(result.room.victory.side, "negative");
  assert.equal(result.room.clock.isRunning, false);
  assert.ok(result.room.clock.totalRemainingMs > 0, "host can declare a winner before timeout");
  assert.equal(result.room.matchLog.at(-1).type, "winner-declared");
  assert.equal((await command("host", hostToken, { type: "resume" })).status, 409);

  const viewerResult = await f.call(`${base}/access?role=viewer&token=${viewerToken}`);
  assert.equal((await viewerResult.json()).room.victory.side, "negative");
  const reset = await command("host", hostToken, { type: "reset" });
  assert.equal((await reset.json()).room.victory, null);
  assert.equal((await command("host", hostToken, { type: "resume" })).status, 200);
});

test("round count is display-only and exhausted matches reject ordinary host commands", async () => {
  const f = fixture();
  const { room } = await f.create();
  const hostToken = new URL(room.links.host).searchParams.get("token");
  const viewerToken = new URL(room.links.viewer).searchParams.get("token");
  const base = `/api/rooms/${room.roomId}`;
  const command = (value) => f.call(`${base}/command`, "POST", {
    role: "host", token: hostToken, command: value,
  });

  assert.equal((await command({ type: "update-config", config: { ...DEFAULT_ROOM_INPUT.config, maxRounds: 1 } })).status, 200);
  assert.equal((await command({ type: "set-active-side", side: "negative" })).status, 200);
  const completed = await command({ type: "end-turn" });
  assert.equal(completed.status, 200);
  const completedPayload = await completed.json();
  assert.equal(completedPayload.room.clock.currentRound, 2);
  assert.equal(completedPayload.room.clock.isRunning, false);
  const exhaustedPayload = await command({ type: "adjust-time", side: "total", amountSeconds: -75 * 60 });
  assert.equal(exhaustedPayload.status, 200);
  const exhausted = await exhaustedPayload.json();
  assert.equal(exhausted.room.clock.totalRemainingMs, 0);
  assert.equal(exhausted.room.clock.isRunning, false);

  for (const ordinaryCommand of [
    { type: "resume" },
    { type: "end-turn" },
    { type: "adjust-time", side: "affirmative", amountSeconds: 120 },
    { type: "set-topic", topic: "must not rewrite finished record" },
  ]) {
    assert.equal((await command(ordinaryCommand)).status, 409);
  }

  assert.equal((await f.call(`${base}/command`, "POST", {
    role: "viewer", token: viewerToken, command: { type: "declare-winner", side: "negative" },
  })).status, 409);
  assert.equal((await command({ type: "declare-winner", side: "other" })).status, 409);

  const declared = await command({ type: "declare-winner", side: "affirmative" });
  assert.equal(declared.status, 200);
  assert.equal((await declared.json()).room.victory.side, "affirmative");
  const viewerResult = await f.call(`${base}/access?role=viewer&token=${viewerToken}`);
  assert.equal((await viewerResult.json()).room.victory.side, "affirmative");

  const reset = await command({ type: "reset" });
  assert.equal(reset.status, 200);
  const resetPayload = await reset.json();
  assert.equal(resetPayload.room.clock.currentRound, 1);
  assert.equal(resetPayload.room.clock.isRunning, false);
  assert.equal(resetPayload.room.roundHistory.length, 0);
  assert.equal(resetPayload.room.victory, null);
});

test("public room proxy cannot create a room through its internal admin path", async () => {
  const f = fixture();
  const response = await f.call("/api/rooms/attack/admin/create", "POST", {
    roomId: "attack", input: DEFAULT_ROOM_INPUT, origin,
  });
  assert.equal(response.status, 404);
  assert.equal(f.forwarded.length, 0);
  assert.equal(f.directory.size, 0);
});

test("public room proxy cannot delete a room, even with a valid admin bearer", async () => {
  const f = fixture();
  const { room, token } = await f.create();
  for (const bearer of [undefined, token]) {
    const response = await f.call(`/api/rooms/${room.roomId}/admin/delete`, "POST", { roomId: room.roomId }, bearer);
    assert.equal(response.status, 404);
    assert.ok(f.rooms.get(room.roomId).values.has("room-state"));
  }
});

test("internal create rejects missing and forged credentials before any storage mutation", async () => {
  const f = fixture();
  const stub = f.env.ROOMS.get("direct");
  for (const token of [undefined, "forged.token"]) {
    const response = await stub.fetch(f.request("/admin/create", "POST", {
      roomId: "direct", input: DEFAULT_ROOM_INPUT, origin,
    }, token));
    assert.equal(response.status, 401);
    assert.equal(f.rooms.get("direct").values.size, 0);
  }
});

test("internal delete requires an admin session, not a room host token", async () => {
  const f = fixture();
  const { room } = await f.create();
  const hostToken = new URL(room.links.host).searchParams.get("token");
  for (const token of [undefined, "forged.token", hostToken]) {
    const response = await f.env.ROOMS.get(room.roomId).fetch(
      f.request("/admin/delete", "POST", { roomId: room.roomId }, token),
    );
    assert.equal(response.status, 401);
    assert.ok(f.rooms.get(room.roomId).values.has("room-state"));
  }
});

test("internal admin rejects expired, wrong-subject and malformed signed sessions", async () => {
  const f = fixture();
  const { room } = await f.create();
  const signed = (payload) => {
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", f.env.ADMIN_SESSION_SECRET).update(data).digest("base64url");
    return `${data}.${signature}`;
  };
  const valid = signed({ sub: "debate-host-admin", exp: Date.now() + 60000 });
  for (const token of [
    signed({ sub: "debate-host-admin", exp: 1 }),
    signed({ sub: "ordinary-account", exp: Date.now() + 60000 }),
    signed({ sub: "debate-host-admin" }),
    `${valid}.extra`,
  ]) {
    const response = await f.env.ROOMS.get(room.roomId).fetch(
      f.request("/admin/delete", "POST", { roomId: room.roomId }, token),
    );
    assert.equal(response.status, 401);
    assert.ok(f.rooms.get(room.roomId).values.has("room-state"));
  }
});

test("normal admin entrypoints reject unauthenticated create and delete", async () => {
  const f = fixture();
  assert.equal((await f.call("/api/admin/rooms", "POST", DEFAULT_ROOM_INPUT)).status, 401);
  assert.equal((await f.call("/api/admin/rooms/example", "DELETE")).status, 401);
  assert.equal(f.forwarded.length, 0);
});

test("authenticated create, room access, host command and authenticated delete still work", async () => {
  const f = fixture();
  const { room, token } = await f.create();
  const host = new URL(room.links.host).searchParams.get("token");
  const viewer = new URL(room.links.viewer).searchParams.get("token");
  const base = `/api/rooms/${room.roomId}`;
  assert.equal((await f.call(`${base}/access?role=viewer&token=${viewer}`)).status, 200);
  assert.equal((await f.call(`${base}/access`, "POST", { role: "viewer", token: viewer })).status, 200);
  assert.equal((await f.call(`${base}/access?role=viewer&token=wrong`)).status, 403);
  const resumed = await f.call(`${base}/command`, "POST", { role: "host", token: host, command: { type: "resume" } });
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json()).room.clock.isRunning, true);
  assert.equal((await f.call(`${base}/command`, "POST", { role: "viewer", token: viewer, command: { type: "reset" } })).status, 403);
  assert.equal((await f.call(`/api/admin/rooms/${room.roomId}`, "DELETE", undefined, token)).status, 200);
  assert.equal(f.directory.size, 0);
  assert.equal(f.rooms.get(room.roomId).values.has("room-state"), false);
});

test("public proxy accepts only the supported path and method combinations", async () => {
  const f = fixture();
  const seen = [];
  f.env.ROOMS.get = () => ({ fetch: async (req) => { seen.push(`${req.method} ${new URL(req.url).pathname}`); return new Response(null, { status: 204 }); } });
  for (const [method, path] of [
    ["GET", "access"], ["POST", "access"], ["GET", "events"], ["POST", "command"],
    ["POST", "barrage"], ["POST", "reaction"], ["POST", "signal"], ["GET", "signals"],
  ]) {
    assert.equal((await f.call(`/api/rooms/test/${path}`, method)).status, 204);
    assert.equal(seen.at(-1), `${method} /${path}`);
  }
  const before = seen.length;
  assert.equal((await f.call("/api/rooms/test/command", "GET")).status, 405);
  for (const path of ["admin/create", "admin/delete", "%61dmin/delete", "access/extra", "unknown"]) {
    assert.equal((await f.call(`/api/rooms/test/${path}`, "POST")).status, 404);
  }
  assert.equal(seen.length, before);
});

for (const role of ["host", "affirmative", "negative", "viewer"]) {
  test(`${role} can share a viewer-only invitation without leaking other role credentials`, async () => {
    const f = fixture();
    const { room } = await f.create();
    const token = new URL(room.links[role]).searchParams.get("token");
    const base = `/api/rooms/${room.roomId}`;
    for (const response of [
      await f.call(`${base}/access?role=${role}&token=${token}`),
      await f.call(`${base}/access`, "POST", { role, token }),
    ]) {
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.viewerToken, new URL(room.links.viewer).searchParams.get("token"));
      if (role !== "host") assert.equal(payload.links, undefined);
      const viewerToken = payload.viewerToken;
      assert.equal((await f.call(`${base}/access?role=viewer&token=${viewerToken}`)).status, 200);
      for (const claimedRole of ["host", "affirmative", "negative"]) {
        assert.equal((await f.call(`${base}/access?role=${claimedRole}&token=${viewerToken}`)).status, 403);
        if (role !== "host" && role !== claimedRole) {
          assert.ok(!JSON.stringify(payload).includes(new URL(room.links[claimedRole]).searchParams.get("token")));
        }
      }
      assert.equal((await f.call(`${base}/command`, "POST", {
        role: "viewer", token: viewerToken, command: { type: "reset" },
      })).status, 403);
    }
  });
}
