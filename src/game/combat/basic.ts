// 평타와 강화 공격 (연계, 화살, 총알, 마력구).

import { sfx } from '../../core/audio';
import type { BattleScene } from '../battleScene';
import { DEPTH } from '../fx';
import { muzzleTint, orbLook, shotColor } from '../weaponArt';
import { crescent, flare, PAL, rays, type Palette3 } from '../vfx';
import { box, slashStyle, swingFx, LONG, swordReach } from './shared';

export function releaseOrb(b: BattleScene): void {
  const p = b.player;
  const c = Math.min(p.charge, 1.2) / 1.2;
  p.charge = -1;
  sfx.play('magic', 1 + c);
  const m = p.shotPoint();
  const look = orbLook(p.weapon.def);
  if (c > 0.95) {
    b.fx.spark(m.x, m.y, ORB_TONE[look][1], 2);
    b.fx.sparks(m.x, m.y, ORB_TONE[look][1], 10, p.facing === 1 ? 0 : Math.PI, 1.2, 220, 300, 0);
  }
  b.spawnPlayerBolt({
    x: m.x,
    y: m.y,
    vx: p.facing * 260,
    vy: 0,
    damage: b.weaponBase() * (1 + 2.5 * c),
    kind: 'orb',
    orb: look,
    size: 1 + c * 1.6,
    basic: true,
    aoe: c > 0.35 ? 30 + 40 * c : 0,
  });
  p.startAction('cast', 0.3);
}

export function fireArrow(b: BattleScene, c: number): void {
  const p = b.player;
  const m = p.muzzle();
  sfx.play('arrow', 0.8 + c * 0.6);
  if (c > 0.95) {
    b.fx.circle(m.x + p.facing * 6, m.y, 0xffe08a, 30, 260, true, DEPTH.fx);
    b.fx.spark(m.x, m.y, 0xffe08a, 2);
  }
  const s = p.shotPoint();
  if (c === 0) arrowCombo(b, p.combo || 1);
  else
    b.spawnPlayerBolt({
      x: s.x,
      y: s.y,
      from: m,
      vx: p.facing * (360 + 160 * c),
      vy: 0,
      damage: b.weaponBase() * (1 + 2.5 * c),
      kind: 'arrow',
      color: c > 0.95 ? 0xffe08a : shotColor(p.weapon.def),
      size: 1 + c * 0.6,
      basic: true,
      pierce: c > 0.6,
    });
  p.drawCd = p.hasBuff('haste') ? 0.3 : 0.6;
  // 연계 2단은 다음 화살을 조금 빨리 걸 수 있다.
  if (c === 0 && p.combo === 2) p.drawCd *= 0.75;
  p.startAction('shoot', 0.2);
}

// ───────── 평타 연계 [초안] ─────────
// 평타를 이어 치면 1 → 5단으로 강해지고, 5단 다음은 다시 1단이다.
// 검·도는 더 많이·넓게 베고, 활은 한 번에 여러 발, 총은 연발·산탄, 스태프는 여러 번 쏜다.

/** 검·도 평타 단계별 [동작 시간, 타격 시점들] */
export const SLASH_TIMING: [number, number[]][] = [
  [0.32, [0.11]],
  [0.32, [0.11]],
  [0.38, [0.09, 0.21]],
  [0.42, [0.15]],
  [0.6, [0.1, 0.23, 0.38]],
];

/** 연계 단계를 머리 위에 띄운다. 마지막 단은 크게. */
export function comboPop(b: BattleScene, n: number): void {
  if (n < 2) return;
  const p = b.player;
  b.fx.text(p.x, p.body.top - 10, `${n}연계`, n >= 5 ? 'crit' : 'info');
  if (n >= 5) {
    b.fx.ring(p.x, p.y, 26, 0xffe08a, 260);
    b.fx.spark(p.x, p.body.top - 4, 0xffe08a, 2);
  }
}

