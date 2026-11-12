import Phaser from 'phaser';
import { sfx } from '../core/audio';
import type { Input } from '../core/input';
import type { SkillDef } from '../data/skills';
import { MELEE_TYPES, type WeaponDef } from '../data/weapons';
import { ORIGIN_X } from './assets2d';
import { AIM_ANIM, AIM_HAND, AIM_ORIGIN_X, baseAnimKey, classAnimKey } from './classSprites';
import { heldDef, heldStyle, meleeLook, RANGED_AURA } from './weaponArt';
import { createWeaponSprites, heldKey, heldOrigin } from './weaponSprites';
import { DEPTH } from './fx';
import type { Derived } from './stats';
import { toneOf } from './tone';
import { flutter, glow, pop, twinkles, wisps, type Palette3 } from './vfx';

export interface EquippedWeapon {
  def: WeaponDef;
  enhance: number;
  /** 지금 장의 스킬 (슬롯 순서) */
  slots: (SkillDef | null)[];
  /** 스킬 장들. 슬롯보다 스킬이 많으면 2장 이상이다. */
  pages: (SkillDef | null)[][];
  page: number;
  ammo: number;
  magazine: number;
}

/** 무기를 손에 든 상태로 만든다: 첫 스킬 장을 펴고 탄창을 채운다. */
export function equipWeapons(weapons: { def: WeaponDef; enhance: number; pages: (SkillDef | null)[][] }[]): EquippedWeapon[] {
  return weapons.map((w) => ({ ...w, slots: w.pages[0], page: 0, ammo: w.def.magazine ?? 0, magazine: w.def.magazine ?? 0 }));
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
  /** 이 동작을 부른 스킬 (없으면 평타·특수 공격). 수련장 집계에 쓴다. */
  src?: string;
}

export interface Buff {
  id: string;
  name: string;
  damageMul: number;
  speedMul?: number;
  time: number;
}

/** 평타 연계 단계 수와, 다음 평타를 쳐야 하는 시간 [초안] */
export const COMBO_MAX = 5;
const COMBO_WINDOW = 1;

/** 칼 휘두르기 대신 무기 그림이 움직이는 원거리 동작 */
const RANGED_ACTIONS: ReadonlySet<ActionKind> = new Set(['shoot', 'volley', 'rapid', 'snipe', 'barrage', 'manaball', 'cast', 'laser']);

/** 평타: 쓰는 동안에도 이동 속도가 줄지 않는다. */
export const BASIC_ACTIONS: ReadonlySet<ActionKind> = new Set(['slash', 'airSlash', 'crouchSlash', 'shoot', 'manaball']);

/** 초식: 수마다 재생할 동작. 수가 더 많으면 처음부터 돌아가며 쓴다. */
const MOVES: Partial<Record<ActionKind, string[]>> = {
  whirl: ['hero-attack'],
  upper: ['hero-attack', 'hero-attack', 'hero-jump-attack'],
  sunder: ['hero-attack', 'hero-jump-attack', 'hero-attack'],
  waves: ['hero-attack', 'hero-jump-attack'],
  crescent: ['hero-attack', 'hero-attack', 'hero-jump-attack'],
  skyfall: ['hero-jump-attack'],
  hamstring: ['hero-crouch-slash'],
  // 발도: 돌진하며 베고, 칼바람이 몰아치는 동안 자세를 낮춘 채 버틴다.
  iai: ['hero-attack', 'hero-crouch', 'hero-crouch', 'hero-crouch', 'hero-crouch'],
};

/** 1m를 몇 픽셀로 보는가 (데이터의 m/s 이동속도를 픽셀로 바꿀 때) */
export const PX_PER_M = 24;
const JUMP_V = -400;
/** 점프 키를 일찍 떼면 이 속도까지만 오른다 (짧게 누르면 낮게 뛴다). */
const JUMP_CUT_V = -150;
/** 떨어질 때 더해지는 중력 (px/초²). 정점에서 오래 떠 있지 않고 바로 내려온다. */
const FALL_EXTRA_G = 480;
/** 발판 끝에서 떨어진 직후에도 땅에서 뛴 것으로 쳐 주는 시간 */
const COYOTE_TIME = 0.09;
/** 착지·구르기 끝나기 직전에 누른 점프를 기억하는 시간 */
const JUMP_BUFFER = 0.13;
/** 대기 시간이 끝나기 직전에 누른 구르기를 기억하는 시간 */
const DODGE_BUFFER = 0.18;
/** 구르기: 처음에 확 튀어 나가고 끝으로 갈수록 느려진다 (평균 속도, 걸리는 시간). 약 83px. */
const DODGE_SPEED = 320;
const DODGE_TIME = 0.26;
const DODGE_CD = 0.55;
/** 블링크(마법사의 구르기): 순간이동 거리, 무적 시간 */
const BLINK_DIST = 124;
const BLINK_INVULN = 0.3;
/** 방향 더블 점프 [초안]: 가로 속도, 세로 속도, 잔상이 남는 시간 */
const AIR_DASH_VX = 460;
const AIR_DASH_VY = -220;
const AIR_DASH_TRAIL = 0.28;

export class Player {
  readonly body: Phaser.Physics.Arcade.Body;
  readonly zone: Phaser.GameObjects.Zone;
  readonly sprite: Phaser.GameObjects.Sprite;
  facing: 1 | -1 = 1;

