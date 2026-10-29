import { SLOT_ACTIONS } from '../core/input';
import { sfx } from '../core/audio';
import type { SkillDef } from '../data/skills';
import type { BattleScene, HitOpts } from './battleScene';
import type { ActionKind } from './player2d';

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
        if (!p.grounded) p.startAction('airSlash', 0.32, [0.1]);
        else if (p.crouching) p.startAction('crouchSlash', 0.28, [0.08]);
        else {
          p.startAction('slash', 0.32, [0.11]);
          p.comboStep++;
          p.comboTimer = 0.8;
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
      else if (free && attack) p.startAction('manaball', 0.36, [0.08]);
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
      else if (free && p.drawCd <= 0 && attack) fireArrow(b, 0);
      break;
    case 'gun':
      if (free && attack && p.fireCd <= 0 && p.reloadTime <= 0) {
        if (p.weapon.ammo > 0) {
          p.weapon.ammo--;
          p.fireCd = 0.24;
          gunShot(b, 1, 0);
          p.startAction('shoot', 0.14);
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
  const color = dao ? 0xffd2a8 : 0xbfe4ff;
  const f = p.facing;
  if (SWINGS.has(kind)) sfx.play('slash');
  switch (kind) {
    case 'slash': {
      const second = p.comboStep % 2 === 0;
      // 칼끝까지 닿도록 넉넉하게: 몸 앞 72px
      b.fx.slash(p.x + f * 18, p.y - 2, f, 40, color, !second);
      box(b, 0, 72, 48, 2, base * (second ? 0.9 : 1.0) * mul, { basic: true, knock: 90 });
      break;
    }
    case 'airSlash':
      b.fx.slash(p.x + f * 14, p.y - 4, f, 40, color, true);
      box(b, -8, 76, 76, 6, base * 1.0 * mul, { basic: true, knock: 70 });
      break;
    case 'crouchSlash':
      b.fx.slash(p.x + f * 18, p.y + 10, f, 34, color);
      box(b, 0, 70, 24, -10, base * 0.9 * mul, { basic: true, knock: 60 });
      break;
    case 'thrust':
      p.body.setVelocityX(f * 220);
      for (let i = 0; i < 5; i++) b.fx.burst(p.x + f * (14 + i * 16), p.y - 2, 0xdff4ff, 2, 30, 200);
      box(b, 0, 110, 22, 2, base * 1.3, { basic: true, knock: 120 });
      break;
    case 'cleave': {
      const c = cleaveCharge;
      b.fx.slash(p.x + f * 20, p.y - 2, f, 44 + c * 12, c > 0.95 ? 0xffb060 : color);
      box(b, 0, 90 + c * 20, 56, 2, base * (1.1 + 1.4 * c), { basic: true, knock: 140 + c * 80 });
      if (c > 0.95) b.fx.shake(0.8);
      break;
    }
    case 'upper':
      b.fx.slash(p.x + f * 6, p.y - 20, f, 32, 0xffe08a, true);
      box(b, 0, 52, 110, 34, b.skillBase({ str: 3.0 }), { stun: 1.2, knock: 40 });
      break;
    case 'whirl':
      b.fx.slash(p.x, p.y - 2, 1, 34, 0x9fd8ff);
      b.fx.slash(p.x, p.y - 2, -1, 34, 0x9fd8ff);
      around(b, 120, 60, 2, b.skillBase({ str: 1.5 }), { stun: 1.0, knock: 100 });
      break;
    case 'sunder':
      b.fx.slash(p.x + f * 10, p.y - 2, f, 30, 0xff6a6a);
      box(b, 0, 60, 44, 2, b.skillBase({ str: 2.0 }), { vuln: [0.25, 6], knock: 80 });
      break;
    case 'crescent':
      b.fx.slash(p.x, p.y - 2, 1, 44, 0xff9a6a);
      b.fx.slash(p.x, p.y - 2, -1, 44, 0xff9a6a);
      around(b, 160, 64, 2, b.skillBase({ str: 2.2 }), { knock: 130 });
      break;
    case 'skyfall':
      b.fx.slash(p.x + f * 6, p.y - 22, f, 34, 0xc8b0ff, true);
      box(b, 0, 56, 116, 36, b.skillBase({ str: 2.8 }), { stun: 1.0 });
      break;
    case 'hamstring':
      b.fx.slash(p.x + f * 12, p.y + 8, f, 26, 0x8fe0ff);
      box(b, 0, 64, 30, -8, b.skillBase({ str: 2.0 }), { slow: [0.5, 4], knock: 40 });
      break;
    case 'iai':
      performIai(b);
      break;
    case 'waves': {
      const dy = [-12, 6, -4, 12][index % 4];
      b.spawnPlayerBolt({ x: p.x + f * 14, y: p.y + dy, vx: f * 340, vy: 0, damage: b.skillBase({ str: 4.0 }), kind: 'wave', pierce: true, life: 0.8 });
      break;
    }
    case 'manaball': {
      sfx.play('magic');
      const m = p.muzzle();
      b.spawnPlayerBolt({ x: m.x, y: m.y, vx: f * 300, vy: 0, damage: base, kind: 'orb', size: 1, basic: true });
      break;
    }
    case 'volley': {
      sfx.play('arrow');
      const m = p.muzzle();
      const ang = (Math.random() - 0.5) * 0.12;
      b.spawnPlayerBolt({
        x: m.x,
        y: m.y,
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
      b.hitscan(m.x, m.y, p.facing === 1 ? 0 : Math.PI, 600, base * 6, { pierce: true, color: 0xfff0a0, width: 4 });
      b.fx.shake(1);
      break;
    }
    default:
      break;
  }
}

function releaseOrb(b: BattleScene): void {
  const p = b.player;
  const c = Math.min(p.charge, 1.2) / 1.2;
  p.charge = -1;
  sfx.play('magic', 1 + c);
  const m = p.muzzle();
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
  b.spawnPlayerBolt({
    x: m.x,
    y: m.y,
    vx: p.facing * (360 + 160 * c),
    vy: 0,
    damage: b.weaponBase() * (1 + 2.5 * c),
    kind: 'arrow',
    color: c > 0.95 ? 0xffe08a : 0xe8dcc0,
    size: 1 + c * 0.6,
    basic: true,
    pierce: c > 0.6,
  });
  p.drawCd = p.hasBuff('haste') ? 0.3 : 0.6;
  p.startAction('shoot', 0.2);
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
  b.hitscan(m.x, m.y, ang, p.ads ? 520 : 420, b.weaponBase() * mul * (p.ads ? 1.25 : 1), { pierce: false, color: 0xffd890, width: 2 });
  b.fx.burst(m.x, m.y, 0xffd080, 3, 50, 120);
}

/** 발도: 앞으로 순간 돌진하며 경로의 적을 벤다. */
function performIai(b: BattleScene): void {
  const p = b.player;
  const len = 170;
  const x0 = p.facing === 1 ? p.x : p.x - len;
  b.hitArea(x0, p.y - 26, len, 52, b.skillBase({ str: 5.0 }), { knock: 60 });
  for (let i = 0; i <= 8; i++) b.fx.burst(p.x + p.facing * (i * len) / 8, p.y - 2, 0xffe2c4, 2, 30, 250);
  p.zone.x += p.facing * len;
  p.invuln = Math.max(p.invuln, 0.35);
  b.fx.slash(p.x, p.y, p.facing === 1 ? -1 : 1, 30, 0xffe2c4);
  b.fx.stop(0.08);
}

function updateLaser(b: BattleScene, dt: number): void {
  b.setBeam(true);
  laserTick -= dt;
  if (laserTick > 0) return;
  laserTick = 0.1;
  const p = b.player;
  const m = p.muzzle();
  b.hitscan(m.x, m.y, p.facing === 1 ? 0 : Math.PI, 380, b.skillBase({ int: 0.5 }), { pierce: true, color: 0x9fe8ff, width: 0, quiet: true });
}

function tryCast(b: BattleScene, skill: SkillDef | null, slot: number): void {
  const p = b.player;
  if (!skill || p.dodgeTime > 0) return;
  if ((p.cooldowns.get(skill.id) ?? 0) > 0) return;
  if (p.mp < skill.mana) {
    b.hud.notify('마나가 부족합니다');
    b.hud.flashSlot(slot);
    return;
  }
  if (p.action && CHANNELS.has(p.action.kind)) return;
  p.mp -= skill.mana;
  p.cooldowns.set(skill.id, skill.cooldown);
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
      p.startAction('whirl', 0.6, [0.15, 0.4]);
      break;
    case 'sword_upper':
      p.startAction('upper', 0.42, [0.14]);
      break;
    case 'sword_sunder':
      p.startAction('sunder', 0.4, [0.14]);
      break;
    case 'sword_waves': {
      const hits: number[] = [];
      for (let i = 0; i < 12; i++) hits.push(0.06 + i * 0.075);
      p.startAction('waves', 1.0, hits);
      break;
    }
    case 'sword_cry':
      p.addBuff({ id: 'cry', name: '전투의 함성', damageMul: 0.3, time: 12 });
      b.fx.ring(p.x, p.feet, 70, 0xffb040);
      b.fx.burst(p.x, p.y, 0xffc060, 18, 120, 600);
      p.startAction('cast', 0.3);
      break;
    case 'staff_meteor':
      b.castMeteor(targetAhead(b, 320, 150), b.skillBase({ int: 6.0 }), b.skillBase({ int: 0.4 }));
      p.startAction('cast', 0.4);
      break;
    case 'staff_shield':
      p.shield = s.int * 10;
      p.shieldTime = 10;
      b.fx.ring(p.x, p.feet, 40, 0x5fc8ff);
      p.startAction('cast', 0.3);
      break;
    case 'staff_ward':
      p.wardHits = 3;
      p.wardTime = 12;
      b.fx.ring(p.x, p.feet, 40, 0xffd34a);
      p.startAction('cast', 0.3);
      break;
    case 'staff_laser':
      p.startAction('laser', 1.5);
      laserTick = 0;
      break;
    case 'staff_frost': {
      const cx = targetAhead(b, 260, 110);
      b.addField({ x: cx - 70, w: 140, life: 5, tickEvery: 0.5, damage: b.skillBase({ int: 0.3 }), slow: 0.5, color: 0x8fe0ff });
      p.startAction('cast', 0.35);
      break;
    }
    case 'staff_curse': {
      const cx = targetAhead(b, 260, 110);
      b.hitArea(cx - 60, p.y - 80, 120, 140, 0, { vuln: [0.3, 6], quiet: true, noDamage: true });
      b.fx.ring(cx, b.floorY(), 60, 0xb04aff);
      b.fx.burst(cx, b.floorY() - 30, 0xb04aff, 16, 80, 500);
      p.startAction('cast', 0.35);
      break;
    }
    case 'staff_amp':
      p.addBuff({ id: 'amp', name: '마력 증폭', damageMul: 0.3, time: 10 });
      b.fx.ring(p.x, p.feet, 60, 0x7fe8ff);
      p.startAction('cast', 0.35);
      break;
    case 'dao_crescent':
      p.startAction('crescent', 0.45, [0.15]);
      break;
    case 'dao_skyfall':
      p.startAction('skyfall', 0.45, [0.15]);
      break;
    case 'dao_hamstring':
      p.startAction('hamstring', 0.4, [0.14]);
      break;
    case 'dao_rage':
      p.addBuff({ id: 'rage', name: '투혼', damageMul: 0.25, speedMul: 0.2, time: 10 });
      b.fx.ring(p.x, p.feet, 60, 0xff5a3a);
      b.fx.burst(p.x, p.y, 0xff6a4a, 16, 110, 500);
      p.startAction('cast', 0.3);
      break;
    case 'dao_iai':
      p.startAction('iai', 0.4, [0.08]);
      break;
    case 'bow_fan': {
      const m = p.muzzle();
      for (let k = -2; k <= 2; k++) {
        const ang = k * 0.13;
        b.spawnPlayerBolt({
          x: m.x,
          y: m.y,
          vx: f * Math.cos(ang) * 380,
          vy: Math.sin(ang) * 380,
          damage: b.skillBase({ dex: 0.9, str: 0.4 }),
          kind: 'arrow',
          color: 0xe8dcc0,
        });
      }
      sfx.play('arrow');
      p.startAction('shoot', 0.25);
      break;
    }
    case 'bow_rain': {
      const cx = targetAhead(b, 300, 130);
      b.addField({ x: cx - 70, w: 140, life: 2, tickEvery: 0.25, damage: b.skillBase({ dex: 0.35, str: 0.15 }), color: 0xd8c8a0, hitsAir: true, rain: true });
      p.startAction('shoot', 0.3);
      break;
    }
    case 'bow_pierce': {
      const m = p.muzzle();
      b.spawnPlayerBolt({ x: m.x, y: m.y, vx: f * 520, vy: 0, damage: b.skillBase({ dex: 2.5, str: 1.0 }), kind: 'arrow', color: 0xffe08a, size: 2, pierce: true });
      sfx.play('arrow', 1.4);
      p.startAction('shoot', 0.3);
      break;
    }
    case 'bow_haste':
      p.addBuff({ id: 'haste', name: '질풍', damageMul: 0, speedMul: 0.4, time: 8 });
      p.drawCd = 0;
      b.fx.ring(p.x, p.feet, 50, 0x9ff0c0);
      break;
    case 'bow_mana_arrows': {
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
      break;
    case 'gun_tactical':
      p.weapon.ammo = p.weapon.magazine;
      p.reloadTime = 0;
      p.addBuff({ id: 'tactical', name: '전술 재장전', damageMul: 0.3, time: 8 });
      b.fx.ring(p.x, p.feet, 40, 0xffd890);
      sfx.play('reload');
      break;
    case 'gun_barrage': {
      const hits: number[] = [];
      for (let i = 0; i < 30; i++) hits.push(0.05 + i * 0.065);
      p.startAction('barrage', 2.05, hits);
      break;
    }
  }
}
