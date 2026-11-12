import Phaser from 'phaser';
import { SLOT_ACTIONS, keyLabel, type Input } from '../core/input';
import { sfx } from '../core/audio';
import { skillSlotIds, type SaveData } from '../core/save';
import { gearBonus, POTION_LIMIT_PER_PHASE } from '../data/gear';
import { MATERIALS } from '../data/items';
import { ELITE_MOD, MONSTERS, type MonsterKind } from '../data/monsters';
import { MOB_COUNT_MUL, type PhaseDef } from '../data/phases';
import { DIFFICULTY, LEGIONS, rewardMul, SILENCE_STACKS, SILENCE_TIME, type LegionRun } from '../data/legion';
import { barProgress, totalReward, WORLD_BOSS_BARS, WORLD_BOSS_TIME } from '../data/worldBoss';
import { koNum } from '../ui/format';
import { resetVfx } from './vfx';
import { chunkSkills, SKILL_BY_ID, SKILL_SLOTS, skillsFor, SKY_FLASH_ID, SKY_MAX_BLADES, SKY_STACKS_PER_BLADE, skyShotMana, type SkillDef } from '../data/skills';
import { CLASS_NAME, GRADES, WEAPONS, type WeaponType } from '../data/weapons';
import { Hud, type HudSlot, type HudState } from '../ui/hud';
import { updatePlayerCombat } from './combat';
import { ctx, type BattleOutcome } from './context';
import { Fx } from './fx';
import { meleeLook, orbLook, weaponIconUrl } from './weaponArt';
import { Monster, monsterBodyHeight } from './monster2d';
import { dev } from './dev';
import { Player } from './player2d';
import { TrainingRoom } from './training';
import { Tutorial } from './tutorial';
import { hpStack, isStacked, STACK_COLORS } from './hpStack';
import { CRIT_DAMAGE, basicDamage, derive, enhanceMultiplier, expToNext, totalStats, totalStatsWith, type Stats } from './stats';
import { raidGearBonus, raidReward, type RaidRun } from '../data/raid';
import { RaidFight } from './raid/raidFight';
import { buildLevel, FLOOR_Y, VIEW_H, type Level } from './world';
import { ORB_FX, Projectiles } from './battle/projectiles';
import { Hazards } from './battle/hazards';

export type { BoltSpec, EnemyBoltOpts } from './battle/projectiles';
export type { FieldSpec } from './battle/hazards';

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
  /** 피해 숫자·타격음·번쩍임을 모두 생략한다 (한꺼번에 수백 번 때리는 궁극기가 직접 묶어서 보여 준다) */
  silent?: boolean;
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
  while (slots.length < SKILL_SLOTS) slots.push(null);
  return slots;
}

