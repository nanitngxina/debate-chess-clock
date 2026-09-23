import { useEffect, useRef } from "react";
import { publishVoiceLevels, resetVoiceLevels } from "../lib/voiceLevels";
import { DebateSide, RoomRole } from "../shared/types";

/**
 * 真实音量检测：量每一路语音的响度，回答"谁在说话"。
 *
 * 之前语音面板上的"开麦中"其实只表示**麦克风开着**，跟有没有出声无关。
 * 这里用 Web Audio 的 AnalyserNode 拿到真实强度，写进 voiceLevels 小 store
 * （不是 React state —— 这个读数每秒十几次，放进 state 会把整页一起重渲染）。
 *
 * 几个刻意的决定：
 * - 只建一个 AudioContext，每路流一个 analyser；本机麦克风也算一路
 * - 分析节点**不接到 destination**，所以完全不影响原有播放（远端音频仍由
 *   VoicePanel 里的 <audio> 播放）
 * - 用 setInterval 采样而不是 requestAnimationFrame：读数不需要动画级帧率
 * - 卸载 / 离开语音 / 流消失时都要断开节点，否则 AnalyserNode 会一直挂着
 */

/** 采样间隔：约 10 次/秒，够看出"在说话"，也不浪费 */
const SAMPLE_INTERVAL_MS = 100;

/** 正常说话大致在这个量级之上；低于它当没说话，避免底噪把界面点亮 */
export const SPEAKING_THRESHOLD = 0.12;

export interface LevelSource {
  clientId: string;
  stream: MediaStream;
}

interface LevelParticipant {
  clientId: string;
  role: RoomRole;
}

interface AnalyserEntry {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  /** 零增益的汇点，见下面 ensureSink 的说明 */
  sink: GainNode | null;
  data: Uint8Array<ArrayBuffer>;
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  return candidate ?? null;
}

/** 时域数据 → 0..1 的响度（放大约 4 倍，语音落在可用区间） */
function readLevel(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(data);

  let sum = 0;
  for (let index = 0; index < data.length; index += 1) {
    const centered = (data[index] - 128) / 128;
    sum += centered * centered;
  }

  const rms = Math.sqrt(sum / data.length);
  return Math.min(1, rms * 4);
}

/**
 * @param sources      要监测的音频流（远端 + 本机），带各自的 clientId
 * @param participants 用来把"谁在响"归到阵营上
 * @param enabled      是否开启检测（没加入语音就别建 AudioContext）
 */
export function useVoiceLevels(
  sources: LevelSource[],
  participants: LevelParticipant[],
  enabled: boolean,
): void {
  const contextRef = useRef<AudioContext | null>(null);
  const entriesRef = useRef(new Map<string, AnalyserEntry>());

  // 参与者变化不该重启采样定时器，用 ref 读取即可
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  // 建立 / 拆除分析节点
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      return;
    }

    if (!contextRef.current) {
      contextRef.current = new AudioContextCtor();
    }

    const context = contextRef.current;
    // 浏览器要求音频上下文在用户手势后才能启动；加入语音本身就是一次点击
    if (context.state === "suspended") {
      void context.resume();
    }

    const entries = entriesRef.current;
    const wanted = new Set(sources.map((item) => item.clientId));

    for (const [clientId, entry] of entries) {
      if (!wanted.has(clientId)) {
        entry.source.disconnect();
        entry.analyser.disconnect();
        entry.sink?.disconnect();
        entries.delete(clientId);
      }
    }

    for (const item of sources) {
      if (entries.has(item.clientId)) {
        continue;
      }

      // 还没有音频轨（对方刚加入、信令没走完）就跳过，下一轮再试
      if (item.stream.getAudioTracks().length === 0) {
        continue;
      }

      const source = context.createMediaStreamSource(item.stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);

      /*
        Web Audio 的图是从 destination 拉取的：只连到 analyser、不连任何出口的子图，
        在某些情况下根本不会被处理，读数永远是 0。所以接一个**零增益**的汇点：
        图被正常拉取，但一点声音都不会发出来（远端音频仍然只由 <audio> 播放）。
      */
      const sink = context.createGain();
      sink.gain.value = 0;
      analyser.connect(sink);
      sink.connect(context.destination);

      entries.set(item.clientId, {
        source,
        analyser,
        sink,
        data: new Uint8Array(analyser.frequencyBinCount),
      });
    }
  }, [sources, enabled]);

  // 采样并写进 store
  useEffect(() => {
    if (!enabled) {
      resetVoiceLevels();
      return;
    }

    const timer = window.setInterval(() => {
      const byClient: Record<string, number> = {};

      for (const [clientId, entry] of entriesRef.current) {
        byClient[clientId] = readLevel(entry.analyser, entry.data);
      }

      const bySide: Record<DebateSide, number> = { affirmative: 0, negative: 0 };
      for (const participant of participantsRef.current) {
        if (participant.role !== "affirmative" && participant.role !== "negative") {
          continue;
        }

        bySide[participant.role] = Math.max(
          bySide[participant.role],
          byClient[participant.clientId] ?? 0,
        );
      }

      publishVoiceLevels({ byClient, bySide });
    }, SAMPLE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      resetVoiceLevels();
    };
  }, [enabled]);

  // 卸载：断开所有节点并关闭上下文
  useEffect(
    () => () => {
      for (const entry of entriesRef.current.values()) {
        entry.source.disconnect();
        entry.analyser.disconnect();
        entry.sink?.disconnect();
      }

      entriesRef.current.clear();
      void contextRef.current?.close();
      contextRef.current = null;
    },
    [],
  );
}
