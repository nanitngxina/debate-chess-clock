import { RoomState } from "./src/shared/types";

export interface WorkerEnv {
  ASSETS: AssetBinding;
  ROOMS: DurableObjectNamespace;
  ROOM_DIRECTORY: KVNamespace;
  HOST_ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
}

export interface RoomBootstrapPayload {
  roomId: string;
  input: {
    topic: string;
    rulesText: string;
    sides: RoomState["sides"];
    config: RoomState["config"];
  };
  origin: string;
}
