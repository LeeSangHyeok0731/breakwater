import Phaser from 'phaser';
import type { Input } from '../core/input';
import type { SkillDef } from '../data/skills';
import { MELEE_TYPES, type WeaponDef } from '../data/weapons';
import { ORIGIN_X } from './assets2d';
import { DEPTH } from './fx';
import type { Derived } from './stats';

export interface EquippedWeapon {
  def: WeaponDef;
  enhance: number;
  slots: (SkillDef | null)[];
  ammo: number;
  magazine: number;
}

export type ActionKind =
  | 'slash'
  | 'thrust'
  | 'crouchSlash'
  | 'airSlash'
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
  hits: number[];
  done: number;
}

export interface Buff {
  id: string;
  name: string;
  damageMul: number;
  speedMul?: number;
  time: number;
}

/** 1m를 몇 픽셀로 보는가 (데이터의 m/s 이동속도를 픽셀로 바꿀 때) */
export const PX_PER_M = 24;
const JUMP_V = -390;
const DODGE_SPEED = 300;
const DODGE_TIME = 0.24;

export class Player {
  readonly body: Phaser.Physics.Arcade.Body;
  readonly zone: Phaser.GameObjects.Zone;
  readonly sprite: Phaser.GameObjects.Sprite;
  facing: 1 | -1 = 1;

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
  /** 강화 공격(T) 차징 시간. 차징 중이 아니면 -1 */
  charge = -1;

  dodgeTime = 0;
  dodgeCd = 0;
  invuln = 0;
  guarding = false;
  parryTimer = 0;
  crouching = false;

  shield = 0;
  shieldTime = 0;
  wardHits = 0;
  wardTime = 0;

  swapCd = 0;
  reloadTime = 0;
  fireCd = 0;
  drawCd = 0;
  /** 총 정조준 (T를 누르고 있는 동안) */
  ads = false;
  hurtTimer = 0;
  /** 발판을 뚫고 내려가는 중 */
  dropTimer = 0;
  /** 공중에서 남은 추가 점프 횟수 (더블 점프) */
  airJumps = 1;
  dead = false;

