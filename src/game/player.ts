import * as THREE from 'three';
import type { Input } from '../core/input';
import type { SkillDef } from '../data/skills';
import { MELEE_TYPES, type WeaponDef } from '../data/weapons';
import { AnimatedModel } from './animated';
import { makeHeldWeapon } from './heldWeapons';
import type { Derived } from './stats';

export interface EquippedWeapon {
  def: WeaponDef;
  enhance: number;
  slots: (SkillDef | null)[];
  model: THREE.Object3D;
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

function dao(type: string, kind: ActionKind): boolean {
  return type === 'dao' && (kind === 'slashV' || kind === 'slashH');
}

export function forwardOf(yaw: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(yaw), 0, Math.cos(yaw));
}
export function rightOf(yaw: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(-Math.cos(yaw), 0, Math.sin(yaw));
}

/** 동작별 상체 애니메이션 (KayKit 클립 이름) */
const ACTION_CLIPS: Record<ActionKind, string> = {
  slashV: '1H_Melee_Attack_Chop',
  slashH: '1H_Melee_Attack_Slice_Horizontal',
  thrust: '1H_Melee_Attack_Stab',
  upper: '1H_Melee_Attack_Slice_Diagonal',
  whirl: '2H_Melee_Attack_Spinning',
  sunder: '1H_Melee_Attack_Slice_Diagonal',
  waves: '1H_Melee_Attack_Slice_Horizontal',
  cast: 'Spellcast_Shoot',
  manaball: 'Spellcast_Shoot',
  laser: 'Spellcasting',
  cleave: '2H_Melee_Attack_Slice',
  crescent: '2H_Melee_Attack_Spin',
  skyfall: '1H_Melee_Attack_Slice_Diagonal',
  hamstring: '2H_Melee_Attack_Slice',
  iai: '2H_Melee_Attack_Stab',
  shoot: '1H_Ranged_Shoot',
  volley: '2H_Ranged_Shooting',
  rapid: '1H_Ranged_Shooting',
  snipe: '2H_Ranged_Aiming',
  barrage: '1H_Ranged_Shooting',
};

/** 반복 재생하는 동작 */
const LOOP_ACTIONS: ReadonlySet<ActionKind> = new Set(['whirl', 'waves', 'laser', 'volley', 'rapid', 'barrage', 'snipe']);

export class Player {
  readonly avatar: AnimatedModel;
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

  private dodgeToken = 0;
  private shieldBubble: THREE.Mesh;
  private wardBubble: THREE.Mesh;

