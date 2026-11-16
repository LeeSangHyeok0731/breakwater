// 전투의 투사체: 만들고, 움직이고, 맞히고, 터뜨린다.

import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { afterglow, flutter, hues, impactBurst, PAL, wisps, type Palette3 } from '../vfx';
import { toneOf } from '../tone';
import { DEPTH } from '../fx';
import { orbKey, type OrbLook, type Palette } from '../fxArt';
import type { Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import type { BattleScene } from '../battleScene';

export interface BoltSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  kind: 'orb' | 'arrow' | 'wave' | 'grenade';
  /** 마나 구체의 색 계열 (지팡이마다 다르다). 비우면 청록 */
  orb?: OrbLook;
  size?: number;
  color?: number;
  basic?: boolean;
  pierce?: boolean;
  aoe?: number;
  stun?: number;
  gravity?: number;
  life?: number;
  /** 피해 출처 (스킬 id·'basic'·'special'). 비우면 쏜 순간의 출처를 쓴다. */
  src?: string;
  /**
   * 눈에 보이는 출발점 (무기 끝). 판정은 (x, y)의 몸 높이 선을 그대로 따라가고,
   * 그림만 여기서 출발해 잠깐 사이에 판정 선으로 내려앉는다.
   */
  from?: { x: number; y: number };
}

/** 무기 끝에서 나간 투사체 그림이 판정 선에 내려앉기까지의 시간 (초) */
const BOLT_SETTLE = 0.28;

type BoltObject = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

interface Bolt extends BoltSpec {
  obj: BoltObject;
  /** 화살 뒤에 끌리는 빛 */
  trail?: Phaser.GameObjects.Sprite;
  /** 다음 꼬리·잔상까지 남은 시간 */
  fxTimer: number;
  radius: number;
  hit: Set<Monster>;
  life: number;
  /** 쏜 뒤 지난 시간 */
  age: number;
  /** 출발할 때 그림이 판정 선보다 얼마나 위(-)·아래(+)에 있었는지 */
  offY: number;
  /** 지금 그림의 세로 어긋남 */
  lift: number;
}

/** 적 탄의 생김새·성질 */
export interface EnemyBoltOpts {
  /** 생김새: 마력탄(기본), 서리, 도깨비불, 깃털 */
  kind?: 'orb' | 'frost' | 'wisp' | 'feather' | 'void';
  /** 깃털·기본 구슬 탄의 색 (밤의 여왕·공허 천사·뇌운 새끼용) */
  tint?: number;
  /** 맞으면 플레이어가 잠깐 느려진다 */
  slow?: boolean;
  /** 플레이어 쪽으로 꺾는 정도 (rad/s) */
  homing?: number;
  life?: number;
}

interface EnemyBolt {
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  aoe: number;
  owner: Monster;
  life: number;
  opts: EnemyBoltOpts;
}

/** 적 탄 생김새별 꼬리 색 */
const ENEMY_BOLT_COLOR: Record<NonNullable<EnemyBoltOpts['kind']>, number> = {
  orb: 0xff4fd0,
  frost: 0x8fe0ff,
  wisp: 0x9fffb0,
  feather: 0xfff4e0,
  void: 0x7ff0ff,
};

/** 마나 구체 색 계열별 [꼬리·타격 색, 밝은 색, 폭발 팔레트] */
export const ORB_FX: Record<OrbLook, { color: number; light: number; boom: Palette }> = {
  arcane: { color: 0x7fe8ff, light: 0xbff6ff, boom: 'arcane' },
  rune: { color: 0xb884ff, light: 0xecd0ff, boom: 'dark' },
  magma: { color: 0xff8a2a, light: 0xffe6a0, boom: 'fire' },
  abyss: { color: 0xd060ff, light: 0xf0a8ff, boom: 'dark' },
};

