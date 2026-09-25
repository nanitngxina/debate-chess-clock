import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pollVoiceSignals, sendRoomCommand, sendVoiceSignal } from "../lib/api";
import { canVoiceParticipantSpeakNow, getVoiceChannelForRole } from "../shared/engine";
import {
  RoomAccessPayload,
  RoomRole,
  VoiceChannel,
  VoiceIceCandidatePayload,
  VoiceParticipant,
  VoiceSignalEnvelope,
  VoiceSignalPayload,
} from "../shared/types";

interface RemoteAudioStream {
  clientId: string;
  label: string;
  stream: MediaStream;
}

interface UseVoiceChatOptions {
  roomId: string;
  role: RoomRole;
  token: string;
  clientId: string;
  nickname: string;
  payload: RoomAccessPayload | null;
  lastVoiceSignal: VoiceSignalEnvelope | null;
  setPayload: (payload: RoomAccessPayload) => void;
}

interface PeerRecord {
  connection: RTCPeerConnection;
  stream: MediaStream;
  label: string;
  pendingCandidates: VoiceIceCandidatePayload[];
}

/** 稳定的空数组常量：不要用 `?? []`（每次渲染都是新引用，会让依赖它的 effect 反复触发） */
const EMPTY_PARTICIPANTS: VoiceParticipant[] = [];

function getFallbackNickname(role: RoomRole): string {
  switch (role) {
    case "host":
      return "主持人";
    case "affirmative":
      return "正方";
    case "negative":
      return "反方";
    case "viewer":
      return "观众";
  }
}

// 公共语音是浏览器之间的 P2P（WebRTC）。不配置 STUN 时，浏览器只会收集本机
// 网卡地址（host candidate）—— 双方一旦不在同一个局域网内就永远连不通，
// 表现是"能加入语音、但听不到对方"，而且不会有明显报错。
// 默认挂上 Cloudflare / Google 的免费公共 STUN，可以先让绝大多数家庭宽带直连；
// 对称 NAT（部分公司网、手机热点）还需要 TURN 中继，用 VITE_ICE_SERVERS
// 注入即可（JSON 数组，格式同 RTCIceServer[]），不用改代码。
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"],
  },
];

function resolveIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS;
  if (!raw) {
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as RTCIceServer[];
    }
  } catch {
    // 环境变量写错就退回默认 STUN，不能让整个语音功能不可用
  }

  return DEFAULT_ICE_SERVERS;
}

const ICE_SERVERS = resolveIceServers();

function trimProcessedSignalCache(cache: Set<string>) {
  while (cache.size > 500) {
    const [first] = cache;
    if (!first) {
      return;
    }

    cache.delete(first);
  }
}

