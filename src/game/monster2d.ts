import Phaser from 'phaser';
import { ELITE_MOD, MONSTERS, type MonsterDef, type MonsterKind } from '../data/monsters';
import { DEPTH } from './fx';
import { PX_PER_M } from './player2d';
import type { BattleScene } from './battleScene';
import { CHAPTER2 } from './mobs/chapter2';
import { ABYSS_PATTERNS, CHAPTER3 } from './mobs/chapter3';
import { CHAPTER4 } from './mobs/chapter4';
import { CHAPTER5 } from './mobs/chapter5';
import { silentKnight } from './legion/knight';
import { corruptedElf } from './legion/elf';
import { darkLord } from './legion/darklord';
import { worldGolem } from './worldGolem';

/** 챕터 2·3 몬스터의 행동 (몬스터 하나를 한 프레임 움직인다) */
export type Behavior = (m: Monster, dt: number) => void;
const BEHAVIORS: Partial<Record<MonsterKind, Behavior>> = { ...CHAPTER2, ...CHAPTER3, ...CHAPTER4, ...CHAPTER5, silent_knight: silentKnight, corrupted_elf: corruptedElf, dark_lord: darkLord, world_golem: worldGolem };

export interface Look {
  walk: string;
  attack?: string;
  spawn?: string;
  /** 서 있을 때 (없으면 walk) */
  idle?: string;
  /** 그림이 기본으로 왼쪽을 본다 */
  facesLeft: boolean;
  body: [number, number];
  scale?: number;
  tint?: number;
}

const LOOKS: Record<MonsterKind, Look> = {
  zombie: { walk: 'skeleton-walk', spawn: 'skeleton-rise', facesLeft: true, body: [16, 40] },
  poison_zombie: { walk: 'skeleton-clothed-walk', spawn: 'skeleton-clothed-rise', facesLeft: true, body: [16, 40], tint: 0xa8ff90 },
  mage: { walk: 'wizard-idle', attack: 'wizard-cast', facesLeft: false, body: [18, 44] },
  fire_mage: { walk: 'ghoul-walk', facesLeft: true, body: [18, 44] },
  minion: { walk: 'ghost-idle', attack: 'ghost-shriek', facesLeft: true, body: [22, 34], scale: 0.85 },
  golem: { walk: 'beast-idle', attack: 'beast-breath', facesLeft: true, body: [26, 52], scale: 1.15 },
  grave_knight: { walk: 'nightmare-idle', attack: 'nightmare-gallop', facesLeft: true, body: [64, 54], scale: 0.9 },
  golem_lord: { walk: 'demon-idle', attack: 'demon-attack', facesLeft: true, body: [70, 96], scale: 1.1 },
  lantern_wraith: { walk: 'lantern-idle', facesLeft: false, body: [18, 44] },
  halo_wraith: { walk: 'halo-idle', facesLeft: false, body: [18, 44] },
  fire_skull: { walk: 'fire-skull', facesLeft: true, body: [20, 20], scale: 0.45 },
  hell_cat: { walk: 'cat-walk', facesLeft: true, body: [40, 24], scale: 0.85 },
  blood_skeleton: { walk: 'skeleton-blood-walk', spawn: 'skeleton-blood-rise', facesLeft: true, body: [16, 40] },
  frost_mage: { walk: 'wizard-frost-idle', attack: 'wizard-frost-cast', facesLeft: false, body: [18, 44] },
  fallen_angel: { walk: 'angel-idle', attack: 'angel-attack', facesLeft: false, body: [44, 76], scale: 1.4 },
  hell_hound: { walk: 'hound-run', attack: 'hound-jump', facesLeft: true, body: [40, 24], scale: 1.2 },
  silver_wolf: { walk: 'wolf-run', facesLeft: false, body: [36, 22], scale: 1.1 },
  flame_beast: { walk: 'beast-idle', attack: 'beast-breath', facesLeft: true, body: [26, 52], scale: 1.2, tint: 0xffb080 },
  wraith_knight: { walk: 'wraith-idle', attack: 'wraith-gallop', facesLeft: true, body: [64, 54], scale: 0.9 },
  abyss_lord: { walk: 'abyss-idle', attack: 'abyss-attack', facesLeft: true, body: [70, 96], scale: 1.2 },
  cursed_skull: { walk: 'cursed-skull', facesLeft: true, body: [20, 22], scale: 0.55 },
  shade: { walk: 'shade-idle', facesLeft: false, body: [18, 40] },
  plague_wolf: { walk: 'plague-wolf-run', facesLeft: false, body: [36, 22], scale: 1.1 },
  iron_beast: { walk: 'iron-idle', attack: 'iron-breath', facesLeft: true, body: [28, 56], scale: 1.3 },
  cursed_knight: { walk: 'cursed-idle', attack: 'cursed-gallop', facesLeft: true, body: [64, 54], scale: 0.9 },
  night_queen: { walk: 'queen-idle', attack: 'queen-attack', facesLeft: false, body: [44, 76], scale: 1.4 },
  void_hound: { walk: 'vhound-run', attack: 'vhound-jump', idle: 'vhound-idle', facesLeft: true, body: [40, 24], scale: 1.2 },
  void_mage: { walk: 'vmage-idle', attack: 'vmage-cast', facesLeft: false, body: [18, 44] },
  lesser_demon: { walk: 'ldemon-idle', attack: 'ldemon-attack', facesLeft: true, body: [34, 44], scale: 0.45 },
  void_angel: { walk: 'vangel-idle', attack: 'vangel-attack', facesLeft: false, body: [30, 50], scale: 0.75 },
  void_knight: { walk: 'vknight-idle', attack: 'vknight-gallop', facesLeft: true, body: [64, 54], scale: 0.95 },
  silent_knight: { walk: 'knight:hero-run', attack: 'knight:hero-idle', idle: 'knight:hero-idle', facesLeft: false, body: [16, 44], scale: 2.2 },
  corrupted_elf: { walk: 'elf:hero-run', attack: 'elf:hero-idle', idle: 'elf:hero-idle', facesLeft: false, body: [16, 44], scale: 2.1 },
  dark_lord: { walk: 'darklord:hero-run', attack: 'darklord:hero-idle', idle: 'darklord:hero-idle', facesLeft: false, body: [16, 44], scale: 2.2 },
  world_golem: { walk: 'demon-idle', attack: 'demon-idle', facesLeft: true, body: [44, 56], scale: 3 },
  void_king: { walk: 'vking-idle', attack: 'vking-attack', facesLeft: true, body: [70, 96], scale: 1.3 },
};

