import Phaser from 'phaser';
import { SLOT_ACTIONS, keyLabel, type Input } from '../core/input';
import { sfx } from '../core/audio';
import { skillSlotIds, type SaveData } from '../core/save';
import { gearBonus, POTION_LIMIT_PER_PHASE } from '../data/gear';
import { MATERIALS } from '../data/items';
import { ELITE_MOD, MONSTERS, type MonsterKind } from '../data/monsters';
import type { PhaseDef } from '../data/phases';
import { DIFFICULTY, LEGIONS, rewardMul, SILENCE_STACKS, SILENCE_TIME, type LegionRun } from '../data/legion';
import { SKILL_BY_ID, type SkillDef } from '../data/skills';
import { CLASS_NAME, GRADES, WEAPONS, type WeaponType } from '../data/weapons';
import { Hud, type HudSlot, type HudState } from '../ui/hud';
import { updatePlayerCombat } from './combat2d';
import { ctx, type BattleOutcome } from './context';
import { DEPTH, Fx } from './fx';
import type { Palette } from './fxArt';
import { meleeLook, weaponIconUrl } from './weaponArt';
import { Monster, monsterBodyHeight } from './monster2d';
import { dev } from './dev';
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

type BoltObject = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

interface Bolt extends BoltSpec {
  obj: BoltObject;
  /** 화살 뒤에 끌리는 빛 */
  trail?: Phaser.GameObjects.Image;
  /** 다음 꼬리·잔상까지 남은 시간 */
  fxTimer: number;
  radius: number;
  hit: Set<Monster>;
  life: number;
}

/** 적 탄의 생김새·성질 */
export interface EnemyBoltOpts {
  /** 생김새: 마력탄(기본), 서리, 도깨비불, 깃털 */
  kind?: 'orb' | 'frost' | 'wisp' | 'feather' | 'void';
  /** 깃털 탄의 색 (밤의 여왕·공허 천사) */
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
  /** 겉모습: 서리(얼음 가시), 불길, 화살비, 독, 기본 */
  style?: 'frost' | 'fire' | 'rain' | 'poison' | 'plain';
}