/** 검·도 평타: 1 베기 → 2 역베기 → 3 두 번 → 4 크게 → 5 회전 세 번 (검사는 마지막에 관통 검기) */
export function comboSlash(b: BattleScene, n: number, index: number, dmg: number, color: number): void {
  const p = b.player;
  const f = p.facing;
  const sword = p.weapon.def.type === 'sword';
  // 검사는 더 멀리 닿는다. 그림도 판정에 맞춰 함께 커진다.
  const r = (v: number): number => swordReach(p, v);
  const style = slashStyle(b);
  const stretch = LONG[0];
  const squash = LONG[1];
  /** 앞쪽 기준 각도 (라디안, 아래가 +)를 실제 방향으로 */
  const dir = (a: number): number => (f === 1 ? a : Math.PI - a);
  switch (n) {
    case 1:
      // 내려 베기: 칼끝이 지나간 아래쪽으로 불티가 쏟아진다.
      b.fx.slash(p.x + f * r(18), p.y - 2, f, r(42), color, true, { style, stretch, squash });
      b.fx.sparks(p.x + f * r(46), p.y + 12, color, 4, dir(0.9), 0.5, 170, 260);
      swingFx(b, p.x + f * r(40), p.y - 2);
      box(b, 0, r(72), 48, 2, dmg, { basic: true, knock: 90 });
      break;
    case 2:
      // 역베기: 아래에서 위로, 조금 더 넓게. 불티는 위로 솟는다.
      b.fx.slash(p.x + f * r(18), p.y - 2, f, r(46), color, false, { up: true, style, stretch, squash, rot: -0.15 });
      b.fx.sparks(p.x + f * r(46), p.y - 16, color, 5, dir(-1.0), 0.5, 190, 300);
      swingFx(b, p.x + f * r(44), p.y - 4);
      box(b, 0, r(80), 54, 4, dmg, { basic: true, knock: 90 });
      break;
    case 3:
      // 두 번 연달아: 엇갈린 X자
      b.fx.slash(p.x + f * r(18), p.y - 2, f, r(44), color, index === 0, { up: index === 1, speed: 1.3, style, stretch, squash, rot: index === 0 ? 0.3 : -0.3 });
      b.fx.sparks(p.x + f * r(48), p.y - 2, color, 4, dir(index === 0 ? 0.8 : -0.8), 0.6, 190, 260);
      if (index === 1) b.fx.twinkle(p.x + f * r(46), p.y - 2, 0xffffff);
      swingFx(b, p.x + f * r(44), p.y - 2);
      p.body.setVelocityX(f * 60);
      box(b, 0, r(84), 56, 2, dmg * 0.7, { basic: true, knock: index === 1 ? 100 : 30 });
      break;
    case 4:
      // 크게 휘두르기: 한 걸음 내디디며 넓게. 몸의 잔상이 뒤따른다.
      p.body.setVelocityX(f * 140);
      p.afterimage(color);
      b.time.delayedCall(50, () => p.afterimage(color));
      b.fx.slash(p.x + f * r(20), p.y - 4, f, r(60), color, true, { style, stretch, squash });
      b.fx.slash(p.x + f * r(16), p.y - 2, f, r(46), 0xffffff, false, { speed: 1.3, style, stretch, squash });
      b.fx.sparks(p.x + f * r(58), p.y + 6, color, 8, dir(0.5), 0.9, 220, 320);
      b.fx.smoke(p.x + f * 10, p.feet - 4, 1, 0x9a8a70, -6);
      swingFx(b, p.x + f * r(56), p.y - 4);
      b.fx.shake(0.4, 90);
      box(b, 0, r(100), 66, 4, dmg * 1.3, { basic: true, knock: 150 });
      break;
    default: {
      // 마무리: 회전하며 세 번, 가장 넓고 멀리. 마지막은 터진다.
      const last = index === 2;
      p.body.setVelocityX(f * (last ? 180 : 70));
      p.afterimage(last ? 0xffe08a : color);
      b.fx.slash(p.x + f * r(16), p.y - 4, f, r(52 + index * 8), last ? 0xffe08a : color, index !== 1, { up: index === 1, speed: 1.4, style, stretch, squash });
      if (index === 1) b.fx.slash(p.x - f * r(10), p.y - 4, (-f) as 1 | -1, r(42), color, true, { speed: 1.4, style, stretch, squash });
      b.fx.sparks(p.x + f * r(50), p.y, color, 5, dir(index === 1 ? -0.7 : 0.7), 0.8, 210, 280);
      swingFx(b, p.x + f * r(60), p.y - 4);
      box(b, r(index === 1 ? -40 : 0), r(index === 1 ? 160 : 120), 76, 6, dmg * 0.8, { basic: true, knock: last ? 220 : 40 });
      if (last) {
        b.fx.slash(p.x + f * r(30), p.y - 4, f, r(72), 0xffffff, true, { stretch, squash: 0.5, style });
        b.fx.ring(p.x + f * r(50), p.feet, r(80), 0xffe08a, 320);
        b.fx.pop(p.x + f * r(56), p.y - 4, 0xfff0c0, 2.2);
        b.fx.sparks(p.x + f * r(56), p.y - 4, 0xffe08a, 14, dir(0), 1.3, 280, 420);
        rays(b, p.x + f * r(56), p.y - 4, 8, r(64), PAL.gold, 300);
        for (let i = 0; i < 4; i++) b.fx.twinkle(p.x + f * r(30 + i * 22), p.y - 22 + ((i * 17) % 34), 0xfff6c0, 60 + i * 50);
        // 검사의 마무리: 적을 꿰뚫고 날아가는 큰 검기
        if (sword) {
          b.spawnPlayerBolt({ x: p.x + f * 20, y: p.y - 4, vx: f * 380, vy: 0, damage: dmg, basic: true, kind: 'wave', pierce: true, life: 0.75, size: 2.4, color });
          crescent(b, p.x + f * 14, p.y - 4, f, 70, PAL.gold, { from: -1.3, to: 1.3, ms: 240 });
        }
        b.fx.shake(0.9, 160);
        b.fx.stop(0.06);
      }
      break;
    }
  }
}