/** 몬스터 판정 몸통의 키 (px, 엘리트는 1.3배) */
export function monsterBodyHeight(kind: MonsterKind, elite: boolean): number {
  const look = LOOKS[kind];
  return look.body[1] * (look.scale ?? 1) * (elite ? 1.3 : 1);
}

/** 미니보스가 체력 절반에서 불러내는 부하 */
const KNIGHT_SUMMON: Partial<Record<MonsterKind, MonsterKind>> = {
  wraith_knight: 'hell_hound',
  cursed_knight: 'cursed_skull',
  void_knight: 'void_hound',
};

export type State = 'move' | 'windup' | 'recover' | 'dash' | 'dive' | 'rise' | 'pattern' | 'leap';
export type Pattern = 'breath' | 'volley' | 'slam' | 'charge' | 'leap' | 'combo' | 'feathers' | 'sweep' | 'beams' | 'pillars' | 'meteors';

export const HOVER_Y = 190;

export class Monster {
  readonly def: MonsterDef;
  readonly elite: boolean;
  readonly look: Look;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  facing: 1 | -1 = -1;

  hp: number;
  readonly maxHp: number;
  readonly damage: number;
  readonly speed: number;
  alive = true;
  /** 쓰러진 뒤 사라질 때까지 */
  dying = 0;
  spawnTime = 0;
  stun = 0;
  slowTime = 0;
  slowMul = 1;
  vulnTime = 0;
  vuln = 0;
  phase2 = false;

