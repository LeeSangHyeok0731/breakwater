import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { DEPTH } from '../fx';
import { EASE, lerpPose, Rig, Track, type Key, type Pose } from '../legion/rig';
import type { Behavior, Monster } from '../monster2d';
import { aura, column, crescent, flare, PAL, pop, rays, shards, shockwave, tint, twinkles, type Palette3 } from '../vfx';
import { FLOOR_Y } from '../world';
import { ASTAROTH_FLOAT, ASTAROTH_GROGGY, ASTAROTH_IDLE, ASTAROTH_RIG, AS_ORB, AS_SWORD, makeAstarothArt, SCYTHE_EDGE } from './astarothArt';
import { RAID_FLOAT_Y } from './raidFight';

/**
 * 종언의 마왕 아스타로트. 파츠 리그로 조립한 몸에 몸보다 큰 지옥 낫을 들고 싸운다.
 *
 * 패턴 (설계 문서 4장):
 * - 지옥 낫 3연 베기: 내려베기 → 올려베기 → 머리 위에서 내리찍어 앞으로 핏빛 균열이 터진다.
 * - 순간이동 뒤잡기: 핏빛 안개로 사라졌다가 플레이어 뒤에서 나타나 주변을 크게 벤다.
 * - 흑염 기둥 연쇄: 낫을 땅에 박으면 앞쪽으로 불기둥이 차례로 솟는다 (광폭화면 양쪽).
 * - 탄막 원: 빈손을 들어 구슬을 원으로 쏜다. 원마다 빈틈이 있다.
 * - 그림자 분신 돌진: 맵 끝에서 분신이 나타나 차례로 바닥을 쓸며 돌진한다.
 * - 마검 비: 낫을 하늘로 들면 마검이 떠올라 예고한 자리에 꽂힌다.
 * - (광폭화) 연속 심판: 맵을 셋으로 나눠 두 칸씩 세 번 내리친다. 매번 한 칸은 비어 있다.
 * 봉인 해제 기믹 동안(RaidFight.mode가 fight가 아닐 때)에는 맵 가운데 높이 떠서 봉인 문양을 두른다.
 * 예고는 길고 분명하게, 맞으면 아프게.
 */

type Pattern = 'reap' | 'blink' | 'pillars' | 'barrage' | 'clones' | 'swords' | 'judge' | 'roar';

const CRIMSON = 0xd8203a;
const BLOOD_HI = 0xff8a7a;
const GOLD = 0xffd060;
/** 핏빛: 검붉음 → 진홍 → 거의 흰 분홍 */
const PAL_BLOOD: Palette3 = [0x8a0a1a, 0xff3a4a, 0xffd8d0];
/** 흑금: 왕관과 심판의 금빛 */
const PAL_GOLD: Palette3 = PAL.gold;

const IDLE: Key = [0, {}];
const back = (t: number, w = ASTAROTH_IDLE.w): Key => [t, { ...ASTAROTH_IDLE, w }, EASE.out];

// ───────── 자세 키프레임 (오른쪽을 볼 때, 손은 어깨 기준, 무기 각도는 0이 위·+가 앞) ─────────

const TRACKS: Record<Pattern, Track> = {
  // 3연 베기: 등 뒤로 치켜들었다가 내려베기 → 낮게 모아 올려베기 → 머리 위에서 내리찍기
  reap: new Track(ASTAROTH_IDLE, [
    IDLE,
    [0.5, { hy: 4, lean: -12, head: -8, fFx: 10, fBx: -9, aFx: -2, aFy: -16, w: -70, two: 1 }, EASE.out],
    [0.6, { aFy: -17, w: -76 }, EASE.linear],
    [0.7, { hy: 6, lean: 22, head: 6, fFx: 13, fBx: -10, aFx: 11, aFy: 8, w: 135 }, EASE.in],
    [0.85, { lean: 20, w: 140 }, EASE.linear],
    [1.05, { hy: 7, lean: 16, aFx: 10, aFy: 11, w: 165 }, EASE.out],
    [1.17, { hy: 2, lean: -8, head: -6, aFx: 6, aFy: -14, w: -25 }, EASE.in],
    [1.3, { w: -30 }, EASE.linear],
    [1.62, { hy: 4, lean: -16, head: -12, fFx: 10, fBx: -9, aFx: -3, aFy: -18, w: -100 }, EASE.out],
    [1.76, { aFy: -19, w: -104 }, EASE.linear],
    [1.88, { hy: 10, lean: 28, head: 10, fFx: 14, fBx: -11, aFx: 12, aFy: 10, w: 125 }, EASE.in],
    [2.5, { hy: 9.5, lean: 26 }, EASE.linear],
    [2.9, { ...ASTAROTH_IDLE }, EASE.out],
  ]),
  // 뒤잡기: 사라졌다가 낫을 등 뒤로 감은 채 나타나 → 몸을 돌리며 크게 휩쓴다
  blink: new Track(ASTAROTH_IDLE, [
    IDLE,
    [0.45, {}, EASE.linear],
    [0.5, { hy: 5, lean: -10, head: -6, fFx: 10, fBx: -9, aFx: -6, aFy: -6, w: -110, two: 1 }, EASE.out],
    [1.05, { aFx: -7, aFy: -7, w: -115 }, EASE.linear],
    [1.15, { hy: 7, lean: 20, head: 4, fFx: 13, fBx: -10, aFx: 12, aFy: 4, w: 100 }, EASE.in],
    [1.5, { lean: 18, w: 104 }, EASE.linear],
    back(1.9),
  ]),
  // 흑염 기둥: 치켜든 낫을 땅에 박고 기둥이 다 솟을 때까지 누른다
  pillars: new Track(ASTAROTH_IDLE, [
    IDLE,
    [0.5, { hy: 3, lean: -12, head: -10, aFx: -2, aFy: -18, w: -70, two: 1 }, EASE.out],
    [0.6, { aFy: -19, w: -74 }, EASE.linear],
    [0.72, { hy: 10, lean: 26, head: 10, fFx: 12, fBx: -10, aFx: 11, aFy: 11, w: 150 }, EASE.in],
    [2.3, { hy: 9.5, lean: 24, head: 8 }, EASE.linear],
    back(2.7),
  ]),
  // 탄막 원: 낫을 세워 짚고 빈손을 하늘로
  barrage: new Track(ASTAROTH_IDLE, [
    IDLE,
    [0.45, { hy: -1, lean: -10, head: -14, aFx: 8, aFy: 10, w: 0, aBx: 4, aBy: -18 }, EASE.out],
    [2.8, { aBy: -19 }, EASE.linear],
    back(3.2),
  ]),
  // 그림자 분신: 낫을 치켜들고 빈손으로 가리킨다
  clones: new Track(ASTAROTH_IDLE, [
    IDLE,
    [0.4, { hy: 2, lean: -8, head: -10, aFx: 6, aFy: -16, w: -20, aBx: 9, aBy: -3 }, EASE.out],
    [3.4, {}, EASE.linear],
    back(3.8),
  ]),
  // 마검 비: 낫과 빈손을 하늘로
  swords: new Track(ASTAROTH_IDLE, [
    IDLE,
    [0.45, { lean: -14, head: -20, aFx: 7, aFy: -18, w: -4, aBx: 4, aBy: -16 }, EASE.out],
    [1.8, {}, EASE.linear],
    back(2.2),
  ]),
  // 연속 심판: 두 팔을 벌려 하늘을 부른다
  judge: new Track(ASTAROTH_IDLE, [
    IDLE,
    [0.5, { hy: 2, lean: -16, head: -24, fFx: 9, fBx: -9, aFx: 9, aFy: -14, w: 20, aBx: -8, aBy: -15 }, EASE.out],
    [3.7, { hy: 2.5 }, EASE.linear],
    back(4.1),
  ]),
  // 광폭화: 몸을 젖히고 두 팔을 벌려 포효한다
  roar: new Track(ASTAROTH_IDLE, [
    IDLE,
    [0.45, { hy: 3, lean: -16, head: -24, fFx: 10, fBx: -10, aFx: 10, aFy: -8, w: 40, aBx: -9, aBy: -10 }, EASE.out],
    [1.5, { hy: 3.5, lean: -18, head: -26 }, EASE.linear],
    back(1.9),
  ]),
};

