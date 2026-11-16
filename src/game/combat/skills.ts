// 일반 스킬 시전. 상급·궁극 스킬은 ultimates/로 넘긴다.

import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { SKY_FLASH_ID, skyShotMana, type SkillDef } from '../../data/skills';
import type { BattleScene } from '../battleScene';
import { DEPTH } from '../fx';
import { castUltimate } from '../ultimates';
import { afterglow, aura, column, crescent, flare, flutter, glow, hues, impactBurst, PAL, pop, rays, shards, shockwave, tint, tone, twinkles, wisps } from '../vfx';
import { snipeSight } from './hits';
import { CHANNELS, combatState, palOf } from './shared';

/** 부채 사격 다섯 화살의 색 (위에서 아래로) */
const FAN_COLORS = [0xff7a8a, 0xffb050, 0xfff0a0, 0x9affc0, 0x7fd0ff];

/** 시전 연출: 발밑 마법진과 피어오르는 기운. 버프는 빛기둥까지 솟는다. */
function castCircle(b: BattleScene, color: number, pillar = false): void {
  const p = b.player;
  b.fx.circle(p.x, p.feet, color, 72, 650);
  b.fx.embers(p.x, p.feet - 4, color, 10, 16, 50);
  if (pillar) b.fx.pillar(p.x, p.feet, color, 110, 650);
  const pal = palOf(color);
  shockwave(b, p.x, p.feet, 90, pal, 460, 0.3, 5);
  shards(b, p.x, p.feet - 20, pal, 12, 120, 600);
  // 발밑에 색이 고이고, 결이 몸을 타고 말려 오른다.
  glow(b, p.x, p.feet, 80, tone(pal).rim, 600, 0.6, 0.35);
  wisps(b, p.x, p.feet - 4, pal, 4, 70, 520, { angle: -Math.PI / 2, cone: 0.9, curl: 3, width: 4 });
  b.fx.sparks(p.x, p.feet - 4, color, pillar ? 12 : 6, -Math.PI / 2, 0.7, 240, 480, 160);
  twinkles(b, p.x, p.y - 14, 34, pal[2], pillar ? 6 : 3, 420);
  // 버프는 하늘까지 솟는 빛기둥과 겹겹이 퍼지는 고리
  if (pillar) {
    aura(b, p.x, p.feet, pal, 70);
    tint(b, color, 0.14, 380);
  }
}

/** 보호막이 몸을 감싸며 펼쳐진다. */
function hexPop(b: BattleScene, color: number): void {
  const p = b.player;
  const h = b.add.image(p.x, p.y, 'fx-hex').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setScale(0.3);
  b.tweens.add({ targets: h, scale: 1.5, alpha: 0, duration: 380, ease: 'Quad.Out', onComplete: () => h.destroy() });
  // 곁들임 색의 두 번째 겹이 반대로 돌며 한 박자 늦게 펼쳐진다.
  const t = tone(palOf(color));
  const h2 = b.add.image(p.x, p.y, 'fx-hex').setTint(t.alt).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setScale(0.2).setRotation(Math.PI / 6).setAlpha(0.8);
  b.tweens.add({ targets: h2, scale: 2, alpha: 0, rotation: -Math.PI / 6, delay: 80, duration: 460, ease: 'Quad.Out', onComplete: () => h2.destroy() });
  glow(b, p.x, p.y, 90, t.rim, 520, 0.6);
  wisps(b, p.x, p.y, palOf(color), 6, 70, 480, { curl: 3.2, width: 5 });
  flutter(b, p.x, p.y, 'star', [color, t.alt, 0xffffff, t.rim], 10, { spread: 26, speed: 90, life: 800 });
  b.fx.burst(p.x, p.y, color, 12, 120, 380);
  // 보호막이 몸을 감싸며 크게 번쩍인다.
  flare(b, p.x, p.y, 46, palOf(color), 360);
  shockwave(b, p.x, p.y, 90, palOf(color), 420, 1, 5);
  rays(b, p.x, p.y, 8, 70, palOf(color));
  pop(b, p.x, p.y, 0xffffff, 3);
  twinkles(b, p.x, p.y, 40, 0xffffff, 5, 360);
}

