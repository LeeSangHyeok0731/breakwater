import Phaser from 'phaser';
import { SLOT_ACTIONS } from '../core/input';
import { sfx } from '../core/audio';
import type { SkillDef } from '../data/skills';
import type { BattleScene, HitOpts } from './battleScene';
import { DEPTH } from './fx';
import type { ActionKind } from './player2d';
import { meleeLook, shotColor } from './weaponArt';
import { castUltimate } from './ultimates';

// 플레이어의 공격 입력과 무기 동작, 스킬. 히트박스는 플레이어 앞쪽의 사각형이다.

/** 이 동작 중에는 스킬로 끊을 수 없다 (채널링). */
const CHANNELS: ReadonlySet<ActionKind> = new Set(['laser', 'barrage', 'volley', 'snipe']);

const SWINGS: ReadonlySet<ActionKind> = new Set([
  'slash',
  'airSlash',
  'crouchSlash',
  'thrust',
  'upper',
  'whirl',
  'sunder',
  'cleave',
  'crescent',
  'skyfall',
  'hamstring',
  'iai',
]);

/**
 * 플레이어 앞쪽 사각형 안의 적을 때린다.
 * forward: 몸 가운데에서 앞쪽으로 시작하는 거리, up: 몸 가운데 기준 위쪽 오프셋.
 */
function box(b: BattleScene, forward: number, w: number, h: number, up: number, damage: number, opts: HitOpts = {}): number {
  const p = b.player;
  const x0 = p.facing === 1 ? p.x + forward : p.x - forward - w;
  const y0 = p.y - up - h / 2;
  return b.hitArea(x0, y0, w, h, damage, opts);
}

/** 몸을 가운데로 양옆까지 */
function around(b: BattleScene, w: number, h: number, up: number, damage: number, opts: HitOpts = {}): number {
  const p = b.player;
  return b.hitArea(p.x - w / 2, p.y - up - h / 2, w, h, damage, opts);
}

let cleaveCharge = 0;
let laserTick = 0;
/** 레이저 판정 띠의 절반 높이 (px) */
const LASER_HALF_H = 12;
/** 발도가 지나간 길 (뒤따르는 칼바람이 친다) */
let iaiPath: { x0: number; len: number; y: number } | null = null;


export function updatePlayerCombat(b: BattleScene, dt: number): void {
  const p = b.player;
  const input = b.keys;
  if (p.dead) return;

  if (input.pressed('swap') && p.swapCd <= 0 && p.dodgeTime <= 0 && !(p.action && CHANNELS.has(p.action.kind))) {
    p.swapWeapon();
    b.hud.flashWeapon();
  }
  if (input.pressed('dodge') && p.dodgeCd <= 0 && p.dodgeTime <= 0) {
    p.startDodge();
    sfx.play('dodge');
  }

  // 타락한 엘프전에서는 원거리 무기도 가드키로 짧게 패링 자세를 잡는다 (막지는 못하고 파란 화살만 튕긴다).
  if (!p.isMelee && b.legion?.id === 'elf' && input.pressed('guard') && p.parryCd <= 0 && p.dodgeTime <= 0) {
    p.parryTimer = 0.3 + p.derived.passive.parryWindow;
    p.parryCd = 0.8;
    b.fx.ring(p.x + p.facing * 10, p.y, 18, 0x9fdcff, 220);
    b.fx.spark(p.x + p.facing * 12, p.y - 4, 0xffffff, 1);
  }
  const wantGuard = p.isMelee && input.isDown('guard') && !p.action && p.dodgeTime <= 0 && p.grounded;
  if (wantGuard && !p.guarding) p.parryTimer = 0.22 + p.derived.passive.parryWindow;
  p.guarding = wantGuard;

  advance(b, dt);

  const free = !p.action && !p.guarding && p.dodgeTime <= 0;
  const type = p.weapon.def.type;
  const attack = input.pressed('attack') || input.isDown('attack');
  p.ads = type === 'gun' && input.isDown('special') && p.grounded && p.dodgeTime <= 0;

  switch (type) {
    case 'sword':
    case 'dao':
      if (type === 'dao' && p.charge >= 0) {
        p.charge += dt;
        if (!input.isDown('special')) {
          cleaveCharge = Math.min(p.charge, 1);
          p.charge = -1;
          p.startAction('cleave', 0.45, [0.15]);
        }
      } else if (free && attack) {
        if (!p.grounded) {
          p.resetCombo();
          p.startAction('airSlash', 0.32, [0.1]);
        } else if (p.crouching) {
          p.resetCombo();
          p.startAction('crouchSlash', 0.28, [0.08]);
        } else {
          const n = p.nextCombo();
          comboPop(b, n);
          const [dur, hits] = SLASH_TIMING[n - 1];
          p.startAction('slash', dur, hits);
        }
      } else if (free && input.pressed('special')) {
        if (type === 'sword') p.startAction('thrust', 0.5, [0.18]);
        else p.charge = 0;
      }
      break;
    case 'staff':
      if (p.charge >= 0) {
        p.charge += dt;
        if (!input.isDown('special')) releaseOrb(b);
      } else if (free && input.pressed('special')) p.charge = 0;
      else if (free && attack) {
        comboPop(b, p.nextCombo());
        p.startAction('manaball', 0.36, [0.08]);
      }
      break;
    case 'bow':
      if (p.charge >= 0) {
        p.charge += dt;
        if (!input.isDown('special')) {
          const c = Math.min(p.charge, 1.2) / 1.2;
          p.charge = -1;
          fireArrow(b, c);
        }
      } else if (free && p.drawCd <= 0 && input.pressed('special')) p.charge = 0;
      else if (free && p.drawCd <= 0 && attack) {
        comboPop(b, p.nextCombo());
        fireArrow(b, 0);
      }
      break;
    case 'gun':
      if (free && attack && p.fireCd <= 0 && p.reloadTime <= 0) {
        if (p.weapon.ammo > 0) {
          p.weapon.ammo--;
          p.fireCd = 0.24;
          const n = p.nextCombo();
          comboPop(b, n);
          gunCombo(b, n);
          p.startAction('shoot', n >= 4 ? 0.22 : 0.14);
          if (p.weapon.ammo === 0) startReload(b);
        } else startReload(b);
      }
      break;
  }

  for (let i = 0; i < SLOT_ACTIONS.length; i++) {
    if (input.pressed(SLOT_ACTIONS[i])) tryCast(b, p.weapon.slots[i], i);
  }
}