/** 그림자 분신의 돌진 자세: 몸을 숙이고 낫을 뒤로 낮게 끈다 */
const DASH: Pose = { ...ASTAROTH_IDLE, hy: 6, lean: 30, head: 6, fFx: 13, fBx: -12, aFx: -6, aFy: 4, w: -120, two: 1 };

/** 패턴이 끝나는 시간 (기준 초) */
const END: Record<Pattern, number> = { reap: 2.9, blink: 1.9, pillars: 2.7, barrage: 2.5, clones: 3.0, swords: 2.2, judge: 4.1, roar: 1.9 };

interface KingState {
  pattern: Pattern | null;
  t: number;
  fired: Set<number>;
  last: Pattern | null;
  rig: Rig;
  dir: 1 | -1;
  /** 순간이동 도착점 */
  to: number;
  /** 떠오를 때 출발점 */
  fromX: number;
  fromY: number;
  floating: boolean;
  wasStunned: boolean;
  /** 광폭화 포효를 했다 */
  roared: boolean;
  /** 방금 휘둘렀다: 낫 잔상을 남긴다 */
  swinging: number;
  ghost: number;
  walk: number;
  time: number;
  blendFrom: Pose | null;
  blend: number;
  blendTotal: number;
  /** 떠 있는 동안 몸을 감싸는 봉인 문양 */
  sigil: Phaser.GameObjects.Graphics;
}

const BLEND = 0.15;
const states = new WeakMap<Monster, KingState>();

function once(st: KingState, step: number, at: number): boolean {
  if (st.t < at || st.fired.has(step)) return false;
  st.fired.add(step);
  return true;
}

/** 낫 날의 바깥 끝 (화면 좌표) */
function bladeTip(st: KingState): { x: number; y: number } {
  const r = st.rig;
  const s = ASTAROTH_RIG.scale;
  const up = r.tip(SCYTHE_EDGE[1] / ASTAROTH_RIG.reach);
  const a = (r.pose.w * Math.PI) / 180;
  return { x: up.x + Math.cos(a) * SCYTHE_EDGE[0] * s * r.facing, y: up.y + Math.sin(a) * SCYTHE_EDGE[0] * s };
}

/** 앞쪽 지면 범위 공격 (바닥에서 h 높이까지). near~far는 몸 중심에서 앞쪽 거리 */
function frontHit(m: Monster, dir: 1 | -1, near: number, far: number, h: number, damage: number): void {
  const x = dir === 1 ? m.x + near : m.x - far;
  m.scene.areaHit(x, FLOOR_Y - h, far - near, h, damage, m, false);
}

/** 낫을 휘두른 궤적: 길게 뺀 핏빛 도트 잔상 두 겹 + 큰 참격 + 불티 */
function swing(m: Monster, x: number, y: number, dir: 1 | -1, radius: number, o: { up?: boolean; squash?: number } = {}): void {
  const b = m.scene;
  const sq = o.squash ?? 1;
  b.fx.slash(x, y, dir, radius, CRIMSON, true, { up: o.up, squash: sq, stretch: 1.35, style: 'blood' });
  b.fx.slash(x - dir * 6, y, dir, radius * 0.8, 0xffffff, false, { up: o.up, squash: sq, stretch: 1.35, speed: 1.3, style: 'blood' });
  crescent(b, x - dir * 10, y, dir, radius * 1.1, PAL_BLOOD, { from: o.up ? 1.6 : -1.7, to: o.up ? -1.6 : 1.4, ms: 320, squash: sq });
  b.fx.sparks(x + dir * radius * 0.9, y + (o.up ? -radius * 0.3 : radius * 0.3) * sq, BLOOD_HI, 12, (dir === 1 ? 0 : Math.PI) + (o.up ? -0.6 : 0.6) * dir, 0.8, 300, 400);
  sfx.play('slash', 0.9);
}