  constructor(derived: Derived, weapons: { def: WeaponDef; enhance: number; slots: (SkillDef | null)[] }[]) {
    this.derived = derived;
    this.hp = derived.maxHp;
    this.mp = derived.maxMp;
    // 기사 모델에 기본으로 달린 무기와 방패는 숨기고 장착 무기를 손에 붙인다.
    this.avatar = new AnimatedModel('Knight', {
      hide: ['1H_Sword', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield'],
    });
    const charScale = this.avatar.root.children[0].scale.x;
    this.weapons = weapons.map((w) => ({
      ...w,
      model: makeHeldWeapon(w.def.type, charScale),
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
    this.avatar.root.add(this.shieldBubble, this.wardBubble);
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

  get root(): THREE.Object3D {
    return this.avatar.root;
  }

  equipModel(): void {
    const hand = this.avatar.handR;
    if (!hand) return;
    for (const w of this.weapons) hand.remove(w.model);
    hand.add(this.weapon.model);
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
    this.dodgeToken++;
    this.dodgeCd = 0.75 * this.derived.passive.dodgeCdMul;
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

  /** 스킬·패시브로 얻는 이동속도 보너스. 스탯 보너스와 달리 상한이 없다. */
  bonusSpeed(): number {
    let mul = this.derived.passive.speedMul;
    for (const b of this.buffs) mul += b.speedMul ?? 0;
    return 5 * mul;
  }

  animate(dt: number): void {
    const av = this.avatar;
    av.root.position.copy(this.pos);
    av.root.rotation.y = this.yaw;

    const type = this.weapon.def.type;
    const f = forwardOf(this.yaw);
    const r = rightOf(this.yaw);
    const vf = this.vel.x * f.x + this.vel.z * f.z;
    const vr = this.vel.x * r.x + this.vel.z * r.z;
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);

    if (this.dead) {
      av.playFull('Death_A', { loop: false, fade: 0.1 });
    } else if (this.dodgeTime > 0) {
      const df = this.dodgeDir.x * f.x + this.dodgeDir.z * f.z;
      const dr = this.dodgeDir.x * r.x + this.dodgeDir.z * r.z;
      const clip = Math.abs(df) >= Math.abs(dr) ? (df >= 0 ? 'Dodge_Forward' : 'Dodge_Backward') : dr > 0 ? 'Dodge_Right' : 'Dodge_Left';
      av.playFull(clip, { loop: false, speed: 1.25, fade: 0.05, token: this.dodgeToken });
    } else {
      // 하체: 이동 방향에 맞춘 달리기·옆걸음·뒷걸음
      let lower: string;
      let lowerSpeed = 1;
      if (!this.grounded) lower = 'Jump_Idle';
      else if (hSpeed > 0.6) {
        if (Math.abs(vf) >= Math.abs(vr)) lower = vf >= 0 ? 'Running_A' : 'Walking_Backwards';
        else lower = vr > 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left';
        lowerSpeed = THREE.MathUtils.clamp(hSpeed / 5.5, 0.6, 1.8);
      } else lower = type === 'dao' ? '2H_Melee_Idle' : 'Idle';
      av.play('lower', lower, { speed: lowerSpeed });

      // 상체: 가드·공격·차징·조준. 아무것도 없으면 하체와 같은 동작.
      const a = this.action;
      if (this.guarding) av.play('upper', 'Blocking', { fade: 0.08 });
      else if (a) {
        let clip = ACTION_CLIPS[a.kind];
        if (dao(type, a.kind)) clip = a.kind === 'slashV' ? '2H_Melee_Attack_Chop' : '2H_Melee_Attack_Slice';
        if (a.kind === 'shoot' && type === 'bow') clip = '2H_Ranged_Shoot';
        const loop = LOOP_ACTIONS.has(a.kind);
        const speed = loop ? 1.4 : THREE.MathUtils.clamp(av.duration(clip) / (a.dur * 1.4), 0.8, 3);
        av.play('upper', clip, { loop, speed, fade: 0.06, token: a });
      } else if (this.charge >= 0) {
        av.play('upper', type === 'staff' ? 'Spellcasting' : type === 'bow' ? '2H_Ranged_Aiming' : '2H_Melee_Idle', { fade: 0.1 });
      } else if (this.reloadTime > 0) {
        av.play('upper', '1H_Ranged_Reload', { loop: false, speed: av.duration('1H_Ranged_Reload') / 1.5 });
      } else if (type === 'gun') av.play('upper', '1H_Ranged_Aiming');
      else if (type === 'bow') av.play('upper', '2H_Ranged_Aiming');
      else av.play('upper', lower, { speed: lowerSpeed });
    }
    av.update(dt);

    // 차징 중에는 스태프 오브가 커진다.
    const orb = this.weapon.model.getObjectByName('orb');
    if (orb) orb.scale.setScalar(this.charge >= 0 ? 1 + Math.min(this.charge, 1.2) * 1.2 : 1);

    this.shieldBubble.visible = this.shield > 0;
    this.wardBubble.visible = this.wardHits > 0;
    if (this.wardBubble.visible) this.wardBubble.rotation.y += dt * 1.5;

    // 피격 시 짧게 깜빡인다.
    av.setVisible(this.hurtTimer <= 0 || Math.floor(this.hurtTimer * 30) % 2 === 0);
  }

  /** 무기 끝(대략) 위치 */
  muzzle(out = new THREE.Vector3()): THREE.Vector3 {
    const f = forwardOf(this.yaw);
    const r = rightOf(this.yaw);
    return out.set(this.pos.x + f.x * 0.7 + r.x * 0.45, this.pos.y + 1.55, this.pos.z + f.z * 0.7 + r.z * 0.45);
  }
}