function advance(b: BattleScene, dt: number): void {
  const p = b.player;
  const a = p.action;
  if (!a) return;
  a.t += dt;
  while (a.done < a.hits.length && a.t >= a.hits[a.done]) {
    performHit(b, a.kind, a.done);
    a.done++;
  }
  if (a.kind === 'laser') updateLaser(b, dt);
  if (a.t >= a.dur) {
    if (a.kind === 'laser') b.setBeam(false);
    p.action = null;
  }
}

function performHit(b: BattleScene, kind: ActionKind, index: number): void {
  const p = b.player;
  const base = b.weaponBase();
  const dao = p.weapon.def.type === 'dao';
  const mul = dao ? 1.2 : 1;
  // 기본 잔상 색은 무기마다 다르다 (화염검은 붉게, 월광도는 푸르게).
  const color = meleeLook(p.weapon.def).slash;
  const f = p.facing;
  if (SWINGS.has(kind)) sfx.play('slash');
  switch (kind) {
    case 'slash':
      comboSlash(b, p.combo || 1, index, base * mul, color);
      break;
    case 'airSlash':
      b.fx.slash(p.x + f * 14, p.y - 4, f, 40, color, true);
      swingFx(b, p.x + f * 36, p.y - 4);
      box(b, -8, 76, 76, 6, base * 1.0 * mul, { basic: true, knock: 70 });
      break;
    case 'crouchSlash':
      b.fx.slash(p.x + f * 18, p.y + 10, f, 34, color);
      swingFx(b, p.x + f * 36, p.y + 10);
      box(b, 0, 70, 24, -10, base * 0.9 * mul, { basic: true, knock: 60 });
      break;
    case 'thrust':
      // 찌르기: 칼끝에서 빛이 앞으로 꿰뚫고 나간다.
      p.body.setVelocityX(f * 220);
      b.fx.streak(p.x + f * 118, p.y - 2, f === 1 ? 0 : Math.PI, 104, 0xdff4ff, 220, 3);
      b.fx.spark(p.x + f * 112, p.y - 2, 0xdff4ff, 2);
      b.fx.burst(p.x + f * 60, p.y - 2, 0xdff4ff, 8, 80, 260);
      box(b, 0, 110, 22, 2, base * 1.3, { basic: true, knock: 120 });
      break;
    case 'cleave': {
      // 차징 횡베기: 모은 만큼 커지고, 끝까지 모으면 불꽃처럼 터진다.
      const c = cleaveCharge;
      const col = c > 0.95 ? 0xffb060 : color;
      b.fx.slash(p.x + f * 14, p.y - 2, f, 46 + c * 16, col, true);
      if (c > 0.5) b.fx.slash(p.x + f * 10, p.y - 2, f, 36 + c * 10, col, false, { up: true, speed: 1.4 });
      box(b, 0, 90 + c * 20, 56, 2, base * (1.1 + 1.4 * c), { basic: true, knock: 140 + c * 80 });
      if (c > 0.95) {
        b.fx.shake(0.8);
        b.fx.spark(p.x + f * 50, p.y - 2, 0xffc080, 3);
        b.fx.burst(p.x + f * 40, p.y - 2, 0xffb060, 16, 160, 380);
        b.fx.ring(p.x + f * 30, p.feet, 70, 0xffa040);
      }
      break;
    }
    // ─── 검사 초식 ───
    case 'whirl': {
      // 선풍: 몸을 돌리며 앞뒤로 네 번 벤다.
      const dir = (index % 2 === 0 ? f : -f) as 1 | -1;
      b.fx.slash(p.x + dir * 4, p.y - 2, dir, 42, meleeLook(p.weapon.def).slash, true, { up: index % 2 === 1, speed: 1.3 });
      b.fx.burst(p.x, p.y, 0xbfe8ff, 5, 130, 260);
      if (index === 3) {
        b.fx.ring(p.x, p.feet, 80, meleeLook(p.weapon.def).slash, 360);
        b.fx.shake(0.5);
      }
      around(b, 120, 60, 2, b.skillBase({ str: 0.75 }), { stun: 1.0, knock: index === 3 ? 140 : 40 });
      break;
    }
    case 'upper':
      // 승천: 두 번 빠르게 베고, 마지막에 하늘로 올려 벤다.
      if (index < 2) {
        b.fx.slash(p.x + f * 14, p.y - 2, f, 30, 0xffe08a, false, { rot: index === 0 ? -0.25 : 0.25, up: index === 1, speed: 1.3 });
        p.body.setVelocityX(f * 90);
        box(b, 0, 60, 44, 2, b.skillBase({ str: 0.6 }), { knock: 30 });
      } else {
        b.fx.slash(p.x + f * 6, p.y - 20, f, 40, 0xffe08a, true, { up: true });
        b.fx.pillar(p.x + f * 34, p.feet, 0xffd060, 120, 420);
        b.fx.embers(p.x + f * 34, p.y - 20, 0xffe08a, 12, 18, 70);
        b.fx.shake(0.6);
        box(b, 0, 52, 110, 34, b.skillBase({ str: 1.8 }), { stun: 1.2, knock: 40 });
      }
      break;
    case 'sunder':
      // 십자: 엇갈려 두 번 베어 X자를 새기고, 그 가운데를 찌른다.
      if (index < 2) {
        b.fx.slash(p.x + f * 14, p.y - 2, f, 32, 0xff6a6a, false, { rot: index === 0 ? -0.65 : 0.65, up: index === 1, speed: 1.3 });
        box(b, 0, 60, 44, 2, b.skillBase({ str: 0.6 }), { vuln: [0.25, 6], knock: 30 });
      } else {
        p.body.setVelocityX(f * 160);
        b.fx.streak(p.x + f * 92, p.y - 2, f === 1 ? 0 : Math.PI, 84, 0xff6a6a, 240, 3);
        b.fx.spark(p.x + f * 86, p.y - 2, 0xff9a9a, 2, Math.PI / 4);
        b.fx.burst(p.x + f * 70, p.y - 2, 0xff6a6a, 10, 120, 320);
        box(b, 0, 80, 22, 2, b.skillBase({ str: 0.8 }), { vuln: [0.25, 6], knock: 110 });
      }
      break;
    case 'waves': {
      // 검기 난무: 위아래로 번갈아 휘두를 때마다 검기가 날아간다.
      const dy = [-12, 6, -4, 12][index % 4];
      b.fx.slash(p.x + f * 10, p.y + dy * 0.5, f, 26, 0x9fdcff, false, { up: index % 2 === 1, rot: dy * 0.02, speed: 1.6 });
      b.spawnPlayerBolt({ x: p.x + f * 14, y: p.y + dy, vx: f * 340, vy: 0, damage: b.skillBase({ str: 4.0 }), kind: 'wave', pierce: true, life: 0.8 });
      break;
    }
    // ─── 도객 초식 ───
    case 'crescent':
      // 만월: 앞뒤로 크게 휘두른 뒤, 둥근 달을 그리며 마무리한다.
      if (index < 2) {
        const dir = (index === 0 ? f : -f) as 1 | -1;
        b.fx.slash(p.x + dir * 6, p.y - 2, dir, 50, 0xff9a6a, true, { up: index === 1 });
        b.fx.burst(p.x + dir * 30, p.y - 2, 0xffb080, 6, 110, 300);
        around(b, 160, 64, 2, b.skillBase({ str: 0.7 }), { knock: 60 });
      } else {
        b.fx.slash(p.x, p.y - 2, 1, 56, 0xffc08a, true);
        b.fx.slash(p.x, p.y - 2, -1, 56, 0xffc08a, true, { up: true });
        b.fx.ring(p.x, p.feet, 100, 0xff9a6a, 400);
        b.fx.burst(p.x, p.y - 4, 0xffd0a0, 18, 170, 420);
        b.fx.shake(0.8);
        around(b, 160, 64, 2, b.skillBase({ str: 0.8 }), { knock: 130 });
      }
      break;
    case 'skyfall':
      // 낙월: 뛰어오르며 올려 베고, 달이 떨어지듯 내려찍는다.
      if (index === 0) {
        if (p.grounded) p.body.setVelocityY(-260);
        b.fx.slash(p.x + f * 6, p.y - 22, f, 36, 0xc8b0ff, true, { up: true });
        b.fx.embers(p.x, p.feet, 0xd8c8ff, 8, 10, 40);
        box(b, 0, 56, 116, 36, b.skillBase({ str: 0.8 }), { knock: 20 });
      } else {
        p.body.setVelocityY(520);
        const gy = b.floorY();
        b.fx.slash(p.x + f * 8, p.y - 6, f, 44, 0xc8b0ff, true, { rot: 0.35 });
        b.fx.ring(p.x + f * 20, gy, 90, 0xc8b0ff, 380);
        b.fx.boom(p.x + f * 24, gy - 10, 24, 'dark');
        for (let i = -2; i <= 2; i++) b.fx.smoke(p.x + f * 24 + i * 14, gy - 4, 1, 0x9a8aa8, -10);
        b.fx.shake(1);
        box(b, 0, 70, 90, -6, b.skillBase({ str: 2.0 }), { stun: 1.0, knock: 90 });
      }
      break;
    case 'hamstring':
      // 연환각: 바닥을 쓸 듯 낮게 세 번 벤다.
      b.fx.slash(p.x + f * 12, p.y + 10, f, 30, 0x8fe0ff, false, { squash: 0.55, up: index === 1, rot: 0.15, speed: 1.4 });
      b.fx.smoke(p.x + f * 24, p.feet - 4, 1, 0x9a8a70, -6);
      p.body.setVelocityX(f * 70);
      box(b, 0, 64, 30, -8, b.skillBase({ str: index === 2 ? 0.8 : 0.6 }), { slow: [0.5, 4], knock: index === 2 ? 60 : 20 });
      break;
    case 'iai':
      if (index === 0) performIai(b);
      else iaiAftershock(b, index);
      break;
    case 'manaball':
      manaCombo(b, p.combo || 1, base);
      break;
    case 'volley': {
      sfx.play('arrow');
      const m = p.muzzle();
      b.fx.spark(m.x, m.y, 0x9fdcff);
      const ang = (Math.random() - 0.5) * 0.12;
      const s = p.shotPoint();
      b.spawnPlayerBolt({
        x: s.x,
        y: s.y,
        vx: f * Math.cos(ang) * 420,
        vy: Math.sin(ang) * 420,
        damage: b.skillBase({ dex: 1.0, str: 1.0 }),
        kind: 'arrow',
        color: 0x9fdcff,
        pierce: true,
      });
      break;
    }
    case 'rapid':
      gunShot(b, 0.8, 0.04);
      break;
    case 'barrage':
      gunShot(b, 0.6, 0.18);
      break;
    case 'snipe': {
      const m = p.muzzle();
      const s = p.shotPoint();
      b.hitscan(s.x, s.y, p.facing === 1 ? 0 : Math.PI, 600, base * 6, { pierce: true, color: 0xfff0a0, width: 4 });
      b.fx.muzzle(m.x, m.y, p.facing, 2);
      b.fx.casing(p.x + p.facing * 8, p.y - 8, p.facing, p.feet);
      b.fx.shake(1);
      break;
    }
    default:
      break;
  }
}

