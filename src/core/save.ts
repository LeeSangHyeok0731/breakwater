import { DEFAULT_KEYMAP, type Keymap } from './input';
import { STARTER_SKILLS } from '../data/skills';
import type { GearSlot } from '../data/gear';

export interface OwnedWeapon {
  uid: string;
  defId: string;
  enhance: number;
}

export interface SaveData {
  version: number;
  level: number;
  exp: number;
  gold: number;
  statPoints: number;
  skillPoints: number;
  allocated: { str: number; dex: number; int: number; hp: number };
  weapons: OwnedWeapon[];
  equipped: [string, string];
  learnedSkills: string[];
  /** 공용 패시브 단계 */
  passives: Record<string, number>;
  /** 보유한 방어구·장신구 id와 부위별 장착 */
  gear: { owned: string[]; equipped: Partial<Record<GearSlot, string>> };
  potions: { hp: number; mp: number };
  materials: Record<string, number>;
  cleared: string[];
  sweepTickets: number;
  keymap: Keymap;
  sensitivity: number;
  /** 효과음 음량 0..1 */
  sfxVolume: number;
  viewMode: 'third' | 'first';
}

export const SAVE_VERSION = 2;
const STORAGE_KEY = 'breakwater-save';

export function newSave(): SaveData {
  return {
    version: SAVE_VERSION,
    level: 1,
    exp: 0,
    gold: 0,
    statPoints: 0,
    skillPoints: 0,
    allocated: { str: 0, dex: 0, int: 0, hp: 0 },
    weapons: [
      { uid: 'w1', defId: 'training_sword', enhance: 0 },
      { uid: 'w2', defId: 'apprentice_staff', enhance: 0 },
    ],
    equipped: ['w1', 'w2'],
    learnedSkills: [...STARTER_SKILLS],
    passives: {},
    gear: { owned: [], equipped: {} },
    potions: { hp: 0, mp: 0 },
    materials: {},
    cleared: [],
    sweepTickets: 0,
    keymap: { ...DEFAULT_KEYMAP },
    sensitivity: 1,
    sfxVolume: 0.6,
    viewMode: 'third',
  };
}

/** 옛 버전이나 일부 필드가 빠진 세이브를 현재 형식으로 맞춘다. 버전이 올라가면 여기서 변환한다. */
function normalize(data: Partial<SaveData>): SaveData {
  const base = newSave();
  // v1 → v2: 챕터 1이 5개 페이즈로 늘면서 보스가 1-2에서 1-5로 옮겨졌다.
  if ((data.version ?? 1) < 2 && data.cleared?.includes('1-2')) {
    data = { ...data, cleared: [...data.cleared.filter((id) => id !== '1-2'), '1-2', '1-3', '1-4', '1-5'] };
  }
  return {
    ...base,
    ...data,
    version: SAVE_VERSION,
    allocated: { ...base.allocated, ...data.allocated },
    materials: { ...data.materials },
    passives: { ...data.passives },
    gear: { owned: [...(data.gear?.owned ?? [])], equipped: { ...data.gear?.equipped } },
    potions: { ...base.potions, ...data.potions },
    keymap: { ...DEFAULT_KEYMAP, ...data.keymap },
    // 새 무기 종류가 추가되면 그 기본 스킬도 배운 상태로 맞춘다.
    learnedSkills: [...new Set([...(data.learnedSkills ?? []), ...STARTER_SKILLS])],
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return newSave();
    return normalize(JSON.parse(raw) as Partial<SaveData>);
  } catch {
    return newSave();
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // 저장소가 막힌 환경(사생활 보호 모드 등)에서는 저장 없이 진행한다.
  }
}

export function exportSave(save: SaveData): void {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `breakwater-save-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSave(file: File): Promise<SaveData> {
  const data: unknown = JSON.parse(await file.text());
  if (typeof data !== 'object' || data === null || typeof (data as SaveData).version !== 'number') {
    throw new Error('세이브 파일 형식이 아닙니다.');
  }
  return normalize(data as Partial<SaveData>);
}