export function useVoiceChat({
  roomId,
  role,
  token,
  clientId,
  nickname,
  payload,
  lastVoiceSignal,
  setPayload,
}: UseVoiceChatOptions) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteAudioStream[]>([]);
  /**
   * 本地麦克风流。
   * ref 是为了在回调里同步读写，state 是为了让"音量检测"这类渲染相关的消费者
   * 能拿到它 —— 两者指向同一个流，赋值处必须同时更新。
   */
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const peersRef = useRef(new Map<string, PeerRecord>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignalIdsRef = useRef(new Set<string>());
  /*
    必须用模块级常量而不是 `?? []`：
    payload 还没到的那一小段时间里，`?? []` 每次渲染都会造一个新数组，
    依赖它的 useMemo / effect 就会每次渲染都重跑，里面的 setRemoteStreams([])
    又制造新数组 —— 于是形成死循环（React 会报 Maximum update depth exceeded）。
  */
  const allParticipants = payload?.room.voice.participants ?? EMPTY_PARTICIPANTS;
  const selfParticipantInAnyChannel = useMemo(
    () => allParticipants.find((participant) => participant.clientId === clientId) ?? null,
    [allParticipants, clientId],
  );
  const channel = useMemo<VoiceChannel>(
    () => selfParticipantInAnyChannel?.channel ?? getVoiceChannelForRole(role),
    [role, selfParticipantInAnyChannel?.channel],
  );
  const participants = useMemo(
    () => allParticipants.filter((participant) => participant.channel === channel),
    [allParticipants, channel],
  );
  const selfParticipant = useMemo(
    () => participants.find((participant) => participant.clientId === clientId) ?? null,
    [clientId, participants],
  );
  const isJoined = Boolean(selfParticipant);
  const canSpeakNow = payload ? canVoiceParticipantSpeakNow(role, channel, payload.room.clock) : role !== "viewer";
  const isMuted = selfParticipant?.muted ?? true;
  const publicRequests = payload?.room.voice.requests ?? [];
  const hasPendingPublicRequest = publicRequests.some((request) => request.clientId === clientId);

  const syncLocalTrackState = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    const enabled = Boolean(selfParticipant && !selfParticipant.muted);
    stream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, [selfParticipant]);

  const closePeer = useCallback((remoteClientId: string) => {
    const record = peersRef.current.get(remoteClientId);
    if (!record) {
      return;
    }

    record.connection.onicecandidate = null;
    record.connection.ontrack = null;
    record.connection.onconnectionstatechange = null;
    record.connection.close();
    peersRef.current.delete(remoteClientId);
    setRemoteStreams((previousStreams) =>
      previousStreams.filter((stream) => stream.clientId !== remoteClientId),
    );
  }, []);

  const closeAllPeers = useCallback(() => {
    for (const remoteClientId of [...peersRef.current.keys()]) {
      closePeer(remoteClientId);
    }
  }, [closePeer]);

  const getLocalNickname = useCallback(() => {
    const trimmedNickname = nickname.trim();
    return selfParticipant?.nickname ?? (trimmedNickname || getFallbackNickname(role));
  }, [nickname, role, selfParticipant?.nickname]);

  const sendSignal = useCallback(
    async (targetClientId: string, signal: VoiceSignalPayload) => {
      await sendVoiceSignal(roomId, {
        role,
        token,
        clientId,
        targetClientId,
        nickname: getLocalNickname(),
        signal,
      });
    },
    [clientId, getLocalNickname, role, roomId, token],
  );

  const flushPendingCandidates = useCallback(async (record: PeerRecord) => {
    if (!record.connection.remoteDescription) {
      return;
    }

    const pendingCandidates = [...record.pendingCandidates];
    record.pendingCandidates = [];
    await Promise.all(
      pendingCandidates.map(async (candidate) => {
        try {
          await record.connection.addIceCandidate(candidate);
        } catch {
          // Ignore duplicated or stale ICE candidates.
        }
      }),
    );
  }, []);

  const attachLocalTracksToConnection = useCallback(async (connection: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    const track = stream?.getAudioTracks()[0] ?? null;
    const before = connection.getTransceivers().length;
    const transceiver = connection
      .getTransceivers()
      .find(
        (candidate) =>
          candidate.receiver.track?.kind === "audio" || candidate.sender.track?.kind === "audio",
      );

    let branch: string;

    if (!track || !stream) {
      if (!transceiver) {
        connection.addTransceiver("audio", { direction: "recvonly" });
        branch = "无流+无收发器 → 新建 recvonly";
      } else {
        if (transceiver.sender.track) {
          await transceiver.sender.replaceTrack(null);
        }
        transceiver.direction = "recvonly";
        branch = "无流+有收发器 → 改 recvonly";
      }
    } else if (!transceiver) {
      connection.addTransceiver(track, {
        direction: "sendrecv",
        streams: [stream],
      });
      branch = "有流+无收发器 → 新建 sendrecv";
    } else {
      if (transceiver.sender.track?.id !== track.id) {
        await transceiver.sender.replaceTrack(track);
      }
      if (transceiver.direction !== "sendrecv") {
        transceiver.direction = "sendrecv";
      }
      branch = "有流+有收发器 → 复用";
    }

    /*
     * 临时诊断（查清单向音频后删除）。
     * 关键看「调用前收发器数」：正常应当始终是 1。
     * 如果某次调用前是 1、调用后变成 2，那条分支就是"凭空多出收发器"的元凶。
     */
    console.log(
      "[语音诊断:挂音轨]",
      JSON.stringify({
        信令: connection.signalingState,
        有本地流: Boolean(stream),
        调用前: before,
        调用后: connection.getTransceivers().length,
        分支: branch,
        收发器: connection.getTransceivers().map((t) => ({
          想要: t.direction,
          实际: t.currentDirection,
        })),
      }),
    );
  }, []);

  const ensurePeer = useCallback(
    (remoteParticipant: Pick<VoiceParticipant, "clientId" | "nickname">, initiate: boolean) => {
      const existing = peersRef.current.get(remoteParticipant.clientId);
      if (existing) {
        if (existing.label !== remoteParticipant.nickname) {
          existing.label = remoteParticipant.nickname;
          setRemoteStreams((previousStreams) =>
            previousStreams.map((stream) =>
              stream.clientId === remoteParticipant.clientId
                ? { ...stream, label: remoteParticipant.nickname }
                : stream,
            ),
          );
        }

        return existing;
      }

      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const stream = new MediaStream();
      const record: PeerRecord = {
        connection,
        stream,
        label: remoteParticipant.nickname,
        pendingCandidates: [],
      };

      peersRef.current.set(remoteParticipant.clientId, record);
      setRemoteStreams((previousStreams) => [
        ...previousStreams.filter((item) => item.clientId !== remoteParticipant.clientId),
        {
          clientId: remoteParticipant.clientId,
          label: remoteParticipant.nickname,
          stream,
        },
      ]);

      connection.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        void sendSignal(remoteParticipant.clientId, {
          type: "ice-candidate",
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          },
        }).catch(() => {
          setError("语音信令发送失败，请重试。");
        });
      };

      connection.ontrack = (event) => {
        const incomingTracks =
          event.streams[0]?.getTracks() ?? (event.track ? [event.track] : []);
        incomingTracks.forEach((track) => {
          if (!record.stream.getTrackById(track.id)) {
            record.stream.addTrack(track);
          }
        });

        setRemoteStreams((previousStreams) => [
          ...previousStreams.filter((item) => item.clientId !== remoteParticipant.clientId),
          {
            clientId: remoteParticipant.clientId,
            label: record.label,
            stream: record.stream,
          },
        ]);
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed" || connection.connectionState === "closed") {
          closePeer(remoteParticipant.clientId);
        }
      };

      if (initiate) {
        void (async () => {
          try {
            if (connection.signalingState !== "stable") {
              return;
            }

            await attachLocalTracksToConnection(connection);
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            await sendSignal(remoteParticipant.clientId, {
              type: "offer",
              description: {
                type: "offer",
                sdp: offer.sdp ?? "",
              },
            });
          } catch {
            closePeer(remoteParticipant.clientId);
            setError("公共语音连接建立失败，请重新加入语音。");
          }
        })();
      }

      return record;
    },
    [attachLocalTracksToConnection, closePeer, sendSignal],
  );

  const processSignal = useCallback(
    async (envelope: VoiceSignalEnvelope) => {
      if (envelope.fromClientId === clientId) {
        return;
      }

      if (processedSignalIdsRef.current.has(envelope.id)) {
        return;
      }

      processedSignalIdsRef.current.add(envelope.id);
      trimProcessedSignalCache(processedSignalIdsRef.current);

      if (envelope.signal.type === "leave") {
        closePeer(envelope.fromClientId);
        return;
      }

      const remoteParticipant = {
        clientId: envelope.fromClientId,
        nickname: envelope.fromNickname || getFallbackNickname(envelope.fromRole),
      };
      let record = ensurePeer(remoteParticipant, false);

      try {
        if (envelope.signal.type === "offer") {
          /*
           * 临时诊断（查清单向音频后删除）：钉死 glare 时序。
           * 特别要看清「冲突前信令状态」和「是否重建了连接」——
           * 线上数据里出现过"setRemoteDescription 之前就已经有 2 个收发器"，
           * 而按逻辑重建后只该有 1 个，说明还有一条未知路径在造收发器。
           */
          console.log(
            "[语音诊断:收到offer]",
            JSON.stringify({
              冲突前信令: record.connection.signalingState,
              冲突前收发器: record.connection.getTransceivers().length,
              本机也发过offer: record.connection.signalingState === "have-local-offer",
            }),
          );

          if (record.connection.signalingState !== "stable") {
            console.log("[语音诊断:收到offer]", "检测到冲突 → closePeer + 重建连接");
            closePeer(envelope.fromClientId);
            record = ensurePeer(remoteParticipant, false);
          }

          console.log(
            "[语音诊断:收到offer]",
            JSON.stringify({ 重建后收发器: record.connection.getTransceivers().length }),
          );

          await record.connection.setRemoteDescription(envelope.signal.description);

          console.log(
            "[语音诊断:收到offer]",
            JSON.stringify({
              setRemoteDescription后收发器: record.connection.getTransceivers().length,
              明细: record.connection.getTransceivers().map((t) => ({
                想要: t.direction,
                实际: t.currentDirection,
                有发送轨: Boolean(t.sender.track),
              })),
            }),
          );

          await attachLocalTracksToConnection(record.connection);
          await flushPendingCandidates(record);
          const answer = await record.connection.createAnswer();
          await record.connection.setLocalDescription(answer);
          await sendSignal(envelope.fromClientId, {
            type: "answer",
            description: {
              type: "answer",
              sdp: answer.sdp ?? "",
            },
          });
          return;
        }

        if (envelope.signal.type === "answer") {
          if (record.connection.signalingState === "have-local-offer") {
            await record.connection.setRemoteDescription(envelope.signal.description);
            await flushPendingCandidates(record);
          }
          return;
        }

        if (record.connection.remoteDescription) {
          await record.connection.addIceCandidate(envelope.signal.candidate);
        } else {
          record.pendingCandidates.push(envelope.signal.candidate);
        }
      } catch {
        setError("公共语音连接同步失败，请重新加入语音。");
      }
    },
    [attachLocalTracksToConnection, clientId, closePeer, ensurePeer, flushPendingCandidates, sendSignal],
  );

  const attachLocalTracksToPeers = useCallback(() => {
    for (const record of peersRef.current.values()) {
      void attachLocalTracksToConnection(record.connection).catch(() => {
        setError("公共语音连接同步失败，请重新加入语音。");
      });
    }
  }, [attachLocalTracksToConnection]);

  const joinVoice = useCallback(async () => {
    if (!payload || joining) {
      return;
    }

    setJoining(true);
    setError(null);

    let acquiredStream: MediaStream | null = null;

    try {
      if (!localStreamRef.current) {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("当前浏览器不支持麦克风访问。");
        }

        acquiredStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        localStreamRef.current = acquiredStream;
        setLocalStream(acquiredStream);
      }

      const nextPayload = await sendRoomCommand(roomId, {
        role,
        token,
        command: {
          type: "join-voice",
          clientId,
          nickname: nickname.trim() || getFallbackNickname(role),
        },
      });

      setPayload(nextPayload);
      attachLocalTracksToPeers();
      setError(null);
    } catch (joinError) {
      if (acquiredStream) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        if (localStreamRef.current === acquiredStream) {
          localStreamRef.current = null;
          setLocalStream(null);
        }
      }

      setError(joinError instanceof Error ? joinError.message : "加入公共语音失败。");
    } finally {
      setJoining(false);
    }
  }, [attachLocalTracksToPeers, clientId, joining, nickname, payload, role, roomId, setPayload, token]);

  const requestPublicVoice = useCallback(async () => {
    if (!payload || !isJoined || role !== "viewer" || channel !== "audience" || hasPendingPublicRequest) {
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const nextPayload = await sendRoomCommand(roomId, {
        role,
        token,
        command: {
          type: "request-public-voice",
          clientId,
          nickname: getLocalNickname(),
        },
      });

      setPayload(nextPayload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "申请加入公共频道失败。");
    } finally {
      setJoining(false);
    }
  }, [
    channel,
    clientId,
    getLocalNickname,
    hasPendingPublicRequest,
    isJoined,
    payload,
    role,
    roomId,
    setPayload,
    token,
  ]);

  const leaveVoice = useCallback(async () => {
    if (!payload || !isJoined) {
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const others = participants.filter((participant) => participant.clientId !== clientId);
      await Promise.allSettled(
        others.map(async (participant) => {
          await sendSignal(participant.clientId, { type: "leave" });
        }),
      );

      const nextPayload = await sendRoomCommand(roomId, {
        role,
        token,
        command: {
          type: "leave-voice",
          clientId,
        },
      });

      setPayload(nextPayload);
      closeAllPeers();

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "离开公共语音失败。");
    } finally {
      setJoining(false);
    }
  }, [clientId, closeAllPeers, isJoined, participants, payload, role, roomId, sendSignal, setPayload, token]);

  const toggleMute = useCallback(async () => {
    if (!isJoined || !selfParticipant) {
      return;
    }

    setError(null);

    try {
      const nextPayload = await sendRoomCommand(roomId, {
        role,
        token,
        command: {
          type: "set-voice-muted",
          clientId,
          muted: !selfParticipant.muted,
        },
      });

      setPayload(nextPayload);
    } catch (muteError) {
      setError(muteError instanceof Error ? muteError.message : "切换麦克风状态失败。");
    }
  }, [clientId, isJoined, role, roomId, selfParticipant, setPayload, token]);

  useEffect(() => {
    syncLocalTrackState();
  }, [syncLocalTrackState]);

  useEffect(() => {
    if (!isJoined) {
      closeAllPeers();
      // 已经是空数组就别再 set 一个新数组：那会让依赖它的 effect 再次触发
      setRemoteStreams((previousStreams) => (previousStreams.length === 0 ? previousStreams : []));
      return;
    }

    const otherParticipants = participants.filter((participant) => participant.clientId !== clientId);
    const activeIds = new Set(otherParticipants.map((participant) => participant.clientId));

    otherParticipants.forEach((participant) => {
      const shouldInitiate = clientId.localeCompare(participant.clientId) < 0;
      ensurePeer(participant, shouldInitiate);
    });

    [...peersRef.current.keys()].forEach((remoteClientId) => {
      if (!activeIds.has(remoteClientId)) {
        closePeer(remoteClientId);
      }
    });
  }, [clientId, closeAllPeers, closePeer, ensurePeer, isJoined, participants]);

  useEffect(() => {
    if (!lastVoiceSignal || !isJoined) {
      return;
    }

    void processSignal(lastVoiceSignal);
  }, [isJoined, lastVoiceSignal, processSignal]);

  useEffect(() => {
    if (!isJoined) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void pollVoiceSignals(roomId, role, token, clientId)
        .then(async (response) => {
          for (const signal of response.signals) {
            await processSignal(signal);
          }
        })
        .catch(() => {
          setError((previousError) => previousError ?? "公共语音同步中断，请稍后重试。");
        });
    }, 1200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [clientId, isJoined, processSignal, role, roomId, token]);

  /*
   * 临时诊断（查清单向音频后删除）：每 3 秒同时打两层状态。
   *
   * 协商层 —— 看不连的方向有没有被协商出来：
   *   想要 sendrecv / 实际 null 或 recvonly  → 收发器没生效，这一方发不出去
   *
   * 播放层 —— 区分"没收到音轨"和"收到音轨但没声音"（这两个的修法完全不同）：
   *   轨数 0                      → 根本没收到
   *   轨状态 live + 轨静音 true    → 音轨被静音了
   *   暂停 true / 元素静音 true     → 播放被浏览器挡了（我改过的那段自愈逻辑）
   */
  useEffect(() => {
    if (!isJoined) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
      const negotiation = [...peersRef.current.entries()].map(([remoteClientId, record]) => ({
        对端: remoteClientId.slice(0, 8),
        连接: record.connection.connectionState,
        本地音轨: localStreamRef.current?.getAudioTracks().length ?? 0,
        /*
         * 本地麦克风轨的状态 —— 这是之前的盲区。
         * enabled=false 时 RTP 照样在发，但内容是静音，
         * 于是"所有指标全绿、对方却听不见"。
         */
        本地轨启用: localStreamRef.current?.getAudioTracks()[0]?.enabled ?? null,
        本地轨静音: localStreamRef.current?.getAudioTracks()[0]?.muted ?? null,
        /** 服务端认为我是否处于静音状态（决定本地轨是否被禁用） */
        服务端认为我静音: selfParticipant?.muted ?? null,
        界面上的静音开关: isMuted,
        收到的音轨: record.stream.getAudioTracks().length,
        收发器: record.connection.getTransceivers().map((t) => ({
          想要: t.direction,
          实际: t.currentDirection,
        })),
      }));

      const playback = Array.from(document.querySelectorAll("audio")).map((audio, index) => {
        // srcObject 的类型是 MediaProvider（MediaStream | MediaSource | Blob），先收窄
        const mediaStream = audio.srcObject instanceof MediaStream ? audio.srcObject : null;
        const track = mediaStream?.getAudioTracks()[0] ?? null;
        return {
          序号: index,
          暂停: audio.paused,
          元素静音: audio.muted,
          音量: audio.volume,
          有流: Boolean(mediaStream),
          轨数: mediaStream?.getAudioTracks().length ?? 0,
          轨状态: track?.readyState ?? null,
          轨静音: track?.muted ?? null,
          轨启用: track?.enabled ?? null,
        };
      });

      /*
       * RTP 收发包计数 —— 这是"媒体到底有没有在传"的唯一硬证据。
       * 音轨存在、readyState=live、muted=false 都可能在没有数据包的情况下成立，
       * 只有这两个计数在涨才说明声音真的在流动。
       *   收包一直是 0  → 对方的媒体到不了本机（NAT / 代理 / 防火墙拦住）
       *   发包一直是 0  → 本机的媒体发不出去
       */
      const rtp = await Promise.all(
        [...peersRef.current.entries()].map(async ([remoteClientId, record]) => {
          const reports = await record.connection.getStats();
          let inbound: unknown = null;
          let outbound: unknown = null;

          reports.forEach((report) => {
            const item = report as unknown as Record<string, unknown>;
            if (item.type === "inbound-rtp" && item.kind === "audio") {
              inbound = { 收包: item.packetsReceived ?? 0, 收字节: item.bytesReceived ?? 0 };
            }
            if (item.type === "outbound-rtp" && item.kind === "audio") {
              outbound = { 发包: item.packetsSent ?? 0, 发字节: item.bytesSent ?? 0 };
            }
          });

          return { 对端: remoteClientId.slice(0, 8), 收: inbound, 发: outbound };
        }),
      );

      console.log("[语音诊断]", JSON.stringify({ 协商: negotiation, 播放: playback, RTP: rtp }));
    })();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [isJoined]);

  /** 卸载时要判断"当时是否还在语音里"，用 ref 记录（cleanup 闭包里的 state 会过时） */
  const joinedRef = useRef(false);
  useEffect(() => {
    joinedRef.current = isJoined;
  }, [isJoined]);

  useEffect(() => {
    return () => {
      /*
       * 直接切页面 / 关标签时，也要通知服务端离开语音。
       * 之前这里只做本地清理，服务端的 voice.participants 会一直留着这个人 ——
       * 别人看到的是一个"人已经走了、却还挂在成员列表里"的幽灵。
       */
      if (joinedRef.current) {
        joinedRef.current = false;
        void sendRoomCommand(roomId, {
          role,
          token,
          command: { type: "leave-voice", clientId },
        }).catch(() => {
          /* 页面已在卸载，通知失败无从补救 */
        });
      }

      closeAllPeers();
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };
  }, [clientId, closeAllPeers, role, roomId, token]);
  return {
    channel,
    participants,
    publicRequests,
    remoteStreams,
    localStream,
    joining,
    error,
    isJoined,
    isMuted,
    canSpeakNow,
    hasPendingPublicRequest,
    joinVoice,
    leaveVoice,
    requestPublicVoice,
    toggleMute,
  };
}