/** 땅이 터진다: 충격파, 솟는 빛, 파편, 불티, 꺾이며 갈라지는 균열 */
function impact(m: Monster, x: number, power = 1): void {
  const b = m.scene;
  b.fx.stop(0.1 * power);
  b.fx.shake(1.5 * power, 280);
  b.fx.boom(x, FLOOR_Y - 8, 30 * power, 'fire');
  b.fx.smoke(x - 22, FLOOR_Y - 6, 1.6, 0x3a1a1e, -20);
  b.fx.smoke(x + 22, FLOOR_Y - 6, 1.6, 0x3a1a1e, -20);
  shockwave(b, x, FLOOR_Y, 130 * power, PAL_BLOOD, 500, 0.28, 7);
  flare(b, x, FLOOR_Y - 10, 36 * power, PAL_BLOOD, 260);
  rays(b, x, FLOOR_Y - 6, 10, 100 * power, PAL_BLOOD, 340, Math.PI);
  column(b, x, FLOOR_Y, 18 * power, 170 * power, PAL_BLOOD, 440);
  shards(b, x, FLOOR_Y - 8, PAL_BLOOD, 20, 320, 540);
  pop(b, x, FLOOR_Y - 12, 0xffd8d0, 2.8 * power);
  b.fx.sparks(x, FLOOR_Y - 6, BLOOD_HI, 20, -Math.PI / 2, 1.2, 400 * power, 580, 620);
  twinkles(b, x, FLOOR_Y - 50, 60, 0xffd8d0, 4, 360);
  crack(m, x, power);
  sfx.play('boom', 0.6 + 0.3 * power);
}

/** 바닥 균열 (잠시 남는다): 꺾이며 뻗고 곁가지가 갈라지며, 금 사이로 핏빛이 비친다. */
function crack(m: Monster, x: number, power: number): void {
  const b = m.scene;
  const g = b.add.graphics().setDepth(DEPTH.fx - 2);
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    let cx = x;
    let cy = FLOOR_Y + 1;
    const segs = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < segs; k++) {
      const nx = cx + side * (9 + Math.random() * 15) * power;
      const ny = FLOOR_Y + 1 + Math.random() * 4;
      g.lineStyle(k === 0 ? 3 : 2, 0x1a0608, 1).lineBetween(cx, cy, nx, ny);
      g.lineStyle(1, CRIMSON, 0.9).lineBetween(cx, cy - 1, nx, ny - 1);
      if (Math.random() < 0.4) g.lineStyle(1, 0x1a0608, 1).lineBetween(nx, ny, nx + side * 6, ny + 3);
      cx = nx;
      cy = ny;
    }
  }
  b.tweens.add({ targets: g, alpha: 0, delay: 1000, duration: 700, onComplete: () => g.destroy() });
}

/** 흑염 기둥 하나: 검은 연기 속에서 핏빛 불길이 하늘까지 솟는다. */
function hellPillar(m: Monster, x: number): void {
  const b = m.scene;
  column(b, x, FLOOR_Y, 32, 240, PAL_BLOOD, 560);
  // 검은 불길: 밑동에서 굵은 불꽃이 일고, 검은 연기가 기둥을 타고 오른다.
  for (let i = -2; i <= 2; i++) b.fx.flame(x + i * 8, FLOOR_Y, 2.6 - Math.abs(i) * 0.45, 700);
  for (let i = 0; i < 5; i++) {
    const sy = FLOOR_Y - 20 - i * 40;
    b.time.delayedCall(i * 45, () => b.fx.smoke(x + (Math.random() - 0.5) * 16, sy, 3, i % 2 ? 0x1a0608 : 0x2a0a10, -60));
  }
  b.fx.streak(x - 6, FLOOR_Y - 20, -Math.PI / 2, 200, BLOOD_HI, 300, 2);
  b.fx.streak(x + 6, FLOOR_Y - 10, -Math.PI / 2, 160, CRIMSON, 300, 2);
  shockwave(b, x, FLOOR_Y, 66, PAL_BLOOD, 400, 0.3, 5);
  pop(b, x, FLOOR_Y - 16, 0xffd8d0, 2.2);
  b.fx.sparks(x, FLOOR_Y - 6, BLOOD_HI, 10, -Math.PI / 2, 0.45, 380, 520, 200);
  twinkles(b, x, FLOOR_Y - 110, 40, 0xffd8d0, 3, 360);
  b.fx.shake(0.5, 100);
  sfx.play('boom', 0.45);
  b.areaHit(x - 22, FLOOR_Y - 220, 44, 220, m.damage * 0.9, m, false);
}

/** 지옥의 구슬 한 발: 직선으로 날아가 플레이어나 바닥에 닿으면 터진다. */
function hellOrb(m: Monster, x: number, y: number, ang: number, speed: number): void {
  const b = m.scene;
  const W = b.level.width;
  const orb = b.add.image(x, y, AS_ORB).setScale(1.5).setDepth(DEPTH.projectile + 1);
  const halo = b.add.circle(x, y, 9, CRIMSON, 0.4).setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD);
  const tail = b.add
    .sprite(x, y, 'fx-comet')
    .play({ key: 'fx-comet', startFrame: Math.floor(Math.random() * 3) })
    .setOrigin(1, 0.5)
    .setTint(CRIMSON)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setRotation(ang)
    .setScale(0.9, 1.4)
    .setDepth(DEPTH.projectile);
  const dist = 760;
  let done = false;
  const end = (burst: boolean): void => {
    if (done) return;
    done = true;
    if (burst) {
      b.fx.burst(orb.x, orb.y, CRIMSON, 4, 90, 300);
      b.fx.sparks(orb.x, orb.y, BLOOD_HI, 5, 0, Math.PI, 160, 280, 200);
      pop(b, orb.x, orb.y, 0xffd8d0, 1);
    }
    orb.destroy();
    halo.destroy();
    tail.destroy();
  };
  b.tweens.add({
    targets: [orb, halo, tail],
    x: x + Math.cos(ang) * dist,
    y: y + Math.sin(ang) * dist,
    duration: (dist / speed) * 1000,
    onUpdate: () => {
      if (done) return;
      orb.rotation += 0.2;
      if (orb.y > FLOOR_Y - 4 || orb.x < -30 || orb.x > W + 30 || orb.y < -30) {
        end(orb.y > FLOOR_Y - 4);
        return;
      }
      const pb = b.player.body;
      if (orb.x > pb.x - 5 && orb.x < pb.right + 5 && orb.y > pb.y - 5 && orb.y < pb.bottom + 5) {
        b.damagePlayer(m.damage * 0.5, { x: orb.x, monster: m, melee: false });
        end(true);
      }
    },
    onComplete: () => end(false),
  });
  b.events.once('shutdown', () => end(false));
}

