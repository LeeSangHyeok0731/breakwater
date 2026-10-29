import Phaser from 'phaser';
import { SLOT_ACTIONS, keyLabel, type Input } from '../core/input';
import { sfx } from '../core/audio';
import type { SaveData } from '../core/save';
import { gearBonus, POTION_LIMIT_PER_PHASE } from '../data/gear';
import { MATERIALS } from '../data/items';
import { ELITE_MOD, type MonsterKind } from '../data/monsters';
import type { PhaseDef } from '../data/phases';
import { SKILLS, type SkillDef } from '../data/skills';
import { GRADES, WEAPONS, type WeaponType } from '../data/weapons';
import { Hud, type HudSlot, type HudState } from '../ui/hud';
import { updatePlayerCombat } from './combat2d';
import { ctx, type BattleOutcome } from './context';
import { DEPTH, Fx } from './fx';
import { Monster } from './monster2d';
import { Player } from './player2d';
import { CRIT_DAMAGE, basicDamage, derive, enhanceMultiplier, expToNext, totalStats, type Stats } from './stats';
import { buildLevel, FLOOR_Y, VIEW_H, type Level } from './world';

export interface HitOpts {
  basic?: boolean;
  stun?: number;
  vuln?: [number, number];
  /** [감속 비율, 지속 시간] */
  slow?: [number, number];
  /** 넉백 세기 (px/s) */
  knock?: number;
  quiet?: boolean;
  /** 피해 없이 디버프만 건다 */
  noDamage?: boolean;
}

export interface BoltSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  kind: 'orb' | 'arrow' | 'wave' | 'grenade';
  size?: number;
  color?: number;
  basic?: boolean;
  pierce?: boolean;
  aoe?: number;
  stun?: number;
  gravity?: number;
  life?: number;
}

type BoltObject = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Ellipse | Phaser.GameObjects.Arc;

interface Bolt extends BoltSpec {
  obj: BoltObject;
  radius: number;
  hit: Set<Monster>;
  life: number;
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
}

export interface FieldSpec {
  x: number;
  w: number;
  life: number;
  tickEvery: number;
  damage: number;
  slow?: number;
  color: number;
  hitsAir?: boolean;
  rain?: boolean;
}

interface Field extends FieldSpec {
  rect: Phaser.GameObjects.Rectangle;
  tickTimer: number;
  age: number;
}

interface Telegraph {
  rect: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  time: number;
  dur: number;
  owner: Monster | null;
  onFire: (() => void) | null;
}

interface Wave {
  obj: Phaser.GameObjects.Rectangle;
  x: number;
  dir: 1 | -1;
  dist: number;
  damage: number;
  owner: Monster;
  hit: boolean;
}

type State = 'intro' | 'fight' | 'rest' | 'done';

/** 장착 무기의 스킬 슬롯: 배운 스킬을 목록 순서대로 최대 8개 채운다. */
export function buildSlots(save: SaveData, type: WeaponType): (SkillDef | null)[] {
  const learned = SKILLS.filter((s) => s.weapon === type && save.learnedSkills.includes(s.id)).slice(0, 8);
  const slots: (SkillDef | null)[] = [...learned];
  while (slots.length < 8) slots.push(null);
  return slots;
}

export class BattleScene extends Phaser.Scene {
  phase!: PhaseDef;
  save!: SaveData;
  keys!: Input;
  hud!: Hud;
  fx!: Fx;
  level!: Level;
  player!: Player;
  stats!: Stats;
  monsters: Monster[] = [];

  private monsterGroup!: Phaser.Physics.Arcade.Group;
  private bolts: Bolt[] = [];
  private enemyBolts: EnemyBolt[] = [];
  private fields: Field[] = [];
  private telegraphs: Telegraph[] = [];
  private waves: Wave[] = [];
  private beam!: Phaser.GameObjects.Rectangle;
  private beamGlow!: Phaser.GameObjects.Rectangle;

  private state: State = 'intro';
  private stateTimer = 1.6;
  private waveIndex = -1;
  private spawnQueue: { kind: MonsterKind; elite: boolean }[] = [];
  private spawnTimer = 0;
  private boss: Monster | null = null;
  private pending = { gold: 0, exp: 0, materials: {} as Record<string, number>, kills: 0 };
  private endTimer = -1;
  private cleared = false;
  private ended = false;
  private paused = false;
  private missionTime = 0;
  private spawnAcc = 0;
  private potionUsed = { hp: 0, mp: 0 };
  private potionCd = 0;

  constructor() {
    super('battle');
  }

  init(data: { phase: PhaseDef }): void {
    this.phase = data.phase;
    this.monsters = [];
    this.bolts = [];
    this.enemyBolts = [];
    this.fields = [];
    this.telegraphs = [];
    this.waves = [];
    this.state = 'intro';
    this.stateTimer = 1.6;
    this.waveIndex = -1;
    this.spawnQueue = [];
    this.boss = null;
    this.pending = { gold: 0, exp: 0, materials: {}, kills: 0 };
    this.endTimer = -1;
    this.cleared = false;
    this.ended = false;
    this.paused = false;
    this.missionTime = 0;
    this.spawnAcc = 0;
    this.potionUsed = { hp: 0, mp: 0 };
  }