  state: State = 'move';
  stateTime = 0;
  attackTimer: number;
  // 아래는 챕터별 행동 함수(mobs/)도 쓰는 상태
  pattern: Pattern = 'breath';
  step = 0;
  hitDone = false;
  targetX = 0;
  targetY = 0;
  /** 이 체력 비율 아래로 내려갈 때마다 부하를 부른다 */
  summonAt = [0.7, 0.4];
  /** 받는 피해 감소 보호막 (후광 망령) 남은 시간 */
  ward = 0;
  /** 이동속도 증가 (늑대 울음) 남은 시간 */
  boostTime = 0;
  /** 행동 함수가 자유롭게 쓰는 타이머 */
  aux = 0;
  /** 지금까지 맞은 횟수 (맞을 때 반응하는 행동이 쓴다) */
  hitCount = 0;
  /** 횟수 보호막 (암흑의 군주): 남은 횟수만큼 맞아야 깨진다. 0이면 없음, -1이면 아무 피해도 받지 않는다. */
  hitShield = 0;
  /** 공허의 왕의 마지막 단계 (체력 25% 아래) */
  phase3 = false;
  private dashCd = 3;
  private bob = Math.random() * 10;
  private wardFx: Phaser.GameObjects.Image | null = null;
  private bar: Phaser.GameObjects.Rectangle | null = null;
  private barBg: Phaser.GameObjects.Rectangle | null = null;
  private barW = 26;

