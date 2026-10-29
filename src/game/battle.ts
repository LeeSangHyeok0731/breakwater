import * as THREE from 'three';
import { SLOT_ACTIONS, keyLabel, type Input } from '../core/input';
import { sfx } from '../core/audio';
import type { SaveData } from '../core/save';
import { MATERIALS } from '../data/items';
import { gearBonus, POTION_LIMIT_PER_PHASE } from '../data/gear';
import { ELITE_MOD, type MonsterKind } from '../data/monsters';
import type { PhaseDef, Theme } from '../data/phases';
import { SKILLS, type SkillDef } from '../data/skills';
import { GRADES, WEAPONS, type WeaponType } from '../data/weapons';
import { Hud, type HudSlot } from '../ui/hud';
import { updatePlayerCombat } from './combat';
import { Effects } from './effects';
import { CameraRig } from './cameraRig';
import { ViewModel } from './viewModel';
import { box, ico, mat } from './models';
import { groundTexture, makeSky, placeProp, radialAlpha, scatterGrass, seeded } from './environment';
import type { PropName } from './assets';
import { Monster } from './monster';
import { Player, forwardOf } from './player';
import { CRIT_DAMAGE, basicDamage, derive, enhanceMultiplier, expToNext, totalStats, type Stats } from './stats';

export interface BattleOutcome {
  cleared: boolean;
  phase: PhaseDef;
  gold: number;
  exp: number;
  materials: Record<string, number>;
  sweepTickets: number;
  kills: number;
}

export interface HitOpts {
  basic?: boolean;
  stun?: number;
  vuln?: [number, number];
  /** [감속 비율, 지속 시간] */
  slow?: [number, number];
  quiet?: boolean;
}

interface PlayerBolt {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  damage: number;
  basic: boolean;
  aoe: number;
  color: number;
  life: number;
  pierce: boolean;
  hit: Set<Monster>;
  gravity: number;
  stun: number;
  arrow: boolean;
}

interface EnemyBolt {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  damage: number;
  gravity: number;
  aoe: number;
  life: number;
  owner: Monster;
}

export interface FieldSpec {
  pos: THREE.Vector3;
  radius: number;
  life: number;
  tickEvery: number;
  damage: number;
  slow?: number;
  color: number;
  /** 공중의 적도 맞는다 */
  hitsAir?: boolean;
  /** 화살비 연출 */
  rain?: boolean;
}

interface Field extends FieldSpec {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  tickTimer: number;
  age: number;
}

/** 플레이어를 해치는 바닥 (독 좀비가 죽으며 남기는 독 웅덩이) */
interface Hazard {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  radius: number;
  life: number;
  tickTimer: number;
  damage: number;
  age: number;
}

interface Telegraph {
  group: THREE.Group;
  fill: THREE.Mesh;
  materials: THREE.MeshBasicMaterial[];
  time: number;
  dur: number;
  owner: Monster | null;
  onFire: (() => void) | null;
}

interface Shockwave {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  r: number;
  maxR: number;
  speed: number;
  damage: number;
  hit: boolean;
  owner: Monster;
}

interface Meteor {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  at: THREE.Vector3;
  time: number;
  dur: number;
  damage: number;
  burn: number;
}

type BattleState = 'intro' | 'fight' | 'rest' | 'done';

interface ThemeColors {
  skyTop: number;
  sky: number;
  skyBottom: number;
  /** 바깥 풀밭 텍스처: 바탕·어두운 얼룩·밝은 얼룩 */
  grass: [string, string, string];
  /** 경기장 흙바닥 텍스처 */
  dirt: [string, string, string];
  blades: number[];
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunIntensity: number;
  /** 랜턴 불빛 세기 (0이면 조명 없음) */
  lantern: number;
}

const THEMES: Record<Theme, ThemeColors> = {
  day: {
    skyTop: 0x4a86d0,
    sky: 0xbcd8ee,
    skyBottom: 0x6a8a50,
    grass: ['#5f8a3e', '#4a7032', '#7aa04c'],
    dirt: ['#8a7656', '#6e5c42', '#a08c68'],
    blades: [0x5f9a3a, 0x6faa44, 0x4f8a34, 0x8ab04a],
    hemiSky: 0xdfeeff,
    hemiGround: 0x4a3a28,
    hemi: 1.1,
    sun: 0xfff0d8,
    sunIntensity: 2.2,
    lantern: 0,
  },
  dusk: {
    skyTop: 0x5a4a8a,
    sky: 0xf0a070,
    skyBottom: 0x5a5030,
    grass: ['#5a6a34', '#46542a', '#76803e'],
    dirt: ['#7e6448', '#644c36', '#967a58'],
    blades: [0x6a7a34, 0x7a8a3a, 0x5a6a2e, 0x9a8a40],
    hemiSky: 0xffd2b0,
    hemiGround: 0x4a3020,
    hemi: 1.0,
    sun: 0xffa060,
    sunIntensity: 2.0,
    lantern: 6,
  },
  night: {
    skyTop: 0x05070f,
    sky: 0x1e2846,
    skyBottom: 0x10141e,
    grass: ['#2e3e2c', '#222e22', '#3e5038'],
    dirt: ['#4a463a', '#38342c', '#5e5848'],
    blades: [0x2e4a30, 0x3a5a38, 0x26402a],
    hemiSky: 0x8a9ad8,
    hemiGround: 0x1e1e2c,
    hemi: 1.0,
    sun: 0xb0c0ff,
    sunIntensity: 1.5,
    lantern: 14,
  },
  lava: {
    skyTop: 0x0e0606,
    sky: 0x4a1e14,
    skyBottom: 0x1a0c08,
    grass: ['#2e2624', '#221c1a', '#3e3230'],
    dirt: ['#4a3e3a', '#3a302c', '#5e4e48'],
    blades: [],
    hemiSky: 0xffc0a0,
    hemiGround: 0x301810,
    hemi: 0.8,
    sun: 0xffa070,
    sunIntensity: 1.6,
    lantern: 10,
  },
};

const circleGeo = new THREE.CircleGeometry(1, 40);
const ringGeo = new THREE.RingGeometry(0.93, 1, 48);
const waveRingGeo = new THREE.RingGeometry(0.88, 1, 64);
const boltGeo = new THREE.IcosahedronGeometry(1, 1);
const arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 4).rotateX(Math.PI / 2);
const arrowTipGeo = new THREE.ConeGeometry(0.06, 0.18, 4).rotateX(Math.PI / 2).translate(0, 0, 0.55);

/** 장착 무기의 스킬 슬롯: 배운 스킬을 목록 순서대로 최대 8개 채운다. */
export function buildSlots(save: SaveData, type: WeaponType): (SkillDef | null)[] {
  const learned = SKILLS.filter((s) => s.weapon === type && save.learnedSkills.includes(s.id)).slice(0, 8);
  const slots: (SkillDef | null)[] = [...learned];
  while (slots.length < 8) slots.push(null);
  return slots;
}

