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

function getFallbackNickname(role: RoomRole): string {
  switch (role) {
    case "host":
      return "主持人";
    case "affirmative":
      return "姝ｆ柟";
    case "negative":
      return "鍙嶆柟";
    case "viewer":
      return "瑙備紬";
  }
}

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

  const peersRef = useRef(new Map<string, PeerRecord>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignalIdsRef = useRef(new Set<string>());
  const allParticipants = payload?.room.voice.participants ?? [];
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
    const transceiver = connection
      .getTransceivers()
      .find(
        (candidate) =>
          candidate.receiver.track?.kind === "audio" || candidate.sender.track?.kind === "audio",
      );

    if (!track || !stream) {
      if (!transceiver) {
        connection.addTransceiver("audio", { direction: "recvonly" });
        return;
      }

      if (transceiver.sender.track) {
        await transceiver.sender.replaceTrack(null);
      }
      transceiver.direction = "recvonly";
      return;
    }

    if (!transceiver) {
      connection.addTransceiver(track, {
        direction: "sendrecv",
        streams: [stream],
      });
      return;
    }

    if (transceiver.sender.track?.id !== track.id) {
      await transceiver.sender.replaceTrack(track);
    }

    if (transceiver.direction !== "sendrecv") {
      transceiver.direction = "sendrecv";
    }
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

      const connection = new RTCPeerConnection();
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
          if (record.connection.signalingState !== "stable") {
            closePeer(envelope.fromClientId);
            record = ensurePeer(remoteParticipant, false);
          }

          await record.connection.setRemoteDescription(envelope.signal.description);
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
      setRemoteStreams([]);
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

  useEffect(() => {
    return () => {
      closeAllPeers();
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };
  }, [closeAllPeers]);

  return {
    channel,
    participants,
    publicRequests,
    remoteStreams,
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


