import * as THREE from 'three';
import { SLOT_ACTIONS } from '../core/input';
import type { SkillDef } from '../data/skills';
import type { Battle } from './battle';
import { forwardOf, type ActionKind } from './player';

// 플레이어의 공격 입력, 무기 동작, 스킬·마법 실행.
// 피해량 = (무기 기본 피해 또는 스킬 스탯 계수) × 동작 계수 → Battle.hitMonster 에서 버프·치명타·취약을 곱한다.

interface MeleeOpts {
  range: number;
  arc: number;
  damage: number;
  /** 공중의 적까지 닿는가 (대공 스킬) */
  airReach?: boolean;
  basic?: boolean;
  stun?: number;
  vuln?: [number, number];
  slow?: [number, number];
}

/** 이 동작 중에는 스킬로 끊을 수 없다 (채널링). */
const CHANNELS: ReadonlySet<ActionKind> = new Set(['laser', 'barrage', 'volley', 'snipe']);

const tmpF = new THREE.Vector3();

function meleeCone(b: Battle, o: MeleeOpts): number {
  const p = b.player;
  const f = forwardOf(p.yaw, tmpF);
  const cosHalf = Math.cos(o.arc / 2);
  const reachLow = p.pos.y - 0.4;
  const reachHigh = p.pos.y + (o.airReach ? 7 : 2.3);
  let count = 0;
  for (const m of b.monsters) {
    if (!m.alive) continue;
    const dx = m.pos.x - p.pos.x;
    const dz = m.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > o.range + m.radius) continue;
    if (o.arc < Math.PI * 2 && dist > 0.3 && (dx * f.x + dz * f.z) / dist < cosHalf) continue;
    if (m.y + m.height < reachLow || m.y > reachHigh) continue;
    b.hitMonster(m, o.damage, { basic: o.basic, stun: o.stun, vuln: o.vuln, slow: o.slow });
    count++;
  }
  return count;
}

function meleeLine(b: Battle, length: number, width: number, damage: number): number {
  const p = b.player;
  const f = forwardOf(p.yaw, tmpF);
  let count = 0;
  for (const m of b.monsters) {
    if (!m.alive) continue;
    const dx = m.pos.x - p.pos.x;
    const dz = m.pos.z - p.pos.z;
    const along = dx * f.x + dz * f.z;
    if (along < -0.3 || along > length + m.radius) continue;
    const side = Math.abs(dx * f.z - dz * f.x);
    if (side > width / 2 + m.radius) continue;
    if (m.y + m.height < p.pos.y - 0.4 || m.y > p.pos.y + 2.3) continue;
    b.hitMonster(m, damage, { basic: true });
    count++;
  }
  return count;
}

