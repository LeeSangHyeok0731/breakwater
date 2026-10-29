import * as THREE from 'three';
import type { Input } from '../core/input';
import type { SkillDef } from '../data/skills';
import { MELEE_TYPES, type WeaponDef } from '../data/weapons';
import { makePlayer, makeWeaponModel, type Rig } from './models';
import type { Derived } from './stats';

export interface EquippedWeapon {
  def: WeaponDef;
  enhance: number;
  slots: (SkillDef | null)[];
  model: THREE.Group;
  /** 총 전용: 남은 탄약과 탄창 크기 (총이 아니면 0) */
  ammo: number;
  magazine: number;
}

export type ActionKind =
  | 'slashV'
  | 'slashH'
  | 'thrust'
  | 'upper'
  | 'whirl'
  | 'sunder'
  | 'waves'
  | 'cast'
  | 'manaball'
  | 'laser'
  | 'cleave'
  | 'crescent'
  | 'skyfall'
  | 'hamstring'
  | 'iai'
  | 'shoot'
  | 'volley'
  | 'rapid'
  | 'snipe'
  | 'barrage';

export interface PlayerAction {
  kind: ActionKind;
  t: number;
  dur: number;
  /** 타격이 일어나는 시점들 (초) */
  hits: number[];
  done: number;
}

export interface Buff {
  id: string;
  name: string;
  damageMul: number;
  /** 이동속도 보너스 비율 (상한 없음) */
  speedMul?: number;
  time: number;
}

export const GRAVITY = 24;
const JUMP_SPEED = 8.5;
const DODGE_SPEED = 15;
const DODGE_TIME = 0.32;

export function forwardOf(yaw: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(yaw), 0, Math.cos(yaw));
}
export function rightOf(yaw: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(-Math.cos(yaw), 0, Math.sin(yaw));
}

export class Player {
  readonly rig: Rig;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0.15;
  grounded = true;

  hp: number;
  mp: number;
  derived: Derived;

  weapons: EquippedWeapon[];
  active = 0;
  cooldowns = new Map<string, number>();
  buffs: Buff[] = [];

  action: PlayerAction | null = null;
  comboStep = 0;
  comboTimer = 0;
  /** 스태프 우클릭 차징 시간. 차징 중이 아니면 -1 */
  charge = -1;

  dodgeTime = 0;
  dodgeCd = 0;
  readonly dodgeDir = new THREE.Vector3();
  invuln = 0;

  guarding = false;
  parryTimer = 0;

  shield = 0;
  shieldTime = 0;
  wardHits = 0;
  wardTime = 0;

  swapCd = 0;
  /** 총 재장전 남은 시간 */
  reloadTime = 0;
  /** 총 연사 간격 */
  fireCd = 0;
  /** 활 장전 남은 시간 (0이면 쏠 수 있다) */
  drawCd = 0;
  /** 총 정조준 중 */
  ads = false;
  hurtTimer = 0;
  dead = false;

  private walkPhase = 0;
  private shieldBubble: THREE.Mesh;
  private wardBubble: THREE.Mesh;

