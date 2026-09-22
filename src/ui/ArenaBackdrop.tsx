/**
 * 辩论现场的抽象背景轮廓。
 *
 * 全部是线稿：舞台灯束、辩论台、立式麦克风、人物剪影、地面线。
 * 左侧冷蓝代表正方、右侧鲜红代表反方，中间完全干净 —— 视线必须落在计时器上。
 *
 * 对比度刻意压得极低（配合 .hero__backdrop 的整体透明度），
 * 只作为"这是一个比赛现场"的氛围暗示，绝不与棋钟争抢注意力。
 */
export function ArenaBackdrop() {
  return (
    <svg
      className="arena-backdrop"
      viewBox="0 0 1440 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="beam-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="beam-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f04444" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#f04444" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="floor-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.035" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="center-dark" cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="#0a0a0b" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#0a0a0b" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 两侧舞台灯束 */}
      <path d="M140 0 L380 720 L70 720 Z" fill="url(#beam-left)" />
      <path d="M1300 0 L1370 720 L1060 720 Z" fill="url(#beam-right)" />

      {/* 舞台地面 */}
      <rect x="0" y="600" width="1440" height="120" fill="url(#floor-fade)" />
      <line x1="0" y1="600" x2="1440" y2="600" stroke="#ffffff" strokeOpacity="0.05" />

      {/* 正方侧：辩论台 + 立式麦克风 + 人物轮廓 */}
      <g stroke="#3b82f6" strokeOpacity="0.16" strokeWidth="1.25" fill="none">
        <path d="M150 600 L174 476 L274 476 L298 600" />
        <line x1="224" y1="476" x2="224" y2="410" />
        <ellipse cx="224" cy="402" rx="8" ry="11" />
        <path d="M206 600 L206 566 L242 566 L242 600" strokeOpacity="0.1" />
        <circle cx="224" cy="358" r="17" />
        <path d="M192 476 c0 -30 15 -49 32 -49 s32 19 32 49" />
      </g>

      {/* 反方侧：镜像 */}
      <g stroke="#f04444" strokeOpacity="0.16" strokeWidth="1.25" fill="none">
        <path d="M1142 600 L1166 476 L1266 476 L1290 600" />
        <line x1="1216" y1="476" x2="1216" y2="410" />
        <ellipse cx="1216" cy="402" rx="8" ry="11" />
        <path d="M1198 600 L1198 566 L1234 566 L1234 600" strokeOpacity="0.1" />
        <circle cx="1216" cy="358" r="17" />
        <path d="M1184 476 c0 -30 15 -49 32 -49 s32 19 32 49" />
      </g>

      {/* 更外侧的观众轮廓，进一步压暗 */}
      <g stroke="#92959b" strokeOpacity="0.07" strokeWidth="1.1" fill="none">
        <circle cx="420" cy="562" r="11" />
        <path d="M398 600 c0 -19 10 -30 22 -30 s22 11 22 30" />
        <circle cx="520" cy="558" r="11" />
        <path d="M498 600 c0 -19 10 -30 22 -30 s22 11 22 30" />
        <circle cx="1020" cy="562" r="11" />
        <path d="M998 600 c0 -19 10 -30 22 -30 s22 11 22 30" />
        <circle cx="920" cy="558" r="11" />
        <path d="M898 600 c0 -19 10 -30 22 -30 s22 11 22 30" />
      </g>

      {/* 中央保持干净，确保计时数字是唯一焦点 */}
      <ellipse cx="720" cy="330" rx="640" ry="380" fill="url(#center-dark)" />
    </svg>
  );
}