export function updatePlayerCombat(b: Battle, dt: number): void {
  const p = b.player;
  const input = b.input;
  if (p.dead) return;

  if (input.pressed('swap') && p.swapCd <= 0 && p.dodgeTime <= 0 && p.action?.kind !== 'laser') {
    p.swapWeapon();
    b.hud.flashWeapon();
  }

  if (input.pressed('dodge') && p.dodgeCd <= 0 && p.dodgeTime <= 0) {
    p.startDodge(p.wishDir(input));
    b.effects.burst(p.pos.clone().setY(p.pos.y + 0.3), 0xd8d0c0, 8, 3, 0.12, 0.4);
  }

  const melee = p.isMelee;
  const wantGuard = melee && input.isDown('guard') && !p.action && p.dodgeTime <= 0;
  if (wantGuard && !p.guarding) p.parryTimer = 0.22 + p.derived.passive.parryWindow;
  p.guarding = wantGuard;

  advanceAction(b, dt);

  const free = !p.action && !p.guarding && p.dodgeTime <= 0;
  // 한 프레임보다 짧은 클릭도 놓치지 않도록 이번 프레임에 눌린 것도 센다.
  const lmb = input.lmb || input.lmbPressed;
  const type = p.weapon.def.type;
  p.ads = type === 'gun' && input.rmb && p.dodgeTime <= 0;
  switch (type) {
    case 'sword':
      if (free && lmb) startSlash(b);
      else if (free && input.rmbPressed) p.startAction('thrust', 0.55, [0.2]);
      break;
    case 'dao':
      if (p.charge >= 0) {
        p.charge += dt;
        if (!input.rmb) releaseCleave(b);
      } else if (free && input.rmbPressed) p.charge = 0;
      else if (free && lmb) startSlash(b);
      break;
    case 'staff':
      if (p.charge >= 0) {
        p.charge += dt;
        if (!input.rmb) releaseCharge(b);
      } else if (free && input.rmbPressed) p.charge = 0;
      else if (free && lmb) p.startAction('manaball', 0.38, [0.06]);
      break;
    case 'bow':
      if (p.charge >= 0) {
        p.charge += dt;
        if (!input.rmb) releaseArrow(b);
      } else if (free && p.drawCd <= 0 && input.rmbPressed) p.charge = 0;
      else if (free && p.drawCd <= 0 && lmb) fireArrow(b, 0);
      break;
    case 'gun':
      if (input.pressed('reload')) startReload(b);
      if (free && lmb && p.fireCd <= 0 && p.reloadTime <= 0) {
        if (p.weapon.ammo > 0) shootGun(b);
        else startReload(b);
      }
      break;
  }

  for (let i = 0; i < SLOT_ACTIONS.length; i++) {
    if (input.pressed(SLOT_ACTIONS[i])) tryCast(b, p.weapon.slots[i], i);
  }
}

function startSlash(b: Battle): void {
  const p = b.player;
  const vertical = p.comboStep % 2 === 0;
  p.startAction(vertical ? 'slashV' : 'slashH', vertical ? 0.36 : 0.4, [vertical ? 0.13 : 0.15]);
  p.comboStep++;
  p.comboTimer = 0.9;
}

function advanceAction(b: Battle, dt: number): void {
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
    if (a.kind === 'laser') b.setBeam(null);
    p.action = null;
  }
}