  create(): void {
    this.save = ctx.getSave();
    this.keys = ctx.input;
    this.fx = new Fx(this);
    const phase = this.phase;
    this.level = buildLevel(this, phase.width, phase.platforms, phase.theme, phase.id.charCodeAt(2) * 31);
    this.physics.world.setBounds(0, -200, phase.width, VIEW_H + 400);

    this.stats = totalStats(this.save);
    const weapons = this.save.equipped.map((uid) => {
      const owned = this.save.weapons.find((w) => w.uid === uid) ?? this.save.weapons[0];
      const def = WEAPONS[owned.defId];
      return { def, enhance: owned.enhance, slots: buildSlots(this.save, def.type) };
    });
    this.player = new Player(this, 80, FLOOR_Y - 40, derive(this.stats, this.save.passives, gearBonus(this.save.gear.equipped)), weapons);

    // 발판: 위에서 떨어질 때만 밟는다. ↓+점프 중에는 통과.
    const onTop = (body: Phaser.Physics.Arcade.Body, plat: Phaser.Physics.Arcade.StaticBody): boolean =>
      body.velocity.y >= 0 && body.bottom <= plat.top + 8;
    this.physics.add.collider(this.player.zone, this.level.solids);
    this.physics.add.collider(this.player.zone, this.level.platforms, undefined, (_p, plat) => {
      const pb = this.player.body;
      return this.player.dropTimer <= 0 && onTop(pb, (plat as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody);
    });
    this.monsterGroup = this.physics.add.group();
    this.physics.add.collider(this.monsterGroup, this.level.solids);
    this.physics.add.collider(this.monsterGroup, this.level.platforms, undefined, (m, plat) =>
      onTop((m as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.Body, (plat as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody),
    );

    const cam = this.cameras.main;
    cam.setBounds(0, 0, phase.width, VIEW_H);
    cam.startFollow(this.player.zone, true, 0.12, 0.12, 0, 40);
    cam.setDeadzone(60, 40);
    cam.fadeIn(300);

    this.beamGlow = this.add.rectangle(0, 0, 10, 14, 0x3fc8ff, 0.35).setOrigin(0, 0.5).setDepth(DEPTH.projectile).setVisible(false);
    this.beam = this.add.rectangle(0, 0, 10, 5, 0xe6fbff, 0.95).setOrigin(0, 0.5).setDepth(DEPTH.projectile).setVisible(false);
    this.beam.setBlendMode(Phaser.BlendModes.ADD);
    this.beamGlow.setBlendMode(Phaser.BlendModes.ADD);

    this.hud = new Hud(ctx.uiRoot);
    ctx.townHud.hide();
    this.events.once('shutdown', () => this.cleanup());
    this.announce(`${phase.id} ${phase.name}`, 1.6);
  }

  private cleanup(): void {
    this.hud.destroy();
    for (const m of this.monsters) m.destroy();
    this.player.destroy();
  }

  // ───────────────────────── 루프 ─────────────────────────

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const input = this.keys;
    if (this.ended) {
      input.endFrame();
      return;
    }
    if (input.pressed('menu')) this.togglePause();
    if (this.paused) {
      input.endFrame();
      return;
    }
    // 히트스톱: 아주 잠깐 모든 것을 멈춘다.
    if (this.fx.hitstop > 0) {
      this.fx.hitstop -= dt;
      if (!this.physics.world.isPaused) this.physics.pause();
      input.endFrame();
      return;
    }
    if (this.physics.world.isPaused) this.physics.resume();

    const p = this.player;
    p.updateTimers(dt);
    p.onPlatform = p.grounded && p.feet < FLOOR_Y - 4;
    updatePlayerCombat(this, dt);
    this.usePotions(dt);
    p.updateMovement(dt, input);
    p.animate();

    this.updateWaves(dt);
    for (const m of this.monsters) m.update(dt);
    this.monsters = this.monsters.filter((m) => {
      if (m.removable) {
        m.destroy();
        return false;
      }
      return true;
    });

    this.updateBolts(dt);
    this.updateEnemyBolts(dt);
    this.updateFields(dt);
    this.updateTelegraphs(dt);
    this.updateWavesFx(dt);
    this.updateBeam();
    this.level.update();
    this.hud.update(this.hudState());

    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer < 0) this.finish();
    }
    input.endFrame();
  }

  private togglePause(): void {
    if (this.paused) {
      this.paused = false;
      this.hud.hidePause();
      this.physics.resume();
      this.anims.resumeAll();
      return;
    }
    this.paused = true;
    this.physics.pause();
    this.anims.pauseAll();
    this.hud.showPause(
      () => this.togglePause(),
      () => this.giveUp(),
    );
  }

  // ───────────────────────── 피해 ─────────────────────────

  weaponBase(): number {
    const w = this.player.weapon;
    return basicDamage(w.def, w.enhance, this.stats);
  }

  /** 스킬 피해 = Σ(스탯 × 계수) × 무기 강화 배율 */
  skillBase(coef: Partial<Stats>): number {
    const s = this.stats;
    const sum = (coef.str ?? 0) * s.str + (coef.dex ?? 0) * s.dex + (coef.int ?? 0) * s.int + (coef.hp ?? 0) * s.hp;
    const w = this.player.weapon;
    return sum * enhanceMultiplier(w.def.type, w.enhance);
  }