/** 무기의 개성이 드러나는 휘두르기 연출: 화염검은 불씨, 월광도는 달빛 가루, 강철 장검은 칼끝 반짝임 */
function swingFx(b: BattleScene, x: number, y: number): void {
  switch (meleeLook(b.player.weapon.def).aura) {
    case 'flame':
      b.fx.embers(x, y, 0xff7a1a, 8, 18, 34, 500);
      b.fx.burst(x, y, 0xffc040, 6, 110, 320);
      break;
    case 'moon':
      b.fx.burst(x, y, 0xbfd4ff, 8, 70, 450);
      b.fx.spark(x, y - 6, 0xbfd4ff, 1, Math.PI / 4);
      break;
    case 'steel':
      b.fx.spark(x + b.player.facing * 6, y - 12, 0xffffff);
      break;
    case 'blood':
      // 핏방울이 흩어지며 떨어진다.
      b.fx.burst(x, y, 0xff3a4a, 9, 90, 480, 1, 420);
      b.fx.spark(x, y, 0xff5a6a);
      break;
    case 'holy':
      b.fx.embers(x, y, 0xffe08a, 8, 18, 40, 600);
      b.fx.spark(x, y - 4, 0xfff0b0, 2);
      break;
    case 'thunder': {
      const f = b.player.facing;
      b.fx.lightning(x - f * 14, y - 16, x + f * 26, y + 8, 0x9fe8ff, 1, 140);
      b.fx.spark(x + f * 20, y, 0xdff8ff);
      break;
    }
  }
}