export class Battle {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly effects: Effects;
  readonly hud: Hud;
  readonly player: Player;
  readonly stats: Stats;
  readonly arenaRadius: number;
  monsters: Monster[] = [];
  readonly aimPoint = new THREE.Vector3();
  readonly rig: CameraRig;
  private viewModel: ViewModel;

  private playerBolts: PlayerBolt[] = [];
  private enemyBolts: EnemyBolt[] = [];
  private fields: Field[] = [];
  private telegraphs: Telegraph[] = [];
  private shockwaves: Shockwave[] = [];
  private meteors: Meteor[] = [];
  private hazards: Hazard[] = [];
  /** 특별 스테이지 진행 시간 */
  private missionTime = 0;
  private spawnAcc = 0;
  private potionUsed = { hp: 0, mp: 0 };
  private potionCd = 0;
  private beam: THREE.Group;
  private sky: THREE.Mesh | null = null;
  private sun: THREE.DirectionalLight | null = null;

  private state: BattleState = 'intro';
  private stateTimer = 2;
  private waveIndex = -1;
  private spawnQueue: { kind: MonsterKind; elite: boolean }[] = [];
  private spawnTimer = 0;
  private boss: Monster | null = null;
  private pending = { gold: 0, exp: 0, materials: {} as Record<string, number>, kills: 0 };
  private endTimer = -1;
  private cleared = false;
  private ended = false;
  private started = false;
  private paused = false;
  private unsubscribeLock: () => void;

  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    readonly input: Input,
    private readonly save: SaveData,
    readonly phase: PhaseDef,
    uiRoot: HTMLElement,
    private readonly onEnd: (outcome: BattleOutcome) => void,
  ) {
    this.arenaRadius = phase.arenaRadius;
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 400);
    this.rig = new CameraRig(this.camera);
    this.rig.mode = save.viewMode;
    // 1인칭 무기는 카메라의 자식이라 카메라를 씬에 넣어야 그려진다.
    this.scene.add(this.camera);
    this.viewModel = new ViewModel(this.camera);
    this.hud = new Hud(uiRoot);
    this.effects = new Effects(this.scene, this.camera, this.hud.layer);

    this.stats = totalStats(save);
    const weapons = save.equipped.map((uid) => {
      const owned = save.weapons.find((w) => w.uid === uid) ?? save.weapons[0];
      const def = WEAPONS[owned.defId];
      return { def, enhance: owned.enhance, slots: buildSlots(save, def.type) };
    });
    this.player = new Player(derive(this.stats, save.passives, gearBonus(save.gear.equipped)), weapons);
    this.player.pos.set(0, 0, -this.arenaRadius * 0.35);
    this.player.yaw = 0;
    this.applyViewMode();
    this.player.animate(0);
    this.scene.add(this.player.root);

    this.beam = this.makeBeam();
    this.scene.add(this.beam);

    this.buildArena();

    this.unsubscribeLock = input.onLockChange((locked) => {
      if (this.ended) return;
      if (locked) {
        this.hud.hideStartHint();
        this.hud.hidePause();
        this.started = true;
        this.paused = false;
      } else if (this.started) {
        this.paused = true;
        this.hud.showPause(
          () => this.input.requestLock(),
          () => this.giveUp(),
        );
      } else {
        this.hud.showStartHint(() => this.input.requestLock(), this.save.keymap);
      }
    });
    this.hud.showStartHint(() => this.input.requestLock(), this.save.keymap);
    this.updateCamera(0);
  }

  // ───────────────────────── 루프 ─────────────────────────

  update(dt: number): void {
    if (!this.started || this.paused || this.ended) {
      this.updateCamera(0);
      this.input.endFrame();
      return;
    }

    const input = this.input;
    const p = this.player;
    this.rig.look(input, this.save.sensitivity);
    if (input.pressed('view')) {
      this.save.viewMode = this.rig.toggle();
      this.applyViewMode();
      this.hud.notify(this.rig.mode === 'first' ? '1인칭 시점' : '3인칭 시점', 0.8);
    }
    p.yaw = this.rig.yaw;
    p.pitch = this.rig.pitch;

    p.updateTimers(dt);
    this.updateAim();
    updatePlayerCombat(this, dt);
    this.usePotions(dt);
    p.updateMovement(dt, input, this.arenaRadius);
    p.animate(dt);
    this.viewModel.update(dt, p);

    this.updateWaves(dt);
    for (const m of this.monsters) m.update(dt, this);
    this.separate();
    this.monsters = this.monsters.filter((m) => {
      if (m.removable) {
        m.removeFrom(this.scene);
        return false;
      }
      return true;
    });

    this.updatePlayerBolts(dt);
    this.updateEnemyBolts(dt);
    this.updateFields(dt);
    this.updateTelegraphs(dt);
    this.updateShockwaves(dt);
    this.updateMeteors(dt);
    this.updateHazards(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.followLights();
    this.hud.update(this.hudState());

    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer < 0) this.finish();
    }
    input.endFrame();
  }

  /** 개발용 상태 요약 */
  debugSummary(): string {
    const alive = this.monsters.filter((m) => m.alive);
    const kinds: Record<string, number> = {};
    for (const m of alive) kinds[m.def.kind] = (kinds[m.def.kind] ?? 0) + 1;
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

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.unsubscribeLock();
    this.effects.clear();
    this.hud.destroy();
  }

  /** 포션은 세이브에서 바로 빠진다 (실패해도 돌려받지 않는다). */
  private usePotions(dt: number): void {
    this.potionCd = Math.max(0, this.potionCd - dt);
    const p = this.player;
    for (const [action, id] of [
      ['item1', 'hp'],
      ['item2', 'mp'],
    ] as const) {
      if (!this.input.pressed(action) || p.dead || this.potionCd > 0) continue;
      const name = id === 'hp' ? '체력 포션' : '마나 포션';
      if (this.save.potions[id] <= 0) {
        this.hud.notify(`${name}이 없습니다`);
        continue;
      }
      if (this.potionUsed[id] >= POTION_LIMIT_PER_PHASE) {
        this.hud.notify(`이번 페이즈에서는 ${name}을 더 쓸 수 없습니다`);
        continue;
      }
      const head = this.tmp2.set(p.pos.x, p.pos.y + 2.1, p.pos.z);
      if (id === 'hp') {
        if (p.hp >= p.derived.maxHp) {
          this.hud.notify('HP가 가득 찼습니다');
          continue;
        }
        const heal = Math.round(p.derived.maxHp * 0.35);
        p.hp = Math.min(p.derived.maxHp, p.hp + heal);
        this.effects.text(head, `+${heal}`, 'heal');
        this.effects.burst(p.pos.clone().setY(1.2), 0x6aff8a, 12, 3, 0.1, 0.6, -2);
      } else {
        if (p.mp >= p.derived.maxMp) {
          this.hud.notify('마나가 가득 찼습니다');
          continue;
        }
        p.mp = Math.min(p.derived.maxMp, p.mp + 60);
        this.effects.text(head, '+60 마나', 'info');
        this.effects.burst(p.pos.clone().setY(1.2), 0x6ab8ff, 12, 3, 0.1, 0.6, -2);
      }
      sfx.play('potion');
      this.save.potions[id]--;
      this.potionUsed[id]++;
      this.potionCd = 0.8;
    }
  }

  /** 하늘은 카메라를, 그림자용 태양은 플레이어를 따라간다 (그림자를 선명하게). */
  private followLights(): void {
    if (this.sky) this.sky.position.copy(this.camera.position);
    if (this.sun) {
      const p = this.player.pos;
      this.sun.position.set(p.x + 18, 34, p.z + 12);
      this.sun.target.position.set(p.x, 0, p.z);
    }
  }

  // ───────────────────────── 카메라·조준 ─────────────────────────

  private updateCamera(dt: number): void {
    const p = this.player;
    this.rig.yaw = p.yaw;
    this.rig.pitch = p.pitch;
    this.rig.update(p.pos, dt, { ads: p.ads });
  }

  /** 1인칭이면 내 몸을 숨기고 화면 앞 무기를 보여 준다. */
  private applyViewMode(): void {
    const first = this.rig.mode === 'first';
    this.player.hidden = first;
    this.viewModel.setVisible(first);
  }

  /** 투사체가 나가는 위치. 1인칭은 화면 오른쪽 아래, 3인칭은 캐릭터의 손 앞. */
  muzzle(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.rig.mode !== 'first') return this.player.muzzle(out);
    const f = this.rig.forward(this.tmp2);
    const p = this.player;
    out.copy(this.camera.position).addScaledVector(f, 0.55);
    out.x += -Math.cos(p.yaw) * 0.16;
    out.z += Math.sin(p.yaw) * 0.16;
    out.y -= 0.14;
    return out;
  }

  /** 화면 중앙(크로스헤어)에서 쏜 광선이 처음 닿는 지점 */
  private updateAim(): void {
    this.updateCamera(0);
    const origin = this.camera.position;
    const dir = this.camera.getWorldDirection(this.tmp);
    let best = 80;
    if (dir.y < -1e-3) best = Math.min(best, -origin.y / dir.y);
    const c = new THREE.Vector3();
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m.center(c);
      const r = Math.max(m.radius, m.height * 0.4);
      const ox = origin.x - c.x;
      const oy = origin.y - c.y;
      const oz = origin.z - c.z;
      const bq = ox * dir.x + oy * dir.y + oz * dir.z;
      const cq = ox * ox + oy * oy + oz * oz - r * r;
      const disc = bq * bq - cq;
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);
      // 3인칭에서는 카메라와 캐릭터 사이에 있는 적은 무시한다.
      if (t > (this.rig.mode === 'first' ? 0.3 : 4.6) && t < best) best = t;
    }
    this.aimPoint.copy(origin).addScaledVector(dir, best);
  }

  /** 조준점을 바닥으로 내린 위치 (장판·메테오용). 플레이어에게서 maxDist 이내로 제한한다. */
  groundAim(maxDist: number): THREE.Vector3 {
    const at = this.aimPoint.clone();
    at.y = 0;
    const dx = at.x - this.player.pos.x;
    const dz = at.z - this.player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > maxDist) {
      at.x = this.player.pos.x + (dx / d) * maxDist;
      at.z = this.player.pos.z + (dz / d) * maxDist;
    }
    return at;
  }

  shake(amount: number): void {
    this.rig.shake(this.rig.mode === 'first' ? amount * 0.5 : amount);
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
    if (!m.alive) return;
    const p = this.player;
    const w = p.weapon.def;
    let crit = false;
    let critMul: number;
    const critChance = w.critChance + p.derived.passive.critBonus;
    if (w.type === 'gun') {
      // 총: 치명타 대신 (치명타 데미지 + 치명타 확률)의 80%만큼 항상 증가
      critMul = 1 + (CRIT_DAMAGE + critChance) * 0.8;
    } else {
      crit = Math.random() < critChance;
      critMul = crit ? 1 + CRIT_DAMAGE : 1;
    }
    const dmg = Math.max(1, Math.round(base * p.damageMul * (1 + m.vuln) * critMul));
    m.hp -= dmg;
    m.onHit();

    if (opts.stun && !m.boss) m.stun = Math.max(m.stun, m.elite || m.def.miniboss ? opts.stun * 0.5 : opts.stun);
    if (opts.vuln) {
      m.vuln = Math.max(m.vuln, opts.vuln[0]);
      m.vulnTime = opts.vuln[1];
    }
    if (opts.slow) {
      m.slowMul = Math.min(m.slowMul, 1 - opts.slow[0]);
      m.slowTime = Math.max(m.slowTime, opts.slow[1]);
    }
    if (opts.basic) p.mp = Math.min(p.derived.maxMp, p.mp + 2);

    const c = m.center(this.tmp2);
    c.y += m.height * 0.3;
    this.effects.text(c, String(dmg), crit ? 'crit' : opts.quiet ? 'quiet' : 'normal');
    sfx.play(crit ? 'crit' : 'hit', opts.quiet ? 0.35 : 1);
    if (!opts.quiet) this.effects.burst(c, crit ? 0xffc040 : 0xffffff, crit ? 8 : 4, 4, 0.08, 0.3);

    if (m.hp <= 0) this.killMonster(m);
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

    const c = m.center();
    this.effects.burst(c, 0x8a5aa0, m.boss ? 60 : 14, m.boss ? 10 : 5, m.boss ? 0.3 : 0.14, 0.7);
    for (const d of m.def.drops) {
      if (Math.random() < (m.elite ? Math.min(1, d.chance * 2) : d.chance)) this.addMaterial(d.id, m.elite ? 2 : 1, c);
    }
    if (m.elite) this.addMaterial('elite_sigil', 1, c);
    if (m.def.kind === 'poison_zombie') this.addHazard(m.pos, m.elite ? 3.4 : 2.4, 4, 6);

    if (m === this.boss) {
      for (const other of this.monsters) if (other.alive && other !== m) other.kill();
      this.clear();
    }
  }

  private addMaterial(id: string, count: number, at: THREE.Vector3): void {
    this.pending.materials[id] = (this.pending.materials[id] ?? 0) + count;
    this.effects.text(at.clone().setY(at.y + 0.6), `+${MATERIALS[id]?.name ?? id}`, 'info');
  }

  damagePlayer(amount: number, src: { pos: THREE.Vector3; monster?: Monster; melee: boolean; unblockable?: boolean }): void {
    const p = this.player;
    if (p.dead || this.ended) return;
    const head = this.tmp2.set(p.pos.x, p.pos.y + 2.1, p.pos.z);

    if (p.invuln > 0) {
      this.effects.text(head, '회피', 'info');
      return;
    }

    if (p.guarding && !src.unblockable) {
      const f = forwardOf(p.yaw);
      const dx = src.pos.x - p.pos.x;
      const dz = src.pos.z - p.pos.z;
      const len = Math.hypot(dx, dz);
      const front = len < 0.01 || (dx * f.x + dz * f.z) / len > 0.5;
      if (front) {
        if (p.parryTimer > 0) {
          this.effects.text(head, '패링!', 'heal');
          sfx.play('parry');
          this.effects.flash(head.clone().setY(p.pos.y + 1.3).addScaledVector(f, 0.8), 1.2, 0xfff2a0, 0.25);
          p.mp = Math.min(p.derived.maxMp, p.mp + 10 + p.derived.passive.parryMana);
          if (src.monster && src.melee && !src.monster.boss) src.monster.stun = Math.max(src.monster.stun, 1.5);
          return;
        }
        amount *= 0.3;
        this.effects.text(head, '가드', 'info');
        sfx.play('block');
        this.effects.burst(head.clone().setY(p.pos.y + 1.3).addScaledVector(f, 0.6), 0xdddddd, 5, 3, 0.07, 0.25);
      }
    }

    if (p.wardHits > 0) {
      p.wardHits--;
      if (p.wardHits === 0) p.wardTime = 0;
      this.effects.text(head, '방어막', 'info');
      this.effects.flash(head.clone().setY(p.pos.y + 1.1), 1.4, 0xffd34a, 0.2);
      return;
    }

    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, amount);
      p.shield -= absorbed;
      amount -= absorbed;
      if (amount <= 0) {
        this.effects.text(head, '보호막', 'info');
        return;
      }
    }

    const dmg = Math.max(1, Math.round(amount));
    p.hp -= dmg;
    p.hurtTimer = 0.35;
    this.hud.hurt();
    sfx.play('hurt');
    this.effects.text(head, `-${dmg}`, 'player');
    this.shake(0.15);
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      this.fail();
    }
  }

  /** 바닥 내려찍기: 범위 안에서 땅에 있는 플레이어만 맞는다. */
  groundSlam(at: THREE.Vector3, radius: number, damage: number, owner: Monster): void {
    sfx.play('boom', 0.7);
    this.effects.ring(at, radius, 0xffa040, 0.35);
    this.effects.burst(at.clone().setY(0.2), 0x9a8a70, 18, 6, 0.16, 0.6);
    const p = this.player;
    if (Math.hypot(p.pos.x - at.x, p.pos.z - at.z) <= radius + 0.4 && p.pos.y < 1.2) {
      this.damagePlayer(damage, { pos: owner.pos, monster: owner, melee: true });
    }
  }

  // ───────────────────────── 스폰·웨이브 ─────────────────────────

  spawnMonster(kind: MonsterKind, elite: boolean, at?: THREE.Vector3): Monster {
    const m = new Monster(kind, elite, this.phase.hpMul);
    if (at) {
      m.pos.set(at.x, 0, at.z);
    } else {
      const pa = Math.atan2(this.player.pos.z, this.player.pos.x);
      const a = pa + Math.PI + (Math.random() - 0.5) * 3.2;
      const r = this.arenaRadius - 2 - Math.random() * 3;
      m.pos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    m.facing = Math.atan2(this.player.pos.x - m.pos.x, this.player.pos.z - m.pos.z);
    m.addTo(this.scene);
    this.monsters.push(m);
    this.effects.burst(m.pos.clone().setY(0.5), 0x9a4aff, 10, 3, 0.12, 0.6);
    this.effects.ring(m.pos, 1.5 * m.scale, 0x9a4aff, 0.5);
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
        this.spawnTimer = 0.28;
      }
      return;
    }

    if (this.boss) return;
    if (this.monsters.some((m) => m.alive)) return;

    if (this.waveIndex + 1 < this.phase.waves.length) {
      this.state = 'rest';
      this.stateTimer = 4;
      this.hud.notify('다음 웨이브까지 4초', 2);
    } else {
      this.clear();
    }
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
    const interval = Math.max(0.45, 1.6 - this.missionTime * 0.012);
    if (alive < 28) {
      this.spawnAcc += dt;
      while (this.spawnAcc >= interval) {
        this.spawnAcc -= interval;
        const pick = this.pickSpawn();
        if (pick) this.spawnMonster(pick.kind, !!pick.elite);
      }
    }
    const done = mission.kind === 'survive' ? this.missionTime >= mission.seconds : this.pending.kills >= mission.target;
    if (done) {
      // 남은 몬스터는 보상 없이 사라진다.
      for (const m of this.monsters) if (m.alive) m.kill();
      this.clear();
    }
  }

  private pickSpawn(): { kind: MonsterKind; elite?: boolean } | null {
    const pool = this.phase.spawnPool ?? [];
    const total = pool.reduce((a, e) => a + e.weight, 0);
    let r = Math.random() * total;
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) return e;
    }
    return pool[0] ?? null;
  }

  private startWave(index: number): void {
    this.waveIndex = index;
    this.state = 'fight';
    const queue: { kind: MonsterKind; elite: boolean }[] = [];
    for (const g of this.phase.waves[index]) {
      for (let i = 0; i < g.count; i++) queue.push({ kind: g.kind, elite: !!g.elite });
    }
    // 엘리트는 마지막에, 나머지는 섞어서 나온다.
    const normal = queue.filter((q) => !q.elite).sort(() => Math.random() - 0.5);
    this.spawnQueue = [...normal, ...queue.filter((q) => q.elite)];
    this.spawnTimer = 0.3;
    sfx.play('wave');
    if (this.phase.type === 'boss') this.announce(this.phase.name, 2.5);
    else this.announce(index === this.phase.waves.length - 1 ? `마지막 웨이브` : `웨이브 ${index + 1}`);
  }

  private clear(): void {
    if (this.cleared || this.player.dead) return;
    this.cleared = true;
    this.state = 'done';
    const r = this.phase.clearReward;
    this.pending.gold += r.gold;
    this.pending.exp += r.exp;
    for (const [id, n] of Object.entries(r.materials)) {
      this.pending.materials[id] = (this.pending.materials[id] ?? 0) + n;
    }
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
    this.hud.hidePause();
    this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.input.exitLock();
    const cleared = this.cleared && !this.player.dead;
    this.onEnd({
      cleared,
      phase: this.phase,
      gold: cleared ? this.pending.gold : 0,
      exp: cleared ? this.pending.exp : 0,
      materials: cleared ? this.pending.materials : {},
      sweepTickets: cleared ? this.phase.clearReward.sweepTickets : 0,
      kills: this.pending.kills,
    });
  }

  // ───────────────────────── 투사체 ─────────────────────────

  spawnPlayerBolt(
    origin: THREE.Vector3,
    vel: THREE.Vector3,
    o: {
      damage: number;
      radius: number;
      color: number;
      basic?: boolean;
      aoe?: number;
      pierce?: boolean;
      arrow?: boolean;
      gravity?: number;
      stun?: number;
    },
  ): void {
    let mesh: THREE.Object3D;
    if (o.arrow) {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(arrowGeo, mat(0x8a6a44));
      const tip = new THREE.Mesh(arrowTipGeo, mat(o.color, o.color, 1.5));
      g.add(shaft, tip);
      if (o.radius > 0.2) g.scale.setScalar(1 + (o.radius - 0.2) * 3);
      mesh = g;
    } else {
      mesh = new THREE.Mesh(boltGeo, mat(o.color, o.color, 2));
      mesh.scale.setScalar(o.radius);
    }
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.playerBolts.push({
      mesh,
      pos: origin.clone(),
      vel: vel.clone(),
      radius: o.radius,
      damage: o.damage,
      basic: !!o.basic,
      aoe: o.aoe ?? 0,
      color: o.color,
      life: 2.5,
      pierce: !!o.pierce,
      hit: new Set(),
      gravity: o.gravity ?? 0,
      stun: o.stun ?? 0,
      arrow: !!o.arrow,
    });
  }

  spawnSwordWave(yaw: number, damage: number): void {
    const f = forwardOf(yaw);
    const material = new THREE.MeshBasicMaterial({
      color: 0x9fdcff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const crescent = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.35, 16, 1, -Math.PI / 2 - 1, 2), material);
    crescent.rotation.x = -Math.PI / 2;
    const group = new THREE.Group();
    group.add(crescent);
    group.rotation.y = yaw;
    const pos = this.player.pos.clone().addScaledVector(f, 0.8);
    pos.y = this.player.pos.y + 1.0;
    group.position.copy(pos);
    this.scene.add(group);
    this.playerBolts.push({
      mesh: group,
      pos,
      vel: f.multiplyScalar(26),
      radius: 1.3,
      damage,
      basic: false,
      aoe: 0,
      color: 0x9fdcff,
      life: 0.75,
      pierce: true,
      hit: new Set(),
      gravity: 0,
      stun: 0,
      arrow: false,
    });
  }

  /** 총알처럼 즉시 판정하는 사격. 관통이면 경로의 모든 적, 아니면 가장 가까운 적 하나. */
  fireHitscan(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    o: { pierce: boolean; color: number; width: number },
  ): void {
    const maxDist = 60;
    const hits: { m: Monster; t: number }[] = [];
    const c = new THREE.Vector3();
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m.center(c);
      const r = Math.max(m.radius, m.height * 0.4);
      const ox = origin.x - c.x;
      const oy = origin.y - c.y;
      const oz = origin.z - c.z;
      const bq = ox * dir.x + oy * dir.y + oz * dir.z;
      const disc = bq * bq - (ox * ox + oy * oy + oz * oz - r * r);
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);
      if (t > 0 && t < maxDist) hits.push({ m, t });
    }
    hits.sort((a, b) => a.t - b.t);
    let end = maxDist;
    if (dir.y < -1e-3) end = Math.min(end, -origin.y / dir.y);
    const targets = o.pierce ? hits : hits.slice(0, 1);
    if (!o.pierce && targets.length) end = Math.min(end, targets[0].t);
    for (const h of targets) {
      if (h.t > end + 0.01 && !o.pierce) break;
      this.hitMonster(h.m, damage);
    }
    const to = origin.clone().addScaledVector(dir, end);
    sfx.play('shot', o.width > 0.05 ? 1.3 : 0.8);
    this.effects.tracer(origin, to, o.color, o.width);
    if (!targets.length && end < maxDist) this.effects.burst(to, 0x9a8a70, 3, 2, 0.06, 0.25);
  }

  private boltHits(b: { pos: THREE.Vector3; radius: number }, m: Monster): boolean {
    if (Math.hypot(b.pos.x - m.pos.x, b.pos.z - m.pos.z) > b.radius + m.radius) return false;
    return b.pos.y >= m.y - b.radius && b.pos.y <= m.y + m.height + b.radius;
  }

  private explode(at: THREE.Vector3, radius: number, damage: number, color: number, stun = 0): void {
    sfx.play('boom', Math.min(1, radius / 3));
    this.effects.flash(at, radius, color, 0.3);
    this.effects.ring(at.clone().setY(Math.max(0, at.y - 1)), radius, color, 0.35);
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const c = m.center(this.tmp2);
      if (Math.hypot(c.x - at.x, c.z - at.z) > radius + m.radius) continue;
      if (Math.abs(c.y - at.y) > radius + m.height / 2) continue;
      this.hitMonster(m, damage, { stun });
    }
  }

  private removeObject(obj: THREE.Object3D): void {
    this.scene.remove(obj);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== boltGeo && o.material instanceof THREE.MeshBasicMaterial) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }

  private updatePlayerBolts(dt: number): void {
    const limit = this.arenaRadius + 15;
    this.playerBolts = this.playerBolts.filter((b) => {
      b.life -= dt;
      b.vel.y -= b.gravity * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.arrow) b.mesh.lookAt(this.tmp.copy(b.pos).add(b.vel));
      else if (b.gravity > 0) b.mesh.rotation.x += dt * 10;
      let alive = b.life > 0 && Math.hypot(b.pos.x, b.pos.z) < limit;

      if (alive) {
        for (const m of this.monsters) {
          if (!m.alive || b.hit.has(m) || !this.boltHits(b, m)) continue;
          if (b.pierce) {
            b.hit.add(m);
            this.hitMonster(m, b.damage, { basic: b.basic });
            continue;
          }
          if (b.aoe > 0) this.explode(b.pos, b.aoe, b.damage, b.color, b.stun);
          else {
            this.hitMonster(m, b.damage, { basic: b.basic });
            this.effects.burst(b.pos, b.color, 5, 3, 0.08, 0.3);
          }
          alive = false;
          break;
        }
      }
      if (alive && b.pos.y <= 0.05) {
        if (b.aoe > 0) {
          this.explode(b.pos, b.aoe, b.damage, b.color, b.stun);
          this.shake(0.25);
        }
        else this.effects.burst(b.pos, b.color, 4, 2, 0.07, 0.25);
        alive = false;
      }
      if (!alive) this.removeObject(b.mesh);
      return alive;
    });
  }

  spawnEnemyBolt(origin: THREE.Vector3, vel: THREE.Vector3, damage: number, color: number, owner: Monster, aoe = 0): void {
    const mesh = new THREE.Mesh(boltGeo, mat(color, color, 2));
    mesh.scale.setScalar(aoe > 0 ? 0.32 : 0.22);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.enemyBolts.push({
      mesh,
      pos: origin.clone(),
      vel: vel.clone(),
      radius: 0.25,
      damage,
      gravity: 0,
      aoe,
      life: 3,
      owner,
    });
  }

  /** 포물선으로 날아가 착지 지점을 폭발시키는 바위. 착지 지점에 경고 원을 띄운다. */
  throwRock(origin: THREE.Vector3, target: THREE.Vector3, flight: number, damage: number, owner: Monster): void {
    const g = 18;
    const vel = new THREE.Vector3(
      (target.x - origin.x) / flight,
      (target.y - origin.y) / flight + 0.5 * g * flight,
      (target.z - origin.z) / flight,
    );
    const rock = new THREE.Group();
    rock.add(ico(0.7, mat(0x4a4448)));
    const core = ico(0.35, mat(0xff5a1f, 0xff4a0f, 2));
    core.position.set(0.2, 0.3, 0.2);
    rock.add(core);
    rock.position.copy(origin);
    this.scene.add(rock);
    this.enemyBolts.push({ mesh: rock, pos: origin.clone(), vel, radius: 0.7, damage, gravity: g, aoe: 2.6, life: flight + 1, owner });
    this.addTelegraph(target, 2.6, flight, null, null);
  }

  private updateEnemyBolts(dt: number): void {
    const p = this.player;
    this.enemyBolts = this.enemyBolts.filter((b) => {
      b.life -= dt;
      b.vel.y -= b.gravity * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += dt * 4;
      let alive = b.life > 0;

      const hitPlayer = Math.hypot(b.pos.x - p.pos.x, b.pos.y - (p.pos.y + 1), b.pos.z - p.pos.z) < b.radius + 0.45;
      // 바위는 땅에 떨어질 때만 터진다 (중력 있는 투사체).
      if (alive && hitPlayer && p.invuln <= 0 && b.gravity === 0) {
        if (b.aoe > 0) this.enemyExplode(b);
        else {
          this.damagePlayer(b.damage, { pos: b.pos, monster: b.owner, melee: false });
          this.effects.burst(b.pos, 0xff4fa0, 6, 3, 0.08, 0.3);
        }
        alive = false;
      }
      if (alive && b.pos.y <= 0) {
        if (b.aoe > 0) this.enemyExplode(b);
        alive = false;
      }
      if (!alive) this.scene.remove(b.mesh);
      return alive;
    });
  }

  private enemyExplode(b: EnemyBolt): void {
    sfx.play('boom', 0.6);
    const p = this.player;
    const at = b.pos.clone();
    at.y = Math.max(0, at.y);
    const fire = b.gravity === 0;
    this.effects.ring(at.clone().setY(0), b.aoe, fire ? 0xff5a1a : 0xff7a2a, 0.35);
    if (fire) this.effects.flash(at, b.aoe, 0xff7a2a, 0.25);
    this.effects.burst(at.clone().setY(Math.max(0.3, at.y)), fire ? 0xff8a3a : 0x7a6a5a, 14, 5, 0.14, 0.5);
    this.shake(0.2);
    const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
    if (d <= b.aoe + 0.3 && Math.abs(p.pos.y + 1 - at.y) < b.aoe + 1) {
      this.damagePlayer(b.damage, { pos: at, monster: b.owner, melee: false });
    }
  }

  private addHazard(pos: THREE.Vector3, radius: number, life: number, damage: number): void {
    const material = new THREE.MeshBasicMaterial({ color: 0x8acc2a, transparent: true, opacity: 0.45, depthWrite: false });
    const mesh = new THREE.Mesh(circleGeo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.05, pos.z);
    mesh.scale.setScalar(radius);
    this.scene.add(mesh);
    this.hazards.push({ mesh, material, pos: pos.clone().setY(0), radius, life, tickTimer: 0.3, damage, age: 0 });
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    this.hazards = this.hazards.filter((h) => {
      h.life -= dt;
      h.age += dt;
      h.tickTimer -= dt;
      h.material.opacity = 0.35 + Math.sin(h.age * 5) * 0.08;
      if (h.life < 0.5) h.material.opacity *= h.life / 0.5;
      if (Math.random() < dt * 8) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * h.radius;
        this.effects.burst(new THREE.Vector3(h.pos.x + Math.cos(a) * r, 0.1, h.pos.z + Math.sin(a) * r), 0xa8ff4a, 1, 1.2, 0.08, 0.7, -1.5);
      }
      if (h.tickTimer <= 0) {
        h.tickTimer = 0.5;
        if (Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z) <= h.radius && p.pos.y < 1.0) {
          this.damagePlayer(h.damage, { pos: h.pos, melee: false, unblockable: true });
        }
      }
      if (h.life <= 0) {
        this.scene.remove(h.mesh);
        h.material.dispose();
        return false;
      }
      return true;
    });
  }

  // ───────────────────────── 장판·경고·충격파·메테오 ─────────────────────────

  addField(spec: FieldSpec): void {
    const material = new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(circleGeo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(spec.pos.x, 0.06, spec.pos.z);
    mesh.scale.setScalar(spec.radius);
    this.scene.add(mesh);
    this.fields.push({ ...spec, mesh, material, tickTimer: 0, age: 0 });
  }

  private updateFields(dt: number): void {
    this.fields = this.fields.filter((f) => {
      f.life -= dt;
      f.age += dt;
      f.tickTimer -= dt;
      f.material.opacity = 0.25 + Math.sin(f.age * 6) * 0.08 * Math.min(1, f.life);
      if (f.tickTimer <= 0) {
        f.tickTimer = f.tickEvery;
        for (const m of this.monsters) {
          if (!m.alive || (!f.hitsAir && m.y > 2.5)) continue;
          if (Math.hypot(m.pos.x - f.pos.x, m.pos.z - f.pos.z) > f.radius + m.radius) continue;
          this.hitMonster(m, f.damage, { quiet: true, slow: f.slow ? [f.slow, 0.6] : undefined });
        }
        if (f.rain) {
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * f.radius;
            const from = new THREE.Vector3(f.pos.x + Math.cos(a) * r, 9, f.pos.z + Math.sin(a) * r);
            this.effects.tracer(from, from.clone().setY(0.1), 0xe8dcc0, 0.025, 0.12);
          }
        } else if (Math.random() < 0.8) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * f.radius;
          this.effects.burst(new THREE.Vector3(f.pos.x + Math.cos(a) * r, 0.2, f.pos.z + Math.sin(a) * r), f.color, 3, 2, 0.08, 0.5, -2);
        }
      }
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.material.dispose();
        return false;
      }
      return true;
    });
  }

  addTelegraph(pos: THREE.Vector3, radius: number, dur: number, owner: Monster | null, onFire: (() => void) | null): void {
    const outlineMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.85, depthWrite: false });
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.28, depthWrite: false });
    const group = new THREE.Group();
    group.position.set(pos.x, 0.07, pos.z);
    const outline = new THREE.Mesh(ringGeo, outlineMat);
    outline.rotation.x = -Math.PI / 2;
    outline.scale.setScalar(radius);
    const fill = new THREE.Mesh(circleGeo, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.01;
    group.add(outline, fill);
    this.scene.add(group);
    this.telegraphs.push({ group, fill, materials: [outlineMat, fillMat], time: 0, dur, owner, onFire });
    fill.scale.setScalar(0.01);
    fill.userData.radius = radius;
  }

  private updateTelegraphs(dt: number): void {
    this.telegraphs = this.telegraphs.filter((t) => {
      t.time += dt;
      const radius = t.fill.userData.radius as number;
      t.fill.scale.setScalar(Math.max(0.01, radius * Math.min(1, t.time / t.dur)));
      const cancelled = t.owner !== null && (!t.owner.alive || t.owner.stun > 0);
      if (t.time >= t.dur || cancelled) {
        if (!cancelled) t.onFire?.();
        this.scene.remove(t.group);
        for (const m of t.materials) m.dispose();
        return false;
      }
      return true;
    });
  }

  /** 바깥으로 퍼지는 충격파. 땅에 있는 플레이어만 맞으므로 점프로 피한다. */
  addShockwave(pos: THREE.Vector3, maxR: number, speed: number, damage: number, owner: Monster): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffa040,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(waveRingGeo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.15, pos.z);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, material, pos: pos.clone(), r: 0.5, maxR, speed, damage, hit: false, owner });
  }

  private updateShockwaves(dt: number): void {
    const p = this.player;
    this.shockwaves = this.shockwaves.filter((s) => {
      s.r += s.speed * dt;
      s.mesh.scale.setScalar(s.r);
      s.material.opacity = 0.85 * (1 - s.r / s.maxR);
      const d = Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z);
      if (!s.hit && Math.abs(d - s.r) < 0.7 && p.pos.y < 0.5) {
        s.hit = true;
        this.damagePlayer(s.damage, { pos: s.pos, monster: s.owner, melee: false });
      }
      if (s.r >= s.maxR) {
        this.scene.remove(s.mesh);
        s.material.dispose();
        return false;
      }
      return true;
    });
  }

  castMeteor(at: THREE.Vector3, damage: number, burn: number): void {
    const rock = new THREE.Group();
    rock.add(ico(1.1, mat(0x5a3a2a), 0));
    const glow = ico(1.35, mat(0xff6a1a, 0xff5a0a, 2.5), 0);
    glow.scale.set(0.8, 1.2, 0.8);
    rock.add(glow);
    const from = new THREE.Vector3(at.x - 7, 30, at.z - 7);
    rock.position.copy(from);
    this.scene.add(rock);
    const dur = 0.9;
    this.meteors.push({ mesh: rock, from, at: at.clone(), time: 0, dur, damage, burn });
    this.addTelegraph(at, 4, dur, null, null);
  }

  private updateMeteors(dt: number): void {
    this.meteors = this.meteors.filter((m) => {
      m.time += dt;
      const t = Math.min(1, m.time / m.dur);
      m.mesh.position.lerpVectors(m.from, m.at, t * t);
      m.mesh.rotation.x += dt * 6;
      if (Math.random() < 0.7) this.effects.burst(m.mesh.position, 0xff7a2a, 2, 1.5, 0.15, 0.4, -2);
      if (t < 1) return true;

      this.scene.remove(m.mesh);
      sfx.play('boom');
      this.effects.flash(m.at.clone().setY(1), 4.5, 0xffa040, 0.4);
      this.effects.ring(m.at, 4.5, 0xff6a1a, 0.45);
      this.effects.burst(m.at.clone().setY(0.5), 0xff8a3a, 30, 9, 0.18, 0.8);
      this.shake(0.4);
      for (const mon of this.monsters) {
        if (!mon.alive || mon.y > 6) continue;
        if (Math.hypot(mon.pos.x - m.at.x, mon.pos.z - m.at.z) > 4 + mon.radius) continue;
        this.hitMonster(mon, m.damage);
      }
      this.addField({ pos: m.at, radius: 3.5, life: 3, tickEvery: 0.5, damage: m.burn, color: 0xff6a2a });
      return false;
    });
  }

  // ───────────────────────── 레이저 ─────────────────────────

  private makeBeam(): THREE.Group {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    geo.translate(0, 0.5, 0);
    const core = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    core.scale.set(0.09, 1, 0.09);
    const outer = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0x3fc8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    outer.scale.set(0.3, 1, 0.3);
    g.add(core, outer);
    g.visible = false;
    return g;
  }

  setBeam(seg: { from: THREE.Vector3; to: THREE.Vector3 } | null): void {
    if (!seg) {
      this.beam.visible = false;
      return;
    }
    const dir = this.tmp2.copy(seg.to).sub(seg.from);
    const len = dir.length();
    this.beam.visible = true;
    this.beam.position.copy(seg.from);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.beam.scale.set(1 + Math.sin(performance.now() * 0.05) * 0.15, len, 1);
  }

  // ───────────────────────── 충돌 ─────────────────────────

  private separate(): void {
    const ms = this.monsters;
    const p = this.player;
    for (let i = 0; i < ms.length; i++) {
      const a = ms[i];
      if (!a.alive || a.def.flying) continue;
      for (let j = i + 1; j < ms.length; j++) {
        const b = ms[j];
        if (!b.alive || b.def.flying) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        const wa = a.boss ? 0.05 : b.boss ? 0.95 : 0.5;
        a.pos.x -= dx * push * wa;
        a.pos.z -= dz * push * wa;
        b.pos.x += dx * push * (1 - wa);
        b.pos.z += dz * push * (1 - wa);
      }
      if (p.pos.y < 1.5) {
        const dx = a.pos.x - p.pos.x;
        const dz = a.pos.z - p.pos.z;
        const min = a.radius + 0.45;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) / d;
          if (a.boss) {
            p.pos.x -= dx * push;
            p.pos.z -= dz * push;
          } else {
            a.pos.x += dx * push;
            a.pos.z += dz * push;
          }
        }
      }
    }
  }

  // ───────────────────────── HUD ─────────────────────────

  private hudState() {
    const p = this.player;
    const w = p.weapon;
    const other = p.weapons[1 - p.active];
    const keymap = this.save.keymap;
    const slots: HudSlot[] = w.slots.map((s, i) => {
      const key = keyLabel(keymap[SLOT_ACTIONS[i]]);
      if (!s) return { key, short: '', name: '', mana: 0, cdLeft: 0, cdRatio: 0, usable: false, empty: true };
      const cdLeft = p.cooldowns.get(s.id) ?? 0;
      return {
        key,
        short: s.short,
        name: s.name,
        mana: s.mana,
        cdLeft,
        cdRatio: cdLeft / s.cooldown,
        usable: cdLeft <= 0 && p.mp >= s.mana,
        empty: false,
      };
    });
    const totalWaves = this.phase.waves.length;
    const mission = this.phase.mission;
    let waveText: string;
    if (mission) {
      if (this.state === 'intro') waveText = '준비';
      else if (mission.kind === 'survive') waveText = `생존 ${Math.max(0, Math.ceil(mission.seconds - this.missionTime))}초 남음`;
      else waveText = `처치 ${Math.min(this.pending.kills, mission.target)} / ${mission.target}`;
    } else if (this.phase.type === 'boss') waveText = '보스 페이즈';
    else if (this.waveIndex < 0) waveText = '준비';
    else waveText = `웨이브 ${Math.min(this.waveIndex + 1, totalWaves)} / ${totalWaves}`;
    const barTarget = this.boss ?? this.monsters.find((m) => m.alive && m.def.miniboss) ?? null;
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
      ammo: this.ammoText(),
      ads: p.ads,
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
      boss: barTarget
        ? { name: barTarget.def.name, hp: Math.max(0, barTarget.hp), maxHp: barTarget.maxHp, phase2: barTarget.phase2 }
        : null,
      dodgeReady: p.dodgeCd <= 0,
    };
  }

  private ammoText(): string | null {
    const p = this.player;
    const w = p.weapon;
    if (w.def.type === 'gun') return p.reloadTime > 0 ? '재장전 중...' : `탄약 ${w.ammo} / ${w.magazine}`;
    if (w.def.type === 'bow') return p.drawCd > 0 ? '장전 중...' : '발사 준비';
    return null;
  }

  // ───────────────────────── 경기장 ─────────────────────────

  private buildArena(): void {
    const lava = this.phase.theme === 'lava';
    const t = THEMES[this.phase.theme];
    const scene = this.scene;
    const R = this.arenaRadius;
    scene.background = new THREE.Color(t.sky);
    scene.fog = new THREE.Fog(t.sky, R * 1.1, R * 3.4);
    this.sky = makeSky(t.skyTop, t.sky, t.skyBottom);
    scene.add(this.sky);

    scene.add(new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemi));
    const sun = new THREE.DirectionalLight(t.sun, t.sunIntensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    const sc = sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 26;
    sc.bottom = -26;
    sc.far = 90;
    scene.add(sun, sun.target);
    this.sun = sun;

    const seed = (lava ? 77 : 13) + this.phase.id.charCodeAt(2) * 7;
    const rand = seeded(seed);

    // 바닥: 바깥 풀밭 + 가장자리가 부드러운 흙 경기장
    const outer = new THREE.Mesh(
      new THREE.CircleGeometry(R + 90, 48),
      new THREE.MeshStandardMaterial({ map: groundTexture(...t.grass, seed, 40), roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    scene.add(outer);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(R + 3, 64),
      new THREE.MeshStandardMaterial({
        map: groundTexture(...t.dirt, seed + 1, 9),
        alphaMap: radialAlpha(0.82),
        transparent: true,
        depthWrite: false,
        roughness: 1,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.005;
    floor.receiveShadow = true;
    scene.add(floor);

    if (t.blades.length) {
      scene.add(scatterGrass(2600, R + 1, R + 26, t.blades, seed + 2));
      // 경기장 안은 밟혀서 풀이 드문드문하다.
      scene.add(scatterGrass(90, 6, R - 1, t.blades, seed + 3));
    }

    if (lava) this.buildLavaProps(rand, t);
    else this.buildGraveyardProps(rand, t);
  }

  /** 묘지: 울타리로 둘러싸고 바깥에 묘비·나무·랜턴을 둔다. */
  private buildGraveyardProps(rand: () => number, t: ThemeColors): void {
    const scene = this.scene;
    const R = this.arenaRadius;
    const fenceLen = 2.0;
    const segments = Math.floor((Math.PI * 2 * (R + 1)) / fenceLen);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * (R + 1);
      const z = Math.sin(a) * (R + 1);
      // 울타리는 원의 접선 방향으로 놓는다.
      const name: PropName = rand() < 0.2 ? 'fence_broken' : 'fence';
      placeProp(scene, name, x, z, -a + Math.PI / 2, 1);
      if (i % 4 === 0) placeProp(scene, 'fence_pillar', x, z, -a);
    }

    const ring = (count: number, names: PropName[], rMin: number, rMax: number, scale: [number, number]): void => {
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2;
        const r = rMin + rand() * (rMax - rMin);
        const n = names[Math.floor(rand() * names.length)];
        placeProp(scene, n, Math.cos(a) * r, Math.sin(a) * r, rand() * Math.PI * 2, scale[0] + rand() * (scale[1] - scale[0]));
      }
    };
    ring(46, ['gravestone', 'grave_A', 'grave_B', 'grave_A_destroyed', 'gravemarker_A', 'gravemarker_B'], R + 3, R + 16, [0.9, 1.2]);
    ring(10, ['coffin', 'skull', 'bone_A', 'bone_B', 'pumpkin_orange', 'pumpkin_orange_jackolantern'], R + 2.5, R + 10, [0.9, 1.3]);
    ring(30, ['tree_dead_large', 'tree_dead_medium', 'tree_dead_small'], R + 6, R + 30, [1.2, 2.0]);
    ring(22, ['tree_pine_orange_large', 'tree_pine_orange_medium', 'tree_pine_yellow_large'], R + 12, R + 40, [1.4, 2.2]);
    // 경기장 안 가장자리의 작은 장식 (충돌 없음)
    ring(10, ['gravemarker_A', 'skull', 'bone_A', 'bone_B'], R - 4, R - 1.5, [0.8, 1.1]);

    const crypt = placeProp(scene, 'crypt', 0, R + 12, Math.PI, 1.6);
    crypt.position.x = (rand() - 0.5) * 8;
    placeProp(scene, 'arch_gate', 0, -(R + 1.2), 0, 1.2);

    // 랜턴: 노을·밤에는 불을 켠다.
    const lanterns = 8;
    for (let i = 0; i < lanterns; i++) {
      const a = (i / lanterns) * Math.PI * 2 + Math.PI / lanterns;
      const x = Math.cos(a) * (R + 2.2);
      const z = Math.sin(a) * (R + 2.2);
      placeProp(scene, 'post_lantern', x, z, -a + Math.PI / 2, 1.2);
      if (t.lantern > 0 && i % 2 === 0) {
        const light = new THREE.PointLight(0xffa850, t.lantern, 14, 1.6);
        light.position.set(x, 2.6, z);
        scene.add(light);
      }
    }
  }

  /** 용암 둥지: 바위 경계, 용암 웅덩이와 균열, 해골과 촛불 */
  private buildLavaProps(rand: () => number, t: ThemeColors): void {
    const scene = this.scene;
    const R = this.arenaRadius;
    const rockMat = mat(0x3a3436);
    const count = Math.floor(R * 1.6);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const rock = ico(0.9 + rand() * 0.9, rockMat, 0);
      rock.position.set(Math.cos(a) * (R + 0.8), 0.3, Math.sin(a) * (R + 0.8));
      rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      rock.receiveShadow = true;
      scene.add(rock);
    }
    const lavaMat = mat(0xff5a1f, 0xff4a0f, 2.2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const pillar = box(2, 8 + rand() * 6, 2, rockMat);
      pillar.position.set(Math.cos(a) * (R + 6), 4, Math.sin(a) * (R + 6));
      pillar.rotation.y = rand() * 3;
      scene.add(pillar);
      const pool = new THREE.Mesh(circleGeo, lavaMat);
      pool.rotation.x = -Math.PI / 2;
      pool.scale.setScalar(2 + rand() * 3);
      pool.position.set(Math.cos(a + 0.4) * (R + 12 + rand() * 10), 0.03, Math.sin(a + 0.4) * (R + 12 + rand() * 10));
      scene.add(pool);
      if (i % 2 === 0) {
        const light = new THREE.PointLight(0xff5a1a, t.lantern, 18, 1.5);
        light.position.set(pool.position.x, 1.5, pool.position.z);
        scene.add(light);
      }
    }
    for (let i = 0; i < 14; i++) {
      const crack = box(0.25, 0.02, 3 + rand() * 5, lavaMat);
      const a = rand() * Math.PI * 2;
      const r = 4 + rand() * (R - 8);
      crack.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
      crack.rotation.y = rand() * Math.PI;
      scene.add(crack);
    }
    const names: PropName[] = ['skull', 'ribcage', 'bone_A', 'bone_B', 'candle_triple', 'shrine_candles'];
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = R + 2 + rand() * 12;
      placeProp(scene, names[Math.floor(rand() * names.length)], Math.cos(a) * r, Math.sin(a) * r, rand() * 6, 1 + rand() * 0.6);
    }
  }
}
