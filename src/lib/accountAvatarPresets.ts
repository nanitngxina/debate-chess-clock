export interface AccountAvatarPreset {
  id: string;
  label: string;
  summary: string;
  avatarUrl: string;
}

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createAvatarSvg(backgroundA: string, backgroundB: string, accent: string, emblem: string): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${backgroundA}" />
          <stop offset="100%" stop-color="${backgroundB}" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="44" fill="url(#bg)" />
      <circle cx="80" cy="80" r="56" fill="rgba(255,255,255,0.08)" />
      <circle cx="80" cy="80" r="42" fill="rgba(8,10,14,0.18)" stroke="${accent}" stroke-width="4" />
      ${emblem}
    </svg>
  `.trim();
}

const presets: Array<Omit<AccountAvatarPreset, "avatarUrl"> & { emblem: string; backgroundA: string; backgroundB: string; accent: string }> = [
  {
    id: "ember",
    label: "反党分子",
    summary: "嘴硬骨头也硬",
    backgroundA: "#7a2315",
    backgroundB: "#d66d2b",
    accent: "#ffd39b",
    emblem: '<path d="M62 112V46" stroke="#ffd39b" stroke-width="8" stroke-linecap="round" /><path d="M68 48h40l-16 18 16 18H68Z" fill="#ffd39b" /><path d="M56 102 74 84 86 92 106 64" stroke="#fff0d6" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />',
  },
  {
    id: "tide",
    label: "墙头草",
    summary: "风往哪吹哪倒",
    backgroundA: "#12314f",
    backgroundB: "#3d86c6",
    accent: "#d6f0ff",
    emblem: '<path d="M80 44v64" stroke="#d6f0ff" stroke-width="8" stroke-linecap="round" /><path d="M54 66h52" stroke="#d6f0ff" stroke-width="8" stroke-linecap="round" /><path d="M46 66 68 54v24Z" fill="#d6f0ff" /><path d="M114 66 92 54v24Z" fill="#d6f0ff" /><path d="M66 112c6-12 10-22 14-30M94 112c-6-12-10-22-14-30" stroke="#d6f0ff" stroke-width="6" stroke-linecap="round" />',
  },
  {
    id: "jade",
    label: "老好人",
    summary: "谁都不想得罪",
    backgroundA: "#12483c",
    backgroundB: "#2f9f73",
    accent: "#d7ffe6",
    emblem: '<path d="M48 92 68 72l14 10-20 20c-6 6-16 6-22 0Z" fill="#d7ffe6" /><path d="M112 92 92 72 78 82l20 20c6 6 16 6 22 0Z" fill="#d7ffe6" /><path d="M66 70 78 82 84 82 96 70" stroke="#f3fff7" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" /><path d="M56 58h18l-10 14H46Z" fill="#d7ffe6" opacity="0.75" /><path d="M104 58H86l10 14h18Z" fill="#d7ffe6" opacity="0.75" />',
  },
  {
    id: "violet",
    label: "野心家",
    summary: "眼里全是高位",
    backgroundA: "#291548",
    backgroundB: "#7747c7",
    accent: "#ffd66e",
    emblem: '<path d="M50 100h60l-6 14H56Z" fill="#ffd66e" /><path d="M52 98 62 58 80 78 98 52 108 78 116 58 124 98Z" fill="#ffd66e" /><path d="M80 108V54M80 54l-12 12M80 54l12 12" stroke="#fff2bf" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />',
  },
  {
    id: "iron",
    label: "小修苗",
    summary: "慢慢长成大树",
    backgroundA: "#27313b",
    backgroundB: "#667381",
    accent: "#c8ffd2",
    emblem: '<path d="M48 104c10 8 22 12 32 12s22-4 32-12" stroke="#c8ffd2" stroke-width="8" stroke-linecap="round" /><path d="M80 104V64" stroke="#c8ffd2" stroke-width="8" stroke-linecap="round" /><path d="M80 74c-16-2-26-14-28-28 16 2 26 14 28 28Z" fill="#c8ffd2" /><path d="M80 82c16-2 26-14 28-28-16 2-26 14-28 28Z" fill="#c8ffd2" />',
  },
  {
    id: "solar",
    label: "小恶霸",
    summary: "张牙舞爪逞强",
    backgroundA: "#7a4d08",
    backgroundB: "#e0a82c",
    accent: "#fff6c9",
    emblem: '<path d="M56 54 70 64 80 50 90 64 104 54 98 74 112 84 98 88 94 108 80 98 66 108 62 88 48 84 62 74Z" fill="#fff6c9" /><path d="M64 78 74 72M86 72 96 78" stroke="#7a4d08" stroke-width="6" stroke-linecap="round" /><path d="M66 92h28l-4 8-6-4-6 4-6-4-6 4Z" fill="#7a4d08" />',
  },
];

export const ACCOUNT_AVATAR_PRESETS: AccountAvatarPreset[] = presets.map((preset) => ({
  id: preset.id,
  label: preset.label,
  summary: preset.summary,
  avatarUrl: toDataUrl(createAvatarSvg(preset.backgroundA, preset.backgroundB, preset.accent, preset.emblem)),
}));

export function findAvatarPresetByUrl(avatarUrl: string): AccountAvatarPreset | null {
  return ACCOUNT_AVATAR_PRESETS.find((preset) => preset.avatarUrl === avatarUrl) ?? null;
}
