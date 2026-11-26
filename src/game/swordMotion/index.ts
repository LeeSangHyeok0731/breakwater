import Phaser from 'phaser';
import { newBuf, type Buf } from './pixels';
import { COMBOS, FPS, type SwordPose } from './poses';
import { drawPose, FRAME_H, FRAME_W } from './rig';
import { DAO_COMBOS, DAO_LOOPS, DAO_SKILL_MOTIONS, type DaoSkill } from './daoMotions';
import { SKILL_MOTIONS, type SwordSkill } from './skillMotions';
import { cutStamps } from './stamps';

// 검사 평타 몸동작. 단계(1~5)마다 칸을 가로로 이어 붙인 텍스처 `sword-combo-N`을 부팅 때 만든다.
// 칸은 애니메이션 재생이 아니라 동작이 시작한 뒤 흐른 시간으로 고른다 (타격 시점에 타격 칸이 오도록).

/** 칸의 몸통 기준점 (x 비율). 발바닥이 칸 맨 아래다. */
export const SWORD_ORIGIN_X = 40 / FRAME_W;

export function swordTexKey(step: number): string {
  return `sword-combo-${step}`;
}

/** 동작이 시작한 뒤 t초일 때 몇 번째 칸인가 */
export function swordFrameAt(step: number, t: number): number {
  return Math.max(0, Math.min(COMBOS[step - 1].length - 1, Math.floor(t * FPS)));
}

/** 그 단의 마지막 칸 (다음 단의 시작 자세와 같다) */
export function swordLastFrame(step: number): number {
  return COMBOS[step - 1].length - 1;
}

export function hasSwordMotion(step: number): boolean {
  return step >= 1 && step <= COMBOS.length;
}

export type { DaoSkill, SwordSkill };

export function skillTexKey(skill: SwordSkill): string {
  return `sword-skill-${skill}`;
}

export function skillFrameAt(skill: SwordSkill, t: number): number {
  return Math.max(0, Math.min(SKILL_MOTIONS[skill].length - 1, Math.floor(t * FPS)));
}

export function isSwordSkill(name: string | undefined): name is SwordSkill {
  return name !== undefined && name in SKILL_MOTIONS;
}

// ───────── 도 ─────────

export function daoTexKey(step: number): string {
  return `dao-combo-${step}`;
}

export function daoFrameAt(step: number, t: number): number {
  return Math.max(0, Math.min(DAO_COMBOS[step - 1].length - 1, Math.floor(t * FPS)));
}

export function daoLastFrame(step: number): number {
  return DAO_COMBOS[step - 1].length - 1;
}

export function hasDaoMotion(step: number): boolean {
  return step >= 1 && step <= DAO_COMBOS.length;
}

export function daoSkillTexKey(skill: DaoSkill): string {
  return `dao-skill-${skill}`;
}

/** 되풀이하는 동작은 정해 둔 시각부터 끝까지를 계속 돈다 */
export function daoSkillFrameAt(skill: DaoSkill, t: number): number {
  const n = DAO_SKILL_MOTIONS[skill].length;
  let f = Math.floor(t * FPS);
  const loop = DAO_LOOPS[skill];
  if (loop !== undefined && f >= n) {
    const from = Math.floor(loop * FPS);
    f = from + ((f - from) % Math.max(1, n - 1 - from));
  }
  return Math.max(0, Math.min(n - 1, f));
}

export function isDaoSkill(name: string | undefined): name is DaoSkill {
  return name !== undefined && name in DAO_SKILL_MOTIONS;
}

function toBuf(scene: Phaser.Scene, key: string, frame: number): Buf {
  const src = scene.textures.get(key);
  const img = src.getSourceImage() as HTMLImageElement;
  const fr = src.get(frame);
  const c = document.createElement('canvas');
  c.width = fr.width;
  c.height = fr.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, fr.cutX, fr.cutY, fr.width, fr.height, 0, 0, fr.width, fr.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, data: d.data };
}

export function createSwordMotion(scene: Phaser.Scene): void {
  if (scene.textures.exists(swordTexKey(1))) return;
  const stamps = cutStamps(toBuf(scene, 'hero-idle', 0));
  const sheets: [string, SwordPose[], 'sword' | 'dao'][] = [
    ...COMBOS.map((keys, n): [string, SwordPose[], 'sword' | 'dao'] => [swordTexKey(n + 1), keys, 'sword']),
    ...(Object.keys(SKILL_MOTIONS) as SwordSkill[]).map((k): [string, SwordPose[], 'sword' | 'dao'] => [skillTexKey(k), SKILL_MOTIONS[k], 'sword']),
    ...DAO_COMBOS.map((keys, n): [string, SwordPose[], 'sword' | 'dao'] => [daoTexKey(n + 1), keys, 'dao']),
    ...(Object.keys(DAO_SKILL_MOTIONS) as DaoSkill[]).map((k): [string, SwordPose[], 'sword' | 'dao'] => [daoSkillTexKey(k), DAO_SKILL_MOTIONS[k], 'dao']),
  ];
  sheets.forEach(([texKey, keys, weapon]) => {
    const sheet: Buf = newBuf(FRAME_W * keys.length, FRAME_H);
    keys.forEach((k, i) => {
      const f = drawPose(k, stamps, weapon);
      for (let y = 0; y < FRAME_H; y++) {
        for (let x = 0; x < FRAME_W; x++) {
          const s = (y * FRAME_W + x) * 4;
          const d = (y * sheet.w + i * FRAME_W + x) * 4;
          sheet.data[d] = f.data[s];
          sheet.data[d + 1] = f.data[s + 1];
          sheet.data[d + 2] = f.data[s + 2];
          sheet.data[d + 3] = f.data[s + 3];
        }
      }
    });
    const canvas = document.createElement('canvas');
    canvas.width = sheet.w;
    canvas.height = sheet.h;
    canvas.getContext('2d')!.putImageData(new ImageData(sheet.data, sheet.w, sheet.h), 0, 0);
    const tex = scene.textures.addCanvas(texKey, canvas)!;
    keys.forEach((_, i) => tex.add(i, 0, i * FRAME_W, 0, FRAME_W, FRAME_H));
  });
}