  hp: number;
  mp: number;
  derived: Derived;
  /** 침묵(군단장 기믹): 남은 시간 동안 스킬을 쓸 수 없다 */
  silenceTime = 0;
  /** 원거리 패링 대기 (엘프전) */
  parryCd = 0;
  weapons: EquippedWeapon[];
  active = 0;
  cooldowns = new Map<string, number>();
  buffs: Buff[] = [];

  action: PlayerAction | null = null;
  /** 평타 연계: 지금 몇 단인지 (0이면 연계 없음, 1~COMBO_MAX) */
  combo = 0;
  /** 이 시간 안에 다음 평타를 쳐야 연계가 이어진다 */
  comboTimer = 0;
  /** 강화 공격(T) 차징 시간. 차징 중이 아니면 -1 */
  charge = -1;

  dodgeTime = 0;
  dodgeCd = 0;
  /** 블링크 직후의 남은 시간 (무적 표시·튜토리얼 판정에 쓴다) */
  blinkTime = 0;
  /** 미리 눌러 둔 구르기·점프 (남은 시간) */
  private dodgeBuf = 0;
  private jumpBuf = 0;
  /** 발이 땅에서 떨어진 뒤에도 땅 점프가 되는 남은 시간 */
  private coyote = 0;
  /** 점프로 오르는 중 (키를 떼면 낮게 끊긴다) */
  private rising = false;
  invuln = 0;
  guarding = false;
  parryTimer = 0;
  crouching = false;

  shield = 0;
  shieldTime = 0;
  wardHits = 0;
  wardTime = 0;

  /** 서리 마법에 맞아 느려진 남은 시간 */
  slowTime = 0;
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
  /** 공중에 떠서 스킬을 쓰는 남은 시간 (천공 섬광). 이동·공격을 할 수 없다. */
  hoverTime = 0;
  /** 궁극기 채널 중 제자리에 선다 (중력은 그대로). 공격 막기는 BattleScene.ult.lock이 한다. */
  locked = false;
  private hoverY = 0;
  /** 방향 더블 점프의 잔상이 남은 시간 */
  private airDashTime = 0;
  dead = false;