/** 폭발 팔레트별 [고리 색, 파편 색, 벡터 팔레트, 연기 색] */
const BOOM_FX: Partial<Record<Palette, [number, number, Palette3, number]>> = {
  arcane: [0x7fe8ff, 0xbff6ff, PAL.arcane, 0x6a7aa8],
  dark: [0xc080ff, 0xe8c8ff, PAL.violet, 0x6a5a88],
};
const BOOM_FIRE: [number, number, Palette3, number] = [0xffa040, 0xffc060, PAL.flame, 0x7a706a];

/** 날아다니는 것들: 플레이어의 투사체와 적의 탄. 전투마다 새로 만든다. */
export class Projectiles {
  private bolts: Bolt[] = [];
  private enemyBolts: EnemyBolt[] = [];

  constructor(private readonly b: BattleScene) {}

  update(dt: number): void {
    this.updateBolts(dt);
    this.updateEnemyBolts(dt);
  }

  /** 플레이어의 투사체 (마력구·화살·검기·수류탄) */
  spawnPlayer(o: BoltSpec): void {
    const size = o.size ?? 1;
    const ang = Math.atan2(o.vy, o.vx);
    const offY = o.from ? o.from.y - o.y : 0;
    // 그림과 발사 연출은 무기 끝에서 시작한다.
    const logical = o;
    if (o.from) o = { ...o, y: o.from.y };
    let obj: BoltObject;
    let radius = 6;
    let trail: Phaser.GameObjects.Sprite | undefined;
    switch (o.kind) {
      case 'orb':
        // 마나 구체: 지팡이 끝에 작은 마법진이 열리며 나간다.
        obj = this.b.add
          .sprite(o.x, o.y, orbKey(o.orb))
          .play(orbKey(o.orb))
          .setScale(Math.max(1, Math.round(size)) * 0.8)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.b.fx.circle(o.x, o.y, ORB_FX[o.orb ?? 'arcane'].color, 16 + 12 * size, 260, true, DEPTH.fx);
        this.b.fx.pop(o.x, o.y, ORB_FX[o.orb ?? 'arcane'].light, 0.5 + 0.35 * size, 0.5);
        radius = 5 * size;
        break;
      case 'arrow':
        obj = this.b.add.image(o.x, o.y, 'fx-arrow').setRotation(ang).setScale(size >= 1.5 ? 2 : 1);
        // 화살 뒤로 끌리는 혜성 꼬리
        trail = this.b.add
          .sprite(o.x, o.y, 'fx-comet')
          .play({ key: 'fx-comet', startFrame: Math.floor(Math.random() * 3) })
          .setOrigin(1, 0.5)
          .setTint(toneOf(o.color ?? 0xe8dcc0).rim, o.color ?? 0xe8dcc0, toneOf(o.color ?? 0xe8dcc0).rim, o.color ?? 0xe8dcc0)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setRotation(ang)
          .setScale((22 + 16 * size) / 40, size >= 1.5 ? 2 : 1)
          .setDepth(DEPTH.projectile - 1);
        radius = 4 * size;
        break;
      case 'wave':
        obj = this.b.add
          .sprite(o.x, o.y, o.color !== undefined ? 'fx-wave-g' : 'fx-wave')
          .play(o.color !== undefined ? 'fx-wave-g' : 'fx-wave')
          .setFlipX(o.vx < 0)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(size);
        // 검기는 위아래 색이 다르다: 칼끝 쪽은 밝고 꼬리 쪽은 테두리 색으로 흐른다.
        if (o.color !== undefined) {
          const t = toneOf(o.color);
          obj.setTint(t.alt, o.color, o.color, t.rim);
        }
        radius = 14 * size;
        break;
      case 'grenade':
        obj = this.b.add.image(o.x, o.y, 'fx-grenade');
        radius = 4;
        break;
    }
    obj.setDepth(DEPTH.projectile);
    this.bolts.push({ ...logical, src: o.src ?? this.b.src, obj, trail, fxTimer: 0, radius, hit: new Set(), life: o.life ?? 1.6, age: 0, offY, lift: offY });
  }