/** 하늘에 떠오른 마검: 예고 뒤 그 자리에 꽂힌다. */
function demonSword(m: Monster, x: number, delay: number): void {
  const b = m.scene;
  const y0 = 70 + Math.random() * 34;
  const sword = b.add.image(x, y0, AS_SWORD).setScale(2).setDepth(DEPTH.projectile).setAlpha(0);
  const glow = b.add.image(x, y0, AS_SWORD).setScale(2.3).setDepth(DEPTH.projectile - 1).setTintFill(CRIMSON).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  b.tweens.add({ targets: sword, alpha: 1, duration: 200 });
  b.tweens.add({ targets: glow, alpha: 0.6, duration: 200, yoyo: true, repeat: -1, hold: 120 });
  pop(b, x, y0, 0xffd8d0, 1.4);
  b.fx.twinkle(x, y0 - 30, 0xffd8d0, 100);
  // 떠 있는 동안 칼끝이 조금씩 떨린다.
  b.tweens.add({ targets: [sword, glow], x: x + 1.5, duration: 60, yoyo: true, repeat: -1 });
  const ground = FLOOR_Y - 26;
  b.addTelegraph(
    x - 16,
    0,
    32,
    FLOOR_Y,
    delay,
    m,
    () => {
      b.tweens.killTweensOf([sword, glow]);
      glow.setAlpha(0.7);
      b.tweens.add({
        targets: [sword, glow],
        x,
        y: ground,
        duration: 90,
        ease: 'Quad.easeIn',
        onComplete: () => {
          // 꽂힌 자리: 충격파, 핏빛 불티, 균열
          shockwave(b, x, FLOOR_Y, 50, PAL_BLOOD, 340, 0.3, 5);
          pop(b, x, FLOOR_Y - 10, 0xffd8d0, 1.8);
          b.fx.sparks(x, FLOOR_Y - 4, BLOOD_HI, 10, -Math.PI / 2, 1.1, 280, 420, 520);
          b.fx.cut(x, FLOOR_Y - 60, Math.PI / 2, 120, BLOOD_HI);
          crack(m, x, 0.6);
          b.fx.shake(0.4, 80);
          sfx.play('slash', 0.6);
          b.areaHit(x - 16, FLOOR_Y - 140, 32, 140, m.damage * 0.8, m, false);
          b.tweens.add({ targets: [sword, glow], alpha: 0, delay: 500, duration: 300, onComplete: () => (sword.destroy(), glow.destroy()) });
        },
      });
      // 떨어지는 길에 빛줄기
      b.fx.streak(x, ground, Math.PI / 2, ground - y0, CRIMSON, 200, 3);
    },
    CRIMSON,
  );
  b.events.once('shutdown', () => (sword.destroy(), glow.destroy()));
}

/**
 * 그림자 분신: 맵 끝에 나타나 예고 뒤 반대편 끝까지 바닥을 쓸며 돌진한다.
 * 마왕의 지금 몸을 돌진 자세로 잠깐 바꿔 그림자를 뜬다.
 */
function shadowClone(m: Monster, st: KingState, side: -1 | 1, warn: number): void {
  const b = m.scene;
  const W = b.level.width;
  const dir = (-side) as 1 | -1;
  const x0 = side === -1 ? 50 : W - 50;
  const x1 = side === -1 ? W + 80 : -80;
  const rig = st.rig;
  const keep = { ...rig.pose };
  rig.pose = DASH;
  rig.update(m.x, m.body.bottom + 1, dir, 0);
  const shade = rig.snapshot(0x1a0408, 0.92, undefined, false);
  const rim = rig.snapshot(CRIMSON, 0.22);
  rig.pose = keep;
  for (const c of [shade, rim]) {
    c.setPosition(x0, FLOOR_Y + 1).setAlpha(0);
    b.tweens.add({ targets: c, alpha: c === shade ? 0.95 : 0.25, duration: 240 });
  }
  b.fx.smoke(x0, FLOOR_Y - 40, 2, 0x2a0a10, -20);
  pop(b, x0, FLOOR_Y - 60, CRIMSON, 2.4);
  twinkles(b, x0, FLOOR_Y - 70, 30, 0xffd8d0, 3, 200);
  b.addTelegraph(0, FLOOR_Y - 80, W, 80, warn, m, null, CRIMSON);
  let hit = false;
  let trail = 0;
  b.time.delayedCall(warn * 1000, () => {
    if (!m.alive) {
      shade.destroy();
      rim.destroy();
      return;
    }
    sfx.play('slash', 1.1);
    pop(b, x0 + dir * 30, FLOOR_Y - 50, 0xffffff, 2.4);
    crescent(b, x0 + dir * 20, FLOOR_Y - 50, dir, 70, PAL_BLOOD, { from: -1.7, to: 1.3, ms: 260 });
    b.fx.bigSlash(x0, FLOOR_Y - 40, x1, FLOOR_Y - 40, CRIMSON, 8, 360);
    b.tweens.add({
      targets: [shade, rim],
      x: x1,
      duration: (Math.abs(x1 - x0) / 950) * 1000,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        const cx = shade.x;
        if ((trail = (trail + 1) % 2) === 0) {
          b.fx.streak(cx - dir * 30, FLOOR_Y - 20 - Math.random() * 70, dir === 1 ? 0 : Math.PI, 60 + Math.random() * 60, CRIMSON, 180, 2);
          b.fx.sparks(cx, FLOOR_Y - 4, BLOOD_HI, 2, dir === 1 ? Math.PI + 0.4 : -0.4, 0.4, 220, 300, 400);
        }
        if (hit) return;
        const pb = b.player.body;
        if (Math.abs(cx - b.player.x) < 34 && pb.bottom > FLOOR_Y - 80) {
          hit = true;
          b.damagePlayer(m.damage * 1.0, { x: cx - dir * 40, monster: m, melee: false });
          b.fx.cut(b.player.x, b.player.y, -0.3 * dir, 90, BLOOD_HI);
        }
      },
      onComplete: () => {
        shade.destroy();
        rim.destroy();
      },
    });
  });
  b.events.once('shutdown', () => (shade.destroy(), rim.destroy()));
}

/** 연속 심판 한 번: 정한 칸(맵의 1/3)들에 하늘에서 핏빛 벼락과 기둥이 내린다. */
function judgeStrike(m: Monster, x0: number, w: number): void {
  const b = m.scene;
  for (let i = 0; i < 4; i++) {
    const x = x0 + (i + 0.5) * (w / 4);
    b.time.delayedCall(i * 40, () => {
      column(b, x, FLOOR_Y, 30, 380, PAL_BLOOD, 700);
      shockwave(b, x, FLOOR_Y, 70, PAL_BLOOD, 420, 0.28, 6);
      b.fx.lightning(x + (Math.random() - 0.5) * 30, 0, x, FLOOR_Y - 4, CRIMSON, 2, 260);
      b.fx.sparks(x, FLOOR_Y - 8, BLOOD_HI, 8, -Math.PI / 2, 0.6, 400, 600, 200);
    });
  }
  twinkles(b, x0 + w / 2, FLOOR_Y - 150, w / 2, 0xffd8d0, 8, 500);
  tint(b, CRIMSON, 0.22, 420);
  b.fx.shake(1.4, 260);
  sfx.play('boom', 0.9);
  b.areaHit(x0, 0, w, FLOOR_Y, m.damage * 1.5, m, false);
}