  hitMonster(m: Monster, base: number, opts: HitOpts = {}): void {
    if (!m.alive || m.spawnTime > 0.3) return;
    const p = this.player;
    if (opts.stun && !m.boss) m.stun = Math.max(m.stun, m.elite || m.def.miniboss ? opts.stun * 0.5 : opts.stun);
    if (opts.vuln) {
      m.vuln = Math.max(m.vuln, opts.vuln[0]);
      m.vulnTime = opts.vuln[1];
    }
    if (opts.slow) {
      m.slowMul = Math.min(m.slowMul, 1 - opts.slow[0]);
      m.slowTime = Math.max(m.slowTime, opts.slow[1]);
    }
    if (opts.noDamage) {
      this.fx.burst(m.x, m.y, 0xb04aff, 6, 50, 400);
      return;
    }
    const w = p.weapon.def;
    const critChance = w.critChance + p.derived.passive.critBonus;
    let crit = false;
    let critMul: number;
    if (w.type === 'gun') {
      // 총: 치명타 대신 (치명타 데미지 + 치명타 확률)의 80%만큼 항상 증가
      critMul = 1 + (CRIT_DAMAGE + critChance) * 0.8;
    } else {
      crit = Math.random() < critChance;
      critMul = crit ? 1 + CRIT_DAMAGE : 1;
    }
    const dmg = Math.max(1, Math.round(base * p.damageMul * (1 + m.vuln) * critMul));
    m.hp -= dmg;
    m.onHit(p.x, opts.knock ?? 0);
    if (opts.basic) p.mp = Math.min(p.derived.maxMp, p.mp + 2);

    this.fx.text(m.x, m.body.top - 2, String(dmg), crit ? 'crit' : opts.quiet ? 'quiet' : 'normal');
    if (!opts.quiet) {
      this.fx.burst(m.x, m.y, crit ? 0xffc040 : 0xffffff, crit ? 10 : 5, 100, 300);
      sfx.play(crit ? 'crit' : 'hit');
      // 근접 타격은 아주 잠깐 멈춰 묵직하게
      if (p.isMelee && (opts.basic || opts.knock)) this.fx.stop(crit ? 0.07 : 0.035);
      if (crit) this.fx.shake(0.4, 80);
    } else sfx.play('hit', 0.35);

    if (m.hp <= 0) this.killMonster(m);
  }