/** 활 평타: 단계마다 한 번에 쏘는 화살이 늘고, 5단은 관통하는 금빛 부채꼴 */
function arrowCombo(b: BattleScene, n: number): void {
  const p = b.player;
  const s = p.shotPoint();
  const m = p.muzzle();
  const count = [1, 1, 2, 3, 5][n - 1];
  const each = [1, 1, 0.8, 0.75, 0.7][n - 1];
  const spread = n >= 5 ? 0.09 : 0.06;
  const finale = n >= 5;
  for (let i = 0; i < count; i++) {
    const a = (i - (count - 1) / 2) * spread;
    const speed = finale ? 500 : 380;
    b.spawnPlayerBolt({
      x: s.x,
      y: s.y,
      from: m,
      vx: p.facing * Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      damage: b.weaponBase() * each,
      kind: 'arrow',
      color: finale ? 0xffe08a : shotColor(p.weapon.def),
      size: finale ? 1.3 : 1,
      basic: true,
      pierce: finale,
    });
  }
  // 시위를 놓는 순간: 활 앞에 세로로 서는 충격 고리와 앞으로 튀는 빛 조각. 단계가 오를수록 커진다.
  const tone = finale ? 0xffe08a : shotColor(p.weapon.def);
  const fwd = p.facing === 1 ? 0 : Math.PI;
  b.fx.pop(m.x + p.facing * 4, m.y, tone, 0.7 + n * 0.14, 0.45);
  b.fx.sparks(m.x, m.y, tone, 2 + n, fwd, 0.35 + n * 0.05, 200 + n * 20, 220, 60);
  if (count > 1) b.fx.spark(m.x, m.y, finale ? 0xffe08a : 0xffffff, finale ? 2 : 1);
  if (n >= 3) b.fx.twinkle(m.x + p.facing * 10, m.y - 8, 0xffffff, 40);
  if (finale) {
    flare(b, m.x + p.facing * 6, m.y, 22, PAL.gold, 220);
    rays(b, m.x + p.facing * 6, m.y, 7, 46, PAL.gold, 260);
    b.fx.pop(m.x + p.facing * 12, m.y, 0xfff6c0, 1.9, 0.45);
    for (let i = 0; i < 3; i++) b.fx.twinkle(m.x + p.facing * (16 + i * 14), m.y + (i - 1) * 12, 0xfff6c0, 50 + i * 40);
    b.fx.shake(0.4, 90);
  }
}

/** 총 평타: 1·2 한 발 → 3 두 발 → 4 세 발 → 5 산탄 다섯 발. 탄창은 한 발만 쓴다. */
export function gunCombo(b: BattleScene, n: number): void {
  const p = b.player;
  if (n <= 2) {
    gunShot(b, 1, 0);
    return;
  }
  if (n === 5) {
    // 산탄: 부채꼴로 다섯 발, 반동으로 살짝 밀린다.
    for (let i = 0; i < 5; i++) gunShot(b, 0.9, 0.16);
    p.body.setVelocityX(-p.facing * 120);
    b.fx.shake(0.8, 120);
    const m = p.muzzle();
    const fwd = p.facing === 1 ? 0 : Math.PI;
    b.fx.muzzle(m.x, m.y, p.facing, 2, 0, muzzleTint(p.weapon.def));
    b.fx.pop(m.x + p.facing * 8, m.y, 0xfff0c0, 2, 0.45);
    b.fx.sparks(m.x, m.y, shotColor(p.weapon.def), 14, fwd, 0.55, 320, 300, 120);
    flare(b, m.x + p.facing * 6, m.y, 20, PAL.gold, 180);
    for (let i = -1; i <= 1; i++) b.time.delayedCall(60 + (i + 1) * 40, () => b.fx.smoke(m.x + p.facing * (8 + (i + 1) * 8), m.y + i * 4, 1, 0x9a948a, -10));
    return;
  }
  const shots = n === 3 ? 2 : 3;
  gunShot(b, 0.85, 0.02);
  for (let i = 1; i < shots; i++)
    b.time.delayedCall(i * 60, () => {
      if (b.player.weapon.def.type === 'gun' && !b.player.dead) gunShot(b, 0.85, 0.03);
    });
}