  private lastAnimAction: PlayerAction | null = null;
  private lastAnimSeg = 0;
  /** 직업 교체 직후 몸이 하얗게 번쩍이는 시간 */
  private swapFlash = 0;
  /** 쏜 뒤 조준 자세를 유지하는 남은 시간 */
  private aimHold = 0;
  private afterimageTimer = 0;
  private guardFx: Phaser.GameObjects.Arc;
  /** 보호막: 육각 무늬 구 (마나 보호막은 청록, 마력 방어막은 금색) */
  private shieldFx: Phaser.GameObjects.Image;
  /** 착지 먼지를 내기 위해 직전 프레임에 공중이었는지 */
  private wasAirborne = false;
  private fallSpeed = 0;
  /** 차징이 가득 찬 순간을 한 번만 알린다. */
  private chargeFull = false;
  private chargeBg: Phaser.GameObjects.Rectangle;
  private chargeFill: Phaser.GameObjects.Rectangle;
  /** 손에 든 활·총·스태프 */
  private held: Phaser.GameObjects.Image;
  private flash: Phaser.GameObjects.Image;
  private orb: Phaser.GameObjects.Image;
  /** 무기 끝 (투사체가 나가는 곳) */
  private tip = { x: 0, y: 0 };
  private tipValid = false;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    derived: Derived,
    weapons: { def: WeaponDef; enhance: number; pages: (SkillDef | null)[][] }[],
  ) {
    this.derived = derived;
    this.hp = derived.maxHp;
    this.mp = derived.maxMp;
    this.weapons = equipWeapons(weapons);

    this.zone = scene.add.zone(x, y, 14, 34);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocityY(700);

    this.sprite = scene.add.sprite(x, y, 'hero-idle').setOrigin(0.5, 1).setDepth(DEPTH.player);
    this.sprite.play('hero-idle');

    this.guardFx = scene.add.circle(x, y, 16, 0x9fd8ff, 0).setStrokeStyle(2, 0x9fd8ff, 0.8).setDepth(DEPTH.fx).setVisible(false);
    this.shieldFx = scene.add.image(x, y, 'fx-hex').setDepth(DEPTH.fx).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    createWeaponSprites(scene);
    this.held = scene.add.image(x, y, heldKey('staff', 'apprentice')).setDepth(DEPTH.player + 1).setVisible(false);
    this.flash = scene.add.image(x, y, 'w-flash').setDepth(DEPTH.player + 2).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.orb = scene.add.image(x, y, 'dot').setDepth(DEPTH.player + 2).setVisible(false).setTint(0x7fe8ff).setBlendMode(Phaser.BlendModes.ADD);
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

  /** 평타 한 번: 연계를 한 단 올린다. 마지막 단 다음은 다시 1단. 몇 단인지 돌려준다. */
  nextCombo(): number {
    this.combo = this.comboTimer > 0 && this.combo < COMBO_MAX ? this.combo + 1 : 1;
    this.comboTimer = COMBO_WINDOW;
    return this.combo;
  }

  /** 구르기·스킬·무기 교체·공중/앉아 베기: 연계가 끊긴다. */
  resetCombo(): void {
    this.combo = 0;
    this.comboTimer = 0;
  }

  /** 직업 교체: 장착한 무기(직업)를 차례로 오간다. 평소에는 2개, 체험장에서는 5개다. */
  swapWeapon(): void {
    this.active = (this.active + 1) % this.weapons.length;
    this.resetCombo();
    this.action = null;
    this.charge = -1;
    this.guarding = false;
    this.reloadTime = 0;
    this.ads = false;
    this.swapFlash = 0.12;
    this.aimHold = 0;
    this.swapPuff();
  }

  /** 다음 스킬 장을 편다. 장이 하나뿐이면 false. 쓰고 있는 스킬은 끊기지 않고, 재사용 시간도 그대로 이어진다. */
  nextSkillPage(): boolean {
    const w = this.weapon;
    if (w.pages.length < 2) return false;
    w.page = (w.page + 1) % w.pages.length;
    w.slots = w.pages[w.page];
    return true;
  }

  /** 활·총·스태프를 겨누는 중 (조준 자세로 무기를 손에 든다) */
  get aiming(): boolean {
    if (this.isMelee || this.dead || this.dodgeTime > 0) return false;
    // 차징·정조준·재장전·스킬은 멈춰 서서 겨눈다.
    const a = this.action;
    if (this.charge >= 0 || this.ads || this.reloadTime > 0) return true;
    if (a && RANGED_ACTIONS.has(a.kind) && !BASIC_ACTIONS.has(a.kind)) return true;
    // 평타는 달리면서 쏘면 달리기 동작을 그대로 두고 (조준 자세로 미끄러지지 않게),
    // 서서 연달아 쏠 때는 자세가 깜빡이지 않게 쏜 뒤에도 잠깐 겨눈 채로 있는다.
    if (Math.abs(this.body.velocity.x) > 40) return false;
    return this.aimHold > 0 || this.wantsAim;
  }

  private get wantsAim(): boolean {
    const a = this.action;
    return (a !== null && RANGED_ACTIONS.has(a.kind)) || this.charge >= 0 || this.ads || this.reloadTime > 0;
  }

  moveSpeed(): number {
    let bonus = this.derived.passive.speedMul;
    for (const b of this.buffs) bonus += b.speedMul ?? 0;
    return (this.derived.moveSpeed + 5 * bonus) * PX_PER_M * (this.slowTime > 0 ? 0.6 : 1);
  }

  /** 공중의 y까지 날아올라 정해진 시간 동안 머문다. 그동안은 맞지 않는다. */
  startHover(y: number, time: number): void {
    this.hoverY = y;
    this.hoverTime = time;
    this.invuln = Math.max(this.invuln, time + 0.2);
    this.action = null;
    this.charge = -1;
    this.guarding = false;
    this.dodgeTime = 0;
    this.resetCombo();
    this.body.setAllowGravity(false);
  }

  updateTimers(dt: number): void {
    if (this.hoverTime > 0) {
      this.hoverTime -= dt;
      if (this.hoverTime <= 0) this.body.setAllowGravity(true);
    }
    this.silenceTime = Math.max(0, this.silenceTime - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.dodgeBuf = Math.max(0, this.dodgeBuf - dt);
    this.blinkTime = Math.max(0, this.blinkTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.swapFlash = Math.max(0, this.swapFlash - dt);
    this.aimHold = this.wantsAim ? 0.35 : Math.max(0, this.aimHold - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.drawCd = Math.max(0, this.drawCd - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.combo = 0;
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
    // 천공 섬광 시전 중에는 마나가 차지 않는다.
    if (!this.dead && this.hoverTime <= 0) this.mp = Math.min(this.derived.maxMp, this.mp + this.derived.mpRegen * dt);
  }

  /** 마법사(지팡이)는 구르는 대신 블링크로 순간이동한다. */
  get blinks(): boolean {
    return this.weapon.def.type === 'staff';
  }

  /**
   * 구르기 키 처리. 대기 시간이 끝나기 직전에 누른 것도 기억했다가 바로 나간다.
   * 방향키를 누르고 있으면 그쪽으로, 아니면 보는 쪽으로 간다. 썼으면 true.
   */
  tryDodge(input: Input): boolean {
    if (input.pressed('dodge')) this.dodgeBuf = DODGE_BUFFER;
    if (this.dodgeBuf <= 0 || this.dodgeCd > 0 || this.dodgeTime > 0 || this.dead || this.hoverTime > 0 || this.locked) return false;
    this.dodgeBuf = 0;
    const wish = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const dir = wish === 0 ? this.facing : (wish as 1 | -1);
    if (this.blinks) this.blink(dir);
    else {
      this.facing = dir;
      this.startDodge();
      sfx.play('dodge');
    }
    return true;
  }

  startDodge(): void {
    this.resetCombo();
    this.dodgeTime = DODGE_TIME;
    this.dodgeCd = DODGE_CD * this.derived.passive.dodgeCdMul;
    this.invuln = Math.max(this.invuln, DODGE_TIME + 0.06);
    this.action = null;
    this.charge = -1;
    this.guarding = false;
    this.rising = false;
  }

  /**
   * 블링크: 정해진 거리를 순간이동한다. 그동안은 맞지 않는다.
   * 구르기와 달리 시전·차징이 끊기지 않아, 쓰자마자 바로 다음 행동을 할 수 있다.
   */
  blink(dir: 1 | -1): void {
    const body = this.body;
    // 스킬·차징으로 방향이 묶여 있으면 몸은 그대로 두고 자리만 옮긴다.
    const lockFacing = (this.action !== null && !BASIC_ACTIONS.has(this.action.kind)) || this.charge >= 0;
    if (!lockFacing) this.facing = dir;
    const bounds = this.scene.physics.world.bounds;
    const x0 = this.x;
    const x1 = Phaser.Math.Clamp(x0 + dir * BLINK_DIST, bounds.x + 10, bounds.right - 10);
    const dx = x1 - x0;
    const y = this.y;

    this.blinkFx(x0, x1, y, dir);
    // 몸(물리)을 바로 옮긴다. zone은 이번 프레임 끝에 몸을 따라온다.
    body.x += dx;
    body.updateCenter();
    // 공중에서 쓰면 잠깐 떠 있는다 (떨어지던 속도를 지운다).
    body.setVelocity(0, Math.min(body.velocity.y, 0) * 0.4);
    this.rising = false;

    this.dodgeCd = DODGE_CD * this.derived.passive.dodgeCdMul;
    this.invuln = Math.max(this.invuln, BLINK_INVULN);
    this.blinkTime = BLINK_INVULN;
    this.guarding = false;
    sfx.play('blink');
  }

  /** 블링크 연출: 떠난 자리에서 몸이 흩어지고, 길을 따라 잔상과 별가루가 남고, 닿은 자리에서 빛이 모인다. */
  private blinkFx(x0: number, x1: number, y: number, dir: 1 | -1): void {
    const scene = this.scene;
    // 지팡이마다 기운 색이 다르다 (룬은 보라, 용암은 주황 …). 없으면 마력의 청록.
    const base = RANGED_AURA[heldStyle(this.weapon.def)] ?? 0x7fe8ff;
    const t = toneOf(base);
    const pal: Palette3 = [t.rim, base, 0xffffff];
    const dist = Math.abs(x1 - x0);
    const along = dir === 1 ? 0 : Math.PI;

    // 떠난 자리: 몸이 빛으로 흩어진다.
    this.afterimage(t.rim, 0, 0.75, 320);
    glow(scene, x0, y, 30, t.rim, 320, 0.6);
    wisps(scene, x0, y - 2, pal, 4, Math.max(30, dist * 0.7), 300, { angle: along, cone: 0.35, curl: 0.7, width: 3 });
    flutter(scene, x0, y - 4, 'star', [base, t.alt, 0xffffff], 6, { spread: 8, spreadY: 14, speed: 70, gravity: -30, life: 520 });

    // 지나간 길: 옅어지는 잔상과 별가루
    const ghosts = Math.floor(dist / 34);
    for (let i = 1; i <= ghosts; i++) {
      const r = i / (ghosts + 1);
      this.afterimage(r < 0.5 ? t.rim : base, (x1 - x0) * r, 0.2 + r * 0.3, 200 + r * 160);
    }
    if (dist > 20) {
      flutter(scene, (x0 + x1) / 2, y - 2, 'star', [base, t.alt, t.rim, 0xffffff], 8, { spread: dist / 2, spreadY: 10, speed: 40, angle: along, cone: 0.8, gravity: -20, life: 620, within: 120 });
    }

    // 닿은 자리: 빛이 터지며 몸이 나타난다.
    glow(scene, x1, y, 38, base, 380, 0.75);
    pop(scene, x1, y - 2, 0xffffff, 1.3);
    wisps(scene, x1, y - 2, pal, 5, 30, 360, { curl: 1.6, width: 2 });
    twinkles(scene, x1, y - 6, 22, t.alt, 4, 220);
  }

  /** 넉백: 맞은 방향 반대로 튕겨 나간다. */
  knockback(fromX: number, power: number): void {
    this.rising = false;
    const dir = this.x >= fromX ? 1 : -1;
    this.body.setVelocity(dir * power, -power * 0.6);
  }

  updateMovement(dt: number, input: Input): void {
    const body = this.body;
    if (this.dead) {
      body.setAllowGravity(true);
      body.setVelocityX(body.velocity.x * 0.9);
      return;
    }
    if (this.hoverTime > 0) {
      this.jumpBuf = 0;
      this.rising = false;
      body.setVelocity(0, this.y > this.hoverY + 2 ? Math.max(-420, (this.hoverY - this.y) * 8) : 0);
      return;
    }
    // 떨어질 때는 더 빨리 내려온다.
    if (!this.grounded && body.velocity.y > 0 && body.allowGravity) body.velocity.y += FALL_EXTRA_G * dt;
    if (this.locked) {
      this.jumpBuf = 0;
      body.setVelocityX(0);
      return;
    }
    // 착지 직전·구르는 중에 누른 점프는 잠깐 기억해 두었다가 가능해지는 순간 뛴다.
    this.jumpBuf = input.pressed('jump') ? JUMP_BUFFER : Math.max(0, this.jumpBuf - dt);
    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - dt);
    if (this.dodgeTime > 0) {
      // 처음에 확 튀어 나가고 끝으로 갈수록 느려진다.
      const r = 1 - this.dodgeTime / DODGE_TIME;
      this.dodgeTime -= dt;
      body.setVelocityX(this.facing * DODGE_SPEED * (1.45 - 0.9 * r));
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.afterimageTimer = 0.04;
        this.afterimage();
      }
      return;
    }

    const left = input.isDown('left');
    const right = input.isDown('right');
    // 평타 중에는 방향을 바꿀 수 있다 (연계 도중 뒤의 적을 칠 수 있게). 스킬·차징은 방향이 고정된다.
    const lockFacing = (this.action !== null && !BASIC_ACTIONS.has(this.action.kind)) || this.charge >= 0;
    if (!lockFacing) {
      if (left && !right) this.facing = -1;
      else if (right && !left) this.facing = 1;
    }

    this.crouching = this.grounded && input.isDown('down') && !this.action;
    let wish = (right ? 1 : 0) - (left ? 1 : 0);
    if (this.crouching || this.guarding || this.ads) wish = 0;
    let speed = this.moveSpeed();
    if (this.charge >= 0 || this.action?.kind === 'laser' || this.action?.kind === 'snipe') speed *= 0.35;
    else if (this.action && this.grounded && !BASIC_ACTIONS.has(this.action.kind)) speed *= 0.4;
    const vx = body.velocity.x;
    const k = (c: number): number => Math.min(1, c * 60 * dt);
    if (this.hurtTimer > 0.15) {
      // 넉백 중에는 조작이 덜 먹힌다.
      body.setVelocityX(vx + (wish * speed - vx) * k(0.05));
    } else if (this.grounded) {
      // 출발과 방향 전환은 바로 붙고, 멈출 때는 아주 조금 미끄러진다.
      body.setVelocityX(vx + (wish * speed - vx) * k(wish !== 0 ? 0.5 : 0.4));
    } else {
      // 공중에서도 방향키가 바로 먹는다 (반대로 꺾으면 돌아올 수 있다). 키를 떼면 관성으로 조금 더 날아간다.
      let next = vx;
      if (wish !== 0) {
        // 구르기·공중 돌진으로 이동 속도보다 빠를 때 같은 방향을 누르면 그 속도를 지킨다.
        const boosted = Math.abs(vx) > speed && Math.sign(wish) === Math.sign(vx);
        if (!boosted) next = vx + (wish * speed - vx) * k(0.16);
      } else {
        next = vx * (1 - k(0.035));
      }
      // 구르기 직후처럼 이동 속도보다 빠르면 서서히 줄인다.
      // 방향 더블 점프로 튀어 나가는 동안은 줄이지 않는다.
      if (Math.abs(next) > speed && this.airDashTime <= 0) next -= (next - Math.sign(next) * speed) * k(0.08);
      body.setVelocityX(next);
    }

    if (this.grounded) this.airJumps = 1;
    // 점프 키를 일찍 떼면 낮게 뛴다.
    if (this.rising) {
      if (body.velocity.y >= 0 || this.grounded) this.rising = false;
      else if (!input.isDown('jump')) {
        this.rising = false;
        if (body.velocity.y < JUMP_CUT_V) body.setVelocityY(JUMP_CUT_V);
      }
    }
    if (this.jumpBuf > 0 && !this.guarding) {
      // 발판 끝에서 막 떨어진 참이면 땅에서 뛴 것으로 친다 (더블 점프를 쓰지 않는다).
      const onGround = this.grounded || (this.coyote > 0 && body.velocity.y >= 0);
      if (onGround) {
        this.jumpBuf = 0;
        this.coyote = 0;
        if (this.grounded && input.isDown('down') && this.onPlatform) {
          // ↓ + 점프: 발판 아래로 내려간다.
          this.dropTimer = 0.3;
          body.setVelocityY(40);
        } else {
          body.setVelocityY(JUMP_V);
          this.rising = true;
        }
      } else if (this.airJumps > 0 && input.pressed('jump')) {
        // 더블 점프: 공중에서 한 번 더 (미리 눌러 둔 것으로는 나가지 않는다)
        this.jumpBuf = 0;
        this.airJumps--;
        if (wish !== 0 && !input.isDown('up')) {
          // 방향키만 누르고 있으면 그쪽으로 강하게 튀어 나간다.
          body.setVelocity(wish * Math.max(AIR_DASH_VX, this.moveSpeed()), AIR_DASH_VY);
          this.airDashTime = AIR_DASH_TRAIL;
          this.rising = false;
          sfx.play('dodge', 0.8);
        } else {
          // 방향키를 안 눌렀거나 ↑를 누르면 위로 뛴다. 공중에서 방향을 바꾸는 수단이기도 하다.
          body.setVelocityY(JUMP_V * 0.9);
          this.rising = true;
          if (wish !== 0) body.setVelocityX(wish * this.moveSpeed());
        }
        this.jumpPuff();
        // 점프 동작을 처음부터 다시 보여 준다.
        if (this.sprite.anims.currentAnim?.key === classAnimKey(this.weapon.def.type, 'hero-jump')) this.sprite.anims.restart();
      }
    }

    if (this.airDashTime > 0) {
      this.airDashTime = this.grounded ? 0 : this.airDashTime - dt;
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.afterimageTimer = 0.04;
        this.afterimage();
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

  /** 직업 교체 때 몸을 감싸는 빛 고리 */
  private swapPuff(): void {
    const ring = this.scene.add.circle(this.x, this.y, 6, 0xffffff, 0).setStrokeStyle(2, 0xfff0c0, 0.9).setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 240, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  }

  /** 몸의 잔상. 구르기·공중 돌진은 하늘빛, 평타의 큰 동작은 무기 색으로 남긴다. */
  afterimage(tint = 0x9fd8ff, dx = 0, alpha = 0.5, ms = 220): void {
    const s = this.sprite;
    const ghost = this.scene.add
      .image(s.x + dx, s.y, s.texture.key, s.frame.name)
      .setOrigin(s.originX, s.originY)
      .setFlipX(s.flipX)
      .setDepth(DEPTH.player - 1)
      .setTint(tint)
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: ms, onComplete: () => ghost.destroy() });
  }

  /**
   * base는 직업 접두사 없는 기본 이름 ('hero-run' 등).
   * restartFor를 주면 그 동작이 새로 시작되거나 초식의 다음 수(seg)로 넘어갈 때 처음부터 다시 재생한다.
   */
  private play(base: string, restartFor?: PlayerAction | null, seg = 0): void {
    const s = this.sprite;
    const key = classAnimKey(this.weapon.def.type, base);
    if (restartFor !== undefined) {
      if (restartFor !== this.lastAnimAction || seg !== this.lastAnimSeg || s.anims.currentAnim?.key !== key) {
        // 이어지는 수는 휘두르기 직전 칸부터 시작해 빠르게 몰아친다.
        s.play({ key, startFrame: seg > 0 ? 1 : 0 });
        this.lastAnimAction = restartFor;
        this.lastAnimSeg = seg;
      }
    } else if (s.anims.currentAnim?.key !== key) {
      s.play(key);
    }
  }

  /** 초식(여러 번 베는 스킬)에서 지금 몇 번째 수인가. 타격 직전에 다음 수로 넘어간다. */
  private moveIndex(a: PlayerAction): number {
    let n = 0;
    for (const h of a.hits) if (a.t >= h - 0.06) n++;
    return Math.max(0, n - 1);
  }

  animate(): void {
    const s = this.sprite;
    const a = this.action;
    /** 회전베기처럼 잠깐 뒤를 돌아보며 베는 수 */
    let reverse = false;
    if (this.dead) this.play('hero-hurt');
    else if (this.hurtTimer > 0.2) this.play('hero-hurt');
    else if (a && !RANGED_ACTIONS.has(a.kind)) {
      const moves = MOVES[a.kind];
      if (moves) {
        const i = this.moveIndex(a);
        this.play(moves[i % moves.length], a, i);
        reverse = (a.kind === 'whirl' && i % 2 === 1) || (a.kind === 'crescent' && i === 1);
      } else if (a.kind === 'crouchSlash') this.play('hero-crouch-slash', a);
      else if (a.kind === 'airSlash' || !this.grounded) this.play('hero-jump-attack', a);
      else this.play('hero-attack', a);
    } else if (this.aiming) this.play(AIM_ANIM);
    else if (this.dodgeTime > 0) this.play('hero-run');
    else if (!this.grounded) this.play('hero-jump');
    else if (this.crouching) this.play('hero-crouch');
    else if (Math.abs(this.body.velocity.x) > 20) this.play('hero-run');
    else this.play('hero-idle');
    if (!a || RANGED_ACTIONS.has(a.kind)) this.lastAnimAction = null;

    // 프레임마다 몸통 위치가 다른 시트는 기준점을 맞춘다.
    const key = baseAnimKey(s.anims.currentAnim?.key ?? 'hero-idle');
    const ox = key === AIM_ANIM ? AIM_ORIGIN_X : (ORIGIN_X[key] ?? 0.5);
    const look = reverse ? -this.facing : this.facing;
    s.setFlipX(look === -1);
    s.setOrigin(look === 1 ? ox : 1 - ox, 1);
    s.setPosition(Math.round(this.x), Math.round(this.feet + 1));

    if (this.swapFlash > 0) s.setTintFill(0xfff6e0);
    // 블링크로 나타나는 순간 몸이 빛으로 번쩍인다.
    else if (this.blinkTime > BLINK_INVULN - 0.05) s.setTintFill(0xe8f6ff);
    else if (s.isTinted) s.clearTint();

    // 피격 무적 중 깜빡임 (구르기·블링크의 무적은 깜빡이지 않는다)
    const evading = this.dodgeTime > 0 || this.blinkTime > 0;
    s.setAlpha(this.invuln > 0 && !evading && Math.floor(this.invuln * 20) % 2 === 0 ? 0.4 : 1);

    this.guardFx.setVisible(this.guarding).setPosition(this.x + this.facing * 10, this.y);
    const t = this.scene.time.now;
    this.shieldFx
      .setVisible(this.shield > 0 || this.wardHits > 0)
      .setPosition(Math.round(this.x), Math.round(this.y - 2))
      .setTint(this.wardHits > 0 ? 0xffd34a : 0x5fc8ff)
      .setAlpha(0.45 + Math.sin(t * 0.006) * 0.15)
      .setScale(0.95 + Math.sin(t * 0.004) * 0.03);

    this.updateHeld();
    this.weaponAura();
    this.chargeMotes();
    this.landingDust();

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

  /**
   * 무기의 기운: 화염검은 불씨, 월광도는 달빛, 강철 장검은 반짝임,
   * 바람의 장궁·룬 지팡이·용암 지팡이는 무기 끝에서 기운이 피어오른다.
   */
  private weaponAura(): void {
    if (this.dead || this.dodgeTime > 0) return;
    const def = this.weapon.def;
    let color: number | undefined;
    let at: { x: number; y: number };
    let rate = 0.35;
    let size = 1;
    if (this.isMelee) {
      const aura = meleeLook(def).aura;
      if (!aura) return;
      const AURA_COLOR = {
        flame: Math.random() < 0.5 ? 0xff7a1a : 0xffc040,
        moon: 0xbfd4ff,
        steel: 0xffffff,
        blood: Math.random() < 0.6 ? 0xff3a4a : 0x8a1a2a,
        holy: Math.random() < 0.5 ? 0xffe08a : 0xffffff,
        thunder: Math.random() < 0.7 ? 0x9fe8ff : 0xffffff,
      };
      color = AURA_COLOR[aura];
      rate = aura === 'steel' ? 0.06 : aura === 'flame' || aura === 'holy' ? 0.5 : aura === 'thunder' ? 0.4 : 0.3;
      size = (aura === 'flame' || aura === 'holy') && Math.random() < 0.3 ? 2 : 1;
      // 칼은 몸 앞쪽(칼을 쥔 쪽)에서 피어오른다.
      at = { x: this.x + this.facing * (6 + Math.random() * 10), y: this.y - 4 + (Math.random() - 0.5) * 16 };
    } else {
      color = RANGED_AURA[heldStyle(def)];
      if (color === undefined || !this.held.visible) return;
      at = this.muzzle();
    }
    if (Math.random() > rate) return;
    const dot = this.scene.add
      .image(at.x, at.y, 'fx-px')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.player + 2)
      .setScale(size);
    this.scene.tweens.add({
      targets: dot,
      y: at.y - 10 - Math.random() * 12,
      x: at.x + (Math.random() - 0.5) * 6,
      alpha: 0,
      duration: 450 + Math.random() * 300,
      onComplete: () => dot.destroy(),
    });
  }

  /** 차징 중에는 무기 끝(근접은 칼날)으로 빛이 빨려 들고, 가득 차면 번쩍인다. */
  private chargeMotes(): void {
    if (this.charge < 0) {
      this.chargeFull = false;
      return;
    }
    const type = this.weapon.def.type;
    const color = type === 'staff' ? 0x7fe8ff : type === 'bow' ? 0xffe08a : 0xffb060;
    const at = this.isMelee ? { x: this.x + this.facing * 12, y: this.y - 4 } : this.muzzle();
    const full = this.charge >= (type === 'dao' ? 1 : 1.2);
    if (full && !this.chargeFull) {
      this.chargeFull = true;
      const ring = this.scene.add.circle(at.x, at.y, 3, color, 0).setStrokeStyle(1, 0xffffff, 1).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    }
    if (Math.random() > (full ? 0.8 : 0.55)) return;
    const a = Math.random() * Math.PI * 2;
    const r = 14 + Math.random() * 12;
    const dot = this.scene.add
      .image(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, 'fx-px')
      .setTint(full ? 0xffffff : color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.fx)
      .setScale(Math.random() < 0.3 ? 2 : 1);
    this.scene.tweens.add({ targets: dot, x: at.x, y: at.y, alpha: 0.3, duration: 200, ease: 'Quad.In', onComplete: () => dot.destroy() });
  }

  /** 높은 곳에서 떨어져 착지하면 발밑에 먼지가 인다. */
  private landingDust(): void {
    const airborne = !this.grounded;
    if (airborne) this.fallSpeed = Math.max(this.fallSpeed, this.body.velocity.y);
    else if (this.wasAirborne && this.fallSpeed > 260) {
      for (const dir of [-1, 1]) {
        const puff = this.scene.add.sprite(this.x + dir * 6, this.feet - 3, 'fx-smoke').setTint(0xb0a090).setDepth(DEPTH.fx - 1);
        puff.play('fx-smoke');
        this.scene.tweens.add({ targets: puff, x: puff.x + dir * 14, y: puff.y - 4, duration: 400 });
        puff.once('animationcomplete', () => puff.destroy());
      }
    }
    if (!airborne) this.fallSpeed = 0;
    this.wasAirborne = airborne;
  }

  /**
   * 원거리 직업이 손에 든 무기. 겨누는 동안에만 조준 자세의 손에 붙이고, 평소에는 등에 멘다(그림에 포함).
   * 오른쪽을 볼 때 기준으로 forward: 손에서 앞쪽, down: 아래쪽, rot: 시계 방향 회전(라디안).
   */
  private updateHeld(): void {
    const type = this.weapon.def.type;
    const showWeapon = this.aiming;
    this.held.setVisible(showWeapon);
    this.flash.setVisible(false);
    this.orb.setVisible(false);
    this.tipValid = false;
    if (this.isMelee) return;

    const a = this.action;
    const ranged = a && RANGED_ACTIONS.has(a.kind) ? a : null;
    const t = ranged ? ranged.t : 0;
    // 무기마다 그림이 다르다 (사냥꾼의 활 / 바람의 장궁, 리볼버 / 장총, 지팡이 3종).
    const heldType = type as 'bow' | 'gun' | 'staff';
    const style = heldStyle(this.weapon.def);
    let key = heldKey(heldType, style);
    let forward = 0;
    let down = 0;
    let rot = 0;
    const tipLocal = heldDef(heldType, style).tip;
    let flash = false;
    let orbScale = 0;

    if (type === 'bow') {
      if (this.charge >= 0) {
        // 차징: 당긴 만큼 시위가 뒤로
        const c = Math.min(1, this.charge / 1.2);
        key = heldKey('bow', style, c < 0.45 ? 1 : 2);
        forward = -c * 2;
      } else if (ranged) {
        // 쏘기: 짧게 당겼다가 놓으면서 살짝 밀려난다
        const cycle = ranged.kind === 'volley' ? (t % 0.075) / 0.075 : Math.min(1, t / 0.2);
        key = heldKey('bow', style, cycle < 0.35 ? 2 : 0);
        if (cycle >= 0.35) forward -= 2 * (1 - cycle);
      }
    } else if (type === 'gun') {
      if (this.reloadTime > 0) {
        // 재장전: 총을 아래로 돌려 탄을 채운다
        rot = 1.1 + Math.sin(this.reloadTime * 10) * 0.15;
        down = 3;
        forward = -3;
      } else if (ranged) {
        // 반동: 쏠 때마다 총구가 위로 튀었다 돌아온다
        const period = ranged.kind === 'rapid' ? 0.1 : ranged.kind === 'barrage' ? 0.065 : ranged.kind === 'snipe' ? 99 : 0.14;
        const since = ranged.kind === 'snipe' ? t - 0.6 : t % period;
        if (since >= 0 && since < 0.1) {
          rot = -0.55 * (1 - since / 0.1);
          forward = -2 * (1 - since / 0.1);
          flash = since < 0.05;
        }
      }
    } else {
      if (this.charge >= 0) {
        // 차징: 곧게 세워 끝에 마력을 모은다
        const c = Math.min(1, this.charge / 1.2);
        orbScale = 0.6 + c * 1.4;
      } else if (ranged?.kind === 'laser') {
        rot = Math.PI / 2;
        orbScale = 1.2 + Math.sin(t * 40) * 0.2;
      } else if (ranged) {
        // 시전: 뒤에서 앞으로 휘두르며 끝이 빛난다
        const p = Math.min(1, t / Math.max(0.12, ranged.dur * 0.6));
        const e = 1 - Math.pow(1 - p, 3);
        rot = -0.5 + e * 1.5;
        orbScale = 1.4 * (1 - p) + 0.4;
      }
    }

    // 손 위치: 조준 자세 그림의 손 (발끝 기준점에서)
    const f = this.facing;
    const [gx, gy] = heldOrigin(heldType, style);
    const hx = Math.round(this.x) + f * (AIM_HAND.x + forward);
    const hy = Math.round(this.feet + 1) + AIM_HAND.y + down;
    this.held
      .setTexture(key)
      .setFlipX(f === -1)
      .setOrigin(f === 1 ? gx : 1 - gx, gy)
      .setRotation(rot * f)
      .setPosition(hx, hy)
      .setAlpha(this.sprite.alpha);

    // 무기 끝 위치 (회전 반영). 겨누기 전에도 첫 발이 나갈 곳으로 쓴다.
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    this.tip = {
      x: hx + f * (tipLocal.x * cos - tipLocal.y * sin),
      y: hy + tipLocal.x * sin + tipLocal.y * cos,
    };
    this.tipValid = true;
    if (!showWeapon) return;
    if (flash) this.flash.setVisible(true).setPosition(this.tip.x + f * 3, this.tip.y).setRotation(Math.random());
    if (orbScale > 0) this.orb.setVisible(true).setPosition(this.tip.x, this.tip.y).setScale(orbScale);
  }

  /** 투사체가 나가는 위치: 원거리 무기는 무기 끝, 아니면 손 앞 */
  muzzle(): { x: number; y: number } {
    if (this.tipValid) return { x: this.tip.x, y: this.tip.y };
    return { x: this.x + this.facing * 16, y: this.y - 4 };
  }

  /**
   * 투사체와 총알이 실제로 날아가는 위치. 손에 든 무기 끝은 바닥에서 30~50px 위라 거기서 쏘면
   * 키 작은 지상 적(20~24px)의 머리 위로 지나간다. 그래서 판정은 몸 가운데 높이로 하고,
   * 총구 불꽃 같은 연출만 muzzle()의 무기 끝에 그린다. 지팡이는 휘두르는 중이라 끝이 앞뒤로 움직여 몸 앞에서 쏜다.
   */
  shotPoint(): { x: number; y: number } {
    const x = this.tipValid && this.weapon.def.type !== 'staff' ? this.tip.x : this.x + this.facing * 16;
    return { x, y: this.y };
  }

  destroy(): void {
    this.sprite.destroy();
    this.zone.destroy();
    this.guardFx.destroy();
    this.shieldFx.destroy();
    this.chargeBg.destroy();
    this.chargeFill.destroy();
    this.held.destroy();
    this.flash.destroy();
    this.orb.destroy();
  }
}