function performHit(b: Battle, kind: ActionKind, index: number): void {
  const p = b.player;
  const base = b.weaponBase();
  // 도는 검보다 한 방이 무겁다.
  const dao = p.weapon.def.type === 'dao';
  const slashMul = dao ? 1.2 : 1;
  const slashColor = dao ? 0xffe2c4 : 0xbfe4ff;
  switch (kind) {
    case 'slashV': {
      b.effects.slash(p.pos, p.yaw, { radius: 2.8, span: Math.PI * 0.75, color: slashColor, vertical: true, y: 0.5 });
      meleeCone(b, { range: 2.8, arc: Math.PI * 0.4, damage: base * 1.0 * slashMul, basic: true });
      break;
    }
    case 'slashH': {
      b.effects.slash(p.pos, p.yaw, { radius: 3.0, span: Math.PI * 0.9, color: slashColor });
      meleeCone(b, { range: 3.0, arc: Math.PI * 0.9, damage: base * 0.9 * slashMul, basic: true });
      break;
    }
    case 'cleave': {
      const c = cleaveCharge;
      b.effects.slash(p.pos, p.yaw, { radius: 3.9, span: Math.PI * 1.1, color: c > 0.95 ? 0xffc070 : 0xffe2c4, dur: 0.3 });
      meleeCone(b, { range: 3.9, arc: Math.PI * 1.1, damage: base * (1.1 + 1.4 * c), basic: true });
      if (c > 0.95) b.shake(0.15);
      break;
    }
    case 'crescent': {
      b.effects.slash(p.pos, p.yaw, { radius: 4.2, span: Math.PI * 1.5, color: 0xff9a6a, dur: 0.3 });
      meleeCone(b, { range: 4.2, arc: Math.PI * 1.5, damage: b.skillBase({ str: 2.2 }) });
      break;
    }
    case 'skyfall': {
      b.effects.slash(p.pos, p.yaw, { radius: 3.8, span: Math.PI * 0.9, color: 0xc8b0ff, vertical: true, y: 0.3 });
      meleeCone(b, { range: 3.8, arc: Math.PI * 0.7, damage: b.skillBase({ str: 2.8 }), airReach: true, stun: 1.0 });
      break;
    }
    case 'hamstring': {
      b.effects.slash(p.pos, p.yaw, { radius: 3.4, span: Math.PI * 0.7, color: 0x8fe0ff, y: 0.4 });
      meleeCone(b, { range: 3.4, arc: Math.PI * 0.7, damage: b.skillBase({ str: 2.0 }), slow: [0.5, 4] });
      break;
    }
    case 'iai':
      performIai(b);
      break;
    case 'volley': {
      const origin = p.muzzle();
      const dir = b.aimPoint.clone().sub(origin).normalize();
      jitter(dir, 0.05);
      b.spawnPlayerBolt(origin, dir.multiplyScalar(50), {
        damage: b.skillBase({ dex: 1.0, str: 1.0 }),
        radius: 0.22,
        color: 0x9fdcff,
        arrow: true,
        pierce: true,
      });
      break;
    }
    case 'rapid':
      gunShot(b, 0.8, 0.012);
      break;
    case 'barrage':
      gunShot(b, 0.6, 0.06);
      break;
    case 'snipe': {
      const origin = p.muzzle();
      const dir = b.aimPoint.clone().sub(origin).normalize();
      b.fireHitscan(origin, dir, base * 6, { pierce: true, color: 0xfff0a0, width: 0.08 });
      b.shake(0.3);
      break;
    }
    case 'thrust': {
      const f = forwardOf(p.yaw, tmpF);
      p.vel.x += f.x * 9;
      p.vel.z += f.z * 9;
      const from = p.pos.clone().addScaledVector(f, 0.8).setY(p.pos.y + 1.3);
      for (let i = 0; i < 6; i++) {
        b.effects.burst(from.clone().addScaledVector(f, i), 0xdff4ff, 2, 1.5, 0.1, 0.25, 0);
      }
      meleeLine(b, 6, 1.1, base * 1.3);
      break;
    }
    case 'upper': {
      b.effects.slash(p.pos, p.yaw, { radius: 3.6, span: Math.PI * 0.9, color: 0xffe08a, vertical: true, y: 0.3 });
      meleeCone(b, { range: 3.6, arc: Math.PI * 0.6, damage: b.skillBase({ str: 3.0 }), airReach: true, stun: 1.2 });
      break;
    }
    case 'whirl': {
      b.effects.slash(p.pos, p.yaw + index * Math.PI, { radius: 3.6, span: Math.PI * 2, color: 0x9fd8ff, dur: 0.3 });
      meleeCone(b, { range: 3.6, arc: Math.PI * 2, damage: b.skillBase({ str: 1.5 }), stun: 1.0 });
      break;
    }
    case 'sunder': {
      b.effects.slash(p.pos, p.yaw, { radius: 3.2, span: Math.PI * 0.6, color: 0xff6a6a });
      meleeCone(b, { range: 3.2, arc: Math.PI * 0.6, damage: b.skillBase({ str: 2.0 }), vuln: [0.25, 6] });
      break;
    }
    case 'waves': {
      const spread = ((index % 4) - 1.5) * 0.18;
      b.spawnSwordWave(p.yaw + spread, b.skillBase({ str: 4.0 }));
      break;
    }
    case 'manaball': {
      const origin = p.muzzle();
      const dir = b.aimPoint.clone().sub(origin).normalize();
      b.spawnPlayerBolt(origin, dir.multiplyScalar(28), {
        damage: base,
        radius: 0.2,
        color: 0x7fe8ff,
        basic: true,
      });
      break;
    }
    default:
      break;
  }
}

let cleaveCharge = 0;

function releaseCleave(b: Battle): void {
  const p = b.player;
  cleaveCharge = Math.min(p.charge, 1);
  p.charge = -1;
  p.startAction('cleave', 0.45, [0.15]);
}

/** 방향을 원뿔 안에서 무작위로 흔든다 (탄 퍼짐). */
function jitter(dir: THREE.Vector3, spread: number): THREE.Vector3 {
  dir.x += (Math.random() - 0.5) * 2 * spread;
  dir.y += (Math.random() - 0.5) * 2 * spread;
  dir.z += (Math.random() - 0.5) * 2 * spread;
  return dir.normalize();
}

