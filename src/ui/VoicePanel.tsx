import { useEffect, useRef } from "react";
import { SPEAKING_THRESHOLD } from "../hooks/useVoiceLevels";
import { useVoiceLevel } from "../lib/voiceLevels";
import {
  AccountProfile,
  RoomRole,
  VoiceChannel,
  VoiceParticipant,
  VoiceRequest,
} from "../shared/types";
import { AccountAvatar } from "./AccountAvatar";
import { StatusBadge } from "./StatusBadge";

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
  onRejectPublicVoice?: (clientId: string) => void | Promise<void>;
}

/** 成员按身份分组的顺序（服务端只有这四个角色） */
const ROLE_GROUPS: { role: RoomRole; label: string }[] = [
  { role: "host", label: "主持人" },
  { role: "affirmative", label: "正方" },
  { role: "negative", label: "反方" },
  { role: "viewer", label: "观众" },
];

/**
 * 一个语音成员。
 *
 * 单独抽成组件是为了订阅音量：只有这一行会随音量重渲染，
 * 语音面板和整个房间页都不会跟着动（音量读数每秒十几次）。
 */
function VoiceMember({ participant }: { participant: VoiceParticipant }) {
  const level = useVoiceLevel(participant.clientId);
  const speaking = !participant.muted && level >= SPEAKING_THRESHOLD;

  return (
    <li className={`voice-member ${speaking ? "voice-member--speaking" : ""}`}>
      <span className="voice-member__name">{participant.nickname}</span>

      <span className="voice-member__state">
        {speaking && (
          <span className="voice-member__level" aria-hidden="true">
            <span
              className="voice-member__level-fill"
              style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }}
            />
          </span>
        )}

        <StatusBadge
          tone={speaking ? "live" : participant.muted ? "waiting" : "plain"}
          marker={participant.muted ? "hollow" : "dot"}
        >
          {participant.muted ? "已静音" : speaking ? "正在说话" : "开麦中"}
        </StatusBadge>
      </span>
    </li>
  );
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

function describeVoiceNotice(
  role: RoomRole,
  currentChannel: VoiceChannel,
  canSpeakNow: boolean,
): string {
  if (role === "viewer" && currentChannel === "audience") {
    return "观众默认进入观众语音频道。也可以申请加入公共频道，等待主持人批准。";
  }

  if (role === "viewer" && currentChannel === "public") {
    return "你已被主持人批准加入公共频道，现在可以和主持人及辩手一起语音交流。";
  }

  if (role === "host") {
    return "主持人可以长期待在公共语音里，且不受棋钟计时限制。";
  }

  if (!canSpeakNow) {
    return "当前不是你方计时阶段，你可以旁听，麦克风保持静音。";
  }

  return "现在轮到你方发言，可以在公共语音中打开麦克风。";
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
      // 部分浏览器需要用户手势后才允许播放
    });
  }, [stream]);

  return <audio autoPlay playsInline ref={audioRef} />;
}

/** 语音状态：成员列表用状态点表达"开麦中 / 已静音"。 */
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
  onRejectPublicVoice,
}: VoicePanelProps) {
  const connectedStreams = remoteStreams.filter((stream) => stream.stream.getAudioTracks().length > 0);
  const title = getVoiceTitle(role, currentChannel);
  const canViewerRequestPublic = role === "viewer" && isJoined && currentChannel === "audience";

  return (
    <section className="voice-panel">
      <div className="voice-panel__head">
        <span className="u-label">Voice</span>
        <span className="voice-panel__title">{title}</span>
        <span className={`pill ${isJoined ? "pill--live" : "pill--plain"}`}>
          {isJoined && <span className="dot dot--live" />}
          {isJoined ? "已加入" : "未加入"}
        </span>
      </div>

      <div className="voice-panel__body">
        <p className="voice-panel__note">{describeVoiceNotice(role, currentChannel, canSpeakNow)}</p>

        {account ? (
          <div className="voice-panel__identity">
            <AccountAvatar
              displayName={account.displayName}
              avatarUrl={account.avatarUrl}
              className="avatar avatar--sm"
            />
            <span>{account.displayName}</span>
            <span className="dim">进入语音时会使用当前账号名称</span>
          </div>
        ) : (
          <p className="dim">登录后才能加入语音频道。</p>
        )}

        <div className="voice-panel__actions">
          <button
            type="button"
            className={isJoined ? "btn btn--ghost" : "btn btn--live"}
            disabled={joining || !account}
            onClick={() => {
              void (isJoined ? onLeaveVoice() : onJoinVoice());
            }}
          >
            {joining ? "处理中…" : getJoinLabel(title, isJoined)}
          </button>

          <button
            type="button"
            className="btn btn--ghost"
            disabled={!isJoined || joining || !canSpeakNow}
            onClick={() => {
              void onToggleMute();
            }}
          >
            {isMuted ? "打开麦克风" : "静音麦克风"}
          </button>

          {canViewerRequestPublic && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={joining || hasPendingPublicRequest || !account}
              onClick={() => {
                void onRequestPublicVoice();
              }}
            >
              {hasPendingPublicRequest ? "等待主持人同意" : "申请加入公共频道"}
            </button>
          )}
        </div>

        {error && <p className="feedback feedback--error">{error}</p>}

        {role === "host" && publicRequests.length > 0 && (
          <div className="voice-block">
            <div className="voice-block__head">
              <span className="u-label">上麦申请</span>
              <span className="pill pill--warn">{publicRequests.length} 人</span>
            </div>
            <ul className="voice-members">
              {publicRequests.map((request) => (
                <li className="voice-member" key={request.clientId}>
                  <span className="voice-member__name">{request.nickname}</span>
                  <span className="voice-member__actions">
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={joining}
                      onClick={() => {
                        void onApprovePublicVoice?.(request.clientId);
                      }}
                    >
                      允许
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      disabled={joining}
                      onClick={() => {
                        void onRejectPublicVoice?.(request.clientId);
                      }}
                    >
                      拒绝
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="voice-block">
          <div className="voice-block__head">
            <span className="u-label">{title}成员</span>
            <span className="pill pill--plain">{participants.length} 人</span>
          </div>

          {participants.length === 0 ? (
            <p className="empty">还没有人加入这个语音频道。</p>
          ) : (
            ROLE_GROUPS.map((group) => {
              const members = participants.filter((item) => item.role === group.role);

              if (members.length === 0) {
                return null;
              }

              return (
                <div className="voice-group" key={group.role}>
                  <div className="voice-group__head">
                    <span className={`voice-group__dot voice-group__dot--${group.role}`} />
                    <span className="voice-group__label">{group.label}</span>
                    <span className="voice-group__count num">{members.length}</span>
                  </div>

                  <ul className="voice-members">
                    {members.map((participant) => (
                      <VoiceMember key={participant.clientId} participant={participant} />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <div className="voice-block">
          <div className="voice-block__head">
            <span className="u-label">已接通</span>
            <span className="pill pill--plain">{connectedStreams.length} 人</span>
          </div>
          <ul className="voice-members">
            {connectedStreams.map((stream) => (
              <li className="voice-member" key={stream.clientId}>
                <span className="voice-member__name">{stream.label}</span>
                <span className="pill pill--live">音频已接通</span>
              </li>
            ))}
            {connectedStreams.length === 0 && (
              <li className="empty">加入语音后，这里会显示已经接通的其他成员。</li>
            )}
          </ul>
        </div>
      </div>

      {remoteStreams.map((stream) => (
        <RemoteAudio key={stream.clientId} stream={stream.stream} />
      ))}
    </section>
  );
}
