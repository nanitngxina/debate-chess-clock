import { getRolePermissions } from "./src/shared/defaults";
import {
  appendBarrage,
  applyCommand,
  buildRoomLinks,
  canExecuteCommand,
  createRoomState,
  syncRoomState,
  toPublicRoomState,
  toRoomSummary,
  validateToken,
} from "./src/shared/engine";
import { BarrageRequest, CommandRequest, RoomAccessPayload, RoomRole, RoomState } from "./src/shared/types";
import { RoomBootstrapPayload, WorkerEnv } from "./worker-types";

const STORAGE_KEY = "room-state";

interface LiveSession {
  writer: WritableStreamDefaultWriter<Uint8Array>;
  heartbeatId: ReturnType<typeof setInterval>;
}

export class RoomDurableObject {
  private readonly state: DurableObjectState;
  private readonly env: WorkerEnv;
  private readonly encoder = new TextEncoder();
  private readonly sessions = new Map<string, LiveSession>();
  private room: RoomState | null = null;

  constructor(state: DurableObjectState, env: WorkerEnv) {
    this.state = state;
    this.env = env;
    void this.state.blockConcurrencyWhile(async () => {
      this.room = (await this.state.storage.get<RoomState>(STORAGE_KEY)) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/admin/create") {
      return this.handleBootstrap(request);
    }

    const room = await this.getRoom();
    if (!room) {
      return json({ error: "房间不存在" }, 404);
    }

    if (request.method === "GET" && url.pathname === "/access") {
      return this.handleAccess(request, room);
    }

    if (request.method === "GET" && url.pathname === "/events") {
      return this.handleEvents(request, room);
    }

    if (request.method === "POST" && url.pathname === "/command") {
      return this.handleCommand(request, room);
    }

    if (request.method === "POST" && url.pathname === "/barrage") {
      return this.handleBarrage(request, room);
    }

    return json({ error: "未知房间接口" }, 404);
  }

  private async handleBootstrap(request: Request): Promise<Response> {
    if (this.room) {
      return json({ error: "房间已存在" }, 409);
    }

    const payload = (await request.json()) as RoomBootstrapPayload;
    const now = Date.now();
    const room = createRoomState(
      payload.roomId,
      payload.input,
      {
        viewer: createToken(),
        affirmative: createToken(),
        negative: createToken(),
        host: createToken(),
      },
      now,
    );

    this.room = room;
    await this.persistRoom(payload.origin);

    return json({
      room: toRoomSummary(room, payload.origin),
    });
  }

  private async handleAccess(request: Request, currentRoom: RoomState): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const token = url.searchParams.get("token") ?? "";

    if (!isRole(role) || !validateToken(currentRoom, role, token)) {
      return json({ error: "房间权限无效" }, 403);
    }

    const now = Date.now();
    const room = await this.syncAndPersistIfNeeded(currentRoom, url.origin, now);
    return json(this.createAccessPayload(room, role, url.origin, now));
  }

  private async handleCommand(request: Request, currentRoom: RoomState): Promise<Response> {
    const payload = (await request.json()) as CommandRequest;
    if (!isRole(payload.role) || !validateToken(currentRoom, payload.role, payload.token)) {
      return json({ error: "房间权限无效" }, 403);
    }

    if (!canExecuteCommand(payload.role, currentRoom, payload.command)) {
      return json({ error: "你没有执行该操作的权限" }, 403);
    }

    if (
      (payload.command.type === "adjust-time" || payload.command.type === "update-config") &&
      currentRoom.clock.isRunning
    ) {
      return json({ error: "请先暂停，再修改时间或配置" }, 409);
    }

    const origin = new URL(request.url).origin;
    const now = Date.now();
    const room = applyCommand(currentRoom, payload.command, now);
    this.room = room;
    await this.persistRoom(origin);
    this.state.waitUntil(this.broadcastSnapshot(origin));

    return json(this.createAccessPayload(room, payload.role, origin, now));
  }