  constructor(
    readonly scene: BattleScene,
    kind: MonsterKind,
    elite: boolean,
    hpMul: number,
    x: number,
    y: number,
    dmgMul = 1,
  ) {
    this.def = MONSTERS[kind];
    this.elite = elite;
    this.look = LOOKS[kind];
    this.maxHp = Math.round(this.def.hp * hpMul * (elite ? ELITE_MOD.hp : 1));
    this.hp = this.maxHp;
    this.damage = this.def.damage * (elite ? ELITE_MOD.damage : 1) * dmgMul;
    this.speed = this.def.speed * PX_PER_M * 0.75 * (elite ? 1.15 : 1);
    this.attackTimer = this.def.attackCd * (0.4 + Math.random() * 0.6);

    const scale = (this.look.scale ?? 1) * (elite ? 1.3 : 1);
    const [bw, bh] = this.look.body;
    this.zone = scene.add.zone(x, y, bw * scale, bh * scale);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    if (this.flying) this.body.setAllowGravity(false);

    this.sprite = scene.add.sprite(x, y, 'dot').setOrigin(0.5, 1).setDepth(DEPTH.monster).setScale(scale);
    const tint = elite ? 0xffb070 : this.look.tint;
    if (tint !== undefined) this.sprite.setTint(tint);
    if (this.look.spawn) {
      this.spawnTime = 0.75;
      this.sprite.play(this.look.spawn);
    } else {
      this.sprite.play(this.look.walk);
      this.sprite.setAlpha(0);
      scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 400 });
    }

    if (!this.def.boss && !this.def.miniboss) {
      this.barW = elite ? 36 : 26;
      this.barBg = scene.add.rectangle(x, y, this.barW + 2, 4, 0x140a0a).setOrigin(0, 0.5).setDepth(DEPTH.text - 1).setVisible(elite);
      this.bar = scene.add
        .rectangle(x, y, this.barW, 2, elite ? 0xff9a1a : 0xe53935)
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.text - 1)
        .setVisible(elite);
    }
  }

  get flying(): boolean {
    return this.def.flying || this.def.kind === 'golem_lord' || this.def.kind === 'abyss_lord' || this.def.kind === 'void_king';
  }

  get boss(): boolean {
    return !!this.def.boss;
  }

  get showsBossBar(): boolean {
    return !!this.def.boss || !!this.def.miniboss;
  }

  get x(): number {
    return this.body.center.x;
  }

  get y(): number {
    return this.body.center.y;
  }

  get removable(): boolean {
    return !this.alive && this.dying <= 0;
  }

  /** 맞았을 때: 번쩍임과 체력바 표시 */
  onHit(fromX: number, knock: number): void {
    this.hitCount++;
    this.scene.fx.flash(this.sprite, 0xffffff, 70);
    this.bar?.setVisible(true);
    this.barBg?.setVisible(true);
    if (knock > 0 && !this.showsBossBar) {
      const dir = this.x >= fromX ? 1 : -1;
      this.body.setVelocityX(dir * knock * (this.elite ? 0.4 : 1));
      if (!this.flying) this.body.setVelocityY(-knock * 0.35);
      this.knockTime = 0.18;
    }
  }

  private knockTime = 0;

  kill(): void {
    this.alive = false;
    this.dying = 0.35;
    this.bar?.setVisible(false);
    this.barBg?.setVisible(false);
    this.body.enable = false;
    this.scene.fx.death(this.x, this.body.bottom, this.showsBossBar ? 2 : this.elite ? 1.3 : 1);
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, duration: 300 });
  }

  destroy(): void {
    this.wardFx?.destroy();
    this.sprite.destroy();
    this.zone.destroy();
    this.bar?.destroy();
    this.barBg?.destroy();
  }

  update(dt: number): void {
    if (!this.alive) {
      this.dying -= dt;
      return;
    }
    const b = this.scene;
    if (this.slowTime > 0) {
      this.slowTime -= dt;
      if (this.slowTime <= 0) this.slowMul = 1;
    }
    if (this.vulnTime > 0) {
      this.vulnTime -= dt;
      if (this.vulnTime <= 0) this.vuln = 0;
    }
    this.knockTime = Math.max(0, this.knockTime - dt);
    this.ward = Math.max(0, this.ward - dt);
    this.boostTime = Math.max(0, this.boostTime - dt);

    if (this.spawnTime > 0) {
      this.spawnTime -= dt;
      if (this.spawnTime <= 0) this.sprite.play(this.look.walk);
      this.body.setVelocityX(0);
    } else if (this.stun > 0) {
      this.stun -= dt;
      if (this.knockTime <= 0) this.body.setVelocityX(this.body.velocity.x * 0.85);
      if (this.flying && this.def.kind === 'minion') this.body.setVelocityY(60);
      if (this.stun <= 0) this.state = this.def.kind === 'minion' ? 'rise' : 'move';
      this.sprite.anims.timeScale = 0;
    } else {
      this.sprite.anims.timeScale = 1;
      if (this.knockTime <= 0) {
        switch (this.def.kind) {
          case 'zombie':
          case 'poison_zombie':
          case 'blood_skeleton':
            this.updateWalker(dt);
            break;
          case 'mage':
          case 'fire_mage':
          case 'frost_mage':
          case 'void_mage':
            this.updateCaster(dt);
            break;
          case 'minion':
            this.updateGhost(dt);
            break;
          case 'golem':
          case 'lesser_demon':
            this.updateBeast(dt);
            break;
          case 'grave_knight':
          case 'wraith_knight':
          case 'cursed_knight':
          case 'void_knight':
            this.updateNightmare(dt);
            break;
          case 'golem_lord':
          case 'abyss_lord':
          case 'void_king':
            this.updateDemon(dt);
            break;
          default:
            BEHAVIORS[this.def.kind]?.(this, dt);
        }
      }
    }

    this.sync();
    void b;
  }

  private sync(): void {
    const s = this.sprite;
    if (this.ward > 0) {
      this.wardFx ??= this.scene.add.image(0, 0, 'fx-hex').setTint(0xffd060).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.monster + 1);
      const size = Math.max(this.body.width, this.body.height) + 14;
      this.wardFx
        .setVisible(true)
        .setPosition(this.x, this.y)
        .setScale(size / 48)
        .setAlpha(0.35 + Math.sin(this.scene.time.now * 0.008) * 0.15);
    } else this.wardFx?.setVisible(false);
    s.setFlipX(this.look.facesLeft ? this.facing === 1 : this.facing === -1);
    const bob = this.flying ? Math.sin((this.bob += 0.06)) * 2 : 0;
    s.setPosition(Math.round(this.x), Math.round(this.body.bottom + 2 + bob));
    if (this.bar && this.barBg) {
      const top = this.body.top - 6;
      this.barBg.setPosition(this.x - this.barW / 2 - 1, top);
      this.bar.setPosition(this.x - this.barW / 2, top);
      this.bar.width = this.barW * Math.max(0, this.hp / this.maxHp);
    }
  }

  toPlayer(): { dx: number; dy: number; dist: number } {
    const p = this.scene.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    return { dx, dy, dist: Math.abs(dx) };
  }

  face(dx: number): void {
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
  }

  /** 발판 끝에서 떨어지지 않도록 멈춘다. */
  walk(dir: number, speedMul = 1): void {
    const v = dir * this.speed * this.slowMul * speedMul * (this.boostTime > 0 ? 1.3 : 1);
    if (dir !== 0 && this.body.blocked.down) {
      const s = this.scene.surfaceUnder(this);
      if (s) {
        const ahead = this.x + dir * (this.body.width / 2 + 4);
        if (ahead < s.x + 2 || ahead > s.x + s.w - 2) {
          this.body.setVelocityX(0);
          return;
        }
      }
    }
    this.body.setVelocityX(v);
    if (dir !== 0) this.face(dir);
  }

  play(key: string | undefined): void {
    if (key && this.sprite.anims.currentAnim?.key !== key) this.sprite.play(key);
  }

  // ─── 해골 병사 / 독 해골: 다가가서 휘두른다 ───
  private updateWalker(dt: number): void {
    const { dx, dy, dist } = this.toPlayer();
    this.stateTime -= dt;
    const sameLevel = Math.abs(dy) < 40;
    switch (this.state) {
      case 'move':
        this.play(this.look.walk);
        if (sameLevel || dist > 160) this.walk(Math.sign(dx));
        else this.walk(0);
        if (this.elite) {
          this.dashCd -= dt;
          if (this.dashCd <= 0 && sameLevel && dist > 70 && dist < 220) {
            this.state = 'windup';
            this.stateTime = 0.5;
            this.step = 1;
            this.hitDone = false;
            this.sprite.setTint(0xff7050);
            break;
          }
        }
        if (sameLevel && dist < 26 + this.body.width / 2) {
          this.state = 'windup';
          this.stateTime = this.elite ? 0.32 : 0.42;
          this.step = 0;
          this.body.setVelocityX(0);
          this.face(dx);
        }
        break;
      case 'windup':
        this.body.setVelocityX(0);
        this.sprite.anims.timeScale = 0.3;
        if (this.stateTime <= 0) {
          if (this.step === 1) {
            this.state = 'dash';
            this.stateTime = 0.45;
            this.face(dx);
          } else {
            // 앞으로 한 발 내디디며 할퀸다.
            this.body.setVelocityX(this.facing * 90);
            if (dist < 34 + this.body.width / 2 && sameLevel) {
              this.scene.damagePlayer(this.damage, { x: this.x, monster: this, melee: true });
            }
            this.scene.fx.slash(this.x + this.facing * 12, this.y - 4, this.facing, 14, 0xff8a6a);
            this.state = 'recover';
            this.stateTime = 0.55;
          }
        }
        break;
      case 'dash':
        this.body.setVelocityX(this.facing * 260);
        if (!this.hitDone && dist < 24 && sameLevel) {
          this.hitDone = true;
          this.scene.damagePlayer(this.damage * 1.2, { x: this.x, monster: this, melee: true });
        }
        if (this.stateTime <= 0) {
          this.state = 'recover';
          this.stateTime = 0.6;
          this.dashCd = 5;
          const tint = this.elite ? 0xffb070 : this.look.tint;
          if (tint !== undefined) this.sprite.setTint(tint);
          else this.sprite.clearTint();
        }
        break;
      default:
        this.body.setVelocityX(this.body.velocity.x * 0.85);
        if (this.stateTime <= 0) this.state = 'move';
    }
  }

  // ─── 해골 마법사 / 불타는 구울: 거리를 두고 쏜다 ───
  private updateCaster(dt: number): void {
    const { dx, dy, dist } = this.toPlayer();
    const mage = this.def.kind !== 'fire_mage';
    this.stateTime -= dt;
    this.attackTimer -= dt;
    if (this.state === 'move') {
      this.play(this.look.walk);
      const want = mage ? 170 : 130;
      if (dist > want + 50) this.walk(Math.sign(dx), 1);
      else if (dist < want - 50) this.walk(-Math.sign(dx), 0.8);
      else this.walk(0);
      this.face(dx);
      if (this.attackTimer <= 0 && dist < 340 && Math.abs(dy) < 90) {
        this.state = 'windup';
        this.stateTime = mage ? 0.75 : 0.6;
        this.body.setVelocityX(0);
        this.play(this.look.attack);
        if (!mage) this.sprite.setTint(0xffd080);
      }
    } else if (this.state === 'windup') {
      this.body.setVelocityX(0);
      this.face(dx);
      if (this.stateTime <= 0) {
        const p = this.scene.player;
        const ox = this.x + this.facing * 14;
        const oy = this.y - (mage ? 10 : 6);
        const ang = Math.atan2(p.y - oy, p.x - ox);
        const spreads = this.elite ? [-0.22, 0, 0.22] : [0];
        for (const s of spreads) {
          const v = mage ? 170 : 150;
          const opts =
            this.def.kind === 'frost_mage' ? { kind: 'frost' as const, slow: true } : this.def.kind === 'void_mage' ? { kind: 'void' as const, slow: true, homing: 1.1, life: 5 } : undefined;
          this.scene.spawnEnemyBolt(ox, oy, Math.cos(ang + s) * v, Math.sin(ang + s) * v, this.damage, this, mage ? 0 : 26, opts);
        }
        this.attackTimer = this.def.attackCd;
        this.state = 'move';
        if (!mage) {
          if (this.elite) this.sprite.setTint(0xffb070);
          else this.sprite.clearTint();
        }
      }
    }
  }

  // ─── 유령: 위에서 떠돌다 내리꽂는다 ───
  private updateGhost(dt: number): void {
    const p = this.scene.player;
    this.stateTime -= dt;
    const body = this.body;
    switch (this.state) {
      case 'move': {
        this.play(this.look.walk);
        this.targetX = p.x + Math.sin(this.bob * 0.4) * 90;
        const ty = p.y - 80;
        body.setVelocity((this.targetX - this.x) * 1.2 * this.slowMul, (ty - this.y) * 1.5);
        this.face(p.x - this.x);
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          this.state = 'windup';
          this.stateTime = 0.4;
          this.play(this.look.attack);
        }
        break;
      }
      case 'windup':
        body.setVelocity(0, -20);
        if (this.stateTime <= 0) {
          this.state = 'dive';
          this.stateTime = 0.9;
          this.hitDone = false;
          this.targetX = p.x;
          this.targetY = p.y;
          const ang = Math.atan2(this.targetY - this.y, this.targetX - this.x);
          body.setVelocity(Math.cos(ang) * 230, Math.sin(ang) * 230);
        }
        break;
      case 'dive':
        if (!this.hitDone && Math.abs(p.x - this.x) < 18 && Math.abs(p.y - this.y) < 24) {
          this.hitDone = true;
          this.scene.damagePlayer(this.damage, { x: this.x, monster: this, melee: true });
        }
        if (this.stateTime <= 0 || this.y > p.y + 10) {
          this.state = 'rise';
          this.stateTime = 0.6;
          body.setVelocity(0, 0);
        }
        break;
      default:
        // 낮게 머문 뒤 올라간다 (이때 근접 공격으로 맞힐 수 있다).
        body.setVelocity(0, this.stateTime > 0 ? 0 : -90);
        if (this.y < p.y - 70) {
          this.state = 'move';
          this.attackTimer = this.def.attackCd * (this.elite ? 0.6 : 1) * (0.8 + Math.random() * 0.4);
        }
    }
  }

  // ─── 헬 비스트: 느리게 다가와 불을 뿜는다 ───
  private updateBeast(dt: number): void {
    const { dx, dy, dist } = this.toPlayer();
    this.stateTime -= dt;
    this.attackTimer -= dt;
    switch (this.state) {
      case 'move':
        this.play(this.look.walk);
        this.walk(Math.abs(dy) < 60 ? Math.sign(dx) : 0);
        if (dist < 110 && Math.abs(dy) < 50 && this.attackTimer <= 0) {
          this.face(dx);
          this.state = 'windup';
          this.stateTime = 0.9;
          this.body.setVelocityX(0);
          const w = this.elite ? 130 : 100;
          const x0 = this.facing === 1 ? this.x + 10 : this.x - 10 - w;
          this.scene.addTelegraph(x0, this.body.bottom - 40, w, 40, 0.9, this, () => {
            this.play(this.look.attack);
            this.scene.areaHit(x0, this.body.bottom - 44, w, 44, this.damage, this, false);
            for (let i = 0; i < 6; i++) this.scene.fx.burst(x0 + (w * i) / 6, this.body.bottom - 18, 0xff7a2a, 4, 60, 400);
            if (this.elite) this.scene.addShockwave(this.x, this.damage * 0.5, this);
          });
        }
        break;
      case 'windup':
        this.body.setVelocityX(0);
        if (this.stateTime <= 0) {
          this.state = 'recover';
          this.stateTime = 0.8;
          this.attackTimer = this.def.attackCd;
        }
        break;
      default:
        if (this.stateTime <= 0) this.state = 'move';
    }
  }

  // ─── 악몽마 (미니보스): 돌진, 도약, 체력 절반 이하에서 소환 ───
  private updateNightmare(dt: number): void {
    const { dx, dist } = this.toPlayer();
    if (!this.phase2 && this.hp / this.maxHp < 0.5) {
      this.phase2 = true;
      const summon = KNIGHT_SUMMON[this.def.kind] ?? 'zombie';
      this.scene.announce(`${this.def.name}가 ${MONSTERS[summon].name}을(를) 불러낸다!`, 1.6);
      for (let i = 0; i < 3; i++) this.scene.spawnMonster(summon, false, this.x + (i - 1) * 60);
    }
    this.stateTime -= dt;
    this.attackTimer -= dt;
    if (this.state === 'move') {
      this.play(this.look.walk);
      this.walk(Math.sign(dx), 0.6);
      if (this.attackTimer <= 0) {
        this.state = 'pattern';
        this.step = 0;
        this.face(dx);
        this.pattern = dist > 200 || Math.random() < 0.5 ? 'charge' : 'leap';
        this.stateTime = 0.6;
        this.sprite.setTint(0xff6a6a);
        if (this.pattern === 'leap') {
          this.targetX = this.scene.player.x;
          this.scene.addTelegraph(this.targetX - 50, this.scene.floorY() - 30, 100, 30, 1.2, null, null);
        }
      }
      return;
    }
    if (this.state === 'recover') {
      this.body.setVelocityX(this.body.velocity.x * 0.9);
      if (this.stateTime <= 0) this.state = 'move';
      return;
    }
    if (this.pattern === 'charge') {
      if (this.step === 0) {
        this.body.setVelocityX(0);
        if (this.stateTime <= 0) {
          this.step = 1;
          this.stateTime = 1.1;
          this.hitDone = false;
          this.play(this.look.attack);
        }
      } else {
        this.body.setVelocityX(this.facing * (this.phase2 ? 330 : 280));
        if (!this.hitDone && Math.abs(this.scene.player.x - this.x) < 40 && Math.abs(this.scene.player.y - this.y) < 40) {
          this.hitDone = true;
          this.scene.damagePlayer(this.damage, { x: this.x, monster: this, melee: true });
          this.scene.player.knockback(this.x, 220);
        }
        if (this.stateTime <= 0 || this.body.blocked.left || this.body.blocked.right) {
          // 망령 기사·공허 기사는 돌진이 끝나는 자리에서 충격파를 일으킨다.
          if (this.def.kind === 'wraith_knight' || this.def.kind === 'void_knight') {
            this.scene.addShockwave(this.x, this.damage * 0.7, this);
            this.scene.fx.ring(this.x, this.scene.floorY(), 60, 0x7ff0e0);
          }
          this.endPattern();
        }
      }
    } else {
      if (this.step === 0) {
        this.body.setVelocityX(0);
        if (this.stateTime <= 0) {
          this.step = 1;
          this.stateTime = 0.6;
          this.face(this.targetX - this.x);
          this.body.setVelocity((this.targetX - this.x) / 0.6, -420);
          this.play(this.look.attack);
        }
      } else if (this.body.blocked.down && this.stateTime < 0.4) {
        this.scene.groundSlam(this.x, 60, this.damage * 1.2, this);
        this.scene.fx.shake(1.2, 200);
        this.endPattern();
      }
    }
  }

  // ─── 악마 군주 (보스): 떠다니며 화염 숨결, 불덩이, 내려찍기 충격파, 소환 ───
  // 심연의 군주도 같은 행동을 쓰고, 불기둥 줄·운석 비 패턴이 더해진다 (mobs/chapter3.ts).
  private updateDemon(dt: number): void {
    const p = this.scene.player;
    const ratio = this.hp / this.maxHp;
    const abyss = this.def.kind === 'abyss_lord';
    const king = this.def.kind === 'void_king';
    if (!this.phase2 && ratio < 0.5) {
      this.phase2 = true;
      this.scene.announce(`${this.def.name}가 격노했다!`);
    }
    // 공허의 왕은 체력 25% 아래에서 한 번 더 깨어난다.
    if (king && !this.phase3 && ratio < 0.25) {
      this.phase3 = true;
      this.scene.announce('공허의 왕이 공허를 찢는다!');
      this.scene.fx.flashScreen(0x7ff0ff, 0.4, 400);
      this.scene.fx.shake(2, 400);
    }
    if (this.summonAt.length && ratio < this.summonAt[0]) {
      this.summonAt.shift();
      this.scene.announce(`${this.def.name}가 하수인을 부른다!`);
      const W = this.scene.level.width;
      if (abyss) {
        for (let i = 0; i < 3; i++) this.scene.spawnMonster('hell_hound', false, 100 + Math.random() * (W - 200));
        if (this.phase2) this.scene.spawnMonster('flame_beast', false);
      } else if (king) {
        for (let i = 0; i < 3; i++) this.scene.spawnMonster('void_hound', false, 100 + Math.random() * (W - 200));
        if (this.phase2) this.scene.spawnMonster('lesser_demon', true);
      } else {
        for (let i = 0; i < 4; i++) this.scene.spawnMonster(i < 3 ? 'zombie' : 'minion', false, 100 + Math.random() * (W - 200));
        if (this.phase2) this.scene.spawnMonster('golem', true);
      }
    }
    const fast = this.phase3 ? 0.55 : this.phase2 ? 0.7 : 1;
    this.stateTime -= dt;
    this.attackTimer -= dt;
    const body = this.body;
    if (this.state === 'move') {
      this.play(this.look.walk);
      const tx = p.x + (this.x < p.x ? -140 : 140);
      body.setVelocity((tx - this.x) * 0.8, (HOVER_Y - this.y) * 2);
      this.face(p.x - this.x);
      if (this.attackTimer <= 0) {
        const options: Pattern[] = king
          ? ['breath', 'pillars', 'meteors', 'beams', 'feathers', 'slam', 'beams']
          : abyss
            ? ['breath', 'volley', 'slam', 'pillars', 'meteors', 'pillars']
            : ['breath', 'volley', 'slam', 'breath'];
        this.pattern = options[Math.floor(Math.random() * options.length)];
        this.state = 'pattern';
        this.step = 0;
        this.stateTime = 0.7 * fast;
        body.setVelocity(0, 0);
        if (this.pattern === 'breath') {
          this.play(this.look.attack);
          const w = 220;
          const x0 = this.facing === 1 ? this.x : this.x - w;
          this.scene.addTelegraph(x0, this.scene.floorY() - 70, w, 70, 0.9 * fast, this, () => {
            this.scene.areaHit(x0, this.scene.floorY() - 74, w, 74, this.damage, this, false);
            for (let i = 0; i < 10; i++) this.scene.fx.burst(x0 + (w * i) / 10, this.scene.floorY() - 30, 0x5ff0ff, 5, 70, 500);
            this.scene.fx.shake(1, 200);
          });
        } else if (this.pattern === 'slam') {
          this.scene.announce('점프로 충격파를 피하라!', 1.1);
        }
      }
      return;
    }
    if (this.state === 'recover') {
      body.setVelocity(0, (HOVER_Y - this.y) * 2);
      if (this.stateTime <= 0) this.state = 'move';
      return;
    }
    switch (this.pattern) {
      case 'breath':
        if (this.stateTime <= -0.6) this.endPattern();
        break;
      case 'volley': {
        const count = this.phase2 ? 5 : 3;
        if (this.step < count && this.stateTime <= -0.25 * this.step) {
          const ang = Math.atan2(p.y - this.y, p.x - this.x) + (Math.random() - 0.5) * 0.35;
          this.scene.spawnEnemyBolt(this.x + this.facing * 30, this.y, Math.cos(ang) * 190, Math.sin(ang) * 190, this.damage * 0.6, this, 30);
          this.step++;
        }
        if (this.stateTime <= -0.25 * count - 0.3) this.endPattern();
        break;
      }
      case 'slam':
        if (this.step === 0) {
          body.setVelocity(0, 0);
          if (this.stateTime <= 0) {
            this.step = 1;
            body.setVelocity(0, 520);
          }
        } else if (this.body.bottom >= this.scene.floorY() - 2) {
          body.setVelocity(0, 0);
          this.scene.addShockwave(this.x, this.damage * 0.8, this);
          if (this.phase2) this.scene.time.delayedCall(450, () => this.alive && this.scene.addShockwave(this.x, this.damage * 0.8, this));
          this.scene.fx.shake(2, 300);
          this.endPattern();
        }
        break;
      default: {
        const extra = ABYSS_PATTERNS[this.pattern];
        if (extra) extra(this, dt);
        else this.endPattern();
      }
    }
  }

  endPattern(): void {
    this.state = 'recover';
    this.stateTime = this.phase2 ? 0.5 : 0.9;
    this.attackTimer = this.def.attackCd * (this.phase2 ? 0.7 : 1);
    const tint = this.elite ? 0xffb070 : this.look.tint;
    if (tint !== undefined) this.sprite.setTint(tint);
    else this.sprite.clearTint();
  }
}