function choose(m: Monster, st: KingState, dist: number): Pattern {
  const near: Pattern[] = ['reap', 'reap', 'pillars', 'barrage', 'blink', 'swords'];
  const far: Pattern[] = ['blink', 'pillars', 'barrage', 'clones', 'swords'];
  const pool = (dist < 220 ? near : far).filter((x) => x !== st.last);
  if (m.scene.raid?.enraged) pool.push('judge', 'clones');
  return pool[Math.floor(Math.random() * pool.length)];
}

function startBlend(st: KingState): void {
  st.blendFrom = { ...st.rig.pose };
  st.blend = st.blendTotal = BLEND;
}

function begin(m: Monster, st: KingState, pattern: Pattern): void {
  const b = m.scene;
  const p = b.player;
  const W = b.level.width;
  const pace = b.legionPace(m);
  st.pattern = pattern;
  st.t = 0;
  st.fired.clear();
  st.dir = p.x >= m.x ? 1 : -1;
  m.face(st.dir);
  m.body.setVelocityX(0);
  startBlend(st);
  switch (pattern) {
    case 'reap':
      // 첫 두 번의 베기가 닿는 곳
      b.addTelegraph(st.dir === 1 ? m.x - 20 : m.x - 200, FLOOR_Y - 150, 220, 150, 0.7 * pace, m, null, CRIMSON);
      break;
    case 'blink': {
      // 플레이어 뒤 (벽에 막히면 앞)
      const behind = p.x + Math.sign(p.x - m.x || 1) * 110;
      st.to = behind > 60 && behind < W - 60 ? behind : Phaser.Math.Clamp(p.x - Math.sign(p.x - m.x || 1) * 110, 60, W - 60);
      break;
    }
  }
}

/** 낫을 세워 든 채 묵직하게 걷거나 숨을 고르는 자세 */
function movePose(st: KingState, moving: boolean, dt: number): Pose {
  const p = { ...ASTAROTH_IDLE };
  const breathe = Math.sin(st.time * 2);
  p.hy += breathe * 0.5;
  p.w += breathe * 1.5;
  p.aFy += breathe * 0.3;
  if (moving) {
    st.walk += dt * 6;
    const s = Math.sin(st.walk);
    const c = Math.cos(st.walk);
    p.fFx = 1 + s * 7;
    p.fFy = -Math.max(0, c) * 3.5;
    p.fBx = -1 - s * 7;
    p.fBy = -Math.max(0, -c) * 3.5;
    p.hy += 1 - Math.abs(c) * 1.2;
    p.lean += 4;
    p.w += s * 4;
  } else st.walk = 0;
  return p;
}

/**
 * 떠 있는 동안의 봉인 문양: 서로 반대로 도는 끊어진 고리 두 겹(진홍·금)과 룬 눈금, 아래로 늘어진 빛 사슬.
 */