export function tryCast(b: BattleScene, skill: SkillDef | null, slot: number): void {
  const p = b.player;
  if (!skill || p.dodgeTime > 0) return;
  if (p.silenceTime > 0) {
    b.hud.notify('침묵! 스킬을 쓸 수 없습니다');
    b.hud.flashSlot(slot);
    return;
  }
  if ((p.cooldowns.get(skill.id) ?? 0) > 0) return;
  // 천공 섬광은 최대 마나에 따라 커지는 한 발 마나만큼은 있어야 쓸 수 있다.
  const need = skill.id === SKY_FLASH_ID ? skyShotMana(p.derived.maxMp) : skill.mana;
  if (p.mp < need) {
    b.hud.notify('마나가 부족합니다');
    b.hud.flashSlot(slot);
    return;
  }
  if (p.action && CHANNELS.has(p.action.kind)) return;
  if (skill.id === SKY_FLASH_ID && b.skyBladeCount() < 1) {
    b.hud.notify('마나검이 없습니다. 몬스터를 더 공격하세요');
    b.hud.flashSlot(slot);
    return;
  }
  // 천공 섬광은 탄검강을 쏠 때마다 마나를 쓴다.
  if (skill.id !== SKY_FLASH_ID) p.mp -= skill.mana;
  p.cooldowns.set(skill.id, skill.cooldown * (1 - p.derived.cdReduce));
  p.resetCombo();
  p.charge = -1;
  p.guarding = false;
  if (skill.weapon === 'staff') sfx.play('magic', 1.2);
  b.lastCastSlot = slot;
  const before = p.action;
  b.withSource(skill.id, () => castSkill(b, skill));
  // 스킬이 시작한 동작·궁극기 채널은 나중에 들어가는 피해도 이 스킬로 친다.
  if (p.action && p.action !== before) p.action.src = skill.id;
  if (b.ult && !b.ult.src) b.ult.src = skill.id;
  b.noteCast(skill.id);
}

/** 바라보는 쪽 앞에서 가장 가까운 적의 x (없으면 정해진 거리) */
function targetAhead(b: BattleScene, maxDist: number, fallback: number): number {
  const p = b.player;
  let best = p.x + p.facing * fallback;
  let bestD = maxDist;
  for (const m of b.monsters) {
    if (!m.alive) continue;
    const d = (m.x - p.x) * p.facing;
    if (d > 0 && d < bestD) {
      bestD = d;
      best = m.x;
    }
  }
  return best;
}

