/**
 * 辩论现场的抽象背景。
 *
 * 纯几何绘制：舞台灯束、辩论台、麦克风、地面线、人物剪影。
 * 左边蓝色代表正方，右边红色代表反方，中间保持完全黑暗 —— 视线必须落在棋钟上。
 * 所有元素透明度都压得很低（0.06–0.18），只是氛围，不是主体。
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
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="beam-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f04444" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f04444" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="floor-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="center-dark" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#0a0a0b" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0a0a0b" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 顶部两侧舞台灯束 */}
      <path d="M120 0 L360 720 L60 720 Z" fill="url(#beam-left)" />
      <path d="M1320 0 L1380 720 L1080 720 Z" fill="url(#beam-right)" />

      {/* 舞台地面 */}
      <rect x="0" y="596" width="1440" height="124" fill="url(#floor-fade)" />
      <line x1="0" y1="596" x2="1440" y2="596" stroke="#ffffff" strokeOpacity="0.07" />

      {/* 左侧：辩论台 + 麦克风（正方） */}
      <g stroke="#3b82f6" strokeOpacity="0.22" strokeWidth="1.5" fill="none">
        <path d="M148 596 L172 470 L272 470 L296 596" />
        <line x1="222" y1="470" x2="222" y2="404" />
        <ellipse cx="222" cy="396" rx="9" ry="12" />
        <path d="M204 596 L204 560 L240 560 L240 596" strokeOpacity="0.14" />
      </g>

      {/* 左侧：人物剪影 */}
      <g fill="#3b82f6" fillOpacity="0.1">
        <circle cx="222" cy="352" r="18" />
        <path d="M186 470 c0 -32 16 -52 36 -52 s36 20 36 52 z" />
      </g>

      {/* 右侧：辩论台 + 麦克风（反方，镜像） */}
      <g stroke="#f04444" strokeOpacity="0.22" strokeWidth="1.5" fill="none">
        <path d="M1144 596 L1168 470 L1268 470 L1292 596" />
        <line x1="1218" y1="470" x2="1218" y2="404" />
        <ellipse cx="1218" cy="396" rx="9" ry="12" />
        <path d="M1200 596 L1200 560 L1236 560 L1236 596" strokeOpacity="0.14" />
      </g>

      <g fill="#f04444" fillOpacity="0.1">
        <circle cx="1218" cy="352" r="18" />
        <path d="M1182 470 c0 -32 16 -52 36 -52 s36 20 36 52 z" />
      </g>

      {/* 更远的两侧观众剪影，进一步压暗 */}
      <g fill="#92959b" fillOpacity="0.05">
        <circle cx="420" cy="560" r="12" />
        <path d="M396 596 c0 -20 10 -32 24 -32 s24 12 24 32 z" />
        <circle cx="520" cy="556" r="12" />
        <path d="M496 596 c0 -20 10 -32 24 -32 s24 12 24 32 z" />
        <circle cx="1020" cy="560" r="12" />
        <path d="M996 596 c0 -20 10 -32 24 -32 s24 12 24 32 z" />
        <circle cx="920" cy="556" r="12" />
        <path d="M896 596 c0 -20 10 -32 24 -32 s24 12 24 32 z" />
      </g>

      {/* 中央保持黑暗，确保棋钟是唯一焦点 */}
      <ellipse cx="720" cy="330" rx="620" ry="360" fill="url(#center-dark)" />
    </svg>
  );
}