function fireArrow(b: Battle, c: number): void {
  const p = b.player;
  const origin = p.muzzle();
  const dir = b.aimPoint.clone().sub(origin).normalize();
  b.spawnPlayerBolt(origin, dir.multiplyScalar(42 + 20 * c), {
    damage: b.weaponBase() * (1 + 2.5 * c),
    radius: 0.16 + 0.12 * c,
    color: c > 0.95 ? 0xffe08a : 0xe8dcc0,
    basic: true,
    arrow: true,
    pierce: c > 0.6,
  });
  p.drawCd = p.hasBuff('haste') ? 0.32 : 0.65;
  p.startAction('shoot', 0.2);
}

function releaseArrow(b: Battle): void {
  const p = b.player;
  const c = Math.min(p.charge, 1.2) / 1.2;
  p.charge = -1;
  fireArrow(b, c);
}

function startReload(b: Battle): void {
  const p = b.player;
  const w = p.weapon;
  if (w.def.type !== 'gun' || p.reloadTime > 0 || w.ammo >= w.magazine) return;
  p.reloadTime = 1.5;
  b.hud.notify('재장전', 0.8);
}

/** 총알 한 발: 조준 방향으로 즉시 판정한다. */
function gunShot(b: Battle, mul: number, extraSpread: number): void {
  const p = b.player;
  const origin = p.muzzle();
  const dir = b.aimPoint.clone().sub(origin).normalize();
  const moving = Math.hypot(p.vel.x, p.vel.z) > 1;
  const spread = (p.ads ? 0.004 : moving ? 0.045 : 0.025) + extraSpread;
  jitter(dir, spread);
  b.fireHitscan(origin, dir, b.weaponBase() * mul * (p.ads ? 1.25 : 1), { pierce: false, color: 0xffd890, width: 0.03 });
  b.effects.flash(origin, 0.3, 0xffd080, 0.06);
}

function shootGun(b: Battle): void {
  const p = b.player;
  p.weapon.ammo--;
  p.fireCd = 0.26;
  gunShot(b, 1, 0);
  p.startAction('shoot', 0.12);
  if (p.weapon.ammo === 0) startReload(b);
}

/** 발도: 앞으로 순간 돌진하며 경로의 적을 벤다. */
function performIai(b: Battle): void {
  const p = b.player;
  const f = forwardOf(p.yaw, tmpF).clone();
  const start = p.pos.clone();
  let length = 9;
  // 경기장 경계에서 멈춘다.
  for (let d = 0.5; d <= 9; d += 0.5) {
    if (Math.hypot(start.x + f.x * d, start.z + f.z * d) > b.arenaRadius - 0.8) {
      length = d - 0.5;
      break;
    }
  }
  const damage = b.skillBase({ str: 5.0 });
  for (const m of b.monsters) {
    if (!m.alive) continue;
    const dx = m.pos.x - start.x;
    const dz = m.pos.z - start.z;
    const along = dx * f.x + dz * f.z;
    if (along < -0.5 || along > length + m.radius) continue;
    if (Math.abs(dx * f.z - dz * f.x) > 1.6 + m.radius) continue;
    if (m.y > p.pos.y + 2.3) continue;
    b.hitMonster(m, damage);
  }
  for (let d = 0; d <= length; d += 0.8) {
    b.effects.burst(start.clone().addScaledVector(f, d).setY(p.pos.y + 1.1), 0xffe2c4, 2, 1.5, 0.1, 0.3, 0);
  }
  p.pos.addScaledVector(f, length);
  p.invuln = Math.max(p.invuln, 0.35);
  b.effects.slash(p.pos, p.yaw + Math.PI, { radius: 3, span: Math.PI * 0.5, color: 0xffe2c4, dur: 0.35 });
}

