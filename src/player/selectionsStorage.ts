import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'cinestream-player-selections-v1';

export type PerTitlePlayerSelection = {
  sourceSig?: string;
  subtitleIdx: number;
  audioIdx: number;
  /** -1 = auto (native adaptive) */
  videoTrackIdx: number;
};

export type PlayerSelectionsFile = {
  v: 1;
  byMediaKey: Record<string, PerTitlePlayerSelection>;
};

const emptyFile = (): PlayerSelectionsFile => ({ v: 1, byMediaKey: {} });

async function readAll(): Promise<PlayerSelectionsFile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyFile();
    const parsed = JSON.parse(raw) as PlayerSelectionsFile;
    if (parsed?.v !== 1 || typeof parsed.byMediaKey !== 'object' || !parsed.byMediaKey) {
      return emptyFile();
    }
    return parsed;
  } catch {
    return emptyFile();
  }
}

export async function loadPlayerSelection(mediaKey: string): Promise<PerTitlePlayerSelection | null> {
  const file = await readAll();
  const row = file.byMediaKey[mediaKey];
  if (!row) return null;
  return {
    sourceSig: typeof row.sourceSig === 'string' ? row.sourceSig : undefined,
    subtitleIdx: typeof row.subtitleIdx === 'number' ? row.subtitleIdx : -1,
    audioIdx: typeof row.audioIdx === 'number' ? row.audioIdx : 0,
    videoTrackIdx: typeof row.videoTrackIdx === 'number' ? row.videoTrackIdx : -1,
  };
}

export async function savePlayerSelection(mediaKey: string, patch: Partial<PerTitlePlayerSelection>): Promise<void> {
  const file = await readAll();
  const prev = file.byMediaKey[mediaKey] ?? {
    subtitleIdx: -1,
    audioIdx: 0,
    videoTrackIdx: -1,
  };
  file.byMediaKey[mediaKey] = { ...prev, ...patch };
  const keys = Object.keys(file.byMediaKey);
  if (keys.length > 120) {
    for (const k of keys.slice(0, keys.length - 120)) {
      delete file.byMediaKey[k];
    }
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(file));
}