  constructor(derived: Derived, weapons: { def: WeaponDef; enhance: number; slots: (SkillDef | null)[] }[]) {
    this.derived = derived;
    this.hp = derived.maxHp;
    this.mp = derived.maxMp;
    this.rig = makePlayer();
    this.weapons = weapons.map((w) => ({
      ...w,
      model: makeWeaponModel(w.def.type),
      ammo: w.def.magazine ?? 0,
      magazine: w.def.magazine ?? 0,
    }));
    this.equipModel();

    this.shieldBubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.2, 2),
      new THREE.MeshBasicMaterial({ color: 0x5fc8ff, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    this.shieldBubble.position.y = 1.1;
    this.wardBubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.22, wireframe: true }),
    );
    this.wardBubble.position.y = 1.1;
    this.rig.root.add(this.shieldBubble, this.wardBubble);
    this.shieldBubble.visible = false;
    this.wardBubble.visible = false;
  }

  get weapon(): EquippedWeapon {
    return this.weapons[this.active];
  }

  get isMelee(): boolean {
    return MELEE_TYPES.has(this.weapon.def.type);
  }

  get isRanged(): boolean {
    const t = this.weapon.def.type;
    return t === 'bow' || t === 'gun';
  }

  get damageMul(): number {
    let m = 1;
    for (const b of this.buffs) m += b.damageMul;
    return m;
  }

  hasBuff(id: string): boolean {
    return this.buffs.some((b) => b.id === id);
  }

  equipModel(): void {
    this.rig.hand.clear();
    this.rig.hand.add(this.weapon.model);
  }

  swapWeapon(): void {
    this.active = 1 - this.active;
    this.action = null;
    this.charge = -1;
    this.guarding = false;
    this.reloadTime = 0;
    this.ads = false;
    this.swapCd = 0.3;
    this.equipModel();
  }

  addBuff(buff: Buff): void {
    this.buffs = this.buffs.filter((b) => b.id !== buff.id);
    this.buffs.push(buff);
  }

  startAction(kind: ActionKind, dur: number, hits: number[] = []): void {
    this.action = { kind, t: 0, dur, hits, done: 0 };
  }

  /** 이동 입력을 월드 방향으로 바꾼다. 입력이 없으면 길이 0. */
  wishDir(input: Input, out = new THREE.Vector3()): THREE.Vector3 {
    const f = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
    const r = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const fw = forwardOf(this.yaw);
    const rt = rightOf(this.yaw);
    out.set(fw.x * f + rt.x * r, 0, fw.z * f + rt.z * r);
    if (out.lengthSq() > 0) out.normalize();
    return out;
  }

  startDodge(dir: THREE.Vector3): void {
    this.dodgeDir.copy(dir.lengthSq() > 0 ? dir : forwardOf(this.yaw));
    this.dodgeTime = DODGE_TIME;
    this.dodgeCd = 0.75;
    this.invuln = DODGE_TIME + 0.05;
    this.action = null;
    this.charge = -1;
    this.guarding = false;
  }

  updateTimers(dt: number): void {
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.swapCd = Math.max(0, this.swapCd - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.drawCd = Math.max(0, this.drawCd - dt);
    if (this.reloadTime > 0) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0) {
        this.reloadTime = 0;
        this.weapon.ammo = this.weapon.magazine;
      }
    }
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.comboStep = 0;
    for (const [id, cd] of this.cooldowns) this.cooldowns.set(id, Math.max(0, cd - dt));
    for (const b of this.buffs) b.time -= dt;
    this.buffs = this.buffs.filter((b) => b.time > 0);
    if (this.shieldTime > 0) {
      this.shieldTime -= dt;
      if (this.shieldTime <= 0) this.shield = 0;
    }
    if (this.wardTime > 0) {
      this.wardTime -= dt;
      if (this.wardTime <= 0) this.wardHits = 0;
    }
    if (!this.dead) this.mp = Math.min(this.derived.maxMp, this.mp + this.derived.mpRegen * dt);
  }

  updateMovement(dt: number, input: Input, arenaRadius: number): void {
    if (this.dead) return;
    if (this.dodgeTime > 0) {
      this.dodgeTime -= dt;
      this.vel.x = this.dodgeDir.x * DODGE_SPEED;
      this.vel.z = this.dodgeDir.z * DODGE_SPEED;
    } else {
      const wish = this.wishDir(input);
      let speed = this.derived.moveSpeed + this.bonusSpeed();
      if (this.guarding) speed *= 0.4;
      else if (this.charge >= 0 || this.action?.kind === 'laser' || this.action?.kind === 'snipe') speed *= 0.45;
      else if (this.ads) speed *= 0.6;
      else if (this.action && this.grounded) speed *= 0.55;
      const accel = this.grounded ? 14 : 5;
      const k = Math.min(1, accel * dt);
      this.vel.x += (wish.x * speed - this.vel.x) * k;
      this.vel.z += (wish.z * speed - this.vel.z) * k;
      if (input.pressed('jump') && this.grounded && !this.guarding) {
        this.vel.y = JUMP_SPEED;
        this.grounded = false;
      }
    }

    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    }

    const r = Math.hypot(this.pos.x, this.pos.z);
    const limit = arenaRadius - 0.6;
    if (r > limit) {
      this.pos.x *= limit / r;
      this.pos.z *= limit / r;
    }
  }

  /** 스킬·장비로 얻는 이동속도 보너스. 스탯 보너스와 달리 상한이 없다. */
  bonusSpeed(): number {
    let mul = 0;
    for (const b of this.buffs) mul += b.speedMul ?? 0;
    return 5 * mul;
  }

  animate(dt: number): void {
    const rig = this.rig;
    rig.root.position.copy(this.pos);
    rig.root.rotation.y = this.yaw;

    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * hSpeed * 2.2;
    const swing = this.grounded ? Math.sin(this.walkPhase) * Math.min(1, hSpeed / 4) * 0.8 : 0.5;
    rig.legL.rotation.x = swing;
    rig.legR.rotation.x = -swing;

    // 기본 자세
    let armR = this.isMelee ? -0.35 : this.isRanged ? -1.45 : -0.75;
    let armRz = 0;
    let armL = this.isRanged ? -1.2 : -swing * 0.4;
    let bodyYaw = 0;
    let bodyPitch = 0;
    let bodyY = 0;

    const a = this.action;
    if (this.dodgeTime > 0) {
      bodyPitch = 0.9;
      bodyY = -0.35;
      armR = -1.2;
      armL = -1.2;
    } else if (this.guarding) {
      armR = -1.3;
      armRz = 0.9;
      armL = -1.1;
    } else if (a) {
      const p = Math.min(1, a.t / a.dur);
      const e = 1 - Math.pow(1 - Math.min(1, p * 2.2), 3);
      switch (a.kind) {
        case 'slashV':
          armR = -2.9 + e * 2.7;
          bodyPitch = e * 0.25;
          break;
        case 'slashH':
        case 'sunder':
        case 'cleave':
        case 'crescent':
        case 'hamstring':
          armR = -1.5;
          bodyYaw = 1.1 - e * 2.2;
          break;
        case 'thrust':
        case 'iai':
          armR = -1.6;
          bodyPitch = 0.25 * e;
          rig.armR.position.z = 0.35 * e;
          break;
        case 'upper':
        case 'skyfall':
          armR = -0.2 - e * 2.9;
          bodyPitch = -0.2 * e;
          break;
        case 'whirl':
          armR = -1.5;
          bodyYaw = p * Math.PI * 4;
          break;
        case 'waves':
          armR = -1.5;
          bodyYaw = Math.sin(a.t * 22) * 0.9;
          break;
        case 'cast':
        case 'manaball':
        case 'laser':
        case 'shoot':
        case 'volley':
        case 'rapid':
        case 'snipe':
        case 'barrage':
          armR = -1.55;
          armL = -1.3;
          break;
      }
    } else if (this.charge >= 0) {
      armR = -1.55;
      armL = -1.4;
    }
    if (!a || (a.kind !== 'thrust' && a.kind !== 'iai')) rig.armR.position.z = 0;

    rig.armR.rotation.x = armR;
    rig.armR.rotation.z = armRz;
    rig.armL.rotation.x = armL;
    rig.body.rotation.y = bodyYaw;
    rig.body.rotation.x = bodyPitch;
    rig.body.position.y = bodyY;

    // 차징 중에는 스태프 오브가 커진다.
    const orb = this.weapon.model.getObjectByName('orb');
    if (orb) orb.scale.setScalar(this.charge >= 0 ? 1 + Math.min(this.charge, 1.2) * 1.2 : 1);

    this.shieldBubble.visible = this.shield > 0;
    this.wardBubble.visible = this.wardHits > 0;
    if (this.wardBubble.visible) this.wardBubble.rotation.y += dt * 1.5;

    // 피격 시 짧게 붉게 깜빡인다.
    rig.body.visible = this.hurtTimer <= 0 || Math.floor(this.hurtTimer * 30) % 2 === 0;
  }

  /** 무기 끝(대략) 위치 */
  muzzle(out = new THREE.Vector3()): THREE.Vector3 {
    const f = forwardOf(this.yaw);
    const r = rightOf(this.yaw);
    return out.set(this.pos.x + f.x * 0.7 + r.x * 0.45, this.pos.y + 1.55, this.pos.z + f.z * 0.7 + r.z * 0.45);
  }
}

