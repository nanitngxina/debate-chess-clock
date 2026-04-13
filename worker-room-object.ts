import { getRolePermissions } from "./src/shared/defaults";
import {
  appendBarrage,
  applyCommand,
  buildRoomLinks,
  canExecuteCommand,
  cleanupDisconnectedClient,
  createRoomState,
  getVoiceParticipant,
  isVoiceParticipant,
  syncRoomState,
  toPublicRoomState,
  toRoomSummary,
  validateToken,
} from "./src/shared/engine";
import {
  BarrageRequest,
  CommandRequest,
  RoomAccessPayload,
  RoomRole,
  RoomState,
  VoiceSignalEnvelope,
  VoiceSignalPollResponse,
  VoiceSignalRequest,
} from "./src/shared/types";
import { RoomBootstrapPayload, WorkerEnv } from "./worker-types";

const STORAGE_KEY = "room-state";
const IDLE_DELETE_AT_KEY = "idle-delete-at";
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

interface LiveSession {
  writer: WritableStreamDefaultWriter<Uint8Array>;
  heartbeatId: ReturnType<typeof setInterval>;
  presenceId: string;
  clientId: string;
  role: RoomRole;
}

export class RoomDurableObject {
  private readonly state: DurableObjectState;
  private readonly env: WorkerEnv;
  private readonly encoder = new TextEncoder();
  private readonly sessions = new Map<string, LiveSession>();
  private readonly queuedSignals = new Map<string, VoiceSignalEnvelope[]>();
  private room: RoomState | null = null;

  constructor(state: DurableObjectState, env: WorkerEnv) {
    this.state = state;
    this.env = env;
    void this.state.blockConcurrencyWhile(async () => {
      this.room = (await this.state.storage.get<RoomState>(STORAGE_KEY)) ?? null;
    });
  }

  async alarm(): Promise<void> {
    const room = await this.getRoom();
    if (!room || this.sessions.size > 0) {
      return;
    }

    const idleDeleteAt = await this.state.storage.get<number>(IDLE_DELETE_AT_KEY);
    if (!idleDeleteAt || idleDeleteAt > Date.now()) {
      return;
    }

    await this.deleteRoomState(room.roomId);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/admin/create") {
      return this.handleBootstrap(request);
    }

    if (request.method === "POST" && url.pathname === "/admin/delete") {
      return this.handleDelete(request);
    }

    const room = await this.getRoom();
    if (!room) {
      return json({ error: "房间不存在" }, 404);
    }

    if (request.method === "GET" && url.pathname === "/access") {
      return this.handleAccess(request, room);
    }