  private lastAnimAction: PlayerAction | null = null;
  private afterimageTimer = 0;
  private guardFx: Phaser.GameObjects.Arc;
  private shieldFx: Phaser.GameObjects.Arc;
  private chargeBg: Phaser.GameObjects.Rectangle;
  private chargeFill: Phaser.GameObjects.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    derived: Derived,
    weapons: { def: WeaponDef; enhance: number; slots: (SkillDef | null)[] }[],
  ) {
    this.derived = derived;
    this.hp = derived.maxHp;
    this.mp = derived.maxMp;
    this.weapons = weapons.map((w) => ({ ...w, ammo: w.def.magazine ?? 0, magazine: w.def.magazine ?? 0 }));

    this.zone = scene.add.zone(x, y, 14, 34);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocityY(700);

    this.sprite = scene.add.sprite(x, y, 'hero-idle').setOrigin(0.5, 1).setDepth(DEPTH.player);
    this.sprite.play('hero-idle');

    this.guardFx = scene.add.circle(x, y, 16, 0x9fd8ff, 0).setStrokeStyle(2, 0x9fd8ff, 0.8).setDepth(DEPTH.fx).setVisible(false);
    this.shieldFx = scene.add.circle(x, y, 22, 0x5fc8ff, 0.12).setStrokeStyle(1, 0xbff0ff, 0.6).setDepth(DEPTH.fx).setVisible(false);
    // 강화 공격 차징 게이지 (머리 위)
    this.chargeBg = scene.add.rectangle(x, y, 24, 4, 0x140a0a).setDepth(DEPTH.text).setVisible(false);
    this.chargeFill = scene.add.rectangle(x, y, 22, 2, 0x9fd8ff).setOrigin(0, 0.5).setDepth(DEPTH.text).setVisible(false);
  }

  get weapon(): EquippedWeapon {
    return this.weapons[this.active];
  }

  get isMelee(): boolean {
    return MELEE_TYPES.has(this.weapon.def.type);
  }

  get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  /** 몸 가운데 */
  get x(): number {
    return this.body.center.x;
  }

  get y(): number {
    return this.body.center.y;
  }

  get feet(): number {
    return this.body.bottom;
  }

  get damageMul(): number {
    let m = 1;
    for (const b of this.buffs) m += b.damageMul;
    return m;
  }

  hasBuff(id: string): boolean {
    return this.buffs.some((b) => b.id === id);
  }

  addBuff(buff: Buff): void {
    this.buffs = this.buffs.filter((b) => b.id !== buff.id);
    this.buffs.push(buff);
  }

  startAction(kind: ActionKind, dur: number, hits: number[] = []): void {
    this.action = { kind, t: 0, dur, hits, done: 0 };
  }

  swapWeapon(): void {
    this.active = 1 - this.active;
    this.action = null;
    this.charge = -1;
    this.guarding = false;
    this.reloadTime = 0;
    this.ads = false;
    this.swapCd = 0.3;
  }

  moveSpeed(): number {
    let bonus = this.derived.passive.speedMul;
    for (const b of this.buffs) bonus += b.speedMul ?? 0;
    return (this.derived.moveSpeed + 5 * bonus) * PX_PER_M;
  }

  updateTimers(dt: number): void {
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.swapCd = Math.max(0, this.swapCd - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.drawCd = Math.max(0, this.drawCd - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.comboStep = 0;
    if (this.reloadTime > 0) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0) {
        this.reloadTime = 0;
        this.weapon.ammo = this.weapon.magazine;
      }
    }
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

  startDodge(): void {
    this.dodgeTime = DODGE_TIME;
    this.dodgeCd = 0.7 * this.derived.passive.dodgeCdMul;
    this.invuln = DODGE_TIME + 0.06;
    this.action = null;
    this.charge = -1;
    this.guarding = false;
  }

  /** 넉백: 맞은 방향 반대로 튕겨 나간다. */
  knockback(fromX: number, power: number): void {
    const dir = this.x >= fromX ? 1 : -1;
    this.body.setVelocity(dir * power, -power * 0.6);
  }

  updateMovement(dt: number, input: Input): void {
    const body = this.body;
    if (this.dead) {
      body.setVelocityX(body.velocity.x * 0.9);
      return;
    }
    if (this.dodgeTime > 0) {
      this.dodgeTime -= dt;
      body.setVelocityX(this.facing * DODGE_SPEED);
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.afterimageTimer = 0.04;
        this.afterimage();
      }
      return;
    }

    const left = input.isDown('left');
    const right = input.isDown('right');
    const lockFacing = this.action !== null || this.charge >= 0;
    if (!lockFacing) {
      if (left && !right) this.facing = -1;
      else if (right && !left) this.facing = 1;
    }

    this.crouching = this.grounded && input.isDown('down') && !this.action;
    let wish = (right ? 1 : 0) - (left ? 1 : 0);
    if (this.crouching || this.guarding || this.ads) wish = 0;
    let speed = this.moveSpeed();
    if (this.charge >= 0 || this.action?.kind === 'laser' || this.action?.kind === 'snipe') speed *= 0.35;
    else if (this.action && this.grounded) speed *= 0.4;
    // 넉백 중에는 조작이 덜 먹힌다.
    const control = this.hurtTimer > 0.15 ? 0.05 : this.grounded ? 0.35 : 0.12;
    body.setVelocityX(body.velocity.x + (wish * speed - body.velocity.x) * Math.min(1, control * 60 * dt));

    if (this.grounded) this.airJumps = 1;
    if (input.pressed('jump') && !this.guarding) {
      if (this.grounded) {
        if (input.isDown('down') && this.onPlatform) {
          // ↓ + 점프: 발판 아래로 내려간다.
          this.dropTimer = 0.3;
          body.setVelocityY(40);
        } else {
          body.setVelocityY(JUMP_V);
        }
      } else if (this.airJumps > 0) {
        // 더블 점프: 공중에서 한 번 더
        this.airJumps--;
        body.setVelocityY(JUMP_V * 0.9);
        this.jumpPuff();
        // 점프 동작을 처음부터 다시 보여 준다.
        if (this.sprite.anims.currentAnim?.key === 'hero-jump') this.sprite.anims.restart();
      }
    }
  }

  /** 지금 발판 위에 서 있는가 (BattleScene/TownScene이 매 프레임 갱신) */
  onPlatform = false;

  /** 더블 점프할 때 발밑에 퍼지는 바람 */
  private jumpPuff(): void {
    const ring = this.scene.add
      .ellipse(this.x, this.feet, 10, 4, 0xbfe4ff, 0)
      .setStrokeStyle(2, 0xbfe4ff, 0.9)
      .setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: ring, width: 34, height: 9, alpha: 0, duration: 260, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  }

  private afterimage(): void {
    const s = this.sprite;
    const ghost = this.scene.add
      .image(s.x, s.y, s.texture.key, s.frame.name)
      .setOrigin(s.originX, s.originY)
      .setFlipX(s.flipX)
      .setDepth(DEPTH.player - 1)
      .setTint(0x9fd8ff)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
  }

  private play(key: string, restartFor?: PlayerAction | null): void {
    const s = this.sprite;
    if (restartFor !== undefined) {
      if (restartFor !== this.lastAnimAction || s.anims.currentAnim?.key !== key) {
        s.play(key);
        this.lastAnimAction = restartFor;
      }
    } else if (s.anims.currentAnim?.key !== key) {
      s.play(key);
    }
  }

  animate(): void {
    const s = this.sprite;
    const a = this.action;
    if (this.dead) this.play('hero-hurt');
    else if (this.hurtTimer > 0.2) this.play('hero-hurt');
    else if (a) {
      const melee = ['slash', 'thrust', 'upper', 'whirl', 'sunder', 'waves', 'cleave', 'crescent', 'skyfall', 'hamstring', 'iai'];
      if (a.kind === 'crouchSlash') this.play('hero-crouch-slash', a);
      else if (a.kind === 'airSlash' || (!this.grounded && melee.includes(a.kind))) this.play('hero-jump-attack', a);
      else this.play('hero-attack', a);
    } else if (this.dodgeTime > 0) this.play('hero-run');
    else if (!this.grounded) this.play('hero-jump');
    else if (this.crouching) this.play('hero-crouch');
    else if (Math.abs(this.body.velocity.x) > 20) this.play('hero-run');
    else this.play('hero-idle');
    if (!a) this.lastAnimAction = null;

    // 프레임마다 몸통 위치가 다른 시트는 기준점을 맞춘다.
    const key = s.anims.currentAnim?.key ?? 'hero-idle';
    const ox = ORIGIN_X[key] ?? 0.5;
    s.setFlipX(this.facing === -1);
    s.setOrigin(this.facing === 1 ? ox : 1 - ox, 1);
    s.setPosition(Math.round(this.x), Math.round(this.feet + 1));

    // 피격 무적 중 깜빡임
    s.setAlpha(this.invuln > 0 && this.dodgeTime <= 0 && Math.floor(this.invuln * 20) % 2 === 0 ? 0.4 : 1);

    this.guardFx.setVisible(this.guarding).setPosition(this.x + this.facing * 10, this.y);
    this.shieldFx.setVisible(this.shield > 0 || this.wardHits > 0).setPosition(this.x, this.y);
    this.shieldFx.setStrokeStyle(this.wardHits > 0 ? 2 : 1, this.wardHits > 0 ? 0xffd34a : 0xbff0ff, 0.7);

    const charging = this.charge >= 0;
    this.chargeBg.setVisible(charging);
    this.chargeFill.setVisible(charging);
    if (charging) {
      const full = this.weapon.def.type === 'dao' ? 1 : 1.2;
      const r = Math.min(1, this.charge / full);
      const top = this.body.top - 10;
      this.chargeBg.setPosition(this.x, top);
      this.chargeFill.setPosition(this.x - 11, top);
      this.chargeFill.width = 22 * r;
      this.chargeFill.fillColor = r >= 1 ? 0xffe08a : 0x9fd8ff;
    }
  }

  /** 투사체가 나가는 위치 */
  muzzle(): { x: number; y: number } {
    return { x: this.x + this.facing * 16, y: this.y - 4 };
  }

  destroy(): void {
    this.sprite.destroy();
    this.zone.destroy();
    this.guardFx.destroy();
    this.shieldFx.destroy();
    this.chargeBg.destroy();
    this.chargeFill.destroy();
  }
}