  /** 날아가는 동안의 꼬리·잔상 */
  private boltTrail(b: Bolt, dt: number): void {
    b.fxTimer -= dt;
    if (b.trail) b.trail.setPosition(b.obj.x, b.obj.y).setRotation(b.obj.rotation);
    if (b.fxTimer > 0) return;
    switch (b.kind) {
      case 'orb': {
        // 구체가 지나간 자리에 옅은 잔상이 줄지어 남고, 가끔 별빛이 튄다.
        b.fxTimer = 0.035;
        const s = b.obj as Phaser.GameObjects.Sprite;
        const look = ORB_FX[b.orb ?? 'arcane'];
        const ghost = this.b.add
          .image(b.x, b.y, s.texture.key, s.frame.name)
          .setDepth(DEPTH.projectile - 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(s.scaleX * 0.85)
          .setAlpha(0.45);
        this.b.tweens.add({ targets: ghost, alpha: 0, scale: s.scaleX * 0.3, duration: 200, onComplete: () => ghost.destroy() });
        if (Math.random() < 0.35) this.b.fx.twinkle(b.x + (Math.random() - 0.5) * 10, b.y + (Math.random() - 0.5) * 12, look.light);
        else this.b.fx.burst(b.x, b.y, look.color, 1, 25, 260);
        break;
      }
      case 'arrow':
        b.fxTimer = 0.05;
        if ((b.size ?? 1) >= 1.5 || b.pierce) {
          if (Math.random() < 0.5) this.b.fx.twinkle(b.x - b.vx * 0.03, b.obj.y + (Math.random() - 0.5) * 8, b.color ?? 0xffe08a);
          else this.b.fx.burst(b.x, b.obj.y, b.color ?? 0xffe08a, 1, 20, 220);
        }
        break;
      case 'wave': {
        b.fxTimer = 0.035;
        const s = b.obj as Phaser.GameObjects.Sprite;
        const ghost = this.b.add
          .image(b.x, b.y, s.texture.key, s.frame.name)
          .setFlipX(s.flipX)
          .setDepth(DEPTH.projectile - 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(s.scaleX, s.scaleY)
          .setTint(s.tintTopLeft, s.tintTopRight, s.tintBottomLeft, s.tintBottomRight)
          .setAlpha(0.5);
        this.b.tweens.add({ targets: ghost, alpha: 0, scaleY: s.scaleY * 0.7, duration: 180, onComplete: () => ghost.destroy() });
        break;
      }
      case 'grenade':
        b.fxTimer = 0.05;
        this.b.fx.smoke(b.x, b.y, 1, 0x9a948a, -6);
        break;
    }
  }

  private removeBolt(b: Bolt): void {
    b.obj.destroy();
    b.trail?.destroy();
  }

  private updateBolts(dt: number): void {
    const W = this.b.level.width;
    this.bolts = this.bolts.filter((b) => {
      // 맞은 피해는 이 탄을 쏜 출처로 친다.
      this.b.src = b.src ?? 'basic';
      b.life -= dt;
      b.vy += (b.gravity ?? 0) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // 무기 끝에서 나간 그림은 부드럽게 판정 선으로 내려앉는다 (판정은 처음부터 몸 높이 선).
      b.age += dt;
      const k = Math.max(0, 1 - b.age / BOLT_SETTLE);
      const lift = b.offY * k * k * (3 - 2 * k);
      const sink = dt > 0 ? (lift - b.lift) / dt : 0;
      b.lift = lift;
      b.obj.setPosition(b.x, b.y + lift);
      if (b.kind === 'arrow') b.obj.setRotation(Math.atan2(b.vy + sink, b.vx));
      if (b.kind === 'grenade') b.obj.setRotation(b.obj.rotation + dt * 14 * Math.sign(b.vx || 1));
      this.boltTrail(b, dt);
      let alive = b.life > 0 && b.x > -40 && b.x < W + 40;
      if (alive) {
        for (const m of this.b.monsters) {
          if (!m.alive || b.hit.has(m)) continue;
          const mb = m.body;
          if (b.x + b.radius < mb.x || b.x - b.radius > mb.right || b.y + b.radius < mb.y || b.y - b.radius > mb.bottom) continue;
          if (b.pierce) {
            b.hit.add(m);
            this.b.hitMonster(m, b.damage, { basic: b.basic, knock: 40 });
            continue;
          }
          const back = Math.atan2(-b.vy, -b.vx);
          if (b.aoe) this.explode(b.x, b.y, b.aoe, b.damage, b.stun ?? 0, b.kind === 'orb' ? ORB_FX[b.orb ?? 'arcane'].boom : 'fire');
          else {
            this.b.hitMonster(m, b.damage, { basic: b.basic, knock: 70 });
            if (b.kind === 'orb') {
              const look = ORB_FX[b.orb ?? 'arcane'];
              this.b.fx.boom(b.x, b.y, 12 * (b.size ?? 1), look.boom);
              this.b.fx.pop(b.x, b.y, look.light, 0.9 + 0.3 * (b.size ?? 1));
              this.b.fx.sparks(b.x, b.y, look.color, 5, 0, Math.PI, 150, 320, 120);
            } else if (b.kind === 'arrow') {
              // 박히는 순간 뒤로 튀는 파편
              this.b.fx.sparks(b.x, b.obj.y, b.color ?? 0xe8dcc0, 4, back, 0.8, 170, 240);
            }
          }
          alive = false;
          break;
        }
      }
      if (alive && b.y >= FLOOR_Y - 2) {
        if (b.aoe) this.explode(b.x, FLOOR_Y - 6, b.aoe, b.damage, b.stun ?? 0, b.kind === 'orb' ? ORB_FX[b.orb ?? 'arcane'].boom : 'fire');
        else this.b.fx.spark(b.x, FLOOR_Y - 3, 0xd8c8a0);
        alive = false;
      }
      if (!alive) this.removeBolt(b);
      return alive;
    });
  }

  private explode(x: number, y: number, radius: number, damage: number, stun: number, palette: Palette = 'fire'): void {
    sfx.play('boom', Math.min(1, radius / 60));
    const ground = Math.min(y + 8, FLOOR_Y);
    const [ringColor, bitColor, pal3, smokeColor] = BOOM_FX[palette] ?? BOOM_FIRE;
    this.b.fx.boom(x, y, radius * 0.6, palette);
    this.b.fx.ring(x, ground, radius, ringColor);
    impactBurst(this.b, x, y, radius * 0.9, pal3, ground);
    this.b.fx.burst(x, y, bitColor, 8, 160, 450, 1, 300);
    this.b.fx.sparks(x, y, bitColor, 8, -Math.PI / 2, 1.4, 220, 420, 420);
    // 큰 폭발은 결이 말려 오르고 잔불이 남는다.
    if (radius >= 40) {
      wisps(this.b, x, y, pal3, 6, radius * 1.3, 480, { angle: -Math.PI / 2, cone: 1.5, curl: 2.6, width: 6 });
      flutter(this.b, x, y, palette === 'frost' ? 'snow' : palette === 'fire' ? 'flame' : 'star', hues(pal3), 12, { spread: radius * 0.3, speed: radius * 2.6, cone: 1.3, gravity: 140, life: 800 });
      afterglow(this.b, x, ground, radius * 2, pal3, palette === 'frost' ? 'snow' : palette === 'fire' ? 'flame' : 'star', 900);
    }
    for (let i = 0; i < 3; i++) this.b.time.delayedCall(120 + i * 60, () => this.b.fx.smoke(x + (i - 1) * radius * 0.4, y - 4, 2, smokeColor));
    this.b.fx.shake(0.5);
    this.b.hitArea(x - radius, y - radius, radius * 2, radius * 2, damage, { stun, knock: 90 });
  }

  /** 적의 탄. aoe가 있으면 땅에 닿아 터지는 불덩이다. */
  spawnEnemy(x: number, y: number, vx: number, vy: number, damage: number, owner: Monster, aoe = 0, opts: EnemyBoltOpts = {}): void {
    let obj: EnemyBolt['obj'];
    if (aoe > 0) {
      obj = this.b.add.sprite(x, y, 'fireball').play('fireball');
      obj.setFlipX(vx < 0);
    } else if (opts.kind === 'frost') {
      obj = this.b.add.sprite(x, y, 'fx-orb').play('fx-orb').setScale(0.75).setBlendMode(Phaser.BlendModes.ADD);
    } else if (opts.kind === 'wisp') {
      obj = this.b.add.sprite(x, y, 'fx-flame').play('fx-flame').setTint(0x9fffb0).setScale(0.8).setBlendMode(Phaser.BlendModes.ADD);
    } else if (opts.kind === 'feather') {
      obj = this.b.add.image(x, y, 'fx-feather').setRotation(Math.atan2(vy, vx));
      if (opts.tint !== undefined) obj.setTint(opts.tint);
    } else if (opts.kind === 'void') {
      obj = this.b.add.sprite(x, y, 'fx-orb-enemy').play('fx-orb-enemy').setTint(0x80d0ff).setBlendMode(Phaser.BlendModes.ADD);
    } else {
      obj = this.b.add.sprite(x, y, 'fx-orb-enemy').play('fx-orb-enemy').setBlendMode(Phaser.BlendModes.ADD);
      if (opts.tint !== undefined) obj.setTint(opts.tint);
    }
    obj.setDepth(DEPTH.projectile);
    this.enemyBolts.push({ obj, x, y, vx, vy, damage, aoe, owner, life: opts.life ?? 4, opts });
  }

  private updateEnemyBolts(dt: number): void {
    const p = this.b.player;
    const pb = p.body;
    this.enemyBolts = this.enemyBolts.filter((b) => {
      b.life -= dt;
      if (b.opts.homing) {
        // 플레이어 쪽으로 조금씩 꺾는다 (속도는 그대로).
        const speed = Math.hypot(b.vx, b.vy);
        const cur = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(p.y - b.y, p.x - b.x);
        const diff = Phaser.Math.Angle.Wrap(want - cur);
        const ang = cur + Phaser.Math.Clamp(diff, -b.opts.homing * dt, b.opts.homing * dt);
        b.vx = Math.cos(ang) * speed;
        b.vy = Math.sin(ang) * speed;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.obj.setPosition(b.x, b.y);
      if (b.opts.kind === 'feather') b.obj.setRotation(Math.atan2(b.vy, b.vx));
      if (Math.random() < 0.4) this.b.fx.burst(b.x, b.y, b.aoe > 0 ? 0xff8a3a : ENEMY_BOLT_COLOR[b.opts.kind ?? 'orb'], 1, 15, 220);
      let alive = b.life > 0;
      const hit = b.x > pb.x - 4 && b.x < pb.right + 4 && b.y > pb.y - 4 && b.y < pb.bottom + 4;
      if (alive && hit && p.invuln <= 0) {
        this.b.damagePlayer(b.damage, { x: b.x, monster: b.owner, melee: false });
        if (b.opts.slow && !p.dead) {
          p.slowTime = 2;
          this.b.fx.text(p.x, p.body.top - 4, '둔화', 'info');
        }
        this.enemyBurst(b);
        alive = false;
      }
      if (alive && b.y >= FLOOR_Y) {
        if (b.aoe > 0) {
          this.enemyBurst(b);
          if (Math.abs(p.x - b.x) < b.aoe && p.grounded && !p.onPlatform) this.b.damagePlayer(b.damage, { x: b.x, monster: b.owner, melee: false });
        }
        alive = false;
      }
      if (!alive) b.obj.destroy();
      return alive;
    });
  }

  private enemyBurst(b: EnemyBolt): void {
    if (b.aoe > 0) {
      sfx.play('boom', 0.5);
      this.b.fx.boom(b.x, Math.min(b.y, FLOOR_Y - 8), b.aoe * 0.5, 'fire');
      this.b.fx.ring(b.x, Math.min(b.y + 6, FLOOR_Y), b.aoe, 0xff6a1a, 250);
    } else {
      const c = ENEMY_BOLT_COLOR[b.opts.kind ?? 'orb'];
      this.b.fx.spark(b.x, b.y, c);
      this.b.fx.burst(b.x, b.y, c, 5, 70, 250);
    }
  }
}
