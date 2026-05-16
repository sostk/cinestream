export type PlayerResizeMode = 'contain' | 'cover' | 'stretch' | 'none';

export type PlayerAspectMode = 'auto' | '16:9' | '4:3' | '21:9';

export const PLAYER_RESIZE_OPTIONS: { id: PlayerResizeMode; label: string; hint: string }[] = [
  { id: 'contain', label: 'Fit', hint: 'Show full frame with letterboxing' },
  { id: 'cover', label: 'Fill', hint: 'Crop to fill the screen' },
  { id: 'stretch', label: 'Stretch', hint: 'Stretch to the view bounds' },
  { id: 'none', label: 'Original', hint: 'Native pixel size (centered)' },
];

export const PLAYER_ASPECT_OPTIONS: { id: PlayerAspectMode; label: string }[] = [
  { id: 'auto', label: 'Auto (source)' },
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
  { id: '21:9', label: '21:9 ultrawide' },
];

export function aspectRatioValue(mode: PlayerAspectMode): number | undefined {
  switch (mode) {
    case '16:9':
      return 16 / 9;
    case '4:3':
      return 4 / 3;
    case '21:9':
      return 21 / 9;
    default:
      return undefined;
  }
}

export function cycleResizeMode(current: PlayerResizeMode): PlayerResizeMode {
  const idx = PLAYER_RESIZE_OPTIONS.findIndex((o) => o.id === current);
  const next = idx < 0 ? 0 : (idx + 1) % PLAYER_RESIZE_OPTIONS.length;
  return PLAYER_RESIZE_OPTIONS[next]!.id;
}

export function cycleAspectMode(current: PlayerAspectMode): PlayerAspectMode {
  const idx = PLAYER_ASPECT_OPTIONS.findIndex((o) => o.id === current);
  const next = idx < 0 ? 0 : (idx + 1) % PLAYER_ASPECT_OPTIONS.length;
  return PLAYER_ASPECT_OPTIONS[next]!.id;
}

export function resizeHudLabel(mode: PlayerResizeMode): string {
  return PLAYER_RESIZE_OPTIONS.find((o) => o.id === mode)?.label ?? 'Fill';
}

export function aspectHudLabel(mode: PlayerAspectMode): string {
  if (mode === 'auto') return 'Auto';
  return PLAYER_ASPECT_OPTIONS.find((o) => o.id === mode)?.label ?? mode;
}

export function formatAspectLabel(width: number, height: number): string {
  if (!width || !height) return '—';
  const ratio = width / height;
  const presets: [string, number][] = [
    ['21:9', 21 / 9],
    ['16:9', 16 / 9],
    ['4:3', 4 / 3],
    ['1:1', 1],
  ];
  for (const [label, target] of presets) {
    if (Math.abs(ratio - target) < 0.04) return label;
  }
  return `${Math.round(width)}×${Math.round(height)}`;
}