    if (request.method === "POST" && url.pathname === "/access") {
      return this.handleAccessPost(request, room);
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

    if (request.method === "POST" && url.pathname === "/signal") {
      return this.handleVoiceSignal(request, room);
    }

    if (request.method === "GET" && url.pathname === "/signals") {
      return this.handleVoiceSignalPoll(request, room);
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
    await this.scheduleIdleDeletion();

    return json({
      room: toRoomSummary(room, payload.origin),
    });
  }

  private async handleDelete(request: Request): Promise<Response> {
    const payload = (await request.json()) as { roomId?: string };
    const room = await this.getRoom();

    if (!room) {
      return json({ error: "房间不存在" }, 404);
    }

    if (!payload.roomId || payload.roomId !== room.roomId) {
      return json({ error: "房间 ID 不匹配" }, 400);
    }

    await this.deleteRoomState(room.roomId);
    return json({ ok: true });
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

  private async handleAccessPost(request: Request, currentRoom: RoomState): Promise<Response> {
    const payload = (await request.json()) as { role?: string; token?: string };
    const role = payload.role ?? null;
    const token = payload.token ?? "";

    if (!isRole(role) || !validateToken(currentRoom, role, token)) {
      return json({ error: "鎴块棿鏉冮檺鏃犳晥" }, 403);
    }

    const origin = new URL(request.url).origin;
    const now = Date.now();
    const room = await this.syncAndPersistIfNeeded(currentRoom, origin, now);
    return json(this.createAccessPayload(room, role, origin, now));
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
    const room = applyCommand(currentRoom, payload.command, now, payload.role);
    this.room = room;
    await this.persistRoom(origin);
    void this.broadcastSnapshot(origin);

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
    void this.broadcastSnapshot(origin);

    return json(this.createAccessPayload(room, payload.role, origin, now));
  }

  private async handleEvents(request: Request, currentRoom: RoomState): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const token = url.searchParams.get("token") ?? "";
    const presenceId = url.searchParams.get("presenceId")?.trim();
    const clientId = url.searchParams.get("clientId")?.trim() || crypto.randomUUID();

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

    this.sessions.set(sessionId, {
      writer,
      heartbeatId,
      presenceId: presenceId || clientId,
      clientId,
      role,
    });
    await this.cancelIdleDeletion();

    request.signal?.addEventListener("abort", () => {
      void this.closeSession(sessionId, url.origin);
    });

    await this.writeSnapshot(writer, syncedRoom, Date.now());
    void this.broadcastSnapshot(url.origin);

    return new Response(stream.readable, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  }

  private async handleVoiceSignal(request: Request, currentRoom: RoomState): Promise<Response> {
    const payload = (await request.json()) as VoiceSignalRequest;
    if (!isRole(payload.role) || !validateToken(currentRoom, payload.role, payload.token)) {
      return json({ error: "房间权限无效" }, 403);
    }

    if (!payload.clientId || !payload.targetClientId) {
      return json({ error: "语音会话信息不完整" }, 400);
    }

    if (!isVoiceParticipant(currentRoom, payload.clientId)) {
      return json({ error: "请先加入公共语音" }, 409);
    }

    if (!isVoiceParticipant(currentRoom, payload.targetClientId)) {
      return json({ error: "目标成员不在公共语音中" }, 404);
    }

    const sourceParticipant = getVoiceParticipant(currentRoom, payload.clientId);
    const targetParticipant = getVoiceParticipant(currentRoom, payload.targetClientId);
    if (!sourceParticipant || !targetParticipant || sourceParticipant.channel !== targetParticipant.channel) {
      return json({ error: "语音成员不在同一频道" }, 409);
    }

    const envelope: VoiceSignalEnvelope = {
      id: `${Date.now()}-${crypto.randomUUID()}`,
      fromClientId: payload.clientId,
      fromRole: payload.role,
      fromNickname: payload.nickname.trim().slice(0, 32) || "成员",
      signal: payload.signal,
    };

    this.enqueueSignal(payload.targetClientId, envelope);
    void this.deliverSignal(payload.targetClientId, envelope, new URL(request.url).origin).catch(() => {
      // The target can still receive the queued signal via polling fallback.
    });

    return json({ ok: true });
  }

  private async handleVoiceSignalPoll(request: Request, currentRoom: RoomState): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const token = url.searchParams.get("token") ?? "";
    const clientId = url.searchParams.get("clientId")?.trim();

    if (!isRole(role) || !validateToken(currentRoom, role, token)) {
      return json({ error: "房间权限无效" }, 403);
    }

    if (!clientId) {
      return json({ error: "缺少语音客户端标识" }, 400);
    }

    const response: VoiceSignalPollResponse = {
      signals: this.dequeueSignals(clientId),
    };

    return json(response);
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
      onlineCount: this.getOnlineCount(),
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
          await this.writeSnapshot(session.writer, room, now);
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
    now: number,
  ): Promise<void> {
    const payload = JSON.stringify({
      room: toPublicRoomState(room),
      serverNow: now,
      onlineCount: this.getOnlineCount(),
    });

    await writer.write(this.encoder.encode(`data: ${payload}\n\n`));
  }

  private async writeEvent(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    eventName: string,
    payload: unknown,
  ): Promise<void> {
    await writer.write(this.encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
  }

  private getOnlineCount(): number {
    return new Set([...this.sessions.values()].map((session) => session.presenceId)).size;
  }

  private async closeSession(sessionId: string, origin: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    clearInterval(session.heartbeatId);
    this.sessions.delete(sessionId);

    if (this.room && !this.hasActiveClientSession(session.clientId)) {
      const nextRoom = cleanupDisconnectedClient(this.room, session.clientId);
      if (nextRoom !== this.room) {
        this.room = nextRoom;
        await this.persistRoom(origin);
      }
    }

    if (this.sessions.size === 0) {
      await this.scheduleIdleDeletion();
    }

    try {
      await session.writer.close();
    } catch {
      return;
    } finally {
      void this.broadcastSnapshot(origin);
    }
  }

  private async scheduleIdleDeletion(): Promise<void> {
    const idleDeleteAt = Date.now() + IDLE_TIMEOUT_MS;
    await this.state.storage.put(IDLE_DELETE_AT_KEY, idleDeleteAt);
    await this.state.storage.setAlarm(idleDeleteAt);
  }

  private async cancelIdleDeletion(): Promise<void> {
    await this.state.storage.delete(IDLE_DELETE_AT_KEY);
    await this.state.storage.deleteAlarm();
  }

  private async deleteRoomState(roomId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      clearInterval(session.heartbeatId);
      try {
        await session.writer.close();
      } catch {
        // Ignore close errors during room deletion.
      }
    }

    this.sessions.clear();
    this.queuedSignals.clear();

    await this.state.storage.delete(STORAGE_KEY);
    await this.state.storage.delete(IDLE_DELETE_AT_KEY);
    await this.state.storage.deleteAlarm();
    await this.env.ROOM_DIRECTORY.delete(`room:${roomId}`);
    this.room = null;
  }

  private enqueueSignal(targetClientId: string, signal: VoiceSignalEnvelope): void {
    const queued = this.queuedSignals.get(targetClientId) ?? [];
    queued.push(signal);
    this.queuedSignals.set(targetClientId, queued.slice(-100));
  }

  private dequeueSignals(targetClientId: string): VoiceSignalEnvelope[] {
    const queued = this.queuedSignals.get(targetClientId) ?? [];
    this.queuedSignals.delete(targetClientId);
    return queued;
  }

  private async deliverSignal(
    targetClientId: string,
    signal: VoiceSignalEnvelope,
    origin: string,
  ): Promise<void> {
    const matchingSessions = [...this.sessions.entries()].filter(
      ([, session]) => session.clientId === targetClientId,
    );

    if (matchingSessions.length === 0) {
      return;
    }

    const closedSessions: string[] = [];
    await Promise.all(
      matchingSessions.map(async ([sessionId, session]) => {
        try {
          await this.writeEvent(session.writer, "voice-signal", signal);
        } catch {
          closedSessions.push(sessionId);
        }
      }),
    );

    await Promise.all(closedSessions.map(async (sessionId) => this.closeSession(sessionId, origin)));
  }

  private hasActiveClientSession(clientId: string): boolean {
    return [...this.sessions.values()].some((session) => session.clientId === clientId);
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
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