function castSkill(b: BattleScene, skill: SkillDef): void {
  const p = b.player;
  const s = b.stats;
  const f = p.facing;
  switch (skill.id) {
    case 'sword_whirl':
      p.startAction('whirl', 0.62, [0.08, 0.2, 0.32, 0.46]);
      break;
    case 'sword_upper':
      p.startAction('upper', 0.56, [0.08, 0.2, 0.36]);
      break;
    case 'sword_sunder':
      p.startAction('sunder', 0.52, [0.08, 0.2, 0.34]);
      break;
    case 'sword_waves': {
      const hits: number[] = [];
      for (let i = 0; i < 12; i++) hits.push(0.06 + i * 0.075);
      p.startAction('waves', 1.0, hits);
      break;
    }
    case 'sword_cry':
      p.addBuff({ id: 'cry', name: '전투의 함성', damageMul: 0.3, time: 12 });
      castCircle(b, 0xffb040, true);
      b.fx.ring(p.x, p.feet, 100, 0xffb040, 420);
      b.fx.flashScreen(0xffb040, 0.15, 220);
      rays(b, p.x, p.y - 10, 16, 170, PAL.gold, 460);
      shockwave(b, p.x, p.y - 6, 200, PAL.gold, 520, 1, 6);
      // 함성: 금빛 사이로 다홍 불길이 치솟고 투기가 온몸에서 피어오른다.
      shockwave(b, p.x, p.y - 6, 130, PAL.crimson, 420, 1, 4);
      wisps(b, p.x, p.y - 6, PAL.sun, 8, 120, 620, { curl: 2.6, width: 7 });
      flutter(b, p.x, p.y, 'flame', [0xffd040, 0xff7a1a, 0xff3a5a, 0xfffbe0], 20, { spread: 26, spreadY: 20, speed: 120, cone: 0.9, gravity: -110, life: 1000, within: 240 });
      b.fx.shake(0.8);
      p.startAction('cast', 0.3);
      break;
    case 'staff_meteor':
      castCircle(b, 0xff8a3a);
      b.castMeteor(targetAhead(b, 320, 150), b.skillBase({ int: 6.0 }), b.skillBase({ int: 0.4 }));
      p.startAction('cast', 0.4);
      break;
    case 'staff_shield':
      p.shield = s.int * 10;
      p.shieldTime = 10;
      castCircle(b, 0x5fc8ff);
      hexPop(b, 0x5fc8ff);
      p.startAction('cast', 0.3);
      break;
    case 'staff_ward':
      p.wardHits = 3;
      p.wardTime = 12;
      castCircle(b, 0xffd34a);
      hexPop(b, 0xffd34a);
      p.startAction('cast', 0.3);
      break;
    case 'staff_laser':
      castCircle(b, 0x7fe8ff);
      p.startAction('laser', 1.5);
      combatState.laserTick = 0;
      break;
    case 'staff_frost': {
      const cx = targetAhead(b, 260, 110);
      castCircle(b, 0x8fe0ff);
      b.addField({ x: cx - 70, w: 140, life: 5, tickEvery: 0.5, damage: b.skillBase({ int: 0.3 }), slow: 0.5, color: 0x8fe0ff, style: 'frost' });
      // 얼음이 터지며 번진다.
      impactBurst(b, cx, b.floorY() - 10, 60, PAL.frost, b.floorY());
      for (let i = -2; i <= 2; i++) b.fx.iceSpike(cx + i * 28, b.floorY(), 0.9 + Math.random() * 0.4, 500, Math.abs(i) * 60);
      // 서리: 연보라 냉기가 땅에 깔리고 눈 결정이 흩날린다.
      glow(b, cx, b.floorY(), 130, 0x6a4aff, 900, 0.6, 0.35);
      wisps(b, cx, b.floorY() - 6, PAL.frost, 7, 100, 600, { angle: -Math.PI / 2, cone: 1.3, curl: 2.8, width: 5 });
      flutter(b, cx, b.floorY() - 50, 'snow', [0xb8ffe8, 0x9ff0ff, 0xc8b0ff, 0xffffff], 22, { spread: 80, spreadY: 40, speed: 40, gravity: 50, sway: 14, life: 1500, within: 400 });
      p.startAction('cast', 0.35);
      break;
    }
    case 'staff_curse': {
      const cx = targetAhead(b, 260, 110);
      b.hitArea(cx - 60, p.y - 80, 120, 140, 0, { vuln: [0.3, 6], quiet: true, noDamage: true });
      // 낙인: 땅에 보랏빛 마법진이 새겨지고 하늘에서 저주의 벼락이 내리친다.
      const gy = b.floorY();
      castCircle(b, 0xb04aff);
      b.fx.circle(cx, gy, 0xb04aff, 130, 900, false, DEPTH.fx - 2);
      b.fx.pillar(cx, gy, 0xb04aff, 150, 600);
      b.fx.lightning(cx - 8, gy - 180, cx, gy - 6, 0xc060ff, 2, 220);
      b.time.delayedCall(90, () => b.fx.lightning(cx + 12, gy - 180, cx + 4, gy - 6, 0xc060ff, 2, 200));
      b.fx.boom(cx, gy - 24, 26, 'dark');
      b.fx.embers(cx, gy - 4, 0xd890ff, 14, 50, 60);
      column(b, cx, gy, 40, 320, PAL.hex, 700);
      shockwave(b, cx, gy, 160, PAL.hex, 520);
      rays(b, cx, gy - 40, 10, 120, PAL.violet);
      // 낙인: 보랏빛 사이로 독기 어린 연두 불이 피어오른다.
      wisps(b, cx, gy - 4, PAL.hex, 7, 120, 640, { angle: -Math.PI / 2, cone: 1.1, curl: 3, width: 6 });
      flutter(b, cx, gy - 10, 'flame', [0x9aff6a, 0xd080ff, 0x8a2aff, 0xf6e0ff], 18, { spread: 50, spreadY: 10, speed: 60, cone: 0.5, gravity: -90, life: 1200, within: 400 });
      afterglow(b, cx, gy, 170, PAL.hex, 'flame', 1100);
      b.fx.shake(0.9);
      p.startAction('cast', 0.35);
      break;
    }
    case 'staff_amp':
      p.addBuff({ id: 'amp', name: '마력 증폭', damageMul: 0.3, time: 10 });
      castCircle(b, 0x7fe8ff, true);
      b.fx.ring(p.x, p.feet, 80, 0x7fe8ff, 380);
      rays(b, p.x, p.y - 10, 12, 140, PAL.arcane, 420);
      // 증폭: 하늘색과 보라, 분홍의 마력이 소용돌이치며 별빛이 떠오른다.
      shockwave(b, p.x, p.y - 6, 130, PAL.violet, 480, 1, 4);
      wisps(b, p.x, p.y - 6, PAL.arcane, 8, 110, 640, { curl: 3.4, width: 6 });
      flutter(b, p.x, p.y - 4, 'star', hues(PAL.arcane), 18, { spread: 34, spreadY: 26, speed: 70, gravity: -70, life: 1100, within: 300 });
      p.startAction('cast', 0.35);
      break;
    case 'dao_crescent':
      p.startAction('crescent', 0.62, [0.1, 0.25, 0.42]);
      break;
    case 'dao_skyfall':
      p.startAction('skyfall', 0.62, [0.1, 0.42]);
      break;
    case 'dao_hamstring':
      p.startAction('hamstring', 0.5, [0.08, 0.2, 0.32]);
      break;
    case 'dao_rage':
      p.addBuff({ id: 'rage', name: '투혼', damageMul: 0.25, speedMul: 0.2, time: 10 });
      castCircle(b, 0xff5a3a, true);
      b.fx.boom(p.x, p.y - 4, 22, 'fire');
      b.fx.ring(p.x, p.feet, 90, 0xff5a3a, 380);
      b.fx.flashScreen(0xff3a1a, 0.18, 200);
      rays(b, p.x, p.y - 6, 14, 160, PAL.flame, 460);
      flare(b, p.x, p.y - 6, 60, PAL.flame, 400);
      // 투혼: 붉은 불길이 몸을 휘감아 오르고 자홍빛 열기가 번진다.
      shockwave(b, p.x, p.y - 6, 140, PAL.crimson, 460, 1, 5);
      wisps(b, p.x, p.feet - 6, PAL.flame, 8, 130, 640, { angle: -Math.PI / 2, cone: 1.0, curl: 2.8, width: 8 });
      flutter(b, p.x, p.y, 'flame', hues(PAL.flame), 24, { spread: 22, spreadY: 22, speed: 130, cone: 0.7, gravity: -140, life: 1000, within: 260 });
      b.fx.shake(0.9);
      p.startAction('cast', 0.3);
      break;
    case 'dao_iai':
      p.startAction('iai', 0.6, [0.06, 0.22, 0.28, 0.34, 0.42]);
      break;
    case 'bow_fan': {
      const m = p.muzzle();
      const s = p.shotPoint();
      for (let k = -2; k <= 2; k++) {
        const ang = k * 0.13;
        b.spawnPlayerBolt({
          x: s.x,
          y: s.y,
          from: m,
          vx: f * Math.cos(ang) * 380,
          vy: Math.sin(ang) * 380,
          damage: b.skillBase({ dex: 0.9, str: 0.4 }),
          kind: 'arrow',
          color: FAN_COLORS[k + 2],
          size: 1.5,
        });
        b.fx.streak(m.x + f * Math.cos(ang) * 26, m.y + Math.sin(ang) * 26, f === 1 ? ang : Math.PI - ang, 30, FAN_COLORS[k + 2], 200, 2);
      }
      b.fx.spark(m.x, m.y, 0xfff0c0, 2);
      b.fx.pop(m.x + f * 8, m.y, 0xfff0c0, 2, 0.5);
      b.fx.sparks(m.x, m.y, 0xffd060, 12, f === 1 ? 0 : Math.PI, 0.6, 300, 300, 60);
      twinkles(b, m.x + f * 30, m.y, 30, 0xfff6c0, 4);
      flare(b, m.x, m.y, 30, PAL.gold, 260);
      rays(b, m.x, m.y, 8, 70, PAL.gold, 300);
      // 부채: 다섯 화살이 다홍에서 하늘색까지 저마다 다른 빛을 끌고 펼쳐진다.
      wisps(b, m.x, m.y, PAL.sun, 5, 70, 400, { angle: f === 1 ? 0 : Math.PI, cone: 0.5, curl: 1.4, width: 4 });
      flutter(b, m.x + f * 16, m.y, 'star', FAN_COLORS, 8, { spread: 10, speed: 110, angle: f === 1 ? 0 : Math.PI, cone: 0.6, gravity: 40, life: 600 });
      sfx.play('arrow');
      p.startAction('shoot', 0.25);
      break;
    }
    case 'bow_rain': {
      const cx = targetAhead(b, 300, 130);
      b.addField({ x: cx - 70, w: 140, life: 2, tickEvery: 0.25, damage: b.skillBase({ dex: 0.35, str: 0.15 }), color: 0xd8c8a0, hitsAir: true, rain: true, style: 'rain' });
      // 하늘로 화살 다발을 쏘아 올린다.
      const m = p.muzzle();
      for (let i = 0; i < 5; i++) b.fx.streak(m.x + (i - 2) * 3, m.y - 30 - i * 6, -Math.PI / 2 + (i - 2) * 0.12, 30, [0xffe08a, 0x9affc0, 0xfff0c0, 0xffa0c8, 0xffe08a][i], 200);
      wisps(b, m.x, m.y - 6, PAL.gold, 4, 90, 420, { angle: -Math.PI / 2, cone: 0.4, curl: 1.4, width: 4 });
      glow(b, cx, b.floorY() - 150, 110, 0xff3a5a, 2000, 0.4, 0.4);
      b.fx.spark(m.x, m.y, 0xffe08a);
      b.fx.sparks(m.x, m.y - 10, 0xffe08a, 10, -Math.PI / 2, 0.35, 380, 360, 0);
      twinkles(b, cx, b.floorY() - 150, 70, 0xfff6c0, 8, 600);
      column(b, m.x, m.y, 10, 220, PAL.gold, 420);
      b.time.delayedCall(250, () => {
        shockwave(b, cx, b.floorY(), 120, PAL.gold, 600);
        shockwave(b, cx, b.floorY(), 80, PAL.aurora, 500, 0.3, 4);
        glow(b, cx, b.floorY(), 110, 0x1a8ad8, 1700, 0.45, 0.3);
      });
      p.startAction('shoot', 0.3);
      break;
    }
    case 'bow_pierce': {
      const m = p.muzzle();
      const s = p.shotPoint();
      b.spawnPlayerBolt({ x: s.x, y: s.y, from: m, vx: f * 520, vy: 0, damage: b.skillBase({ dex: 2.5, str: 1.0 }), kind: 'arrow', color: 0xffe08a, size: 3, pierce: true });
      // 화살이 지나갈 길에 금빛 섬광이 먼저 그어진다.
      b.fx.bigSlash(m.x, m.y, s.x + f * 560, s.y, 0xffc040, 7, 360);
      flare(b, m.x, m.y, 40, PAL.gold, 300);
      rays(b, m.x, m.y, 10, 90, PAL.gold, 340);
      // 금빛 화살길 위아래로 다홍·하늘색 바람이 갈라지고, 꿰뚫린 공기가 말려 나간다.
      b.fx.bigSlash(m.x, m.y - 4, s.x + f * 520, s.y - 9, 0xff5a7a, 2, 300);
      b.fx.bigSlash(m.x, m.y + 4, s.x + f * 520, s.y + 9, 0x7fd8ff, 2, 300);
      wisps(b, m.x + f * 10, m.y, PAL.sun, 6, 130, 460, { angle: f === 1 ? 0 : Math.PI, cone: 0.45, curl: 1.8, width: 5 });
      glow(b, m.x + f * 16, m.y, 100, 0xff3a5a, 400, 0.55);
      // 관통: 활 앞에 금빛 마법진이 서고 공기가 갈라진다.
      b.fx.circle(m.x + f * 8, m.y, 0xffe08a, 46, 420, true, DEPTH.fx);
      b.fx.spark(m.x + f * 8, m.y, 0xffffff, 2);
      b.fx.burst(m.x, m.y, 0xffe08a, 4, 140, 300);
      b.fx.sparks(m.x, m.y, 0xffe08a, 14, f === 1 ? 0 : Math.PI, 0.4, 420, 320, 0);
      for (let i = 1; i <= 4; i++) b.fx.pop(m.x + f * i * 110, m.y + ((s.y - m.y) * i) / 5, [0xfff0c0, 0xffa0c8, 0x9fe0ff, 0xffd060][i - 1], 1.6 - i * 0.2, 0.4);
      b.fx.shake(0.4);
      sfx.play('arrow', 1.4);
      p.startAction('shoot', 0.3);
      break;
    }
    case 'bow_haste':
      p.addBuff({ id: 'haste', name: '질풍', damageMul: 0, speedMul: 0.4, time: 8 });
      p.drawCd = 0;
      castCircle(b, 0x9ff0c0, true);
      // 질풍: 연두와 청록의 바람결이 몸을 감고, 나뭇잎이 휘말려 돈다.
      wisps(b, p.x, p.y, PAL.jade, 8, 110, 640, { curl: 3.6, width: 6 });
      wisps(b, p.x, p.y, PAL.aurora, 5, 80, 520, { curl: 3.2, width: 4, delay: 120 });
      flutter(b, p.x, p.y, 'leaf', [0x8affc0, 0xe8ff6a, 0x7fd8ff, 0xffffff], 20, { spread: 30, spreadY: 24, speed: 170, gravity: 30, sway: 20, life: 1200, within: 260 });
      // 몸 주위로 바람결이 스친다.
      for (let i = 0; i < 6; i++) {
        const y = p.y - 20 + i * 8;
        b.time.delayedCall(i * 40, () => b.fx.streak(p.x + 24 - i * 4, y, Math.PI, 40, 0xbff8d8, 220));
      }
      for (let i = 0; i < 3; i++) b.time.delayedCall(i * 90, () => crescent(b, p.x, p.y, (i % 2 ? -1 : 1) as 1 | -1, 50 + i * 10, i === 1 ? PAL.aurora : PAL.jade, { ms: 260 }));
      break;
    case 'bow_mana_arrows': {
      const m = p.muzzle();
      b.fx.circle(m.x + f * 8, m.y, 0x9fdcff, 40, 1050, true, DEPTH.fx);
      const hits: number[] = [];
      for (let i = 0; i < 12; i++) hits.push(0.05 + i * 0.075);
      p.startAction('volley', 1.0, hits);
      break;
    }
    case 'gun_rapid':
      p.startAction('rapid', 0.65, [0, 0.1, 0.2, 0.3, 0.4, 0.5]);
      break;
    case 'gun_grenade': {
      const m = p.muzzle();
      const tx = targetAhead(b, 300, 160);
      const t = 0.75;
      const g = 900;
      b.spawnPlayerBolt({
        x: m.x,
        y: m.y,
        vx: (tx - m.x) / t,
        vy: (b.floorY() - 6 - m.y) / t - 0.5 * g * t,
        damage: b.weaponBase() * 3,
        kind: 'grenade',
        gravity: g,
        aoe: 70,
        stun: 0.8,
      });
      p.startAction('cast', 0.3);
      break;
    }
    case 'gun_snipe':
      p.startAction('snipe', 0.8, [0.6]);
      snipeSight(b);
      break;
    case 'gun_tactical':
      p.weapon.ammo = p.weapon.magazine;
      p.reloadTime = 0;
      p.addBuff({ id: 'tactical', name: '전술 재장전', damageMul: 0.3, time: 8 });
      castCircle(b, 0xffd890, true);
      b.fx.spark(p.muzzle().x, p.muzzle().y, 0xffd890, 2);
      flare(b, p.muzzle().x, p.muzzle().y, 36, PAL.gold, 320);
      // 전술 재장전: 금빛 탄피 같은 별이 튀고 청록 결이 총을 감싼다.
      wisps(b, p.muzzle().x, p.muzzle().y, PAL.aurora, 5, 60, 480, { curl: 3.2, width: 4 });
      flutter(b, p.x, p.y - 6, 'star', [0xffd060, 0xfff6c0, 0x7fffd0, 0xffa0c8], 16, { spread: 24, spreadY: 20, speed: 110, gravity: 120, life: 900, within: 200 });
      sfx.play('reload');
      break;
    case 'gun_barrage': {
      const hits: number[] = [];
      for (let i = 0; i < 30; i++) hits.push(0.05 + i * 0.065);
      p.startAction('barrage', 2.05, hits);
      break;
    }
    default:
      // 상급·궁극 스킬 (화면 전체를 휩쓰는 광역기)
      castUltimate(b, skill.id);
  }
}