  /** 사각형 범위 안의 적을 모두 때린다. 맞은 수를 돌려준다. */
  hitArea(x: number, y: number, w: number, h: number, damage: number, opts: HitOpts = {}): number {
    const rect = new Phaser.Geom.Rectangle(x, y, w, h);
    let n = 0;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const b = m.body;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) continue;
      this.hitMonster(m, damage, opts);
      n++;
    }
    return n;
  }

  /** 총알·저격·레이저처럼 즉시 판정하는 선 */
  hitscan(x: number, y: number, angle: number, len: number, damage: number, o: { pierce: boolean; color: number; width: number; quiet?: boolean }): void {
    const line = new Phaser.Geom.Line(x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    const hits: { m: Monster; d: number }[] = [];
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const b = m.body;
      if (Phaser.Geom.Intersects.LineToRectangle(line, new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) {
        hits.push({ m, d: Math.hypot(m.x - x, m.y - y) });
      }
    }
    hits.sort((a, b) => a.d - b.d);
    const targets = o.pierce ? hits : hits.slice(0, 1);
    let end = len;
    if (!o.pierce && targets.length) end = targets[0].d;
    for (const h of targets) this.hitMonster(h.m, damage, { quiet: o.quiet, knock: o.pierce ? 30 : 50 });
    if (o.width > 0) {
      sfx.play('shot', o.width > 3 ? 1.3 : 0.8);
      const ex = x + Math.cos(angle) * end;
      const ey = y + Math.sin(angle) * end;
      const g = this.add.line(0, 0, x, y, ex, ey, o.color).setOrigin(0, 0).setLineWidth(o.width).setDepth(DEPTH.projectile);
      g.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: g, alpha: 0, duration: 90, onComplete: () => g.destroy() });
    }
  }

  private killMonster(m: Monster): void {
    m.kill();
    sfx.play(m.showsBossBar ? 'boom' : 'kill');
    const p = this.player;
    const mul = m.elite ? ELITE_MOD.reward : 1;
    this.pending.gold += m.def.gold * mul;
    this.pending.exp += m.def.exp * mul;
    this.pending.kills++;
    p.mp = Math.min(p.derived.maxMp, p.mp + m.def.mana * (m.elite ? 5 : 1));
    for (const d of m.def.drops) {
      if (Math.random() < (m.elite ? Math.min(1, d.chance * 2) : d.chance)) this.addMaterial(d.id, m.elite ? 2 : 1, m.x, m.body.top);
    }
    if (m.elite) this.addMaterial('elite_sigil', 1, m.x, m.body.top);
    if (m.def.kind === 'poison_zombie') this.addField({ x: m.x - 34, w: 68, life: 4, tickEvery: 0.5, damage: 0, color: 0x8acc2a, poison: true } as FieldSpec & { poison: boolean });
    if (m.showsBossBar) this.fx.shake(2, 300);
    if (m === this.boss) {
      for (const other of this.monsters) if (other.alive && other !== m) other.kill();
      this.clear();
    }
  }

  private addMaterial(id: string, count: number, x: number, y: number): void {
    this.pending.materials[id] = (this.pending.materials[id] ?? 0) + count;
    this.fx.text(x, y - 12, `+${MATERIALS[id]?.name ?? id}`, 'info');
  }

  damagePlayer(amount: number, src: { x: number; monster?: Monster; melee: boolean; unblockable?: boolean }): void {
    const p = this.player;
    if (p.dead || this.ended) return;
    const headY = p.body.top - 4;
    if (p.invuln > 0) {
      if (p.dodgeTime > 0) this.fx.text(p.x, headY, '회피', 'info');
      return;
    }
    if (p.guarding && !src.unblockable) {
      const front = (src.x - p.x) * p.facing >= -4;
      if (front) {
        if (p.parryTimer > 0) {
          this.fx.text(p.x, headY, '패링!', 'heal');
          this.fx.burst(p.x + p.facing * 12, p.y, 0xfff2a0, 12, 120, 300);
          this.fx.stop(0.08);
          sfx.play('parry');
          p.mp = Math.min(p.derived.maxMp, p.mp + 10 + p.derived.passive.parryMana);
          if (src.monster && src.melee && !src.monster.boss) src.monster.stun = Math.max(src.monster.stun, 1.5);
          return;
        }
        amount *= 0.3;
        this.fx.text(p.x, headY, '가드', 'info');
        this.fx.burst(p.x + p.facing * 12, p.y, 0xdddddd, 5, 70, 250);
        sfx.play('block');
        p.body.setVelocityX(-p.facing * 80);
      }
    }
    if (p.wardHits > 0) {
      p.wardHits--;
      if (p.wardHits === 0) p.wardTime = 0;
      this.fx.text(p.x, headY, '방어막', 'info');
      p.invuln = 0.3;
      return;
    }
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, amount);
      p.shield -= absorbed;
      amount -= absorbed;
      if (amount <= 0) {
        this.fx.text(p.x, headY, '보호막', 'info');
        return;
      }
    }
    const dmg = Math.max(1, Math.round(amount));
    p.hp -= dmg;
    p.hurtTimer = 0.35;
    // 맞으면 잠깐 무적이 되어 연속으로 맞지 않는다.
    p.invuln = 0.7;
    p.action = null;
    p.charge = -1;
    if (!p.guarding) p.knockback(src.x, 150);
    this.hud.hurt();
    this.fx.text(p.x, headY, `-${dmg}`, 'player');
    this.fx.shake(0.6, 120);
    sfx.play('hurt');
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      this.fail();
    }
  }

  /** 적의 범위 공격 (불 뿜기 등) */
  areaHit(x: number, y: number, w: number, h: number, damage: number, owner: Monster, unblockable: boolean): void {
    const pb = this.player.body;
    if (Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(x, y, w, h), new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height))) {
      this.damagePlayer(damage, { x: owner.x, monster: owner, melee: false, unblockable });
    }
  }

  /** 내려찍기: 땅에 서 있는 플레이어만 맞는다. */
  groundSlam(x: number, halfW: number, damage: number, owner: Monster): void {
    sfx.play('boom', 0.7);
    this.fx.ring(x, FLOOR_Y, halfW, 0xffa040);
    this.fx.burst(x, FLOOR_Y - 4, 0x9a8a70, 14, 120, 500);
    const p = this.player;
    if (Math.abs(p.x - x) <= halfW + 8 && p.grounded && !p.onPlatform) {
      this.damagePlayer(damage, { x: owner.x, monster: owner, melee: true });
    }
  }

  // ───────────────────────── 스폰·웨이브 ─────────────────────────

  floorY(): number {
    return FLOOR_Y;
  }

  /** 몬스터가 서 있는 바닥 (발판이면 그 발판, 아니면 땅 전체) */
  surfaceUnder(m: Monster): { x: number; y: number; w: number } | null {
    const feet = m.body.bottom;
    for (const s of this.level.surfaces) {
      if (Math.abs(feet - s.y) < 6 && m.x >= s.x - 4 && m.x <= s.x + s.w + 4) return s;
    }
    return { x: 0, y: FLOOR_Y, w: this.level.width };
  }

  spawnMonster(kind: MonsterKind, elite: boolean, atX?: number): Monster {
    const W = this.level.width;
    const p = this.player;
    let x = atX ?? 0;
    let y = FLOOR_Y - 30;
    if (atX === undefined) {
      for (let tries = 0; tries < 12; tries++) {
        x = 40 + Math.random() * (W - 80);
        if (Math.abs(x - p.x) > 170) break;
      }
      // 일부는 발판 위에 나온다.
      const flying = kind === 'minion';
      if (!flying && kind !== 'golem_lord' && this.level.surfaces.length && Math.random() < 0.3) {
        const s = this.level.surfaces[Math.floor(Math.random() * this.level.surfaces.length)];
        x = s.x + 16 + Math.random() * (s.w - 32);
        y = s.y - 30;
      }
    }
    if (kind === 'minion') y = 140 + Math.random() * 60;
    if (kind === 'golem_lord') {
      x = atX ?? W - 180;
      y = 160;
    }
    x = Phaser.Math.Clamp(x, 30, W - 30);
    const m = new Monster(this, kind, elite, this.phase.hpMul, x, y);
    m.facing = p.x < x ? -1 : 1;
    this.monsters.push(m);
    this.monsterGroup.add(m.zone);
    // 그룹에 넣으면 중력 설정이 초기화되므로 다시 맞춘다.
    if (m.flying) m.body.setAllowGravity(false);
    m.body.setCollideWorldBounds(true);
    return m;
  }

  announce(text: string, duration?: number): void {
    this.hud.announce(text, duration);
  }

  private updateWaves(dt: number): void {
    if (this.state === 'done') return;
    this.stateTimer -= dt;
    if (this.phase.mission) {
      this.updateMission(dt);
      return;
    }
    if (this.state === 'intro' || this.state === 'rest') {
      if (this.stateTimer <= 0) this.startWave(this.waveIndex + 1);
      return;
    }
    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const next = this.spawnQueue.shift()!;
        const m = this.spawnMonster(next.kind, next.elite);
        if (m.boss) this.boss = m;
        this.spawnTimer = 0.35;
      }
      return;
    }
    if (this.boss) return;
    if (this.monsters.some((m) => m.alive)) return;
    if (this.waveIndex + 1 < this.phase.waves.length) {
      this.state = 'rest';
      this.stateTimer = 3;
      this.hud.notify('다음 웨이브까지 3초', 2);
    } else this.clear();
  }

  private startWave(index: number): void {
    this.waveIndex = index;
    this.state = 'fight';
    const queue: { kind: MonsterKind; elite: boolean }[] = [];
    for (const g of this.phase.waves[index]) {
      for (let i = 0; i < g.count; i++) queue.push({ kind: g.kind, elite: !!g.elite });
    }
    const normal = queue.filter((q) => !q.elite).sort(() => Math.random() - 0.5);
    this.spawnQueue = [...normal, ...queue.filter((q) => q.elite)];
    this.spawnTimer = 0.3;
    sfx.play('wave');
    if (this.phase.type === 'boss') this.announce('악마 군주', 2.5);
    else this.announce(index === this.phase.waves.length - 1 ? '마지막 웨이브' : `웨이브 ${index + 1}`);
  }

  /** 특별 스테이지: 시간이 지날수록 빨라지는 속도로 몬스터가 계속 나온다. */
  private updateMission(dt: number): void {
    const mission = this.phase.mission!;
    if (this.state === 'intro') {
      if (this.stateTimer > 0) return;
      this.state = 'fight';
      this.announce(mission.kind === 'survive' ? `${mission.seconds}초 동안 버텨라!` : `${mission.target}마리를 처치하라!`, 2.2);
      return;
    }
    this.missionTime += dt;
    const alive = this.monsters.filter((m) => m.alive).length;
    const interval = Math.max(0.5, 1.7 - this.missionTime * 0.012);
    if (alive < 18) {
      this.spawnAcc += dt;
      while (this.spawnAcc >= interval) {
        this.spawnAcc -= interval;
        const pool = this.phase.spawnPool ?? [];
        const total = pool.reduce((a, e) => a + e.weight, 0);
        let r = Math.random() * total;
        const pick = pool.find((e) => (r -= e.weight) <= 0) ?? pool[0];
        if (pick) this.spawnMonster(pick.kind, !!pick.elite);
      }
    }
    const done = mission.kind === 'survive' ? this.missionTime >= mission.seconds : this.pending.kills >= mission.target;
    if (done) {
      for (const m of this.monsters) if (m.alive) m.kill();
      this.clear();
    }
  }

  private clear(): void {
    if (this.cleared || this.player.dead) return;
    this.cleared = true;
    this.state = 'done';
    const r = this.phase.clearReward;
    this.pending.gold += r.gold;
    this.pending.exp += r.exp;
    for (const [id, n] of Object.entries(r.materials)) this.pending.materials[id] = (this.pending.materials[id] ?? 0) + n;
    this.announce('클리어!', 2.5);
    sfx.play('clear');
    this.endTimer = 2.5;
  }

  private fail(): void {
    if (this.cleared) return;
    this.state = 'done';
    this.announce('쓰러졌다...', 2.5);
    sfx.play('fail');
    this.endTimer = 2.5;
  }

  private giveUp(): void {
    if (this.ended) return;
    this.player.dead = true;
    this.state = 'done';
    this.paused = false;
    this.hud.hidePause();
    this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const cleared = this.cleared && !this.player.dead;
    const outcome: BattleOutcome = {
      cleared,
      phase: this.phase,
      gold: cleared ? this.pending.gold : 0,
      exp: cleared ? this.pending.exp : 0,
      materials: cleared ? this.pending.materials : {},
      sweepTickets: cleared ? this.phase.clearReward.sweepTickets : 0,
      kills: this.pending.kills,
    };
    ctx.onBattleEnd(outcome, this.hud, () => {
      this.cameras.main.fadeOut(250);
      this.time.delayedCall(260, () => this.scene.start('town'));
    });
  }

  // ───────────────────────── 포션 ─────────────────────────

  /** 포션은 세이브에서 바로 빠진다 (실패해도 돌려받지 않는다). */
  private usePotions(dt: number): void {
    this.potionCd = Math.max(0, this.potionCd - dt);
    const p = this.player;
    for (const [action, id] of [
      ['item1', 'hp'],
      ['item2', 'mp'],
    ] as const) {
      if (!this.keys.pressed(action) || p.dead || this.potionCd > 0) continue;
      const name = id === 'hp' ? '체력 포션' : '마나 포션';
      if (this.save.potions[id] <= 0) {
        this.hud.notify(`${name}이 없습니다`);
        continue;
      }
      if (this.potionUsed[id] >= POTION_LIMIT_PER_PHASE) {
        this.hud.notify(`이번 페이즈에서는 ${name}을 더 쓸 수 없습니다`);
        continue;
      }
      if (id === 'hp') {
        if (p.hp >= p.derived.maxHp) {
          this.hud.notify('HP가 가득 찼습니다');
          continue;
        }
        const heal = Math.round(p.derived.maxHp * 0.35);
        p.hp = Math.min(p.derived.maxHp, p.hp + heal);
        this.fx.text(p.x, p.body.top - 4, `+${heal}`, 'heal');
        this.fx.burst(p.x, p.y, 0x6aff8a, 12, 60, 600);
      } else {
        if (p.mp >= p.derived.maxMp) {
          this.hud.notify('마나가 가득 찼습니다');
          continue;
        }
        p.mp = Math.min(p.derived.maxMp, p.mp + 60);
        this.fx.text(p.x, p.body.top - 4, '+60 마나', 'info');
        this.fx.burst(p.x, p.y, 0x6ab8ff, 12, 60, 600);
      }
      sfx.play('potion');
      this.save.potions[id]--;
      this.potionUsed[id]++;
      this.potionCd = 0.8;
    }
  }

  // ───────────────────────── 투사체 ─────────────────────────

  spawnPlayerBolt(o: BoltSpec): void {
    const size = o.size ?? 1;
    let obj: BoltObject;
    let radius = 6;
    switch (o.kind) {
      case 'orb':
        obj = this.add.image(o.x, o.y, 'dot').setTint(0x7fe8ff).setScale(1.3 * size).setBlendMode(Phaser.BlendModes.ADD);
        radius = 5 * size;
        break;
      case 'arrow':
        obj = this.add.rectangle(o.x, o.y, 14 * size, 2 * size, o.color ?? 0xe8dcc0);
        obj.setRotation(Math.atan2(o.vy, o.vx));
        radius = 4 * size;
        break;
      case 'wave':
        obj = this.add.ellipse(o.x, o.y, 8, 30, 0x9fdcff, 0.85).setBlendMode(Phaser.BlendModes.ADD);
        radius = 14;
        break;
      case 'grenade':
        obj = this.add.circle(o.x, o.y, 3, 0x5a6a2a).setStrokeStyle(1, 0x2a3010);
        radius = 4;
        break;
    }
    obj.setDepth(DEPTH.projectile);
    this.bolts.push({ ...o, obj, radius, hit: new Set(), life: o.life ?? 1.6 });
  }

  private updateBolts(dt: number): void {
    const W = this.level.width;
    this.bolts = this.bolts.filter((b) => {
      b.life -= dt;
      b.vy += (b.gravity ?? 0) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.obj.setPosition(b.x, b.y);
      if (b.kind === 'arrow' || b.kind === 'grenade') b.obj.setRotation(Math.atan2(b.vy, b.vx));
      let alive = b.life > 0 && b.x > -40 && b.x < W + 40;
      if (alive) {
        for (const m of this.monsters) {
          if (!m.alive || b.hit.has(m)) continue;
          const mb = m.body;
          if (b.x + b.radius < mb.x || b.x - b.radius > mb.right || b.y + b.radius < mb.y || b.y - b.radius > mb.bottom) continue;
          if (b.pierce) {
            b.hit.add(m);
            this.hitMonster(m, b.damage, { basic: b.basic, knock: 40 });
            continue;
          }
          if (b.aoe) this.explode(b.x, b.y, b.aoe, b.damage, b.stun ?? 0);
          else this.hitMonster(m, b.damage, { basic: b.basic, knock: 70 });
          alive = false;
          break;
        }
      }
      if (alive && b.y >= FLOOR_Y - 2) {
        if (b.aoe) this.explode(b.x, FLOOR_Y - 6, b.aoe, b.damage, b.stun ?? 0);
        alive = false;
      }
      if (!alive) b.obj.destroy();
      return alive;
    });
  }

  private explode(x: number, y: number, radius: number, damage: number, stun: number): void {
    sfx.play('boom', Math.min(1, radius / 60));
    this.fx.ring(x, Math.min(y + 8, FLOOR_Y), radius, 0xffa040);
    this.fx.burst(x, y, 0xffb060, 16, 140, 450, 1.3);
    this.fx.shake(0.5);
    this.hitArea(x - radius, y - radius, radius * 2, radius * 2, damage, { stun, knock: 90 });
  }

  spawnEnemyBolt(x: number, y: number, vx: number, vy: number, damage: number, owner: Monster, aoe = 0): void {
    let obj: EnemyBolt['obj'];
    if (aoe > 0) {
      obj = this.add.sprite(x, y, 'fireball').play('fireball');
      obj.setFlipX(vx < 0);
    } else {
      obj = this.add.image(x, y, 'dot').setTint(0xff4fd0).setScale(1.1).setBlendMode(Phaser.BlendModes.ADD);
    }
    obj.setDepth(DEPTH.projectile);
    this.enemyBolts.push({ obj, x, y, vx, vy, damage, aoe, owner, life: 4 });
  }

  private updateEnemyBolts(dt: number): void {
    const p = this.player;
    const pb = p.body;
    this.enemyBolts = this.enemyBolts.filter((b) => {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.obj.setPosition(b.x, b.y);
      let alive = b.life > 0;
      const hit = b.x > pb.x - 4 && b.x < pb.right + 4 && b.y > pb.y - 4 && b.y < pb.bottom + 4;
      if (alive && hit && p.invuln <= 0) {
        this.damagePlayer(b.damage, { x: b.x, monster: b.owner, melee: false });
        this.enemyBurst(b);
        alive = false;
      }
      if (alive && b.y >= FLOOR_Y) {
        if (b.aoe > 0) {
          this.enemyBurst(b);
          if (Math.abs(p.x - b.x) < b.aoe && p.grounded && !p.onPlatform) this.damagePlayer(b.damage, { x: b.x, monster: b.owner, melee: false });
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
      this.fx.ring(b.x, Math.min(b.y + 6, FLOOR_Y), b.aoe, 0xff6a1a, 250);
      this.fx.burst(b.x, b.y, 0xff8a3a, 10, 100, 350);
    } else this.fx.burst(b.x, b.y, 0xff4fd0, 6, 70, 250);
  }

  // ───────────────────────── 장판·경고·충격파·메테오 ─────────────────────────

  addField(spec: FieldSpec): void {
    const poison = (spec as FieldSpec & { poison?: boolean }).poison;
    const rect = this.add
      .rectangle(spec.x, FLOOR_Y - 2, spec.w, 8, spec.color, 0.5)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.fx)
      .setBlendMode(Phaser.BlendModes.ADD);
    const f: Field & { poison?: boolean } = { ...spec, rect, tickTimer: 0, age: 0 };
    f.poison = poison;
    this.fields.push(f);
  }

  private updateFields(dt: number): void {
    const p = this.player;
    this.fields = this.fields.filter((f) => {
      const poison = (f as Field & { poison?: boolean }).poison;
      f.life -= dt;
      f.age += dt;
      f.tickTimer -= dt;
      f.rect.setAlpha((0.35 + Math.sin(f.age * 6) * 0.15) * Math.min(1, f.life * 2));
      if (Math.random() < dt * (f.rain ? 30 : 10)) {
        const x = f.x + Math.random() * f.w;
        if (f.rain) {
          const streak = this.add.rectangle(x, FLOOR_Y - 140, 1, 10, 0xe8dcc0).setDepth(DEPTH.fx);
          this.tweens.add({ targets: streak, y: FLOOR_Y - 4, duration: 180, onComplete: () => streak.destroy() });
        } else this.fx.burst(x, FLOOR_Y - 6, f.color, 1, 30, 600);
      }
      if (f.tickTimer <= 0) {
        f.tickTimer = f.tickEvery;
        if (poison) {
          // 독 웅덩이: 플레이어를 해친다 (가드 불가).
          if (p.x > f.x && p.x < f.x + f.w && p.grounded && !p.onPlatform) {
            this.damagePlayer(6, { x: p.x, melee: false, unblockable: true });
          }
        } else {
          for (const m of this.monsters) {
            if (!m.alive) continue;
            if (m.x < f.x - 6 || m.x > f.x + f.w + 6) continue;
            if (!f.hitsAir && m.body.bottom < FLOOR_Y - 60) continue;
            this.hitMonster(m, f.damage, { quiet: true, slow: f.slow ? [f.slow, 0.6] : undefined });
          }
        }
      }
      if (f.life <= 0) {
        f.rect.destroy();
        return false;
      }
      return true;
    });
  }

  addTelegraph(x: number, y: number, w: number, h: number, dur: number, owner: Monster | null, onFire: (() => void) | null): void {
    const rect = this.add.rectangle(x, y, w, h, 0xff3a2a, 0).setOrigin(0, 0).setStrokeStyle(1, 0xff3a2a, 0.9).setDepth(DEPTH.fx);
    const fill = this.add.rectangle(x, y + h, w, 0, 0xff3a2a, 0.3).setOrigin(0, 1).setDepth(DEPTH.fx);
    this.telegraphs.push({ rect, fill, time: 0, dur, owner, onFire });
  }

  private updateTelegraphs(dt: number): void {
    this.telegraphs = this.telegraphs.filter((t) => {
      t.time += dt;
      t.fill.height = t.rect.height * Math.min(1, t.time / t.dur);
      const cancelled = t.owner !== null && (!t.owner.alive || t.owner.stun > 0);
      if (t.time >= t.dur || cancelled) {
        if (!cancelled) t.onFire?.();
        t.rect.destroy();
        t.fill.destroy();
        return false;
      }
      return true;
    });
  }

  /** 바닥을 타고 양옆으로 퍼지는 충격파. 점프하거나 발판 위에 있으면 피한다. */
  addShockwave(x: number, damage: number, owner: Monster): void {
    for (const dir of [-1, 1] as const) {
      const obj = this.add.rectangle(x, FLOOR_Y - 6, 10, 12, 0xffa040, 0.8).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
      this.waves.push({ obj, x, dir, dist: 0, damage, owner, hit: false });
    }
  }

  private updateWavesFx(dt: number): void {
    const p = this.player;
    this.waves = this.waves.filter((w) => {
      const step = 260 * dt;
      w.x += w.dir * step;
      w.dist += step;
      w.obj.setPosition(w.x, FLOOR_Y - 6).setAlpha(0.9 * (1 - w.dist / 360));
      if (Math.random() < 0.6) this.fx.burst(w.x, FLOOR_Y - 4, 0xffa040, 1, 30, 300);
      if (!w.hit && Math.abs(p.x - w.x) < 10 && p.grounded && !p.onPlatform) {
        w.hit = true;
        this.damagePlayer(w.damage, { x: w.x, monster: w.owner, melee: false });
      }
      if (w.dist >= 360) {
        w.obj.destroy();
        return false;
      }
      return true;
    });
  }

  castMeteor(x: number, damage: number, burn: number): void {
    this.addTelegraph(x - 60, FLOOR_Y - 40, 120, 40, 0.8, null, null);
    const rock = this.add.sprite(x - 90, -40, 'fireball').play('fireball').setScale(3).setDepth(DEPTH.projectile).setTint(0xffb070);
    this.tweens.add({
      targets: rock,
      x,
      y: FLOOR_Y - 10,
      duration: 800,
      ease: 'Quad.In',
      onComplete: () => {
        rock.destroy();
        sfx.play('boom');
        this.fx.ring(x, FLOOR_Y, 70, 0xff6a1a, 400);
        this.fx.burst(x, FLOOR_Y - 10, 0xff8a3a, 30, 200, 700, 1.6);
        this.fx.shake(1.4, 220);
        this.hitArea(x - 60, FLOOR_Y - 140, 120, 150, damage, { knock: 120 });
        this.addField({ x: x - 55, w: 110, life: 3, tickEvery: 0.5, damage: burn, color: 0xff6a2a });
      },
    });
  }

  setBeam(on: boolean): void {
    this.beam.setVisible(on);
    this.beamGlow.setVisible(on);
  }

  private updateBeam(): void {
    if (!this.beam.visible) return;
    const p = this.player;
    const m = p.muzzle();
    const len = 380;
    const x = p.facing === 1 ? m.x : m.x - len;
    this.beam.setPosition(x, m.y).setSize(len, 4 + Math.sin(this.time.now * 0.05) * 1.5);
    this.beamGlow.setPosition(x, m.y).setSize(len, 14);
  }

  // ───────────────────────── HUD ─────────────────────────

  private hudState(): HudState {
    const p = this.player;
    const w = p.weapon;
    const other = p.weapons[1 - p.active];
    const keymap = this.save.keymap;
    const slots: HudSlot[] = w.slots.map((s, i) => {
      const key = keyLabel(keymap[SLOT_ACTIONS[i]]);
      if (!s) return { key, short: '', name: '', mana: 0, cdLeft: 0, cdRatio: 0, usable: false, empty: true };
      const cdLeft = p.cooldowns.get(s.id) ?? 0;
      return { key, short: s.short, name: s.name, mana: s.mana, cdLeft, cdRatio: cdLeft / s.cooldown, usable: cdLeft <= 0 && p.mp >= s.mana, empty: false };
    });
    const mission = this.phase.mission;
    let waveText: string;
    if (mission) {
      if (this.state === 'intro') waveText = '준비';
      else if (mission.kind === 'survive') waveText = `생존 ${Math.max(0, Math.ceil(mission.seconds - this.missionTime))}초 남음`;
      else waveText = `처치 ${Math.min(this.pending.kills, mission.target)} / ${mission.target}`;
    } else if (this.phase.type === 'boss') waveText = '보스 페이즈';
    else if (this.waveIndex < 0) waveText = '준비';
    else waveText = `웨이브 ${Math.min(this.waveIndex + 1, this.phase.waves.length)} / ${this.phase.waves.length}`;
    const barTarget = this.boss ?? this.monsters.find((m) => m.alive && m.def.miniboss) ?? null;
    let ammo: string | null = null;
    if (w.def.type === 'gun') ammo = p.reloadTime > 0 ? '재장전 중...' : `탄약 ${w.ammo} / ${w.magazine}`;
    else if (w.def.type === 'bow') ammo = p.drawCd > 0 ? '장전 중...' : '발사 준비';
    return {
      hp: p.hp,
      maxHp: p.derived.maxHp,
      mp: p.mp,
      maxMp: p.derived.maxMp,
      shield: p.shield,
      wardHits: p.wardHits,
      level: this.save.level,
      expRatio: this.save.exp / expToNext(this.save.level),
      weaponName: `${w.def.name}${w.enhance > 0 ? ` +${w.enhance}` : ''}`,
      weaponGradeColor: GRADES[w.def.grade].color,
      otherWeaponName: `${other.def.name}${other.enhance > 0 ? ` +${other.enhance}` : ''}`,
      swapKey: keyLabel(keymap.swap),
      slots,
      buffs: p.buffs.map((b) => ({ name: b.name, time: b.time })),
      charge: p.charge >= 0 ? Math.min(1, p.charge / (w.def.type === 'dao' ? 1 : 1.2)) : -1,
      ammo,
      ads: false,
      potions: {
        hp: Math.min(this.save.potions.hp, POTION_LIMIT_PER_PHASE - this.potionUsed.hp),
        mp: Math.min(this.save.potions.mp, POTION_LIMIT_PER_PHASE - this.potionUsed.mp),
        hpKey: keyLabel(keymap.item1),
        mpKey: keyLabel(keymap.item2),
      },
      phaseName: `${this.phase.id} ${this.phase.name}`,
      waveText,
      gold: this.pending.gold,
      kills: this.pending.kills,
      boss: barTarget ? { name: barTarget.def.name, hp: Math.max(0, barTarget.hp), maxHp: barTarget.maxHp, phase2: barTarget.phase2 } : null,
      dodgeReady: p.dodgeCd <= 0,
    };
  }

  /** 개발용 상태 요약 */
  debugSummary(): string {
    const kinds: Record<string, number> = {};
    for (const m of this.monsters) if (m.alive) kinds[m.def.kind] = (kinds[m.def.kind] ?? 0) + 1;
    return JSON.stringify({
      state: this.state,
      wave: this.waveIndex,
      missionTime: Math.round(this.missionTime * 10) / 10,
      hp: Math.round(this.player.hp),
      kills: this.pending.kills,
      alive: kinds,
      ended: this.ended,
    });
  }
}