/** 마나 구체 색 계열별 벡터 팔레트 */
const ORB_TONE: Record<ReturnType<typeof orbLook>, Palette3> = {
  arcane: PAL.arcane,
  rune: PAL.violet,
  magma: PAL.flame,
  abyss: PAL.rose,
};

/** 스태프 평타: 단계마다 연달아 쏘는 마력구가 늘고, 5단의 마지막은 커다란 구체 */
export function manaCombo(b: BattleScene, n: number, base: number): void {
  // 5단: 다섯 발을 연달아 쏜 뒤 커다란 구체 하나
  const count = [1, 1, 2, 3, 6][n - 1];
  const each = [1, 1, 0.75, 0.7, 0.6][n - 1];
  for (let i = 0; i < count; i++) {
    const fire = (): void => {
      const p = b.player;
      if (p.dead || p.weapon.def.type !== 'staff') return;
      const big = n >= 5 && i === count - 1;
      const m = p.shotPoint();
      const look = orbLook(p.weapon.def);
      const tone = ORB_TONE[look];
      const fwd = p.facing === 1 ? 0 : Math.PI;
      sfx.play('magic', big ? 1.5 : 1);
      // 쏘는 순간 지팡이 앞에서 마력이 튄다.
      b.fx.sparks(m.x, m.y, tone[1], big ? 10 : 3, fwd, big ? 1.2 : 0.6, big ? 240 : 170, 260, 0);
      b.fx.twinkle(m.x + p.facing * 6, m.y + (i % 2 ? -9 : 9), 0xffffff, 30);
      if (big) {
        b.fx.spark(m.x, m.y, tone[1], 2);
        b.fx.pop(m.x + p.facing * 6, m.y, tone[2], 2, 0.5);
        flare(b, m.x, m.y, 20, tone, 220);
        rays(b, m.x, m.y, 7, 44, tone, 260);
      }
      b.spawnPlayerBolt({
        x: m.x,
        y: m.y + (big ? 0 : (i % 2 ? -5 : 5) * (count > 1 ? 1 : 0)),
        vx: p.facing * (big ? 260 : 320),
        vy: 0,
        damage: base * (big ? 2 : each),
        kind: 'orb',
        orb: look,
        size: big ? 2 : 1,
        basic: true,
        aoe: big ? 50 : 0,
      });
    };
    if (i === 0) fire();
    else b.time.delayedCall(i * 90, fire);
  }
}

export function startReload(b: BattleScene): void {
  const p = b.player;
  const w = p.weapon;
  if (w.def.type !== 'gun' || p.reloadTime > 0 || w.ammo >= w.magazine) return;
  p.reloadTime = 1.5;
  b.hud.notify('재장전', 0.8);
  sfx.play('reload');
}

/** 총알 한 발: 바라보는 방향으로 즉시 판정 */
export function gunShot(b: BattleScene, mul: number, spread: number): void {
  const p = b.player;
  const m = p.muzzle();
  const base = p.facing === 1 ? 0 : Math.PI;
  const ang = base + (Math.random() - 0.5) * 2 * (spread + (p.ads ? 0 : 0.03));
  const s = p.shotPoint();
  b.hitscan(s.x, s.y, ang, p.ads ? 520 : 420, b.weaponBase() * mul * (p.ads ? 1.25 : 1), { pierce: false, color: shotColor(p.weapon.def), width: 2, from: m });
  b.fx.muzzle(m.x, m.y, p.facing, 1, ang - (p.facing === 1 ? 0 : Math.PI), muzzleTint(p.weapon.def));
  // 총구 앞에 서는 작은 충격 고리와 튀는 불티
  b.fx.pop(m.x + p.facing * 5, m.y, 0xfff0c0, 0.75, 0.45, ang - base);
  b.fx.sparks(m.x, m.y, shotColor(p.weapon.def), 3, ang, 0.5, 210, 180, 80);
  b.fx.casing(p.x + p.facing * 8, p.y - 8, p.facing, p.feet);
}