function releaseOrb(b: BattleScene): void {
  const p = b.player;
  const c = Math.min(p.charge, 1.2) / 1.2;
  p.charge = -1;
  sfx.play('magic', 1 + c);
  const m = p.shotPoint();
  if (c > 0.95) {
    b.fx.spark(m.x, m.y, 0x7fe8ff, 2);
    b.fx.burst(m.x, m.y, 0xbff6ff, 10, 120, 300);
  }
  b.spawnPlayerBolt({
    x: m.x,
    y: m.y,
    vx: p.facing * 260,
    vy: 0,
    damage: b.weaponBase() * (1 + 2.5 * c),
    kind: 'orb',
    size: 1 + c * 1.6,
    basic: true,
    aoe: c > 0.35 ? 30 + 40 * c : 0,
  });
  p.startAction('cast', 0.3);
}

function fireArrow(b: BattleScene, c: number): void {
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
const SLASH_TIMING: [number, number[]][] = [
  [0.32, [0.11]],
  [0.32, [0.11]],
  [0.38, [0.09, 0.21]],
  [0.42, [0.15]],
  [0.6, [0.1, 0.23, 0.38]],
];

/** 연계 단계를 머리 위에 띄운다. 마지막 단은 크게. */
function comboPop(b: BattleScene, n: number): void {
  if (n < 2) return;
  const p = b.player;
  b.fx.text(p.x, p.body.top - 10, `${n}연계`, n >= 5 ? 'crit' : 'info');
  if (n >= 5) {
    b.fx.ring(p.x, p.y, 26, 0xffe08a, 260);
    b.fx.spark(p.x, p.body.top - 4, 0xffe08a, 2);
  }
}

/** 검·도 평타: 1 베기 → 2 역베기 → 3 두 번 → 4 크게 → 5 회전 세 번 */
function comboSlash(b: BattleScene, n: number, index: number, dmg: number, color: number): void {
  const p = b.player;
  const f = p.facing;
  switch (n) {
    case 1:
      b.fx.slash(p.x + f * 18, p.y - 2, f, 40, color, true);
      swingFx(b, p.x + f * 40, p.y - 2);
      box(b, 0, 72, 48, 2, dmg, { basic: true, knock: 90 });
      break;
    case 2:
      // 역베기: 아래에서 위로, 조금 더 넓게
      b.fx.slash(p.x + f * 18, p.y - 2, f, 44, color, false, { up: true });
      swingFx(b, p.x + f * 44, p.y - 4);
      box(b, 0, 80, 54, 4, dmg, { basic: true, knock: 90 });
      break;
    case 3:
      // 두 번 연달아
      b.fx.slash(p.x + f * 18, p.y - 2, f, 42, color, index === 0, { up: index === 1, speed: 1.3 });
      swingFx(b, p.x + f * 44, p.y - 2);
      p.body.setVelocityX(f * 60);
      box(b, 0, 84, 56, 2, dmg * 0.7, { basic: true, knock: index === 1 ? 100 : 30 });
      break;
    case 4:
      // 크게 휘두르기: 한 걸음 내디디며 넓게
      p.body.setVelocityX(f * 140);
      b.fx.slash(p.x + f * 20, p.y - 4, f, 56, color, true);
      b.fx.slash(p.x + f * 16, p.y - 2, f, 44, 0xffffff, false, { speed: 1.3 });
      swingFx(b, p.x + f * 56, p.y - 4);
      b.fx.shake(0.4, 90);
      box(b, 0, 100, 66, 4, dmg * 1.3, { basic: true, knock: 150 });
      break;
    default: {
      // 마무리: 회전하며 세 번, 가장 넓고 멀리. 마지막은 터진다.
      const last = index === 2;
      p.body.setVelocityX(f * (last ? 180 : 70));
      b.fx.slash(p.x + f * 16, p.y - 4, f, 50 + index * 8, last ? 0xffe08a : color, index !== 1, { up: index === 1, speed: 1.4 });
      if (index === 1) b.fx.slash(p.x - f * 10, p.y - 4, (-f) as 1 | -1, 40, color, true, { speed: 1.4 });
      swingFx(b, p.x + f * 60, p.y - 4);
      box(b, index === 1 ? -40 : 0, index === 1 ? 160 : 120, 76, 6, dmg * 0.8, { basic: true, knock: last ? 220 : 40 });
      if (last) {
        b.fx.slash(p.x + f * 30, p.y - 4, f, 70, 0xffffff, true, { squash: 0.6 });
        b.fx.ring(p.x + f * 50, p.feet, 80, 0xffe08a, 320);
        b.fx.burst(p.x + f * 60, p.y - 4, 0xffe08a, 16, 180, 380);
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
  if (count > 1) {
    const m = p.muzzle();
    b.fx.spark(m.x, m.y, finale ? 0xffe08a : 0xffffff, finale ? 2 : 1);
    if (finale) b.fx.shake(0.4, 90);
  }
}

/** 총 평타: 1·2 한 발 → 3 두 발 → 4 세 발 → 5 산탄 다섯 발. 탄창은 한 발만 쓴다. */
function gunCombo(b: BattleScene, n: number): void {
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
    b.fx.muzzle(m.x, m.y, p.facing, 2);
    b.fx.burst(m.x, m.y, 0xffe08a, 10, 160, 260);
    return;
  }
  const shots = n === 3 ? 2 : 3;
  gunShot(b, 0.85, 0.02);
  for (let i = 1; i < shots; i++)
    b.time.delayedCall(i * 60, () => {
      if (b.player.weapon.def.type === 'gun' && !b.player.dead) gunShot(b, 0.85, 0.03);
    });
}

/** 스태프 평타: 단계마다 연달아 쏘는 마력구가 늘고, 5단의 마지막은 커다란 구체 */
function manaCombo(b: BattleScene, n: number, base: number): void {
  // 5단: 다섯 발을 연달아 쏜 뒤 커다란 구체 하나
  const count = [1, 1, 2, 3, 6][n - 1];
  const each = [1, 1, 0.75, 0.7, 0.6][n - 1];
  for (let i = 0; i < count; i++) {
    const fire = (): void => {
      const p = b.player;
      if (p.dead || p.weapon.def.type !== 'staff') return;
      const big = n >= 5 && i === count - 1;
      const m = p.shotPoint();
      sfx.play('magic', big ? 1.5 : 1);
      if (big) {
        b.fx.spark(m.x, m.y, 0x7fe8ff, 2);
        b.fx.burst(m.x, m.y, 0xbff6ff, 12, 140, 320);
      }
      b.spawnPlayerBolt({
        x: m.x,
        y: m.y + (big ? 0 : (i % 2 ? -5 : 5) * (count > 1 ? 1 : 0)),
        vx: p.facing * (big ? 260 : 320),
        vy: 0,
        damage: base * (big ? 2 : each),
        kind: 'orb',
        size: big ? 2 : 1,
        basic: true,
        aoe: big ? 50 : 0,
      });
    };
    if (i === 0) fire();
    else b.time.delayedCall(i * 90, fire);
  }
}

function startReload(b: BattleScene): void {
  const p = b.player;
  const w = p.weapon;
  if (w.def.type !== 'gun' || p.reloadTime > 0 || w.ammo >= w.magazine) return;
  p.reloadTime = 1.5;
  b.hud.notify('재장전', 0.8);
  sfx.play('reload');
}

/** 총알 한 발: 바라보는 방향으로 즉시 판정 */
function gunShot(b: BattleScene, mul: number, spread: number): void {
  const p = b.player;
  const m = p.muzzle();
  const base = p.facing === 1 ? 0 : Math.PI;
  const ang = base + (Math.random() - 0.5) * 2 * (spread + (p.ads ? 0 : 0.03));
  const s = p.shotPoint();
  b.hitscan(s.x, s.y, ang, p.ads ? 520 : 420, b.weaponBase() * mul * (p.ads ? 1.25 : 1), { pierce: false, color: shotColor(p.weapon.def), width: 2 });
  b.fx.muzzle(m.x, m.y, p.facing, 1, ang - (p.facing === 1 ? 0 : Math.PI));
  b.fx.casing(p.x + p.facing * 8, p.y - 8, p.facing, p.feet);
}

/** 발도: 앞으로 순간 돌진하며 경로의 적을 벤다. 지나간 길은 iaiPath에 남겨 뒤따르는 칼바람이 쓴다. */
function performIai(b: BattleScene): void {
  const p = b.player;
  const len = 170;
  const f = p.facing;
  const x0 = f === 1 ? p.x : p.x - len;
  iaiPath = { x0, len, y: p.y };
  b.hitArea(x0, p.y - 26, len, 52, b.skillBase({ str: 1.0 }), { knock: 20 });
  // 지나간 자리: 하얀 섬광 선과 잔상
  b.fx.streak(p.x + f * len, p.y - 2, f === 1 ? 0 : Math.PI, len + 20, 0xffe2c4, 320, 2);
  b.fx.streak(p.x + f * len, p.y + 4, f === 1 ? 0 : Math.PI, len, 0xffffff, 180, 1);
  for (let i = 0; i <= 8; i++) b.fx.burst(p.x + (f * (i * len)) / 8, p.y - 2, 0xffe2c4, 2, 40, 260);
  p.zone.x += f * len;
  p.invuln = Math.max(p.invuln, 0.35);
  b.fx.stop(0.06);
}

/** 발도 직후 지나간 길에 칼바람이 몰아친다. 마지막 바람은 화면을 가른다. */
function iaiAftershock(b: BattleScene, index: number): void {
  const path = iaiPath;
  if (!path) return;
  const x = path.x0 + path.len * (0.15 + Math.random() * 0.7);
  const dir = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
  b.fx.slash(x, path.y - 2, dir, 30 + Math.random() * 10, 0xffe2c4, false, { rot: (Math.random() - 0.5) * 1.6, up: Math.random() < 0.5, speed: 1.5 });
  b.fx.spark(x, path.y - 2, 0xffe2c4, 1, Math.random());
  const last = index === 4;
  b.hitArea(path.x0, path.y - 26, path.len, 52, b.skillBase({ str: 1.0 }), { knock: last ? 80 : 10 });
  if (last) {
    b.fx.slash(path.x0 + path.len / 2, path.y - 2, 1, path.len * 0.55, 0xffffff, true, { squash: 0.35 });
    b.fx.flashScreen(0xffe2c4, 0.28, 180);
    b.fx.shake(0.9, 160);
    b.fx.stop(0.08);
    iaiPath = null;
  }
}

function updateLaser(b: BattleScene, dt: number): void {
  b.setBeam(true);
  laserTick -= dt;
  if (laserTick > 0) return;
  laserTick = 0.1;
  const p = b.player;
  const m = p.muzzle();
  // 광선은 손 높이에서 나가므로, 선 하나로 판정하면 키 작은 적(고양이·늑대 등)을 지나친다.
  // 보이는 광선 굵기만큼의 띠로 판정한다.
  const len = 380;
  const x0 = p.facing === 1 ? m.x : m.x - len;
  b.hitArea(x0, m.y - LASER_HALF_H, len, LASER_HALF_H * 2, b.skillBase({ int: 0.5 }), { quiet: true, knock: 30 });
}

/** 시전 연출: 발밑 마법진과 피어오르는 기운. 버프는 빛기둥까지 솟는다. */
function castCircle(b: BattleScene, color: number, pillar = false): void {
  const p = b.player;
  b.fx.circle(p.x, p.feet, color, 72, 650);
  b.fx.embers(p.x, p.feet - 4, color, 10, 16, 50);
  if (pillar) b.fx.pillar(p.x, p.feet, color, 110, 650);
}

/** 보호막이 몸을 감싸며 펼쳐진다. */
function hexPop(b: BattleScene, color: number): void {
  const p = b.player;
  const h = b.add.image(p.x, p.y, 'fx-hex').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setScale(0.3);
  b.tweens.add({ targets: h, scale: 1.5, alpha: 0, duration: 380, ease: 'Quad.Out', onComplete: () => h.destroy() });
  b.fx.burst(p.x, p.y, color, 12, 120, 380);
}

/** 저격 조준: 붉은 조준선이 깜빡이고 총구로 빛이 모인다. */
function snipeSight(b: BattleScene): void {
  const p = b.player;
  const g = b.add.graphics().setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
  let t = 0;
  const ev = b.time.addEvent({
    delay: 16,
    loop: true,
    callback: () => {
      t += 16;
      g.clear();
      if (p.action?.kind !== 'snipe' || t > 600) {
        ev.remove();
        g.destroy();
        return;
      }
      const m = p.muzzle();
      // 조준선은 총알이 실제로 날아갈 높이에 긋는다.
      const s = p.shotPoint();
      g.lineStyle(1, 0xff3a2a, 0.35 + 0.35 * Math.sin(t * 0.04)).lineBetween(s.x, s.y, s.x + p.facing * 600, s.y);
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const dot = b.add.image(m.x + Math.cos(a) * 14, m.y + Math.sin(a) * 14, 'fx-px').setTint(0xfff0a0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
        b.tweens.add({ targets: dot, x: m.x, y: m.y, alpha: 0.2, duration: 160, onComplete: () => dot.destroy() });
      }
    },
  });
}

function tryCast(b: BattleScene, skill: SkillDef | null, slot: number): void {
  const p = b.player;
  if (!skill || p.dodgeTime > 0) return;
  if (p.silenceTime > 0) {
    b.hud.notify('침묵! 스킬을 쓸 수 없습니다');
    b.hud.flashSlot(slot);
    return;
  }
  if ((p.cooldowns.get(skill.id) ?? 0) > 0) return;
  if (p.mp < skill.mana) {
    b.hud.notify('마나가 부족합니다');
    b.hud.flashSlot(slot);
    return;
  }
  if (p.action && CHANNELS.has(p.action.kind)) return;
  p.mp -= skill.mana;
  p.cooldowns.set(skill.id, skill.cooldown * (1 - p.derived.cdReduce));
  p.resetCombo();
  p.charge = -1;
  p.guarding = false;
  if (skill.weapon === 'staff') sfx.play('magic', 1.2);
  castSkill(b, skill);
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
      b.fx.shake(0.5);
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
      laserTick = 0;
      break;
    case 'staff_frost': {
      const cx = targetAhead(b, 260, 110);
      castCircle(b, 0x8fe0ff);
      b.addField({ x: cx - 70, w: 140, life: 5, tickEvery: 0.5, damage: b.skillBase({ int: 0.3 }), slow: 0.5, color: 0x8fe0ff, style: 'frost' });
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
      b.fx.shake(0.6);
      p.startAction('cast', 0.35);
      break;
    }
    case 'staff_amp':
      p.addBuff({ id: 'amp', name: '마력 증폭', damageMul: 0.3, time: 10 });
      castCircle(b, 0x7fe8ff, true);
      b.fx.ring(p.x, p.feet, 80, 0x7fe8ff, 380);
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
      b.fx.shake(0.6);
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
          vx: f * Math.cos(ang) * 380,
          vy: Math.sin(ang) * 380,
          damage: b.skillBase({ dex: 0.9, str: 0.4 }),
          kind: 'arrow',
          color: 0xe8dcc0,
        });
        b.fx.streak(m.x + f * Math.cos(ang) * 26, m.y + Math.sin(ang) * 26, f === 1 ? ang : Math.PI - ang, 26, 0xfff0c0, 160);
      }
      b.fx.spark(m.x, m.y, 0xfff0c0, 2);
      sfx.play('arrow');
      p.startAction('shoot', 0.25);
      break;
    }
    case 'bow_rain': {
      const cx = targetAhead(b, 300, 130);
      b.addField({ x: cx - 70, w: 140, life: 2, tickEvery: 0.25, damage: b.skillBase({ dex: 0.35, str: 0.15 }), color: 0xd8c8a0, hitsAir: true, rain: true, style: 'rain' });
      // 하늘로 화살 다발을 쏘아 올린다.
      const m = p.muzzle();
      for (let i = 0; i < 5; i++) b.fx.streak(m.x + (i - 2) * 3, m.y - 30 - i * 6, -Math.PI / 2 + (i - 2) * 0.12, 30, 0xffe08a, 200);
      b.fx.spark(m.x, m.y, 0xffe08a);
      p.startAction('shoot', 0.3);
      break;
    }
    case 'bow_pierce': {
      const m = p.muzzle();
      const s = p.shotPoint();
      b.spawnPlayerBolt({ x: s.x, y: s.y, vx: f * 520, vy: 0, damage: b.skillBase({ dex: 2.5, str: 1.0 }), kind: 'arrow', color: 0xffe08a, size: 2, pierce: true });
      // 관통: 활 앞에 금빛 마법진이 서고 공기가 갈라진다.
      b.fx.circle(m.x + f * 8, m.y, 0xffe08a, 46, 420, true, DEPTH.fx);
      b.fx.spark(m.x + f * 8, m.y, 0xffffff, 2);
      b.fx.burst(m.x, m.y, 0xffe08a, 10, 140, 300);
      b.fx.shake(0.4);
      sfx.play('arrow', 1.4);
      p.startAction('shoot', 0.3);
      break;
    }
    case 'bow_haste':
      p.addBuff({ id: 'haste', name: '질풍', damageMul: 0, speedMul: 0.4, time: 8 });
      p.drawCd = 0;
      castCircle(b, 0x9ff0c0, true);
      // 질풍: 몸 주위로 바람결이 스친다.
      for (let i = 0; i < 6; i++) {
        const y = p.y - 20 + i * 8;
        b.time.delayedCall(i * 40, () => b.fx.streak(p.x + 24 - i * 4, y, Math.PI, 40, 0xbff8d8, 220));
      }
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