function drawSigil(m: Monster, st: KingState): void {
  const g = st.sigil;
  g.clear();
  if (!st.floating) return;
  const t = st.time;
  const cx = m.x;
  const cy = m.y - 10;
  const ring = (r: number, n: number, spin: number, width: number, fill: number, color: number, alpha: number): void => {
    for (let i = 0; i < n; i++) {
      const a0 = spin + (i / n) * Math.PI * 2;
      const rr = r + Math.sin(t * 5 + i * 1.7) * 1.5;
      g.lineStyle(width, color, alpha)
        .beginPath()
        .arc(cx, cy, rr, a0, a0 + ((Math.PI * 2) / n) * fill, false)
        .strokePath();
    }
  };
  ring(96, 12, t * 1.2, 3, 0.7, CRIMSON, 0.9);
  ring(104, 18, -t * 0.8, 1.5, 0.45, GOLD, 0.7);
  ring(82, 5, -t * 2, 2, 0.5, CRIMSON, 0.5);
  for (let i = 0; i < 12; i++) {
    const a = t * 1.2 + (i / 12) * Math.PI * 2 + 0.2;
    const r1 = i % 3 === 0 ? 112 : 108;
    g.lineStyle(i % 3 === 0 ? 2 : 1, GOLD, 0.8).lineBetween(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  // 바닥으로 늘어진 빛 사슬 세 가닥
  for (let i = -1; i <= 1; i++) {
    const x = cx + i * 40;
    for (let y = cy + 60; y < FLOOR_Y; y += 10) {
      const on = Math.floor((y + t * 60) / 10) % 2 === 0;
      if (on) g.lineStyle(2, CRIMSON, 0.5).lineBetween(x + Math.sin(y * 0.05 + t) * 3, y, x + Math.sin((y + 6) * 0.05 + t) * 3, y + 6);
    }
  }
}

/** 떠 있던 마왕이 땅에 내려선다: 봉인 문양을 거두고, 내려선 자리에 충격파. */
function land(m: Monster, st: KingState): void {
  const b = m.scene;
  st.floating = false;
  st.t = 0;
  st.rig.glowing = false;
  st.sigil.clear();
  m.body.setAllowGravity(true);
  startBlend(st);
  shockwave(b, m.x, FLOOR_Y, 160, PAL_BLOOD, 460, 0.28, 6);
  b.fx.sparks(m.x, FLOOR_Y - 4, BLOOD_HI, 10, -Math.PI / 2, 1.2, 260, 420, 520);
  crack(m, m.x, 1);
}

function init(m: Monster): KingState {
  const b = m.scene;
  makeAstarothArt(b);
  const rig = new Rig(b, ASTAROTH_RIG, ASTAROTH_IDLE);
  rig.glowColor = CRIMSON;
  m.sprite.setVisible(false);
  const sigil = b.add.graphics().setDepth(DEPTH.monster - 1).setBlendMode(Phaser.BlendModes.ADD);
  const st: KingState = {
    pattern: null,
    t: 0,
    fired: new Set(),
    last: null,
    rig,
    dir: -1,
    to: 0,
    fromX: 0,
    fromY: 0,
    floating: false,
    wasStunned: false,
    roared: false,
    swinging: 0,
    ghost: 0,
    walk: 0,
    time: 0,
    blendFrom: null,
    blend: 0,
    blendTotal: BLEND,
    sigil,
  };
  states.set(m, st);
  // 리그는 본체 발밑을 따라가고, 맞으면 번쩍이고, 쓰러지면 함께 사라진다. 그로기 동안에는 무릎을 꿇는다.
  const follow = (): void => {
    const step = b.rigStep();
    // 봉인이 풀리면 곧바로 그로기에 빠져 행동(behavior)이 멈추므로, 내려앉는 처리는 여기서 한다.
    if (st.floating && (!b.raid || b.raid.mode === 'fight')) land(m, st);
    if (m.alive && m.stun > 0 && !st.floating) {
      rig.pose = lerpPose(rig.pose, ASTAROTH_GROGGY, Math.min(1, step * 8));
      rig.glowing = false;
      st.wasStunned = true;
    }
    rig.mirror(m.sprite);
    rig.update(m.x, m.body.bottom + 1, m.facing, step);
    drawSigil(m, st);
    if (!m.alive) sigil.clear();
  };
  b.events.on('postupdate', follow);
  b.events.once('shutdown', () => {
    b.events.off('postupdate', follow);
    rig.destroy();
    sigil.destroy();
  });
  // 등장: 발밑에서 핏빛 기운이 솟는다.
  b.time.delayedCall(250, () => {
    if (!m.alive) return;
    aura(b, m.x, FLOOR_Y, PAL_BLOOD, 90);
    column(b, m.x, FLOOR_Y, 30, 340, PAL_BLOOD, 800);
    shockwave(b, m.x, FLOOR_Y, 220, PAL_BLOOD, 620, 0.28, 7);
    twinkles(b, m.x, m.y - 40, 90, 0xffd8d0, 10, 700);
  });
  m.attackTimer = 1.8;
  // 개발용: 콘솔에서 패턴을 바로 시켜 본다 (__bw.battle.monsters[0].force('reap'))
  if (import.meta.env.DEV) (m as unknown as { force: (p: Pattern) => void }).force = (pat) => begin(m, st, pat);
  return st;
}

export const demonKingRaid: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  const raid = b.raid;
  const st = states.get(m) ?? init(m);
  const body = m.body;
  const rig = st.rig;
  st.time += dt;

  // 봉인 해제 기믹 동안: 가운데로 떠올라 봉인 문양을 두르고 머문다.
  if (raid && raid.mode !== 'fight' && raid.mode !== 'intro') {
    if (!st.floating) {
      st.floating = true;
      st.pattern = null;
      st.t = 0;
      st.fromX = m.x;
      st.fromY = m.y;
      body.setAllowGravity(false);
      m.sprite.setAlpha(1);
      rig.glowing = true;
      shards(b, m.x, m.y, PAL_BLOOD, 22, 240, 540);
      shockwave(b, m.x, FLOOR_Y, 140, PAL_BLOOD, 480, 0.28, 6);
      pop(b, m.x, m.y - 10, 0xffd8d0, 3.4);
    }
    st.t += dt;
    const k = Phaser.Math.Clamp(st.t / 0.8, 0, 1);
    const e = Phaser.Math.Easing.Sine.InOut(k);
    const tx = b.level.width / 2;
    const ty = RAID_FLOAT_Y + Math.sin(b.time.now / 300) * 4 * k;
    body.reset(st.fromX + (tx - st.fromX) * e, st.fromY + (ty - st.fromY) * e);
    body.setVelocity(0, 0);
    m.face(p.x - m.x || 1);
    const wave = Math.sin(st.time * 4);
    rig.pose = lerpPose(rig.pose, { ...ASTAROTH_FLOAT, aFy: ASTAROTH_FLOAT.aFy - wave * 1.5, aBy: ASTAROTH_FLOAT.aBy - wave * 1.5 }, Math.min(1, dt * 6));
    if (Math.random() < 0.5) b.fx.burst(m.x + (Math.random() - 0.5) * 120, m.y + (Math.random() - 0.5) * 140, CRIMSON, 1, 30, 400);
    if (Math.random() < 0.08) b.fx.twinkle(m.x + (Math.random() - 0.5) * 200, m.y + (Math.random() - 0.5) * 200, 0xffd8d0);
    return;
  }
  if (st.floating) land(m, st);
  if (m.stun > 0) {
    // 그로기: follow가 무릎 꿇은 자세로 무너뜨린다.
    body.setVelocityX(0);
    st.pattern = null;
    m.sprite.setAlpha(1);
    return;
  }
  if (st.wasStunned) {
    st.wasStunned = false;
    st.blendFrom = { ...rig.pose };
    st.blend = st.blendTotal = 0.35;
  }
  if (raid?.enraged && !st.roared) {
    st.roared = true;
    begin(m, st, 'roar');
  }
  const pace = b.legionPace(m);
  const f = st.dir;
  let pose: Pose;
  let done = false;

  if (!st.pattern) {
    // 낫을 세워 든 채 묵직하게 걸어온다.
    const dx = p.x - m.x;
    m.face(dx || 1);
    st.dir = dx >= 0 ? 1 : -1;
    rig.glowing = false;
    const moving = Math.abs(dx) > 170;
    body.setVelocityX(moving ? Math.sign(dx) * m.speed * 0.7 : 0);
    pose = movePose(st, moving, dt);
    // 낫 날에서 핏빛 기운이 피어오른다.
    if (Math.random() < 0.15) {
      const e = bladeTip(st);
      b.fx.sparks(e.x, e.y, CRIMSON, 1, -Math.PI / 2, 0.5, 60, 500, -60);
    }
    m.attackTimer -= dt;
    if (m.attackTimer <= 0) begin(m, st, choose(m, st, Math.abs(dx)));
  } else {
    st.t += dt / pace;
    const t = st.t;
    body.setVelocityX(0);
    switch (st.pattern) {
      case 'reap': {
        if (once(st, 1, 0.55)) {
          const e = bladeTip(st);
          pop(b, e.x, e.y, 0xffd8d0, 1.6);
          b.fx.twinkle(e.x, e.y, 0xffffff, 60);
        }
        if ((t > 0.6 && t < 0.72) || (t > 1.05 && t < 1.2) || (t > 1.76 && t < 1.9)) st.swinging = 0.1;
        if (t > 0.7 && t < 0.85) body.setVelocityX(f * 160);
        if (once(st, 2, 0.7)) {
          swing(m, m.x + f * 50, FLOOR_Y - 80, f, 110);
          frontHit(m, f, 0, 190, 150, m.damage * 0.9);
        }
        if (once(st, 3, 1.17)) {
          swing(m, m.x + f * 46, FLOOR_Y - 70, f, 104, { up: true });
          frontHit(m, f, -20, 180, 170, m.damage * 0.9);
        }
        // 내리찍기 예고 (앞으로 터지는 균열까지)
        if (once(st, 4, 1.3)) b.addTelegraph(f === 1 ? m.x + 20 : m.x - 330, FLOOR_Y - 130, 310, 130, 0.58 * pace, m, null, CRIMSON);
        if (once(st, 5, 1.88)) {
          const e = bladeTip(st);
          swing(m, m.x + f * 50, FLOOR_Y - 70, f, 120);
          impact(m, e.x, 1.3);
          frontHit(m, f, 10, 200, 130, m.damage * 1.3);
          // 앞으로 핏빛 균열이 차례로 터진다.
          for (let i = 0; i < 4; i++) {
            const x = e.x + f * (50 + i * 50);
            b.time.delayedCall(70 + i * 70, () => {
              if (!m.alive) return;
              column(b, x, FLOOR_Y, 14, 120, PAL_BLOOD, 380);
              b.fx.sparks(x, FLOOR_Y - 4, BLOOD_HI, 6, -Math.PI / 2, 0.6, 300, 420, 400);
              b.fx.flame(x, FLOOR_Y, 1.2, 500);
              b.areaHit(x - 22, FLOOR_Y - 90, 44, 90, m.damage * 0.6, m, false);
            });
          }
        }
        break;
      }
      case 'blink': {
        if (once(st, 0, 0)) {
          // 핏빛 안개로 사라진다.
          rig.ghost(CRIMSON, 0.7, 360);
          shards(b, m.x, m.y, PAL_BLOOD, 18, 220, 440);
          pop(b, m.x, m.y, 0xffd8d0, 3);
          b.fx.cut(m.x, m.y, Math.PI / 2, 140, BLOOD_HI);
          b.fx.smoke(m.x, m.y, 2, 0x2a0a10);
          m.sprite.setAlpha(0);
          sfx.play('magic', 0.6);
        }
        if (once(st, 1, 0.45)) {
          body.reset(st.to, FLOOR_Y - body.height / 2);
          st.dir = p.x >= st.to ? 1 : -1;
          m.face(st.dir);
          m.sprite.setAlpha(1);
          b.fx.smoke(st.to, m.y, 2, 0x2a0a10);
          flare(b, st.to, m.y, 36, PAL_BLOOD, 300);
          b.fx.cut(st.to, m.y, Math.PI / 2, 140, BLOOD_HI);
          twinkles(b, st.to, m.y, 50, 0xffd8d0, 5, 300);
          b.addTelegraph(st.to - 160, FLOOR_Y - 120, 320, 120, 0.7 * pace, m, null, CRIMSON);
        }
        if (t > 1.05 && t < 1.17) st.swinging = 0.1;
        if (once(st, 2, 1.15)) {
          const d = st.dir;
          swing(m, m.x + d * 40, FLOOR_Y - 60, d, 120, { squash: 0.6 });
          crescent(b, m.x, FLOOR_Y - 60, (-d) as 1 | -1, 120, PAL_BLOOD, { from: 1.6, to: -1.4, ms: 340, squash: 0.6 });
          shockwave(b, m.x, FLOOR_Y, 170, PAL_BLOOD, 420, 0.25, 6);
          b.fx.shake(1, 180);
          b.fx.stop(0.08);
          b.areaHit(m.x - 160, FLOOR_Y - 120, 320, 120, m.damage * 1.2, m, false);
        }
        break;
      }
      case 'pillars': {
        rig.glowing = t > 0.4;
        if (t > 0.6 && t < 0.74) st.swinging = 0.1;
        if (once(st, 1, 0.72)) {
          const e = bladeTip(st);
          impact(m, e.x, 1);
          b.fx.flashScreen(CRIMSON, 0.15, 220);
          const W = b.level.width;
          const n = raid?.enraged ? 9 : 7;
          const chains: (1 | -1)[] = raid?.enraged ? [f, (-f) as 1 | -1] : [f];
          for (const d of chains) {
            for (let i = 0; i < n; i++) {
              const x = m.x + d * (80 + i * 72);
              if (x < 20 || x > W - 20) break;
              b.addTelegraph(x - 22, FLOOR_Y - 220, 44, 220, (0.8 + i * 0.14) * pace, m, () => hellPillar(m, x), CRIMSON);
            }
          }
        }
        // 박힌 낫에서 핏빛 기운이 땅으로 번진다.
        if (t > 0.72 && t < 2.3 && Math.random() < 0.5) {
          const e = bladeTip(st);
          b.fx.sparks(e.x, FLOOR_Y - 4, BLOOD_HI, 1, -Math.PI / 2, 1.2, 160, 400, 300);
          b.fx.burst(e.x, FLOOR_Y - 4, CRIMSON, 1, 80, 360);
        }
        break;
      }
      case 'barrage': {
        const top = { x: m.x - f * 6, y: m.body.top - 18 };
        // 들어 올린 손 위로 핏빛 구가 모인다.
        if (t > 0.3 && Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          b.fx.sparks(top.x + Math.cos(a) * 30, top.y + Math.sin(a) * 30, BLOOD_HI, 1, a + Math.PI, 0.1, 160, 200, 0);
        }
        const rings = raid?.enraged ? [0.55, 1.05, 1.55, 2.05] : [0.55, 1.15, 1.75];
        rings.forEach((at, k) => {
          if (!once(st, 10 + k, at)) return;
          const n = 18;
          const off = Math.random() * Math.PI * 2;
          // 원마다 두 발을 비워 빠져나갈 틈을 둔다.
          const gap = Math.floor(Math.random() * n);
          for (let i = 0; i < n; i++) {
            if (i === gap || i === (gap + 1) % n) continue;
            hellOrb(m, top.x, top.y, off + (i / n) * Math.PI * 2, 140 + k * 12);
          }
          flare(b, top.x, top.y, 30, PAL_BLOOD, 260);
          rays(b, top.x, top.y, 10, 70, PAL_BLOOD, 300);
          pop(b, top.x, top.y, 0xffd8d0, 2.6);
          shockwave(b, top.x, top.y, 70, PAL_BLOOD, 320, 1, 4);
          sfx.play('magic', 0.7);
        });
        if (t > (raid?.enraged ? 2.5 : 2.2)) done = true;
        break;
      }
      case 'clones': {
        rig.glowing = true;
        const n = raid?.enraged ? 4 : 3;
        for (let i = 0; i < n; i++) {
          if (!once(st, 20 + i, 0.45 + i * 0.6)) continue;
          // 플레이어 쪽에서 먼 끝과 가까운 끝을 번갈아
          const far: -1 | 1 = p.x < b.level.width / 2 ? 1 : -1;
          shadowClone(m, st, (i % 2 ? -far : far) as -1 | 1, 0.75 * pace);
          const e = bladeTip(st);
          pop(b, e.x, e.y, CRIMSON, 1.6);
        }
        if (t > 0.45 + n * 0.6 + 1.2) done = true;
        break;
      }
      case 'swords': {
        rig.glowing = t > 0.3;
        if (once(st, 0, 0.5)) {
          const e = bladeTip(st);
          column(b, e.x, e.y, 12, 320, PAL_BLOOD, 600);
          flare(b, e.x, e.y, 34, PAL_BLOOD, 340);
          rays(b, e.x, e.y, 12, 90, PAL_BLOOD, 380);
          tint(b, CRIMSON, 0.12, 400);
          const W = b.level.width;
          const n = raid?.enraged ? 11 : 8;
          const span = 520;
          for (let i = 0; i < n; i++) {
            const x = Phaser.Math.Clamp(p.x - span / 2 + (span * (i + 0.5)) / n + (Math.random() - 0.5) * 20, 30, W - 30);
            demonSword(m, x, (0.95 + (i % 2) * 0.25 + Math.floor(i / 2) * 0.06) * pace);
          }
          sfx.play('magic', 1);
        }
        break;
      }
      case 'judge': {
        rig.glowing = true;
        if (once(st, 0, 0.5)) {
          const W = b.level.width;
          const third = W / 3;
          // 비워 둘 칸의 순서: 세 칸이 한 번씩
          const safe = [0, 1, 2].sort(() => Math.random() - 0.5);
          b.announce('종언의 연속 심판! 빈 칸으로 피하라', 1.6);
          b.fx.dim(0x2a0610, 0.3, 3200);
          safe.forEach((s, k) => {
            for (let z = 0; z < 3; z++) {
              if (z === s) continue;
              b.addTelegraph(z * third, 0, third, FLOOR_Y, (1.3 + k * 1.0) * pace, m, () => judgeStrike(m, z * third, third), CRIMSON);
            }
          });
          aura(b, m.x, FLOOR_Y, PAL_GOLD, 80);
          sfx.play('magic', 1);
        }
        if (Math.random() < 0.4) {
          const e = bladeTip(st);
          b.fx.sparks(e.x, e.y, GOLD, 1, -Math.PI / 2, 0.6, 140, 400, -40);
        }
        break;
      }
      case 'roar': {
        rig.glowing = true;
        if (once(st, 0, 0.45)) {
          b.announce('아스타로트가 마지막 힘을 끌어낸다!', 1.8);
          const e = bladeTip(st);
          aura(b, m.x, FLOOR_Y, PAL_BLOOD, 100);
          column(b, m.x, FLOOR_Y, 36, 360, PAL_BLOOD, 900);
          flare(b, m.x, m.body.top, 60, PAL_BLOOD, 460);
          rays(b, m.x, m.body.top, 16, 180, PAL_BLOOD, 560);
          rays(b, e.x, e.y, 10, 100, PAL_GOLD, 480);
          shockwave(b, m.x, m.y, 280, PAL_BLOOD, 680, 1, 7);
          shockwave(b, m.x, FLOOR_Y, 320, PAL_BLOOD, 720, 0.28, 8);
          tint(b, CRIMSON, 0.25, 600);
          twinkles(b, m.x, m.y - 30, 140, 0xffd8d0, 14, 900);
          b.fx.flashScreen(CRIMSON, 0.35, 360);
          b.fx.shake(1.8, 500);
          sfx.play('boom', 1);
        }
        if (t > 0.45 && t < 1.5 && Math.random() < 0.8) {
          const a = rig.tip(0.3 + Math.random() * 0.7);
          b.fx.sparks(a.x, a.y, BLOOD_HI, 2, -Math.PI / 2, 0.6, 220, 420, -80);
        }
        break;
      }
    }
    if (st.pattern && t > END[st.pattern]) done = true;
    pose = TRACKS[st.pattern ?? 'reap'].at(st.t);
    // 내려찍기 직전 팔이 떨린다.
    if (st.pattern === 'reap' && st.t > 1.62 && st.t < 1.76) pose.w += Math.sin(st.t * 90) * 2;
  }

  if (done) {
    st.last = st.pattern;
    st.pattern = null;
    rig.glowing = false;
    m.sprite.setAlpha(1);
    startBlend(st);
    m.attackTimer = (0.55 + Math.random() * 0.45) * pace;
  }

  // 갑자기 바뀐 자세는 잠깐 섞는다 (무기 각도는 가까운 쪽으로 돌린다).
  if (st.blendFrom && st.blend > 0) {
    const total = st.blendTotal;
    st.blend = Math.max(0, st.blend - dt);
    const from = { ...st.blendFrom };
    from.w += Math.round((pose.w - from.w) / 360) * 360;
    pose = lerpPose(from, pose, 1 - st.blend / total);
  }
  rig.pose = pose;
  // 휘두르는 중에는 낫 잔상을 남긴다.
  st.swinging = Math.max(0, st.swinging - dt);
  if (st.swinging > 0) rig.ghost(CRIMSON, 0.5, 170, ['weapon']);
  if (st.pattern === 'blink' && st.t > 0.45 && st.t < 1.15) {
    st.ghost -= dt;
    if (st.ghost <= 0) {
      st.ghost = 0.08;
      rig.ghost(0x5a0a1a, 0.3, 200);
    }
  }
};

/** 봉인의 결정: 제자리에서 천천히 떠 있다. */
export const sealCrystal: Behavior = (m, dt) => {
  m.aux += dt;
  m.body.setVelocity(0, Math.sin(m.aux * 2.4) * 8);
};