/** 첫 장은 고른 세트, 다음 장부터는 세트에 없는 배운 스킬이다. */
export function buildPages(save: SaveData, type: WeaponType): (SkillDef | null)[][] {
  const first = buildSlots(save, type);
  const rest = skillsFor(type).filter((s) => save.learnedSkills.includes(s.id) && !first.includes(s));
  return [first, ...chunkSkills(rest)];
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
  private projectiles!: Projectiles;
  private hazards!: Hazards;
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
  /** 전투가 끝났다 (결과 창으로 넘어가는 중) */
  ended = false;
  private paused = false;
  private missionTime = 0;
  private spawnAcc = 0;
  private potionUsed = { hp: 0, mp: 0 };
  private potionCd = 0;
  /** 군단장 전투면 출격 정보 */
  legion: LegionRun | null = null;
  /** 침묵 스택 (침묵의 기사단장) */
  silenceStacks = 0;
  /** 엘프 그로기 남은 시간 (HUD 표시용) */
  legionGroggy = 0;
  /** 군단장이 HUD에 띄우는 상태 (보호막 남은 횟수 등). 그로기보다 먼저 보인다. */
  legionNote = '';
  private reviveLeft = 0;
  /** 마왕 레이드면 출격 정보와 진행자 */
  private raidRun: RaidRun | null = null;
  raid: RaidFight | null = null;
  /** 봉인 전 스탯 (레이드). 피해 계산은 봉인을 곱한 this.stats를 쓴다. */
  private fullStats: Stats | null = null;
  /** 월드 보스 전투인가, 흐른 시간 */
  worldBoss = false;
  private wbTime = 0;
  /** 쌓은 처치·타격 수 (천공 섬광의 마나검이 된다). 전투는 가득 찬 채로 시작한다. */
  skyStacks = 0;
  /** 이어지는 궁극기 (충전·표식·타이밍·룬 입력): tick이 true를 돌려주면 끝난다. lock이면 플레이어가 움직이거나 공격할 수 없다. */
  ult: { tick: (dt: number) => boolean; lock: boolean; still: boolean; src?: string } | null = null;
  /** 지금 들어가는 피해의 출처 (스킬 id, 'basic' 평타, 'special' 특수 공격). 수련장의 스킬별 집계에 쓴다. */
  src = 'basic';
  /** 방금 스킬을 쓴 슬롯 (누르고 있는 궁극기가 그 키를 본다) */
  lastCastSlot = 0;
  /** 플레이어의 타격이 몬스터에 들어갈 때마다 불린다 (별사냥 표식) */
  hitHook: ((m: Monster) => void) | null = null;
  /** 튜토리얼 전투면 진행자 */
  private tutorial: Tutorial | null = null;
  private isTutorial = false;
  /** 훈련 단계 없이 직업 체험장부터 시작한다 */
  private trialOnly = false;
  /** 수련장 (DPS 측정) */
  private training: TrainingRoom | null = null;
  private isTraining = false;

  constructor() {
    super('battle');
  }

  init(data: { phase: PhaseDef; legion?: LegionRun; raid?: RaidRun; worldBoss?: boolean; tutorial?: boolean; trialOnly?: boolean; training?: boolean }): void {
    this.raidRun = data.raid ?? null;
    this.raid = null;
    // 씬 객체는 전투마다 다시 쓰인다. 궁극기 도중에 전투가 끝났다면 그 채널이 남아,
    // 다음 전투에서 이미 지워진 그림을 건드리며 매 프레임 오류를 낸다. 여기서 비운다.
    this.ult = null;
    this.hitHook = null;
    resetVfx();
    this.fullStats = null;
    this.isTutorial = !!data.tutorial;
    this.skyStacks = SKY_MAX_BLADES * SKY_STACKS_PER_BLADE;
    this.trialOnly = !!data.trialOnly;
    this.isTraining = !!data.training;
    this.training = null;
    this.tutorial = null;
    this.phase = data.phase;
    this.legion = data.legion ?? null;
    this.worldBoss = !!data.worldBoss;
    this.wbTime = 0;
    this.silenceStacks = 0;
    this.legionGroggy = 0;
    this.legionNote = '';
    this.reviveLeft = this.legion?.mods.includes('revive') ? 1 : 0;
    this.monsters = [];
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

    // 마왕 레이드는 방어구 세 벌을 합친 장비로 계산한다.
    const run = this.raidRun;
    const gear = run ? raidGearBonus(this.save, run.armor) : gearBonus(this.save.gear.equipped, this.save.gear.enhance);
    this.stats = run ? totalStatsWith(this.save, gear) : totalStats(this.save);
    // 군단장 전투는 기지에서 고른 무기 2개, 레이드는 무기 5자루로 싸운다.
    const uids = run?.weapons.length ? run.weapons : (this.legion?.weapons ?? this.save.equipped);
    const weapons = uids.map((uid) => {
      const owned = this.save.weapons.find((w) => w.uid === uid) ?? this.save.weapons[0];
      const def = WEAPONS[owned.defId];
      return { def, enhance: owned.enhance, pages: buildPages(this.save, def.type) };
    });
    const derived = derive(this.stats, this.save.passives, gear, this.save.level);
    if (run) {
      // HP·마나는 원래 스탯으로 정하고, 봉인은 피해 계산에 쓰는 스탯에만 건다.
      this.fullStats = this.stats;
      this.raid = new RaidFight(this, run);
      this.raid.onSeal = () => this.applySeal();
      this.applySeal();
    }
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
    // 거대한 용처럼 발판을 무시하는 몬스터는 몸통 zone에 noPlatform을 단다.
    this.physics.add.collider(
      this.monsterGroup,
      this.level.platforms,
      undefined,
      (m, plat) =>
        !(m as Phaser.GameObjects.Zone).getData('noPlatform') &&
        onTop((m as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.Body, (plat as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody),
    );

    const cam = this.cameras.main;
    cam.setBounds(0, 0, phase.width, VIEW_H);
    cam.startFollow(this.player.zone, true, 0.12, 0.12, 0, 40);
    cam.setDeadzone(60, 40);
    cam.fadeIn(300);

    this.hazards = new Hazards(this);
    this.projectiles = new Projectiles(this);

    this.hud = new Hud(ctx.uiRoot);
    ctx.townHud.hide();
    this.events.once('shutdown', () => this.cleanup());
    this.announce(this.namedOnly ? phase.name : `${phase.id} ${phase.name}`, 1.6);
    if (this.isTutorial) this.tutorial = new Tutorial(this, ctx.uiRoot, this.trialOnly);
    if (this.isTraining) this.training = new TrainingRoom(this, ctx.uiRoot);
  }

  /** 페이즈 번호 없이 이름만 보여 주는 전투 */
  private get namedOnly(): boolean {
    return !!this.legion || !!this.raid || this.worldBoss || this.isTutorial || this.isTraining;
  }

  /** 레이드 봉인: 피해 계산에 쓰는 힘·민첩·마력을 봉인 비율만큼 줄인다 (HP 스탯은 그대로). */
  private applySeal(): void {
    const full = this.fullStats;
    if (!full || !this.raid) return;
    const k = this.raid.sealMul;
    this.stats = { str: full.str * k, dex: full.dex * k, int: full.int * k, hp: full.hp };
  }

  private cleanup(): void {
    // this.anims는 게임 전체가 함께 쓰므로, 일시정지 중에 나가면 마을까지 멈춘 채로 남는다.
    this.anims.resumeAll();
    this.raid?.destroy();
    this.tutorial?.destroy();
    this.training?.destroy();
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
    if (input.pressed('menu')) {
      this.togglePause();
      input.consume('menu');
    }
    if (this.paused) {
      input.endFrame();
      return;
    }
    // 히트스톱: 아주 잠깐 모든 것을 멈춘다.
    if (this.fx.hitstop > 0) {
      this.fx.hitstop -= dt;
      if (!this.physics.world.isPaused) this.physics.pause();
      // 멈춘 동안 누른 키(점프·구르기·스킬)는 버리지 않고 다음 프레임에 처리한다.
      return;
    }
    if (this.physics.world.isPaused) this.physics.resume();

    const p = this.player;
    p.updateTimers(dt);
    this.src = 'basic';
    if (this.ult) {
      const ult = this.ult;
      if (this.withSource(ult.src ?? 'basic', () => ult.tick(dt))) this.ult = null;
    }
    p.locked = !!this.ult?.still;
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

    this.projectiles.update(dt);
    this.hazards.update(dt);
    this.level.update();
    this.legionGroggy = Math.max(0, this.legionGroggy - dt);
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
      this.isTraining ? { text: '수련장을 나가 마을로 돌아갑니다.', giveUp: '수련장 나가기' } : this.tutorial?.pauseLabels(),
    );
  }

  // ───────────────────────── 피해 ─────────────────────────

  /** fn 동안 피해 출처를 src로 둔다. */
  withSource<T>(src: string, fn: () => T): T {
    const prev = this.src;
    this.src = src;
    try {
      return fn();
    } finally {
      this.src = prev;
    }
  }

  /** 보스 리그가 이번 프레임에 진행할 시간 (초). 히트스톱으로 멈춘 동안은 0이다. */
  rigStep(): number {
    return this.fx.hitstop > 0 ? 0 : Math.min(0.05, this.game.loop.delta / 1000);
  }

  /** 스킬을 썼다 (수련장 발동 횟수) */
  noteCast(id: string): void {
    this.training?.cast(id);
  }

  weaponBase(): number {
    const w = this.player.weapon;
    // 총 평타는 스탯을 쓰지 않으므로 레이드 봉인 비율을 그대로 곱한다.
    const seal = this.raid && w.def.type === 'gun' ? this.raid.sealMul : 1;
    return basicDamage(w.def, w.enhance, this.stats) * seal;
  }

  /** 스킬 피해 = Σ(스탯 × 계수) × 무기 강화 배율 */
  skillBase(coef: Partial<Stats>): number {
    const s = this.stats;
    const sum = (coef.str ?? 0) * s.str + (coef.dex ?? 0) * s.dex + (coef.int ?? 0) * s.int + (coef.hp ?? 0) * s.hp;
    const w = this.player.weapon;
    return sum * enhanceMultiplier(w.def.type, w.enhance);
  }

  /** 피해를 주고 실제로 들어간 피해를 돌려준다 (막히거나 피해가 없으면 0). */
  hitMonster(m: Monster, base: number, opts: HitOpts = {}): number {
    if (!m.alive || m.spawnTime > 0.3) return 0;
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
      return 0;
    }
    // 레이드 봉인의 결정: 맞는 무기로 친 횟수만큼 깎인다.
    if (this.raid?.isCrystal(m)) {
      this.raid.hitCrystal(m, p.weapon.def.type);
      return 0;
    }
    // 횟수 보호막: 피해 대신 한 번씩 깎인다.
    if (m.hitShield !== 0) {
      const hx = m.x + (Math.random() - 0.5) * 60;
      const hy = m.y + (Math.random() - 0.5) * 60;
      if (m.hitShield > 0) {
        m.hitShield--;
        this.fx.text(m.x, m.body.top - 30, String(m.hitShield), 'crit');
        this.fx.spark(hx, hy, 0xe0d0ff, 1.5, Math.random() < 0.5 ? 0 : Math.PI / 4);
        this.fx.burst(hx, hy, 0xb04aff, 6, 120, 300);
        sfx.play('block', 0.6);
        if (p.isMelee) this.fx.stop(0.03);
      } else {
        this.fx.text(m.x, m.body.top - 30, '무효', 'quiet');
        sfx.play('block', 0.3);
      }
      return 0;
    }
    const w = p.weapon.def;
    const critChance = w.critChance + p.derived.passive.critBonus;
    // 세트 효과의 치명타 피해 추가분은 기본 치명타 피해에 더한다.
    const critDamage = CRIT_DAMAGE + p.derived.critDamage;
    let crit = false;
    let critMul: number;
    if (w.type === 'gun') {
      // 총: 치명타 대신 (치명타 데미지 + 치명타 확률)의 80%만큼 항상 증가. 직업 패시브의 총 숙련이 둘 다 늘린다.
      critMul = 1 + (critDamage + p.derived.gunCritDamage + critChance + p.derived.gunCritChance) * 0.8;
    } else {
      crit = Math.random() < critChance;
      critMul = crit ? 1 + critDamage : 1;
    }
    // 후광 망령의 보호막을 두른 적은 피해를 절반만 받는다.
    const ward = m.ward > 0 ? 0.5 : 1;
    // 레이드 마왕: 약점 무기 ×3, 다른 무기 ×0.3
    const raidMul = this.raid && m === this.raid.boss ? this.raid.damageMul(w.type) : 1;
    let dmg = Math.max(1, Math.round(base * p.damageMul * (1 + p.derived.damageMul) * (1 + m.vuln) * critMul * dev.damageMul * ward * raidMul));
    if (dev.oneHit) dmg = Math.max(dmg, Math.ceil(m.hp));
    m.hp -= dmg;
    this.hitHook?.(m);
    this.training?.record(m, dmg, crit, this.src);
    // 탄검강의 타격도 다음 마나검으로 쌓인다.
    this.skyStacks++;
    m.onHit(p.x, opts.knock ?? 0, !opts.silent);
    if (opts.basic) p.mp = Math.min(p.derived.maxMp, p.mp + 2);
    if (opts.silent) {
      if (m.hp <= 0) this.killMonster(m);
      return dmg;
    }

    // 레이드: 약점 피해는 금빛 큰 숫자, 다른 무기는 흐린 숫자
    const style = raidMul > 1 || crit ? 'crit' : raidMul < 1 || opts.quiet ? 'quiet' : 'normal';
    this.fx.text(m.x, m.body.top - 2, String(dmg), style);
    if (!opts.quiet) {
      const hx = m.x + (Math.random() - 0.5) * m.body.width * 0.6;
      const hy = m.y + (Math.random() - 0.5) * m.body.height * 0.4;
      const tone = crit ? 0xffd060 : p.isMelee ? meleeLook(w).slash : w.type === 'staff' ? ORB_FX[orbLook(w)].color : HIT_COLOR[w.type];
      // 맞은 쪽 반대편(플레이어에게서 멀어지는 쪽)으로 불티가 튄다.
      const away = m.x >= p.x ? 0 : Math.PI;
      this.fx.spark(hx, hy, tone, crit ? 2 : 1, Math.random() * Math.PI);
      // 근접: 몸을 가로지르는 베인 자국
      if (p.isMelee) this.fx.cut(hx, hy, (Math.random() - 0.5) * 1.7, (crit ? 62 : 42) + Math.random() * 14, tone);
      this.fx.sparks(hx, hy, tone, crit ? 9 : 4, away - 0.25, 1.0, crit ? 250 : 180);
      this.fx.burst(hx, hy, tone, crit ? 5 : 2, 110, 300);
      if (crit) {
        this.fx.pop(hx, hy, 0xfff0c0, 1.6);
        this.fx.twinkle(hx + (Math.random() - 0.5) * 24, hy - 8 - Math.random() * 12, 0xffffff, 60);
      }
      sfx.play(crit ? 'crit' : 'hit');
      // 근접 타격은 아주 잠깐 멈춰 묵직하게
      if (p.isMelee && (opts.basic || opts.knock)) this.fx.stop(crit ? 0.07 : 0.035);
      if (crit) this.fx.shake(0.4, 80);
    } else sfx.play('hit', 0.35);

    if (m.hp <= 0) this.killMonster(m);
    return dmg;
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
  /**
   * o.from: 눈에 보이는 출발점 (총구). 판정은 (x, y)에서 나가는 몸 높이 선으로 하고, 빛줄기만 총구에서 그린다.
   * 맞은 적이 있으면 빛줄기는 총구 높이에서 가장 가까운 그 적의 몸으로 향하고, 없으면 총구 높이로 곧게 나간다.
   */
  hitscan(
    x: number,
    y: number,
    angle: number,
    len: number,
    damage: number,
    o: { pierce: boolean; color: number; width: number; quiet?: boolean; from?: { x: number; y: number } },
  ): void {
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
      let ey = y + Math.sin(angle) * end;
      if (o.from) {
        const rise = o.from.y - y;
        x = o.from.x;
        y = o.from.y;
        if (o.pierce) {
          // 관통탄은 총구 높이에서 판정 선으로 아주 완만하게 내려간다.
        } else if (targets.length) {
          const tb = targets[0].m.body;
          ey = Phaser.Math.Clamp(ey + rise, tb.y + 3, tb.bottom - 3);
        } else ey += rise;
      }
      if (o.width > 3) {
        // 저격: 굵은 빛줄기가 오래 남고, 지나간 자리에 연기가 핀다.
        this.fx.tracer(x, y, ex, ey, o.color, o.width, 320);
        this.fx.flashScreen(0xfff0c0, 0.25, 140);
        for (let d = 24 + Math.random() * 20; d < end; d += 26 + Math.random() * 40) {
          const k = d;
          const sx = x + ((ex - x) * k) / end;
          const sy = y + ((ey - y) * k) / end;
          this.time.delayedCall(40 + Math.random() * 120, () => this.fx.smoke(sx, sy + (Math.random() - 0.5) * 5, 1, 0x8a8480, -6 - Math.random() * 8));
        }
        this.fx.spark(ex, ey, o.color, 2);
      } else {
        this.fx.shot(x, y, ex, ey, o.color, o.width, 130);
        // 맞은 자리에서 뒤로 튀는 불티
        if (targets.length) {
          this.fx.sparks(ex, ey, o.color, 3, angle + Math.PI, 0.7, 150, 220);
          this.fx.spark(ex, ey, o.color);
        }
      }
    }
  }

  private killMonster(m: Monster): void {
    this.skyStacks++;
    m.kill();
    sfx.play(m.showsBossBar ? 'boom' : 'kill');
    // 튜토리얼에는 보상이 없다.
    if (this.isTutorial) {
      this.pending.kills++;
      return;
    }
    const p = this.player;
    // 일반 몬스터는 수가 늘어난 만큼 한 마리의 몫을 나눠, 페이즈 전체 보상을 그대로 둔다.
    const share = m.elite || m.showsBossBar || this.legion || this.raid || this.worldBoss ? 1 : 1 / MOB_COUNT_MUL;
    const mul = (m.elite ? ELITE_MOD.reward : 1) * share;
    this.pending.gold += m.def.gold * mul;
    this.pending.exp += m.def.exp * mul;
    this.pending.kills++;
    // 천공 섬광 시전 중에 잡아도 마나를 돌려받지 않는다.
    if (p.hoverTime <= 0) p.mp = Math.min(p.derived.maxMp, p.mp + m.def.mana * (m.elite ? 5 : 1));
    for (const d of m.def.drops) {
      if (Math.random() < (m.elite ? Math.min(1, d.chance * 2) : d.chance) * share) this.addMaterial(d.id, m.elite ? 2 : 1, m.x, m.body.top);
    }
    if (m.elite) this.addMaterial('elite_sigil', 1, m.x, m.body.top);
    if (m.def.kind === 'poison_zombie' || m.def.kind === 'plague_wolf') this.addField({ x: m.x - 34, w: 68, life: 4, tickEvery: 0.5, damage: 0, color: 0x8acc2a, poison: true });
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
      if (p.dodgeTime > 0 || p.blinkTime > 0) this.fx.text(p.x, headY, '회피', 'info');
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
      // 튜토리얼에서는 쓰러지지 않는다.
      if (this.isTutorial) {
        p.hp = p.derived.maxHp;
        this.fx.text(p.x, headY, '회복', 'heal');
        return;
      }
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
    if (this.raid) return this.raid.pace();
    if (!this.legion) return 1;
    return DIFFICULTY[this.legion.difficulty].pace * (this.legion.mods.includes('boss_slow') ? 1.15 : 1);
  }

  /** 기믹 완화 디버프: 즉사 예고를 늘린다 */
  legionWarnBonus(): number {
    return this.legion?.mods.includes('gimmick') ? 1 : 0;
  }

  get silenceMax(): number {
    if (this.legion?.id !== 'knight') return 0;
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
    this.silenceStacks = 0;
    this.executePlayer('침묵의 심판', 0xb04aff);
  }

  /** 군단장 즉사기: HP 100% 피해 (무적·가드 무시) */
  executePlayer(name: string, color: number): void {
    const p = this.player;
    if (p.dead) return;
    this.announce(name, 1.2);
    this.fx.flashScreen(0x6a1aa8, 0.6, 500);
    this.fx.pillar(p.x, p.feet, color, 220, 800);
    this.fx.shake(1.5, 300);
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
    if (this.tutorial) {
      this.tutorial.update(dt);
      return;
    }
    if (this.training) {
      // 수련장: 시작 연출이 끝나면 허수아비를 세우고, 그 뒤로는 측정만 한다.
      if (this.state === 'intro' && this.stateTimer <= 0) {
        this.state = 'fight';
        this.training.spawn();
      }
      this.training.update(dt);
      return;
    }
    if (this.worldBoss) {
      this.updateWorldBoss(dt);
      return;
    }
    if (this.raid) {
      // 마왕 레이드: 시작 연출이 끝나면 마왕을 세우고, 그 뒤로는 진행자가 기믹을 돌린다.
      if (this.state === 'intro') {
        if (this.stateTimer > 0) return;
        this.state = 'fight';
        this.boss = this.raid.spawnBoss();
      }
      this.raid.update(dt);
      return;
    }
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
        this.spawnTimer = 0.35 / MOB_COUNT_MUL;
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
    const interval = Math.max(0.5, 1.7 - this.missionTime * 0.012) / MOB_COUNT_MUL;
    if (alive < 18 * MOB_COUNT_MUL) {
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

  /** 월드 보스: 맵 한가운데 골렘을 세우고 3분을 잰다. 시간이 다 되거나 99줄을 다 깨면 끝. */
  private updateWorldBoss(dt: number): void {
    if (this.state === 'intro') {
      if (this.stateTimer > 0) return;
      this.state = 'fight';
      this.boss = this.spawnMonster('world_golem', false, this.phase.width / 2);
      this.announce('3분 동안 최대한 많은 줄을 깨라!', 2.2);
      sfx.play('wave');
      return;
    }
    this.wbTime += dt;
    if (this.wbTime >= WORLD_BOSS_TIME) {
      this.announce('시간 종료!', 2);
      this.clear();
    }
  }

  /** 월드 보스에 준 피해와 깬 줄 */
  private worldBossScore(): { damage: number; bars: number; left: number } {
    const g = this.boss;
    const damage = g ? Math.max(0, g.maxHp - Math.max(0, g.hp)) : 0;
    const { broken, left } = barProgress(damage);
    return { damage, bars: broken, left };
  }

  private clear(): void {
    if (this.cleared || this.player.dead) return;
    this.cleared = true;
    this.state = 'done';
    if (this.worldBoss) {
      // 깬 줄까지의 보상이 모두 쌓인다.
      const r = totalReward(this.worldBossScore().bars);
      this.pending.gold = r.gold;
      this.pending.materials = r.materials;
      this.announce(this.worldBossScore().bars >= WORLD_BOSS_BARS ? '99줄 전부 돌파!' : '시간 종료!', 2.5);
      sfx.play('clear');
      this.endTimer = 2.5;
      return;
    }
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
    // 월드 보스는 그만둬도 깬 줄까지 보상을 받는다.
    if (this.worldBoss && this.state === 'fight') {
      this.paused = false;
      this.hud.hidePause();
      this.physics.resume();
      this.anims.resumeAll();
      this.clear();
      this.finish();
      return;
    }
    this.player.dead = true;
    this.state = 'done';
    this.paused = false;
    this.hud.hidePause();
    this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.isTraining) {
      // 수련장: 결과 창 없이 마을의 허수아비 앞으로 돌아간다.
      this.cameras.main.fadeOut(250);
      this.time.delayedCall(260, () => this.scene.start('town', { area: 'town' }));
      return;
    }
    if (this.isTutorial) {
      // 결과 창과 보상 없이 바로 마을로 간다.
      ctx.onTutorialEnd();
      this.cameras.main.fadeOut(250);
      this.time.delayedCall(260, () => this.scene.start('town', { area: 'town' }));
      return;
    }
    const cleared = this.cleared && !this.player.dead;
    const outcome: BattleOutcome = {
      cleared,
      phase: this.phase,
      gold: cleared ? Math.round(this.pending.gold) : 0,
      exp: cleared ? Math.round(this.pending.exp) : 0,
      materials: cleared ? this.pending.materials : {},
      sweepTickets: cleared ? this.phase.clearReward.sweepTickets : 0,
      kills: this.pending.kills,
    };
    if (this.legion) {
      // 군단장 보상: 조각 (하드는 희망의 조각을 낮은 확률로). 버프·디버프를 고를수록 줄어든다.
      outcome.legion = this.legion;
      outcome.materials = cleared ? legionReward(this.legion) : {};
    }
    if (this.worldBoss) {
      const sc = this.worldBossScore();
      outcome.worldBoss = { bars: sc.bars, damage: Math.round(sc.damage) };
      outcome.sweepTickets = totalReward(sc.bars).sweepTickets;
    }
    if (this.raidRun) {
      outcome.raid = this.raidRun;
      outcome.materials = cleared ? raidReward(this.raidRun) : {};
    }
    const area = this.legion || this.raidRun ? 'base' : 'town';
    ctx.onBattleEnd(outcome, this.hud, () => {
      this.cameras.main.fadeOut(250);
      this.time.delayedCall(260, () => this.scene.start('town', { area }));
    });
  }

  // ───────────────────────── 포션 ─────────────────────────

  /** 포션은 세이브에서 바로 빠진다 (실패해도 돌려받지 않는다). */
  private usePotions(dt: number): void {
    // 튜토리얼·체험장·수련장에서는 가진 포션을 쓰지 않는다.
    if (this.isTutorial || this.isTraining) return;
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

  // ───────────────────────── 투사체·장판 ─────────────────────────
  // 본체는 battle/projectiles.ts와 battle/hazards.ts에 있다. 스킬·몬스터 코드는 씬의 이 창구로 부른다.

  spawnPlayerBolt(...a: Parameters<Projectiles['spawnPlayer']>): void {
    this.projectiles.spawnPlayer(...a);
  }

  spawnEnemyBolt(...a: Parameters<Projectiles['spawnEnemy']>): void {
    this.projectiles.spawnEnemy(...a);
  }

  /** 바닥에서 솟는 불기둥 */
  firePillar(...a: Parameters<Hazards['firePillar']>): void {
    this.hazards.firePillar(...a);
  }

  /** 하늘에서 내리꽂히는 빛기둥 */
  lightBeam(...a: Parameters<Hazards['lightBeam']>): void {
    this.hazards.lightBeam(...a);
  }

  /** 적이 부르는 운석 */
  enemyMeteor(...a: Parameters<Hazards['enemyMeteor']>): void {
    this.hazards.enemyMeteor(...a);
  }

  /** 자폭 (처치로 치지 않는다) */
  selfDestruct(...a: Parameters<Hazards['selfDestruct']>): void {
    this.hazards.selfDestruct(...a);
  }

  addField(...a: Parameters<Hazards['addField']>): void {
    this.hazards.addField(...a);
  }

  addTelegraph(...a: Parameters<Hazards['addTelegraph']>): void {
    this.hazards.addTelegraph(...a);
  }

  /** 바닥을 타고 양옆으로 퍼지는 충격파 */
  addShockwave(...a: Parameters<Hazards['addShockwave']>): void {
    this.hazards.addShockwave(...a);
  }

  /** 플레이어의 메테오 */
  castMeteor(...a: Parameters<Hazards['castMeteor']>): void {
    this.hazards.castMeteor(...a);
  }

  /** 레이저 줄기를 켜고 끈다 */
  setBeam(on: boolean): void {
    this.hazards.setBeam(on);
  }

  // ───────────────────────── HUD ─────────────────────────

  private hudState(): HudState {
    const p = this.player;
    const w = p.weapon;
    const other = p.weapons[(p.active + 1) % p.weapons.length];
    const keymap = this.save.keymap;
    const slots: HudSlot[] = w.slots.map((s, i) => {
      const key = keyLabel(keymap[SLOT_ACTIONS[i]]);
      if (!s) return { key, short: '', name: '', mana: 0, cdLeft: 0, cdRatio: 0, usable: false, empty: true };
      const cdLeft = p.cooldowns.get(s.id) ?? 0;
      // 천공 섬광 칸에는 지금 소환할 수 있는 마나검 수를 적는다.
      const blades = s.id === SKY_FLASH_ID ? this.skyBladeCount() : -1;
      const mana = blades >= 0 ? skyShotMana(p.derived.maxMp) : s.mana;
      return { key, short: blades >= 0 ? `${blades}검` : s.short, name: s.name, mana, cdLeft, cdRatio: cdLeft / (s.cooldown * (1 - p.derived.cdReduce)), usable: cdLeft <= 0 && p.mp >= mana && blades !== 0, empty: false };
    });
    const mission = this.phase.mission;
    let waveText: string;
    if (mission) {
      if (this.state === 'intro') waveText = '준비';
      else if (mission.kind === 'survive') waveText = `생존 ${Math.max(0, Math.ceil(mission.seconds - this.missionTime))}초 남음`;
      else waveText = `처치 ${Math.min(this.pending.kills, mission.target)} / ${mission.target}`;
    } else if (this.worldBoss) {
      const left = Math.max(0, WORLD_BOSS_TIME - this.wbTime);
      waveText = this.state === 'intro' ? '준비' : `남은 시간 ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} · 총 피해 ${koNum(Math.round(this.worldBossScore().damage))}`;
    } else if (this.isTutorial) waveText = this.tutorial?.inTrial ? '직업 체험' : '훈련 중';
    else if (this.isTraining) waveText = 'DPS 측정';
    else if (this.phase.type === 'boss') waveText = '보스 페이즈';
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
      skillPage: w.pages.length > 1 ? { key: keyLabel(keymap.skillPage), text: `${w.page + 1} / ${w.pages.length}` } : null,
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
      phaseName: this.namedOnly ? this.phase.name : `${this.phase.id} ${this.phase.name}`,
      waveText,
      gold: this.pending.gold,
      kills: this.pending.kills,
      boss: barTarget ? { name: barTarget.def.name, hp: Math.max(0, barTarget.hp), maxHp: barTarget.maxHp, phase2: barTarget.phase2, stack: this.worldBoss ? this.worldBossStack() : isStacked(barTarget.maxHp) ? this.bossStack(barTarget) : undefined } : null,
      legion: this.raid
        ? { stacks: 0, max: 0, silence: 0, revive: 0, status: this.raid.note() }
        : this.legion
        ? {
            stacks: this.silenceStacks,
            max: this.silenceMax,
            silence: p.silenceTime,
            revive: this.reviveLeft,
            status: this.legionNote || (this.legionGroggy > 0 ? `그로기 ${this.legionGroggy.toFixed(1)}초 · 받는 피해 200%` : ''),
          }
        : null,
      dodgeReady: p.dodgeCd <= 0,
      dodgeLabel: p.blinks ? '블링크' : '구르기',
    };
  }

  /** 겹친 체력바: 남은 줄, 지금 줄의 남은 비율과 색, 아래 줄 색 */
  /** 지금 천공 섬광으로 소환할 수 있는 마나검 수 */
  skyBladeCount(): number {
    return Math.min(SKY_MAX_BLADES, Math.floor(this.skyStacks / SKY_STACKS_PER_BLADE));
  }

  /** 천공 섬광을 쓴다: 마나검 수를 돌려주고 쌓은 처치·타격을 비운다. */
  takeSkyBlades(): number {
    const n = this.skyBladeCount();
    this.skyStacks = 0;
    return n;
  }

  /** 체력이 많은 보스·미니보스의 겹친 체력바 */
  private bossStack(m: Monster): { left: number; ratio: number; color: string; under: string } {
    const st = hpStack(Math.max(0, m.hp));
    const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
    return { left: st.left, ratio: st.ratio, color: css(st.color), under: css(st.under) };
  }

  private worldBossStack(): { left: number; ratio: number; color: string; under: string } {
    const sc = this.worldBossScore();
    const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
    const palette = STACK_COLORS;
    const done = sc.bars >= WORLD_BOSS_BARS;
    return {
      left: WORLD_BOSS_BARS - sc.bars,
      ratio: done ? 0 : sc.left,
      color: css(palette[sc.bars % palette.length]),
      under: sc.bars + 1 >= WORLD_BOSS_BARS ? '#1a1214' : css(palette[(sc.bars + 1) % palette.length]),
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