interface Field extends FieldSpec {
  rect: Phaser.GameObjects.Rectangle;
  /** 장판이 사라질 때 함께 지울 장식 (불꽃 등) */
  deco: Phaser.GameObjects.GameObject[];
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

/** 무기별 타격 불빛 */
const HIT_COLOR: Record<WeaponType, number> = {
  sword: 0xbfe4ff,
  dao: 0xffd2a8,
  bow: 0xfff0c0,
  gun: 0xffd890,
  staff: 0x7fe8ff,
};

/** 버프별 몸에서 피어오르는 기운의 색 */
const BUFF_COLOR: Record<string, number> = {
  cry: 0xffb040,
  amp: 0x7fe8ff,
  rage: 0xff5a3a,
  haste: 0x9ff0c0,
  tactical: 0xffd890,
};

/** 장착 무기의 스킬 슬롯: 배운 스킬을 목록 순서대로 최대 8개 채운다. */
export function buildSlots(save: SaveData, type: WeaponType): (SkillDef | null)[] {
  const slots: (SkillDef | null)[] = skillSlotIds(save, type).map((id) => SKILL_BY_ID[id] ?? null);
  while (slots.length < 8) slots.push(null);
  return slots;
}

/** 군단장 보상: 조각 (최소~최대 × 보상 배율), 하드는 희망의 조각을 낮은 확률로 */
export function legionReward(run: LegionRun): Record<string, number> {
  const diff = DIFFICULTY[run.difficulty];
  const mul = rewardMul(run.mods);
  const [lo, hi] = diff.shards;
  const out: Record<string, number> = { [LEGIONS[run.id].shard]: Math.max(1, Math.round((lo + Math.random() * (hi - lo)) * mul)) };
  if (diff.hopeChance > 0 && Math.random() < diff.hopeChance * mul) out.hope_shard = 1;
  return out;
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
  /** 레이저를 쏘는 동안 지팡이 끝에 서는 마법진 */
  private beamCircle: Phaser.GameObjects.Sprite | null = null;
  /** 버프 기운이 피어오르는 간격 */
  private auraTimer = 0;

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
  /** 군단장 전투면 출격 정보 */
  legion: LegionRun | null = null;
  /** 침묵 스택 (침묵의 기사단장) */
  silenceStacks = 0;
  private reviveLeft = 0;

  constructor() {
    super('battle');
  }

  init(data: { phase: PhaseDef; legion?: LegionRun }): void {
    this.phase = data.phase;
    this.legion = data.legion ?? null;
    this.silenceStacks = 0;
    this.reviveLeft = this.legion?.mods.includes('revive') ? 1 : 0;
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
    this.beamCircle = null;
  }

  create(): void {
    this.save = ctx.getSave();
    this.keys = ctx.input;
    this.fx = new Fx(this);
    const phase = this.phase;
    this.level = buildLevel(this, phase.width, phase.platforms, phase.theme, phase.id.charCodeAt(2) * 31);
    this.physics.world.setBounds(0, -200, phase.width, VIEW_H + 400);

    this.stats = totalStats(this.save);
    // 군단장 전투는 기지에서 고른 무기 2개로 싸운다.
    const uids = this.legion?.weapons ?? this.save.equipped;
    const weapons = uids.map((uid) => {
      const owned = this.save.weapons.find((w) => w.uid === uid) ?? this.save.weapons[0];
      const def = WEAPONS[owned.defId];
      return { def, enhance: owned.enhance, slots: buildSlots(this.save, def.type) };
    });
    const derived = derive(this.stats, this.save.passives, gearBonus(this.save.gear.equipped, this.save.gear.enhance));
    const mods = this.legion?.mods ?? [];
    if (mods.includes('atk')) derived.damageMul += 0.2;
    if (mods.includes('guard')) derived.damageReduce = Math.min(0.6, derived.damageReduce + 0.2);
    if (mods.includes('vigor')) derived.maxHp = Math.round(derived.maxHp * 1.3);
    this.player = new Player(this, 80, FLOOR_Y - 40, derived, weapons);

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
    this.announce(this.legion ? phase.name : `${phase.id} ${phase.name}`, 1.6);
  }

  private cleanup(): void {
    // this.anims는 게임 전체가 함께 쓰므로, 일시정지 중에 나가면 마을까지 멈춘 채로 남는다.
    this.anims.resumeAll();
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
    if (dev.infiniteMp) p.mp = p.derived.maxMp;
    if (dev.noCooldown) for (const id of p.cooldowns.keys()) p.cooldowns.set(id, 0);
    p.onPlatform = p.grounded && p.feet < FLOOR_Y - 4;
    updatePlayerCombat(this, dt);
    this.usePotions(dt);
    p.updateMovement(dt, input);
    p.animate();
    this.buffAura(dt);

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

  /** 버프가 걸려 있는 동안 몸에서 기운이 피어오른다. */
  private buffAura(dt: number): void {
    this.auraTimer -= dt;
    if (this.auraTimer > 0) return;
    this.auraTimer = 0.07;
    const p = this.player;
    for (const b of p.buffs) {
      const c = BUFF_COLOR[b.id];
      if (c !== undefined) this.fx.embers(p.x, p.feet - 4, c, 1, 8, 34, 650);
    }
    if (p.slowTime > 0) this.fx.burst(p.x, p.y, 0x8fe0ff, 1, 20, 400);
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
      this.fx.spark(m.x, m.y, 0xc060ff, 1, Math.PI / 4);
      this.fx.burst(m.x, m.y, 0xb04aff, 6, 50, 400);
      return;
    }
    const w = p.weapon.def;
    const critChance = w.critChance + p.derived.passive.critBonus;
    // 세트 효과의 치명타 피해 추가분은 기본 치명타 피해에 더한다.
    const critDamage = CRIT_DAMAGE + p.derived.critDamage;
    let crit = false;
    let critMul: number;
    if (w.type === 'gun') {
      // 총: 치명타 대신 (치명타 데미지 + 치명타 확률)의 80%만큼 항상 증가
      critMul = 1 + (critDamage + critChance) * 0.8;
    } else {
      crit = Math.random() < critChance;
      critMul = crit ? 1 + critDamage : 1;
    }
    // 후광 망령의 보호막을 두른 적은 피해를 절반만 받는다.
    const ward = m.ward > 0 ? 0.5 : 1;
    let dmg = Math.max(1, Math.round(base * p.damageMul * (1 + p.derived.damageMul) * (1 + m.vuln) * critMul * dev.damageMul * ward));
    if (dev.oneHit) dmg = Math.max(dmg, Math.ceil(m.hp));
    m.hp -= dmg;
    m.onHit(p.x, opts.knock ?? 0);
    if (opts.basic) p.mp = Math.min(p.derived.maxMp, p.mp + 2);

    this.fx.text(m.x, m.body.top - 2, String(dmg), crit ? 'crit' : opts.quiet ? 'quiet' : 'normal');
    if (!opts.quiet) {
      const hx = m.x + (Math.random() - 0.5) * m.body.width * 0.6;
      const hy = m.y + (Math.random() - 0.5) * m.body.height * 0.4;
      const tone = p.isMelee ? meleeLook(w).slash : HIT_COLOR[w.type];
      this.fx.spark(hx, hy, crit ? 0xffd060 : tone, crit ? 2 : 1, Math.random() < 0.5 ? 0 : Math.PI / 4);
      this.fx.burst(hx, hy, crit ? 0xffc040 : tone, crit ? 10 : 5, 110, 300);
      if (crit) this.fx.spark(hx, hy, 0xffffff, 1, Math.PI / 4);
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
      if (o.width > 3) {
        // 저격: 굵은 빛줄기가 오래 남고, 지나간 자리에 연기가 핀다.
        this.fx.tracer(x, y, ex, ey, o.color, o.width, 320);
        this.fx.flashScreen(0xfff0c0, 0.25, 140);
        for (let d = 24 + Math.random() * 20; d < end; d += 26 + Math.random() * 40) {
          const k = d;
          this.time.delayedCall(40 + Math.random() * 120, () => this.fx.smoke(x + Math.cos(angle) * k, y + Math.sin(angle) * k + (Math.random() - 0.5) * 5, 1, 0x8a8480, -6 - Math.random() * 8));
        }
        this.fx.spark(ex, ey, o.color, 2);
      } else {
        this.fx.tracer(x, y, ex, ey, o.color, o.width, 90);
        if (targets.length) this.fx.spark(ex, ey, o.color);
      }
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
    if (m.def.kind === 'poison_zombie' || m.def.kind === 'plague_wolf') this.addField({ x: m.x - 34, w: 68, life: 4, tickEvery: 0.5, damage: 0, color: 0x8acc2a, poison: true } as FieldSpec & { poison: boolean });
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
    if (dev.god) {
      this.fx.text(p.x, headY, '무적', 'info');
      return;
    }
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
    // 세트 효과의 받는 피해 감소
    const dmg = Math.max(1, Math.round(amount * (1 - p.derived.damageReduce)));
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
      if (this.reviveLeft > 0) {
        this.revivePlayer();
        return;
      }
      p.hp = 0;
      p.dead = true;
      this.fail();
    }
  }

  // ───────────────────────── 군단장 ─────────────────────────

  /** 군단장 패턴 속도 배율 (대기 시간에 곱한다): 난이도 · 둔화 디버프 */
  legionPace(_m?: Monster): number {
    if (!this.legion) return 1;
    return DIFFICULTY[this.legion.difficulty].pace * (this.legion.mods.includes('boss_slow') ? 1.15 : 1);
  }

  /** 기믹 완화 디버프: 즉사 예고를 늘린다 */
  legionWarnBonus(): number {
    return this.legion?.mods.includes('gimmick') ? 1 : 0;
  }

  get silenceMax(): number {
    return SILENCE_STACKS + (this.legion?.mods.includes('gimmick') ? 2 : 0);
  }

  /** 보라색 공격에 맞았다: 침묵을 걸고 스택을 쌓는다. 스택이 가득 차면 즉사. */
  silencePlayer(): void {
    const p = this.player;
    if (p.dead) return;
    p.silenceTime = SILENCE_TIME;
    this.silenceStacks++;
    this.fx.text(p.x, p.body.top - 14, `침묵 ${this.silenceStacks}/${this.silenceMax}`, 'info');
    this.fx.burst(p.x, p.y, 0xb04aff, 12, 120, 500);
    sfx.play('magic', 0.5);
    if (this.silenceStacks < this.silenceMax) return;
    // 가득 찼다: HP 100% 피해 (무적·가드 무시)
    this.announce('침묵의 심판', 1.2);
    this.fx.flashScreen(0x6a1aa8, 0.6, 500);
    this.fx.pillar(p.x, p.feet, 0xb04aff, 220, 800);
    this.fx.shake(1.5, 300);
    this.silenceStacks = 0;
    p.invuln = 0;
    p.guarding = false;
    p.shield = 0;
    p.wardHits = 0;
    p.hp = Math.min(p.hp, 1);
    this.damagePlayer(p.derived.maxHp, { x: p.x, melee: false, unblockable: true });
  }

  /** 불사조의 깃털: 한 번 HP 50%로 되살아난다. */
  private revivePlayer(): void {
    const p = this.player;
    this.reviveLeft--;
    p.hp = Math.round(p.derived.maxHp * 0.5);
    p.invuln = 2;
    this.silenceStacks = 0;
    this.announce('불사조의 깃털: 부활!', 1.2);
    this.fx.flashScreen(0xffa040, 0.4, 400);
    this.fx.embers(p.x, p.feet, 0xffa040, 20, 20, 60, 900);
    this.fx.pillar(p.x, p.feet, 0xffc060, 140, 700);
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
    // 몸이 큰 몬스터(강철 헬비스트 등)도 땅에 박히지 않도록 키의 절반 + 여유만큼 위에서 떨어뜨린다.
    const def = MONSTERS[kind];
    const halfH = monsterBodyHeight(kind, elite) / 2;
    let y = FLOOR_Y - halfH - 6;
    if (atX === undefined) {
      for (let tries = 0; tries < 12; tries++) {
        x = 40 + Math.random() * (W - 80);
        if (Math.abs(x - p.x) > 170) break;
      }
      // 일부는 발판 위에 나온다.
      if (!def.flying && !def.boss && this.level.surfaces.length && Math.random() < 0.3) {
        const s = this.level.surfaces[Math.floor(Math.random() * this.level.surfaces.length)];
        x = s.x + 16 + Math.random() * (s.w - 32);
        y = s.y - halfH - 6;
      }
    }
    if (MONSTERS[kind].flying) y = 140 + Math.random() * 60;
    if (MONSTERS[kind].boss) {
      x = atX ?? W - 180;
      y = 160;
    }
    x = Phaser.Math.Clamp(x, 30, W - 30);
    const m = new Monster(this, kind, elite, this.phase.hpMul * dev.monsterHpMul, x, y, this.phase.dmgMul ?? 1);
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
    if (this.phase.type === 'boss') this.announce(MONSTERS[this.phase.waves[index][0].kind].name, 2.5);
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
    if (this.legion) {
      // 군단장 보상: 조각 (하드는 희망의 조각을 낮은 확률로). 버프·디버프를 고를수록 줄어든다.
      outcome.legion = this.legion;
      outcome.materials = cleared ? legionReward(this.legion) : {};
    }
    const area = this.legion ? 'base' : 'town';
    ctx.onBattleEnd(outcome, this.hud, () => {
      this.cameras.main.fadeOut(250);
      this.time.delayedCall(260, () => this.scene.start('town', { area }));
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
    const ang = Math.atan2(o.vy, o.vx);
    let obj: BoltObject;
    let radius = 6;
    let trail: Phaser.GameObjects.Image | undefined;
    switch (o.kind) {
      case 'orb':
        // 마나 구체: 지팡이 끝에 작은 마법진이 열리며 나간다.
        obj = this.add.sprite(o.x, o.y, 'fx-orb').play('fx-orb').setScale(Math.max(1, Math.round(size))).setBlendMode(Phaser.BlendModes.ADD);
        this.fx.circle(o.x, o.y, 0x7fe8ff, 16 + 12 * size, 260, true, DEPTH.fx);
        radius = 5 * size;
        break;
      case 'arrow':
        obj = this.add.image(o.x, o.y, 'fx-arrow').setRotation(ang).setScale(size >= 1.5 ? 2 : 1);
        trail = this.fx.streak(o.x, o.y, ang, 16 + 16 * size, o.color ?? 0xe8dcc0, 0, size >= 1.5 ? 2 : 1);
        radius = 4 * size;
        break;
      case 'wave':
        obj = this.add.sprite(o.x, o.y, 'fx-wave').play('fx-wave').setFlipX(o.vx < 0).setBlendMode(Phaser.BlendModes.ADD).setScale(size);
        if (o.color !== undefined) obj.setTint(o.color);
        radius = 14 * size;
        break;
      case 'grenade':
        obj = this.add.image(o.x, o.y, 'fx-grenade');
        radius = 4;
        break;
    }
    obj.setDepth(DEPTH.projectile);
    this.bolts.push({ ...o, obj, trail, fxTimer: 0, radius, hit: new Set(), life: o.life ?? 1.6 });
  }

  /** 날아가는 동안의 꼬리·잔상 */
  private boltTrail(b: Bolt, dt: number): void {
    b.fxTimer -= dt;
    if (b.trail) b.trail.setPosition(b.x, b.y).setRotation(Math.atan2(b.vy, b.vx));
    if (b.fxTimer > 0) return;
    switch (b.kind) {
      case 'orb':
        b.fxTimer = 0.025;
        this.fx.burst(b.x, b.y, 0x7fe8ff, 1, 25, 260, b.size ?? 1);
        break;
      case 'arrow':
        b.fxTimer = 0.04;
        if ((b.size ?? 1) >= 1.5 || b.pierce) this.fx.burst(b.x, b.y, b.color ?? 0xffe08a, 1, 20, 220);
        break;
      case 'wave': {
        b.fxTimer = 0.035;
        const s = b.obj as Phaser.GameObjects.Sprite;
        const ghost = this.add
          .image(b.x, b.y, 'fx-wave', s.frame.name)
          .setFlipX(s.flipX)
          .setDepth(DEPTH.projectile - 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(s.scaleX, s.scaleY)
          .setTint(s.tintTopLeft)
          .setAlpha(0.5);
        this.tweens.add({ targets: ghost, alpha: 0, scaleY: s.scaleY * 0.7, duration: 180, onComplete: () => ghost.destroy() });
        break;
      }
      case 'grenade':
        b.fxTimer = 0.05;
        this.fx.smoke(b.x, b.y, 1, 0x9a948a, -6);
        break;
    }
  }

  private removeBolt(b: Bolt): void {
    b.obj.destroy();
    b.trail?.destroy();
  }

  private updateBolts(dt: number): void {
    const W = this.level.width;
    this.bolts = this.bolts.filter((b) => {
      b.life -= dt;
      b.vy += (b.gravity ?? 0) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.obj.setPosition(b.x, b.y);
      if (b.kind === 'arrow') b.obj.setRotation(Math.atan2(b.vy, b.vx));
      if (b.kind === 'grenade') b.obj.setRotation(b.obj.rotation + dt * 14 * Math.sign(b.vx || 1));
      this.boltTrail(b, dt);
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
          if (b.aoe) this.explode(b.x, b.y, b.aoe, b.damage, b.stun ?? 0, b.kind === 'orb' ? 'arcane' : 'fire');
          else {
            this.hitMonster(m, b.damage, { basic: b.basic, knock: 70 });
            if (b.kind === 'orb') this.fx.boom(b.x, b.y, 12 * (b.size ?? 1), 'arcane');
          }
          alive = false;
          break;
        }
      }
      if (alive && b.y >= FLOOR_Y - 2) {
        if (b.aoe) this.explode(b.x, FLOOR_Y - 6, b.aoe, b.damage, b.stun ?? 0, b.kind === 'orb' ? 'arcane' : 'fire');
        else this.fx.spark(b.x, FLOOR_Y - 3, 0xd8c8a0);
        alive = false;
      }
      if (!alive) this.removeBolt(b);
      return alive;
    });
  }

  private explode(x: number, y: number, radius: number, damage: number, stun: number, palette: Palette = 'fire'): void {
    sfx.play('boom', Math.min(1, radius / 60));
    const ground = Math.min(y + 8, FLOOR_Y);
    this.fx.boom(x, y, radius * 0.6, palette);
    this.fx.ring(x, ground, radius, palette === 'arcane' ? 0x7fe8ff : 0xffa040);
    this.fx.burst(x, y, palette === 'arcane' ? 0xbff6ff : 0xffc060, 14, 160, 450, 1, 300);
    for (let i = 0; i < 3; i++) this.time.delayedCall(120 + i * 60, () => this.fx.smoke(x + (i - 1) * radius * 0.4, y - 4, 2, palette === 'arcane' ? 0x6a7aa8 : 0x7a706a));
    this.fx.shake(0.5);
    this.hitArea(x - radius, y - radius, radius * 2, radius * 2, damage, { stun, knock: 90 });
  }

  spawnEnemyBolt(x: number, y: number, vx: number, vy: number, damage: number, owner: Monster, aoe = 0, opts: EnemyBoltOpts = {}): void {
    let obj: EnemyBolt['obj'];
    if (aoe > 0) {
      obj = this.add.sprite(x, y, 'fireball').play('fireball');
      obj.setFlipX(vx < 0);
    } else if (opts.kind === 'frost') {
      obj = this.add.sprite(x, y, 'fx-orb').play('fx-orb').setBlendMode(Phaser.BlendModes.ADD);
    } else if (opts.kind === 'wisp') {
      obj = this.add.sprite(x, y, 'fx-flame').play('fx-flame').setTint(0x9fffb0).setScale(0.8).setBlendMode(Phaser.BlendModes.ADD);
    } else if (opts.kind === 'feather') {
      obj = this.add.image(x, y, 'fx-feather').setRotation(Math.atan2(vy, vx));
      if (opts.tint !== undefined) obj.setTint(opts.tint);
    } else if (opts.kind === 'void') {
      obj = this.add.sprite(x, y, 'fx-orb-enemy').play('fx-orb-enemy').setTint(0x80d0ff).setBlendMode(Phaser.BlendModes.ADD);
    } else {
      obj = this.add.sprite(x, y, 'fx-orb-enemy').play('fx-orb-enemy').setBlendMode(Phaser.BlendModes.ADD);
    }
    obj.setDepth(DEPTH.projectile);
    this.enemyBolts.push({ obj, x, y, vx, vy, damage, aoe, owner, life: opts.life ?? 4, opts });
  }

  private updateEnemyBolts(dt: number): void {
    const p = this.player;
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
      if (Math.random() < 0.4) this.fx.burst(b.x, b.y, b.aoe > 0 ? 0xff8a3a : ENEMY_BOLT_COLOR[b.opts.kind ?? 'orb'], 1, 15, 220);
      let alive = b.life > 0;
      const hit = b.x > pb.x - 4 && b.x < pb.right + 4 && b.y > pb.y - 4 && b.y < pb.bottom + 4;
      if (alive && hit && p.invuln <= 0) {
        this.damagePlayer(b.damage, { x: b.x, monster: b.owner, melee: false });
        if (b.opts.slow && !p.dead) {
          p.slowTime = 2;
          this.fx.text(p.x, p.body.top - 4, '둔화', 'info');
        }
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
      this.fx.boom(b.x, Math.min(b.y, FLOOR_Y - 8), b.aoe * 0.5, 'fire');
      this.fx.ring(b.x, Math.min(b.y + 6, FLOOR_Y), b.aoe, 0xff6a1a, 250);
    } else {
      const c = ENEMY_BOLT_COLOR[b.opts.kind ?? 'orb'];
      this.fx.spark(b.x, b.y, c);
      this.fx.burst(b.x, b.y, c, 5, 70, 250);
    }
  }

  // ───────────────────────── 적의 큰 공격 (챕터 2·3) ─────────────────────────

  /** 바닥에서 솟는 불기둥: 경고 뒤 폭 w, 높이 150의 기둥이 선다. */
  firePillar(x: number, damage: number, owner: Monster, delay = 0.9, w = 40): void {
    const top = FLOOR_Y - 150;
    this.addTelegraph(x - w / 2, top, w, 150, delay, owner, () => {
      const s = this.add.sprite(x, FLOOR_Y + 4, 'beast-burn').setOrigin(0.5, 1).setDepth(DEPTH.fx).setScale(w / 40, 1);
      s.play('fire-pillar');
      this.tweens.add({ targets: s, alpha: 0, delay: 420, duration: 200, onComplete: () => s.destroy() });
      this.fx.burst(x, FLOOR_Y - 10, 0xffa040, 10, 120, 400);
      this.fx.shake(0.4, 100);
      this.areaHit(x - w / 2, top, w, 150, damage, owner, false);
    });
  }

  /** 하늘에서 내리꽂히는 빛기둥 (타락천사) */
  lightBeam(x: number, damage: number, owner: Monster, delay = 0.9, w = 36, color = 0xfff0c0): void {
    const top = 0;
    this.addTelegraph(x - w / 2, top, w, FLOOR_Y, delay, owner, () => {
      this.fx.pillar(x, FLOOR_Y, color, FLOOR_Y + 20, 420);
      this.fx.tracer(x, 0, x, FLOOR_Y, color, 6, 260);
      this.fx.spark(x, FLOOR_Y - 6, 0xffffff, 2);
      this.fx.ring(x, FLOOR_Y, 40, color);
      this.areaHit(x - w / 2, top, w, FLOOR_Y, damage, owner, false);
    });
  }

  /** 적이 부르는 운석: 경고 원 → 낙하 → 폭발 (플레이어만 맞는다) */
  enemyMeteor(x: number, damage: number, owner: Monster, delay = 0): void {
    this.time.delayedCall(delay * 1000, () => {
      if (this.ended) return;
      this.fx.circle(x, FLOOR_Y - 1, 0xff3a2a, 110, 1000, false, DEPTH.fx - 2);
      const sx = x - 90;
      const rock = this.add.sprite(sx, -20, 'fx-meteor').play('fx-meteor').setScale(1.5).setDepth(DEPTH.projectile).setTint(0xd8a0ff);
      rock.setOrigin(26 / 40, 26 / 40);
      this.tweens.add({
        targets: rock,
        x,
        y: FLOOR_Y - 14,
        delay: 200,
        duration: 750,
        ease: 'Quad.In',
        onUpdate: () => this.fx.burst(rock.x - 4, rock.y - 4, 0xc080ff, 1, 30, 260),
        onComplete: () => {
          rock.destroy();
          sfx.play('boom', 0.8);
          this.fx.boom(x, FLOOR_Y - 20, 40, 'dark');
          this.fx.ring(x, FLOOR_Y, 70, 0xc060ff, 380);
          this.fx.shake(0.9, 180);
          this.areaHit(x - 50, FLOOR_Y - 110, 100, 110, damage, owner, false);
        },
      });
    });
  }

  /** 불타는 해골의 자폭: 주변을 태우고 스스로 사라진다 (처치로 치지 않는다). */
  selfDestruct(m: Monster, radius: number): void {
    if (!m.alive) return;
    sfx.play('boom', 0.6);
    this.fx.boom(m.x, m.y, radius * 0.6, 'fire');
    this.fx.ring(m.x, Math.min(m.y + 10, FLOOR_Y), radius, 0xff7a1a);
    this.areaHit(m.x - radius, m.y - radius, radius * 2, radius * 2, m.damage, m, false);
    m.kill();
  }

  // ───────────────────────── 장판·경고·충격파·메테오 ─────────────────────────

  addField(spec: FieldSpec): void {
    const poison = (spec as FieldSpec & { poison?: boolean }).poison;
    const style = spec.style ?? (poison ? 'poison' : spec.rain ? 'rain' : 'plain');
    const rect = this.add
      .rectangle(spec.x, FLOOR_Y - 2, spec.w, style === 'plain' || style === 'poison' ? 8 : 4, spec.color, 0.5)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.fx)
      .setBlendMode(Phaser.BlendModes.ADD);
    const deco: Phaser.GameObjects.GameObject[] = [];
    const ms = spec.life * 1000;
    const cx = spec.x + spec.w / 2;
    if (style === 'frost') {
      // 얼음 가시가 안쪽부터 바깥으로 차례로 솟는다.
      this.fx.circle(cx, FLOOR_Y - 1, 0x8fe0ff, spec.w + 20, ms, false, DEPTH.fx - 2);
      const n = Math.max(3, Math.floor(spec.w / 13));
      for (let i = 0; i < n; i++) {
        const x = spec.x + ((i + 0.5) * spec.w) / n + (Math.random() - 0.5) * 4;
        const delay = Math.abs(x - cx) * 2.2;
        this.fx.iceSpike(x, FLOOR_Y, 0.7 + Math.random() * 0.5, Math.max(200, ms - delay - 150), delay);
      }
      this.fx.burst(cx, FLOOR_Y - 8, 0xdff8ff, 16, 120, 450);
    } else if (style === 'fire') {
      const n = Math.max(3, Math.floor(spec.w / 12));
      for (let i = 0; i < n; i++) deco.push(this.fx.flame(spec.x + ((i + 0.5) * spec.w) / n, FLOOR_Y, 0.8 + Math.random() * 0.7, 0));
    } else if (style === 'rain') {
      // 하늘에 금빛 마법진이 열리고 그 아래로 화살이 쏟아진다.
      deco.push(this.fx.circle(cx, FLOOR_Y - 150, 0xffe08a, spec.w + 30, ms + 200, false, DEPTH.fx));
    }
    const f: Field & { poison?: boolean } = { ...spec, style, rect, deco, tickTimer: 0, age: 0 };
    f.poison = poison;
    this.fields.push(f);
  }

  /** 장판이 살아 있는 동안의 연출 */
  private fieldFx(f: Field, dt: number): void {
    const x = f.x + Math.random() * f.w;
    switch (f.style) {
      case 'rain':
        if (Math.random() < dt * 34) {
          const top = FLOOR_Y - 146;
          const arrow = this.add.image(x, top, 'fx-arrow').setRotation(Math.PI / 2).setDepth(DEPTH.projectile);
          const tail = this.fx.streak(x, top, Math.PI / 2, 26, 0xffe08a, 0);
          this.tweens.add({
            targets: [arrow, tail],
            y: FLOOR_Y - 4,
            duration: 200,
            ease: 'Quad.In',
            onComplete: () => {
              arrow.destroy();
              tail.destroy();
              this.fx.spark(x, FLOOR_Y - 3, 0xffe08a);
              this.fx.burst(x, FLOOR_Y - 2, 0xc8b890, 2, 40, 220, 1, 300);
            },
          });
        }
        break;
      case 'frost':
        if (Math.random() < dt * 8) this.fx.smoke(x, FLOOR_Y - 6, 2, 0x8fc8e8, -10);
        if (Math.random() < dt * 14) this.fx.embers(x, FLOOR_Y - 4, 0xdff8ff, 1, 4, 24, 700);
        break;
      case 'fire':
        if (Math.random() < dt * 18) this.fx.embers(x, FLOOR_Y - 8, Math.random() < 0.5 ? 0xffc040 : 0xff7a1a, 1, 4, 40, 700);
        if (Math.random() < dt * 4) this.fx.smoke(x, FLOOR_Y - 16, 1, 0x5a4a44, -14);
        break;
      default:
        if (Math.random() < dt * 10) this.fx.burst(x, FLOOR_Y - 6, f.color, 1, 30, 600);
    }
  }

  private updateFields(dt: number): void {
    const p = this.player;
    this.fields = this.fields.filter((f) => {
      const poison = (f as Field & { poison?: boolean }).poison;
      f.life -= dt;
      f.age += dt;
      f.tickTimer -= dt;
      const glow = f.style === 'plain' || f.style === 'poison' ? 0.35 : 0.22;
      f.rect.setAlpha((glow + Math.sin(f.age * 6) * 0.12) * Math.min(1, f.life * 2));
      this.fieldFx(f, dt);
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
        for (const d of f.deco) {
          // 불꽃은 사그라들며 사라진다.
          if (d instanceof Phaser.GameObjects.Sprite && d.texture.key === 'fx-flame') {
            this.tweens.add({ targets: d, alpha: 0, scaleY: 0.2, duration: 300, onComplete: () => d.destroy() });
          } else if (d.active && !(d instanceof Phaser.GameObjects.Sprite && d.texture.key === 'fx-circle')) d.destroy();
        }
        return false;
      }
      return true;
    });
  }