function releaseCharge(b: Battle): void {
  const p = b.player;
  const c = Math.min(p.charge, 1.2) / 1.2;
  p.charge = -1;
  const origin = p.muzzle();
  const dir = b.aimPoint.clone().sub(origin).normalize();
  b.spawnPlayerBolt(origin, dir.multiplyScalar(24), {
    damage: b.weaponBase() * (1 + 2.5 * c),
    radius: 0.2 + 0.35 * c,
    color: c > 0.95 ? 0xb4f4ff : 0x7fe8ff,
    basic: true,
    aoe: c > 0.35 ? 1.5 + 2 * c : 0,
  });
  p.startAction('cast', 0.3);
}

function tryCast(b: Battle, skill: SkillDef | null, slot: number): void {
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
  castSkill(b, skill);
}

function castSkill(b: Battle, skill: SkillDef): void {
  const p = b.player;
  const s = b.stats;
  switch (skill.id) {
    case 'sword_whirl':
      p.startAction('whirl', 0.6, [0.15, 0.4]);
      break;
    case 'sword_upper':
      p.startAction('upper', 0.45, [0.16]);
      break;
    case 'sword_sunder':
      p.startAction('sunder', 0.4, [0.15]);
      break;
    case 'sword_waves': {
      const hits: number[] = [];
      for (let i = 0; i < 12; i++) hits.push(0.08 + i * 0.075);
      p.startAction('waves', 1.0, hits);
      break;
    }
    case 'sword_cry':
      p.addBuff({ id: 'cry', name: '전투의 함성', damageMul: 0.3, time: 12 });
      b.effects.ring(p.pos, 6, 0xffb040, 0.5);
      b.effects.burst(p.pos.clone().setY(1.2), 0xffc060, 20, 6, 0.12, 0.6);
      p.startAction('cast', 0.35);
      break;
    case 'staff_meteor': {
      const at = b.groundAim(25);
      b.castMeteor(at, b.skillBase({ int: 6.0 }), b.skillBase({ int: 0.4 }));
      p.startAction('cast', 0.4);
      break;
    }
    case 'staff_shield':
      p.shield = s.int * 10;
      p.shieldTime = 10;
      b.effects.ring(p.pos, 3, 0x5fc8ff, 0.4);
      p.startAction('cast', 0.3);
      break;
    case 'staff_ward':
      p.wardHits = 3;
      p.wardTime = 12;
      b.effects.ring(p.pos, 3, 0xffd34a, 0.4);
      p.startAction('cast', 0.3);
      break;
    case 'staff_laser':
      p.startAction('laser', 1.5);
      laserTick = 0;
      break;
    case 'staff_frost': {
      const at = b.groundAim(22);
      b.addField({ pos: at, radius: 4.5, life: 5, tickEvery: 0.5, damage: b.skillBase({ int: 0.3 }), slow: 0.5, color: 0x8fe0ff });
      b.effects.ring(at, 4.5, 0xbff0ff, 0.5);
      p.startAction('cast', 0.35);
      break;
    }
    case 'staff_curse': {
      const at = b.groundAim(22);
      for (const m of b.monsters) {
        if (!m.alive) continue;
        if (Math.hypot(m.pos.x - at.x, m.pos.z - at.z) <= 3.5 + m.radius) {
          m.vuln = Math.max(m.vuln, 0.3);
          m.vulnTime = 6;
          b.effects.burst(m.center(), 0xb04aff, 6, 2, 0.1, 0.5, 0);
        }
      }
      b.effects.ring(at, 3.5, 0xb04aff, 0.5);
      p.startAction('cast', 0.35);
      break;
    }
    case 'staff_amp':
      p.addBuff({ id: 'amp', name: '마력 증폭', damageMul: 0.3, time: 10 });
      b.effects.ring(p.pos, 5, 0x7fe8ff, 0.5);
      p.startAction('cast', 0.35);
      break;
    case 'dao_crescent':
      p.startAction('crescent', 0.45, [0.15]);
      break;
    case 'dao_skyfall':
      p.startAction('skyfall', 0.45, [0.16]);
      break;
    case 'dao_hamstring':
      p.startAction('hamstring', 0.4, [0.15]);
      break;
    case 'dao_rage':
      p.addBuff({ id: 'rage', name: '투혼', damageMul: 0.25, speedMul: 0.2, time: 10 });
      b.effects.ring(p.pos, 5, 0xff5a3a, 0.5);
      b.effects.burst(p.pos.clone().setY(1.2), 0xff6a4a, 18, 6, 0.12, 0.6);
      p.startAction('cast', 0.3);
      break;
    case 'dao_iai':
      p.startAction('iai', 0.5, [0.1]);
      break;
    case 'bow_fan': {
      const origin = p.muzzle();
      const base = b.aimPoint.clone().sub(origin).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      for (let k = -2; k <= 2; k++) {
        const dir = base.clone().applyAxisAngle(up, k * 0.12);
        b.spawnPlayerBolt(origin, dir.multiplyScalar(44), {
          damage: b.skillBase({ dex: 0.9, str: 0.4 }),
          radius: 0.18,
          color: 0xe8dcc0,
          arrow: true,
        });
      }
      p.startAction('shoot', 0.25);
      break;
    }
    case 'bow_rain': {
      const at = b.groundAim(28);
      b.addField({
        pos: at,
        radius: 4,
        life: 2,
        tickEvery: 0.25,
        damage: b.skillBase({ dex: 0.35, str: 0.15 }),
        color: 0xd8c8a0,
        hitsAir: true,
        rain: true,
      });
      p.startAction('shoot', 0.3);
      break;
    }
    case 'bow_pierce': {
      const origin = p.muzzle();
      const dir = b.aimPoint.clone().sub(origin).normalize();
      b.spawnPlayerBolt(origin, dir.multiplyScalar(60), {
        damage: b.skillBase({ dex: 2.5, str: 1.0 }),
        radius: 0.45,
        color: 0xffe08a,
        arrow: true,
        pierce: true,
      });
      p.startAction('shoot', 0.3);
      break;
    }
    case 'bow_haste':
      p.addBuff({ id: 'haste', name: '질풍', damageMul: 0, speedMul: 0.4, time: 8 });
      p.drawCd = 0;
      b.effects.ring(p.pos, 4, 0x9ff0c0, 0.4);
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
      const origin = p.muzzle();
      const target = b.groundAim(22);
      const g = 18;
      const t = 0.8;
      const vel = new THREE.Vector3(
        (target.x - origin.x) / t,
        (target.y - origin.y) / t + 0.5 * g * t,
        (target.z - origin.z) / t,
      );
      b.spawnPlayerBolt(origin, vel, {
        damage: b.weaponBase() * 3,
        radius: 0.18,
        color: 0x6b7a3a,
        aoe: 3.5,
        stun: 0.8,
        gravity: g,
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
      b.effects.ring(p.pos, 3, 0xffd890, 0.35);
      break;
    case 'gun_barrage': {
      const hits: number[] = [];
      for (let i = 0; i < 30; i++) hits.push(0.05 + i * 0.065);
      p.startAction('barrage', 2.05, hits);
      break;
    }
  }
}

let laserTick = 0;
const segA = new THREE.Vector3();
const segB = new THREE.Vector3();
const closest = new THREE.Vector3();
const line = new THREE.Line3();

function updateLaser(b: Battle, dt: number): void {
  const p = b.player;
  p.muzzle(segA);
  const dir = b.aimPoint.clone().sub(segA).normalize();
  segB.copy(segA).addScaledVector(dir, 26);
  b.setBeam({ from: segA, to: segB });
  laserTick -= dt;
  if (laserTick > 0) return;
  laserTick = 0.1;
  line.set(segA, segB);
  const damage = b.skillBase({ int: 0.5 });
  for (const m of b.monsters) {
    if (!m.alive) continue;
    line.closestPointToPoint(m.center(), true, closest);
    if (Math.hypot(closest.x - m.pos.x, closest.z - m.pos.z) > m.radius + 0.5) continue;
    if (closest.y < m.y - 0.5 || closest.y > m.y + m.height + 0.5) continue;
    b.hitMonster(m, damage, { quiet: true });
  }
}