  private async handleBarrage(request: Request, currentRoom: RoomState): Promise<Response> {
    const payload = (await request.json()) as BarrageRequest;
    if (!isRole(payload.role) || !validateToken(currentRoom, payload.role, payload.token)) {
      return json({ error: "房间权限无效" }, 403);
    }

    const origin = new URL(request.url).origin;
    const now = Date.now();
    const room = appendBarrage(currentRoom, payload, now);
    this.room = room;
    await this.persistRoom(origin);
    this.state.waitUntil(this.broadcastSnapshot(origin));

    return json(this.createAccessPayload(room, payload.role, origin, now));
  }

  private async handleEvents(request: Request, currentRoom: RoomState): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const token = url.searchParams.get("token") ?? "";

    if (!isRole(role) || !validateToken(currentRoom, role, token)) {
      return json({ error: "房间权限无效" }, 403);
    }

    const syncedRoom = await this.syncAndPersistIfNeeded(currentRoom, url.origin, Date.now());
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    const sessionId = crypto.randomUUID();
    const heartbeatId = setInterval(() => {
      void writer.write(this.encoder.encode(": ping\n\n"));
    }, 15000);

    this.sessions.set(sessionId, { writer, heartbeatId });
    request.signal?.addEventListener("abort", () => {
      void this.closeSession(sessionId, url.origin);
    });

    await this.writeSnapshot(writer, syncedRoom, url.origin, Date.now());
    this.state.waitUntil(this.broadcastSnapshot(url.origin));

    return new Response(stream.readable, {
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  }

  private async getRoom(): Promise<RoomState | null> {
    if (this.room) {
      return this.room;
    }

    this.room = (await this.state.storage.get<RoomState>(STORAGE_KEY)) ?? null;
    return this.room;
  }

  private createAccessPayload(
    room: RoomState,
    role: RoomRole,
    origin: string,
    now: number,
  ): RoomAccessPayload {
    return {
      room: toPublicRoomState(room),
      role,
      permissions: getRolePermissions(role),
      links: role === "host" ? buildRoomLinks(origin, room.roomId, room.tokens) : undefined,
      serverNow: now,
      onlineCount: this.sessions.size,
    };
  }

  private async syncAndPersistIfNeeded(room: RoomState, origin: string, now: number): Promise<RoomState> {
    const nextRoom = syncRoomState(room, now);
    if (nextRoom !== room) {
      this.room = nextRoom;
      await this.persistRoom(origin);
      return nextRoom;
    }

    return room;
  }

  private async persistRoom(origin: string): Promise<void> {
    if (!this.room) {
      return;
    }

    await this.state.storage.put(STORAGE_KEY, this.room);
    await this.env.ROOM_DIRECTORY.put(
      `room:${this.room.roomId}`,
      JSON.stringify(toRoomSummary(this.room, origin)),
    );
  }

  private async broadcastSnapshot(origin: string): Promise<void> {
    if (!this.room || this.sessions.size === 0) {
      return;
    }

    const now = Date.now();
    const room = await this.syncAndPersistIfNeeded(this.room, origin, now);
    const closedSessions: string[] = [];

    await Promise.all(
      [...this.sessions.entries()].map(async ([sessionId, session]) => {
        try {
          await this.writeSnapshot(session.writer, room, origin, now);
        } catch {
          closedSessions.push(sessionId);
        }
      }),
    );

    await Promise.all(closedSessions.map(async (sessionId) => this.closeSession(sessionId, origin)));
  }

  private async writeSnapshot(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    room: RoomState,
    origin: string,
    now: number,
  ): Promise<void> {
    const payload = JSON.stringify({
      room: toPublicRoomState(room),
      serverNow: now,
      onlineCount: this.sessions.size,
    });
    await writer.write(this.encoder.encode(`data: ${payload}\n\n`));
  }

  private async closeSession(sessionId: string, origin: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    clearInterval(session.heartbeatId);
    this.sessions.delete(sessionId);
    try {
      await session.writer.close();
    } catch {
      return;
    } finally {
      this.state.waitUntil(this.broadcastSnapshot(origin));
    }
  }
}

function isRole(value: string | null): value is RoomRole {
  return value === "viewer" || value === "affirmative" || value === "negative" || value === "host";
}

function createToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}