  addTelegraph(x: number, y: number, w: number, h: number, dur: number, owner: Monster | null, onFire: (() => void) | null, color = 0xff3a2a): void {
    const rect = this.add.rectangle(x, y, w, h, color, 0).setOrigin(0, 0).setStrokeStyle(1, color, 0.9).setDepth(DEPTH.fx);
    const fill = this.add.rectangle(x, y + h, w, 0, color, 0.3).setOrigin(0, 1).setDepth(DEPTH.fx);
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

  /** 메테오: 하늘에 마법진이 열리고, 불타는 운석이 떨어져 터진 뒤 불길이 남는다. */
  castMeteor(x: number, damage: number, burn: number): void {
    const sx = x - 120;
    const sy = 26;
    this.fx.circle(sx, sy, 0xff8a3a, 90, 900, false, DEPTH.fx);
    this.fx.circle(x, FLOOR_Y - 1, 0xff5a2a, 140, 1000, false, DEPTH.fx - 2);
    const rock = this.add.sprite(sx, sy, 'fx-meteor').play('fx-meteor').setScale(2).setDepth(DEPTH.projectile);
    rock.setOrigin(26 / 40, 26 / 40);
    let trailAcc = 0;
    this.tweens.add({
      targets: rock,
      x,
      y: FLOOR_Y - 18,
      delay: 120,
      duration: 780,
      ease: 'Quad.In',
      onUpdate: () => {
        trailAcc++;
        this.fx.burst(rock.x - 6, rock.y - 6, trailAcc % 2 ? 0xffc040 : 0xff7a1a, 2, 40, 300);
        if (trailAcc % 3 === 0) this.fx.smoke(rock.x - 14, rock.y - 14, 2, 0x5a4a44, -6);
      },
      onComplete: () => {
        rock.destroy();
        sfx.play('boom');
        this.fx.flashScreen(0xffa040, 0.45, 260);
        this.fx.boom(x, FLOOR_Y - 26, 62, 'fire');
        this.time.delayedCall(90, () => {
          this.fx.boom(x - 34, FLOOR_Y - 16, 30, 'fire');
          this.fx.boom(x + 36, FLOOR_Y - 14, 28, 'fire');
        });
        this.fx.ring(x, FLOOR_Y, 110, 0xff6a1a, 450);
        this.fx.ring(x, FLOOR_Y, 70, 0xffd060, 300);
        this.fx.burst(x, FLOOR_Y - 16, 0xffb050, 26, 240, 650, 1, 500);
        this.fx.burst(x, FLOOR_Y - 10, 0x8a6a50, 14, 200, 700, 1.5, 700);
        for (let i = 0; i < 6; i++) this.time.delayedCall(150 + i * 50, () => this.fx.smoke(x + (i - 2.5) * 22, FLOOR_Y - 18, 3, 0x6a5a54, -24));
        this.fx.shake(1.6, 280);
        this.hitArea(x - 60, FLOOR_Y - 140, 120, 150, damage, { knock: 120 });
        this.addField({ x: x - 55, w: 110, life: 3, tickEvery: 0.5, damage: burn, color: 0xff6a2a, style: 'fire' });
      },
    });
  }

  setBeam(on: boolean): void {
    this.beam.setVisible(on);
    this.beamGlow.setVisible(on);
    if (on && !this.beamCircle) {
      this.beamCircle = this.add.sprite(0, 0, 'fx-circle').play('fx-circle').setTint(0x7fe8ff).setRotation(Math.PI / 2).setScale(0.6, 0.9);
      this.beamCircle.setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
    } else if (!on && this.beamCircle) {
      const c = this.beamCircle;
      this.beamCircle = null;
      this.tweens.add({ targets: c, alpha: 0, scaleY: 0, duration: 160, onComplete: () => c.destroy() });
    }
  }

  /** 레이저: 굵은 빛 줄기와 하얀 심, 지팡이 끝 마법진, 줄기를 타고 튀는 전류와 끝의 불꽃 */
  private updateBeam(): void {
    if (!this.beam.visible) return;
    const p = this.player;
    const m = p.muzzle();
    const len = 380;
    const f = p.facing;
    const x = f === 1 ? m.x : m.x - len;
    const t = this.time.now;
    this.beam.setPosition(x, m.y).setSize(len, 3 + Math.sin(t * 0.05) * 1.2);
    this.beamGlow.setPosition(x, m.y).setSize(len, 12 + Math.sin(t * 0.031) * 3);
    this.beamCircle?.setPosition(m.x + f * 3, m.y);
    if (Math.random() < 0.35) this.fx.lightning(m.x, m.y, m.x + f * (60 + Math.random() * 300), m.y + (Math.random() - 0.5) * 6, 0x7fe8ff, 1, 90);
    if (Math.random() < 0.5) this.fx.spark(m.x + f * len, m.y, 0x9fe8ff, 1 + Math.round(Math.random()));
    if (Math.random() < 0.6) this.fx.burst(m.x + f * Math.random() * len, m.y, 0xd8fbff, 1, 40, 250);
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
      return { key, short: s.short, name: s.name, mana: s.mana, cdLeft, cdRatio: cdLeft / (s.cooldown * (1 - p.derived.cdReduce)), usable: cdLeft <= 0 && p.mp >= s.mana, empty: false };
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
      weaponName: `${CLASS_NAME[w.def.type]} · ${w.def.name}${w.enhance > 0 ? ` +${w.enhance}` : ''}`,
      weaponGradeColor: GRADES[w.def.grade].color,
      weaponIcon: weaponIconUrl(w.def),
      otherWeaponIcon: weaponIconUrl(other.def),
      otherWeaponName: `${CLASS_NAME[other.def.type]} · ${other.def.name}${other.enhance > 0 ? ` +${other.enhance}` : ''}`,
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
      phaseName: this.legion ? this.phase.name : `${this.phase.id} ${this.phase.name}`,
      waveText,
      gold: this.pending.gold,
      kills: this.pending.kills,
      boss: barTarget ? { name: barTarget.def.name, hp: Math.max(0, barTarget.hp), maxHp: barTarget.maxHp, phase2: barTarget.phase2 } : null,
      legion: this.legion ? { stacks: this.silenceStacks, max: this.silenceMax, silence: p.silenceTime, revive: this.reviveLeft } : null,
      dodgeReady: p.dodgeCd <= 0,
    };
  }

  // ───────────────────────── 개발자 모드 ─────────────────────────

  devKillAll(): void {
    for (const m of [...this.monsters]) if (m.alive) this.killMonster(m);
  }

  devHeal(): void {
    const p = this.player;
    p.hp = p.derived.maxHp;
    p.mp = p.derived.maxMp;
    for (const id of p.cooldowns.keys()) p.cooldowns.set(id, 0);
    this.fx.burst(p.x, p.y, 0x6aff8a, 14, 70, 500);
  }

  /** 페이즈를 바로 클리어 처리한다 (보상 포함). */
  devClear(): void {
    for (const m of this.monsters) if (m.alive) m.kill();
    this.spawnQueue = [];
    this.clear();
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
