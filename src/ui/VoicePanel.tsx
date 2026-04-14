import { useEffect, useRef } from "react";
import { describeRole } from "../lib/format";
import { AccountProfile, RoomRole, VoiceChannel, VoiceParticipant, VoiceRequest } from "../shared/types";
import { AccountAvatar } from "./AccountAvatar";

interface RemoteAudioStream {
  clientId: string;
  label: string;
  stream: MediaStream;
}

interface VoicePanelProps {
  account: AccountProfile | null;
  role: RoomRole;
  currentChannel: VoiceChannel;
  participants: VoiceParticipant[];
  publicRequests: VoiceRequest[];
  remoteStreams: RemoteAudioStream[];
  joining: boolean;
  isJoined: boolean;
  isMuted: boolean;
  canSpeakNow: boolean;
  hasPendingPublicRequest: boolean;
  error: string | null;
  onJoinVoice: () => void | Promise<void>;
  onLeaveVoice: () => void | Promise<void>;
  onToggleMute: () => void | Promise<void>;
  onRequestPublicVoice: () => void | Promise<void>;
  onApprovePublicVoice?: (clientId: string) => void | Promise<void>;
}

function getVoiceTitle(role: RoomRole, currentChannel: VoiceChannel): string {
  if (role === "viewer" && currentChannel === "public") {
    return "公共语音";
  }

  return role === "viewer" ? "观众语音频道" : "公共语音";
}

function getJoinLabel(title: string, isJoined: boolean): string {
  return isJoined ? `离开${title}` : `加入${title}`;
}

function describeVoiceNotice(role: RoomRole, currentChannel: VoiceChannel, canSpeakNow: boolean): string {
  if (role === "viewer" && currentChannel === "audience") {
    return "观众默认进入观众语音频道。你也可以申请加入公共频道，等待主持人批准。";
  }

  if (role === "viewer" && currentChannel === "public") {
    return "你已被主持人批准加入公共频道，现在可以和主持人及辩手一起语音交流。";
  }

  if (role === "host") {
    return "主持人可以长期待在公共语音里，并且不受棋钟计时限制。";
  }

  if (!canSpeakNow) {
    return "当前不是你方计时阶段，你可以旁听，但麦克风会保持静音。";
  }

  return "现在轮到你方发言，你可以在公共语音中打开麦克风。";
}

function describeParticipantStatus(participant: VoiceParticipant): string {
  return participant.muted ? "已静音" : "开麦中";
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.srcObject = stream;
    void audio.play().catch(() => {
      // Some browsers require another user gesture before playback.
    });
  }, [stream]);

  return <audio autoPlay playsInline ref={audioRef} />;
}

export function VoicePanel({
  account,
  role,
  currentChannel,
  participants,
  publicRequests,
  remoteStreams,
  joining,
  isJoined,
  isMuted,
  canSpeakNow,
  hasPendingPublicRequest,
  error,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onRequestPublicVoice,
  onApprovePublicVoice,
}: VoicePanelProps) {
  const connectedStreams = remoteStreams.filter((stream) => stream.stream.getAudioTracks().length > 0);
  const title = getVoiceTitle(role, currentChannel);
  const canViewerRequestPublic = role === "viewer" && isJoined && currentChannel === "audience";

  return (
    <section className="card voice-panel">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">实时语音</span>
          <h2>{title}</h2>
        </div>
        <span className="pill">{isJoined ? "已加入" : "未加入"}</span>
      </div>

      <p className="voice-panel__intro">{describeVoiceNotice(role, currentChannel, canSpeakNow)}</p>

      <div className="account-inline">
        {account ? (
          <>
            <AccountAvatar
              displayName={account.displayName}
              avatarUrl={account.avatarUrl}
              className="account-avatar--small"
            />
            <div>
              <strong>{account.displayName}</strong>
              <span>进入语音时会自动使用当前账户名称</span>
            </div>
          </>
        ) : (
          <p className="empty-state">先在顶部注册账户，再加入语音频道。</p>
        )}
      </div>

      <div className="voice-panel__actions">
        <button
          type="button"
          className="button"
          disabled={joining || !account}
          onClick={() => {
            void (isJoined ? onLeaveVoice() : onJoinVoice());
          }}
        >
          {joining ? "处理中..." : getJoinLabel(title, isJoined)}
        </button>

        <button
          type="button"
          className="button button--ghost"
          disabled={!isJoined || joining || !canSpeakNow}
          onClick={() => {
            void onToggleMute();
          }}
        >
          {isMuted ? "打开麦克风" : "静音麦克风"}
        </button>
      </div>

      {canViewerRequestPublic && (
        <div className="voice-panel__actions">
          <button
            type="button"
            className="button button--ghost"
            disabled={joining || hasPendingPublicRequest || !account}
            onClick={() => {
              void onRequestPublicVoice();
            }}
          >
            {hasPendingPublicRequest ? "等待主持人同意" : "申请加入公共频道"}
          </button>
        </div>
      )}

      {role === "host" && publicRequests.length > 0 && (
        <section className="voice-box">
          <div className="voice-box__header">
            <strong>公共频道申请</strong>
            <span>{publicRequests.length} 人</span>
          </div>
          <div className="voice-box__list">
            {publicRequests.map((request) => (
              <article className="voice-member" key={request.clientId}>
                <strong>{request.nickname}</strong>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={joining}
                  onClick={() => {
                    void onApprovePublicVoice?.(request.clientId);
                  }}
                >
                  同意加入公共频道
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {error && <p className="feedback feedback--error">{error}</p>}

      <div className="voice-panel__grid">
        <section className="voice-box">
          <div className="voice-box__header">
            <strong>{title}成员</strong>
            <span>{participants.length} 人</span>
          </div>
          <div className="voice-box__list">
            {participants.map((participant) => (
              <article className="voice-member" key={participant.clientId}>
                <strong>
                  {participant.nickname} · {describeRole(participant.role)}
                </strong>
                <span>{describeParticipantStatus(participant)}</span>
              </article>
            ))}
            {participants.length === 0 && <p className="empty-state">还没有人加入这个语音频道。</p>}
          </div>
        </section>

        <section className="voice-box">
          <div className="voice-box__header">
            <strong>当前能听到的成员</strong>
            <span>{connectedStreams.length} 人</span>
          </div>
          <div className="voice-box__list">
            {connectedStreams.map((stream) => (
              <article className="voice-member" key={stream.clientId}>
                <strong>{stream.label}</strong>
                <span>音频已接通</span>
              </article>
            ))}
            {connectedStreams.length === 0 && <p className="empty-state">加入语音后，这里会显示已经接通的其他成员。</p>}
          </div>
        </section>
      </div>

      {remoteStreams.map((stream) => (
        <RemoteAudio key={stream.clientId} stream={stream.stream} />
      ))}
    </section>
  );
}
