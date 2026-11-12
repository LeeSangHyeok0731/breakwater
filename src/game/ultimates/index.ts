// 상급·궁극 스킬: 화면 전체를 휩쓰는 광역기. 무기마다 3개씩 (상급 2, 궁극 1).
// 스킬 본체는 무기별 파일에 있고, 여기서는 이름표와 공통 시전 연출만 맡는다.

import type { BattleScene } from '../battleScene';
import { aura, flare, flutter, hues, PAL, shards, shockwave, tint, wisps, type Palette3 } from '../vfx';
import { heavenCleave, crossJudgment, skyFlash } from './sword';
import { moonStorm, heavenFall, bloodMoon } from './dao';
import { skyBurst, meteorArrow, aurora } from './bow';
import { ricochet, airstrike, deadEye } from './gun';
import { chainLightning, blizzard, armageddon } from './staff';
import type { Cast } from './shared';

const ULTIMATES: Record<string, Cast> = {
  sword_heaven_cleave: heavenCleave,
  sword_cross_judgment: crossJudgment,
  sword_thousand_blades: skyFlash,
  dao_moon_storm: moonStorm,
  dao_heaven_fall: heavenFall,
  dao_blood_moon: bloodMoon,
  bow_sky_burst: skyBurst,
  bow_meteor_arrow: meteorArrow,
  bow_aurora: aurora,
  gun_ricochet: ricochet,
  gun_airstrike: airstrike,
  gun_dead_eye: deadEye,
  staff_chain_lightning: chainLightning,
  staff_blizzard: blizzard,
  staff_armageddon: armageddon,
};

/** 무기 계열별 궁극기 시전 색 */
const ULT_PAL: Record<string, Palette3> = { sword: PAL.sky, dao: PAL.moon, bow: PAL.gold, gun: PAL.flame, staff: PAL.violet };

/** 시전 때 겹치는 두 번째 빛깔 */
const ULT_PAL2: Record<string, Palette3> = { sword: PAL.aurora, dao: PAL.rose, bow: PAL.sun, gun: PAL.rose, staff: PAL.arcane };

/** 상급·궁극 스킬을 시전한다. 없는 스킬이면 false */
export function castUltimate(b: BattleScene, id: string): boolean {
  const cast = ULTIMATES[id];
  if (!cast) return false;
  const pal = ULT_PAL[id.split('_')[0]] ?? PAL.gold;
  const p = b.player;
  const pal2 = ULT_PAL2[id.split('_')[0]] ?? PAL.sun;
  aura(b, p.x, p.feet, pal, 80);
  flare(b, p.x, p.y, 50, pal, 360);
  shards(b, p.x, p.y, pal, 30, 260, 600);
  tint(b, pal[0], 0.18, 380);
  // 두 번째 빛깔의 물결과 결이 한 박자 늦게 겹친다.
  shockwave(b, p.x, p.y, 150, pal2, 520, 1, 6);
  wisps(b, p.x, p.y, pal2, 7, 120, 620, { curl: 3.2, width: 7, delay: 60 });
  flutter(b, p.x, p.y, 'star', [...hues(pal), ...hues(pal2)], 18, { spread: 20, speed: 200, gravity: 40, life: 900 });
  cast(b);
  return true;
}
