import * as THREE from 'three';
import { SLOT_ACTIONS, keyLabel, type Input } from '../core/input';
import type { SaveData } from '../core/save';
import { MATERIALS } from '../data/items';
import { ELITE_MOD, type MonsterKind } from '../data/monsters';
import type { PhaseDef } from '../data/phases';
import { SKILLS, type SkillDef } from '../data/skills';
import { GRADES, WEAPONS, type WeaponType } from '../data/weapons';
import { Hud, type HudSlot } from '../ui/hud';
import { updatePlayerCombat } from './combat';
import { Effects } from './effects';
import { box, cone, cyl, ico, mat } from './models';
import { Monster } from './monster';
import { Player, forwardOf, rightOf } from './player';
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
  slow?: number;
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
}

interface Field extends FieldSpec {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  tickTimer: number;
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

const circleGeo = new THREE.CircleGeometry(1, 40);
const ringGeo = new THREE.RingGeometry(0.93, 1, 48);
const waveRingGeo = new THREE.RingGeometry(0.88, 1, 64);
const boltGeo = new THREE.IcosahedronGeometry(1, 1);

/** 장착 무기의 스킬 슬롯: 배운 스킬을 목록 순서대로 최대 8개 채운다. */
export function buildSlots(save: SaveData, type: WeaponType): (SkillDef | null)[] {
  const learned = SKILLS.filter((s) => s.weapon === type && save.learnedSkills.includes(s.id)).slice(0, 8);
  const slots: (SkillDef | null)[] = [...learned];
  while (slots.length < 8) slots.push(null);
  return slots;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
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

  private playerBolts: PlayerBolt[] = [];
  private enemyBolts: EnemyBolt[] = [];
  private fields: Field[] = [];
  private telegraphs: Telegraph[] = [];
  private shockwaves: Shockwave[] = [];
  private meteors: Meteor[] = [];
  private beam: THREE.Group;

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
  private shakeAmount = 0;
  private unsubscribeLock: () => void;

  private readonly camDir = new THREE.Vector3();
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
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 400);
    this.hud = new Hud(uiRoot);
    this.effects = new Effects(this.scene, this.camera, this.hud.layer);

    this.stats = totalStats(save);
    const weapons = save.equipped.map((uid) => {
      const owned = save.weapons.find((w) => w.uid === uid) ?? save.weapons[0];
      const def = WEAPONS[owned.defId];
      return { def, enhance: owned.enhance, slots: buildSlots(save, def.type) };
    });
    this.player = new Player(derive(this.stats), weapons);
    this.player.pos.set(0, 0, -this.arenaRadius * 0.35);
    this.player.yaw = 0;
    this.player.animate(0);
    this.scene.add(this.player.rig.root);

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
    const sens = 0.0022 * this.save.sensitivity;
    p.yaw -= input.mouseDX * sens;
    p.pitch = THREE.MathUtils.clamp(p.pitch + input.mouseDY * sens, -0.75, 1.0);

    p.updateTimers(dt);
    this.updateAim();
    updatePlayerCombat(this, dt);
    p.updateMovement(dt, input, this.arenaRadius);
    p.animate(dt);

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
    this.effects.update(dt);
    this.updateCamera(dt);
    this.hud.update(this.hudState());

    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer < 0) this.finish();
    }
    input.endFrame();
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
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

  // ───────────────────────── 카메라·조준 ─────────────────────────

  private updateCamera(dt: number): void {
    const p = this.player;
    const cp = Math.cos(p.pitch);
    this.camDir.set(Math.sin(p.yaw) * cp, -Math.sin(p.pitch), Math.cos(p.yaw) * cp);
    const right = rightOf(p.yaw, this.tmp2);
    const pivot = this.tmp.set(p.pos.x, p.pos.y + 1.65, p.pos.z);
    const cam = this.camera.position;
    cam.copy(pivot).addScaledVector(this.camDir, -4.3).addScaledVector(right, 0.75);
    if (cam.y < 0.4) cam.y = 0.4;
    if (this.shakeAmount > 0) {
      cam.x += (Math.random() - 0.5) * this.shakeAmount;
      cam.y += (Math.random() - 0.5) * this.shakeAmount;
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.5);
    }
    this.camera.lookAt(cam.x + this.camDir.x, cam.y + this.camDir.y, cam.z + this.camDir.z);
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
      if (t > 4.6 && t < best) best = t;
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
    this.shakeAmount = Math.max(this.shakeAmount, amount);
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
    const crit = Math.random() < p.weapon.def.critChance;
    const dmg = Math.max(1, Math.round(base * p.damageMul * (1 + m.vuln) * (crit ? 1 + CRIT_DAMAGE : 1)));
    m.hp -= dmg;
    m.onHit();

    if (opts.stun && !m.boss) m.stun = Math.max(m.stun, m.elite ? opts.stun * 0.5 : opts.stun);
    if (opts.vuln) {
      m.vuln = Math.max(m.vuln, opts.vuln[0]);
      m.vulnTime = opts.vuln[1];
    }
    if (opts.slow) {
      m.slowMul = Math.min(m.slowMul, 1 - opts.slow);
      m.slowTime = 0.6;
    }
    if (opts.basic) p.mp = Math.min(p.derived.maxMp, p.mp + 2);

    const c = m.center(this.tmp2);
    c.y += m.height * 0.3;
    this.effects.text(c, String(dmg), crit ? 'crit' : opts.quiet ? 'quiet' : 'normal');
    if (!opts.quiet) this.effects.burst(c, crit ? 0xffc040 : 0xffffff, crit ? 8 : 4, 4, 0.08, 0.3);

    if (m.hp <= 0) this.killMonster(m);
  }

  private killMonster(m: Monster): void {
    m.kill();
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

    if (m === this.boss) {
      for (const other of this.monsters) if (other.alive && other !== m) other.kill();
      this.clear();
    }
  }

  private addMaterial(id: string, count: number, at: THREE.Vector3): void {
    this.pending.materials[id] = (this.pending.materials[id] ?? 0) + count;
    this.effects.text(at.clone().setY(at.y + 0.6), `+${MATERIALS[id]?.name ?? id}`, 'info');
  }

  damagePlayer(amount: number, src: { pos: THREE.Vector3; monster?: Monster; melee: boolean }): void {
    const p = this.player;
    if (p.dead || this.ended) return;
    const head = this.tmp2.set(p.pos.x, p.pos.y + 2.1, p.pos.z);

    if (p.invuln > 0) {
      this.effects.text(head, '회피', 'info');
      return;
    }

    if (p.guarding) {
      const f = forwardOf(p.yaw);
      const dx = src.pos.x - p.pos.x;
      const dz = src.pos.z - p.pos.z;
      const len = Math.hypot(dx, dz);
      const front = len < 0.01 || (dx * f.x + dz * f.z) / len > 0.5;
      if (front) {
        if (p.parryTimer > 0) {
          this.effects.text(head, '패링!', 'heal');
          this.effects.flash(head.clone().setY(p.pos.y + 1.3).addScaledVector(f, 0.8), 1.2, 0xfff2a0, 0.25);
          p.mp = Math.min(p.derived.maxMp, p.mp + 10);
          if (src.monster && src.melee && !src.monster.boss) src.monster.stun = Math.max(src.monster.stun, 1.5);
          return;
        }
        amount *= 0.3;
        this.effects.text(head, '가드', 'info');
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
    if (this.phase.type === 'boss') this.announce('골렘 군주', 2.5);
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
    this.endTimer = 2.5;
  }

  private fail(): void {
    if (this.cleared) return;
    this.state = 'done';
    this.announce('쓰러졌다...', 2.5);
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
    o: { damage: number; radius: number; color: number; basic?: boolean; aoe?: number },
  ): void {
    const mesh = new THREE.Mesh(boltGeo, mat(o.color, o.color, 2));
    mesh.scale.setScalar(o.radius);
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
      pierce: false,
      hit: new Set(),
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
    });
  }

  private boltHits(b: { pos: THREE.Vector3; radius: number }, m: Monster): boolean {
    if (Math.hypot(b.pos.x - m.pos.x, b.pos.z - m.pos.z) > b.radius + m.radius) return false;
    return b.pos.y >= m.y - b.radius && b.pos.y <= m.y + m.height + b.radius;
  }

  private explode(at: THREE.Vector3, radius: number, damage: number, color: number): void {
    this.effects.flash(at, radius, color, 0.3);
    this.effects.ring(at.clone().setY(Math.max(0, at.y - 1)), radius, color, 0.35);
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const c = m.center(this.tmp2);
      if (Math.hypot(c.x - at.x, c.z - at.z) > radius + m.radius) continue;
      if (Math.abs(c.y - at.y) > radius + m.height / 2) continue;
      this.hitMonster(m, damage);
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
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      let alive = b.life > 0 && Math.hypot(b.pos.x, b.pos.z) < limit;

      if (alive) {
        for (const m of this.monsters) {
          if (!m.alive || b.hit.has(m) || !this.boltHits(b, m)) continue;
          if (b.pierce) {
            b.hit.add(m);
            this.hitMonster(m, b.damage);
            continue;
          }
          if (b.aoe > 0) this.explode(b.pos, b.aoe, b.damage, b.color);
          else {
            this.hitMonster(m, b.damage, { basic: b.basic });
            this.effects.burst(b.pos, b.color, 5, 3, 0.08, 0.3);
          }
          alive = false;
          break;
        }
      }
      if (alive && b.pos.y <= 0.05) {
        if (b.aoe > 0) this.explode(b.pos, b.aoe, b.damage, b.color);
        else this.effects.burst(b.pos, b.color, 4, 2, 0.07, 0.25);
        alive = false;
      }
      if (!alive) this.removeObject(b.mesh);
      return alive;
    });
  }

  spawnEnemyBolt(origin: THREE.Vector3, vel: THREE.Vector3, damage: number, color: number, owner?: Monster): void {
    const mesh = new THREE.Mesh(boltGeo, mat(color, color, 2));
    mesh.scale.setScalar(0.22);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.enemyBolts.push({
      mesh,
      pos: origin.clone(),
      vel: vel.clone(),
      radius: 0.25,
      damage,
      gravity: 0,
      aoe: 0,
      life: 3,
      owner: owner ?? this.monsters[0],
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
      if (alive && b.aoe === 0 && hitPlayer && p.invuln <= 0) {
        this.damagePlayer(b.damage, { pos: b.pos, monster: b.owner, melee: false });
        this.effects.burst(b.pos, 0xff4fa0, 6, 3, 0.08, 0.3);
        alive = false;
      }
      if (alive && b.pos.y <= 0) {
        if (b.aoe > 0) {
          const at = b.pos.clone().setY(0);
          this.effects.ring(at, b.aoe, 0xff7a2a, 0.35);
          this.effects.burst(at.clone().setY(0.3), 0x7a6a5a, 14, 5, 0.14, 0.5);
          this.shake(0.2);
          if (Math.hypot(p.pos.x - at.x, p.pos.z - at.z) <= b.aoe + 0.3 && p.pos.y < 1.5) {
            this.damagePlayer(b.damage, { pos: at, monster: b.owner, melee: false });
          }
        }
        alive = false;
      }
      if (!alive) this.scene.remove(b.mesh);
      return alive;
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
          if (!m.alive || m.y > 2.5) continue;
          if (Math.hypot(m.pos.x - f.pos.x, m.pos.z - f.pos.z) > f.radius + m.radius) continue;
          this.hitMonster(m, f.damage, { quiet: true, slow: f.slow });
        }
        if (Math.random() < 0.8) {
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
    const waveText =
      this.phase.type === 'boss'
        ? '보스 페이즈'
        : this.waveIndex < 0
          ? '준비'
          : `웨이브 ${Math.min(this.waveIndex + 1, totalWaves)} / ${totalWaves}`;
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
      charge: p.charge >= 0 ? Math.min(1, p.charge / 1.2) : -1,
      phaseName: `${this.phase.id} ${this.phase.name}`,
      waveText,
      gold: this.pending.gold,
      kills: this.pending.kills,
      boss: this.boss
        ? { name: this.boss.def.name, hp: Math.max(0, this.boss.hp), maxHp: this.boss.maxHp, phase2: this.boss.phase2 }
        : null,
      dodgeReady: p.dodgeCd <= 0,
    };
  }

  // ───────────────────────── 경기장 ─────────────────────────

  private buildArena(): void {
    const boss = this.phase.type === 'boss';
    const scene = this.scene;
    const R = this.arenaRadius;
    const sky = boss ? 0x2a1c1c : 0x9cc4e4;
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(sky, R * 1.2, R * 3.2);

    scene.add(new THREE.HemisphereLight(boss ? 0xffc0a0 : 0xdfeeff, boss ? 0x301810 : 0x4a3a28, boss ? 0.8 : 1.0));
    const sun = new THREE.DirectionalLight(boss ? 0xffb080 : 0xfff2dd, boss ? 1.4 : 1.8);
    sun.position.set(25, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -R - 5;
    sc.right = R + 5;
    sc.top = R + 5;
    sc.bottom = -R - 5;
    sc.far = 120;
    scene.add(sun);

    const outer = new THREE.Mesh(new THREE.CircleGeometry(R + 90, 48), mat(boss ? 0x2e2624 : 0x5d7a3e));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    scene.add(outer);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 64), mat(boss ? 0x4a3f3a : 0x7a7552));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const rand = seeded(boss ? 77 : 13);
    // 경계: 바위와 기둥
    const rockMat = mat(boss ? 0x3a3436 : 0x8c8a84);
    const count = Math.floor(R * 1.6);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const rock = ico(0.9 + rand() * 0.9, rockMat, 0);
      rock.position.set(Math.cos(a) * (R + 0.8), 0.3, Math.sin(a) * (R + 0.8));
      rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      rock.receiveShadow = true;
      scene.add(rock);
    }

    if (boss) {
      const lava = mat(0xff5a1f, 0xff4a0f, 1.6);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const pillar = box(2, 8 + rand() * 6, 2, mat(0x3a3436));
        pillar.position.set(Math.cos(a) * (R + 6), 4, Math.sin(a) * (R + 6));
        pillar.rotation.y = rand() * 3;
        scene.add(pillar);
        const pool = new THREE.Mesh(circleGeo, lava);
        pool.rotation.x = -Math.PI / 2;
        pool.scale.setScalar(2 + rand() * 3);
        pool.position.set(Math.cos(a + 0.4) * (R + 12 + rand() * 10), 0.03, Math.sin(a + 0.4) * (R + 12 + rand() * 10));
        scene.add(pool);
      }
      for (let i = 0; i < 14; i++) {
        const crack = box(0.25, 0.02, 3 + rand() * 5, lava);
        const a = rand() * Math.PI * 2;
        const r = 4 + rand() * (R - 8);
        crack.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
        crack.rotation.y = rand() * Math.PI;
        scene.add(crack);
      }
    } else {
      const trunk = mat(0x6b4a2a);
      const leaves = [mat(0x3f7a35), mat(0x4f8a3a), mat(0x356b30)];
      for (let i = 0; i < 70; i++) {
        const a = rand() * Math.PI * 2;
        const r = R + 4 + rand() * 40;
        const s = 0.8 + rand() * 0.9;
        const t = cyl(0.25 * s, 0.35 * s, 1.6 * s, 6, trunk);
        t.position.set(Math.cos(a) * r, 0.8 * s, Math.sin(a) * r);
        scene.add(t);
        const l = cone(1.4 * s, 3.2 * s, 7, leaves[i % 3]);
        l.position.set(t.position.x, 3.0 * s, t.position.z);
        scene.add(l);
      }
      const stone = mat(0x9a9890);
      for (let i = 0; i < 26; i++) {
        const a = rand() * Math.PI * 2;
        const r = R + 2 + rand() * 12;
        const g = box(0.7, 1.1, 0.25, stone);
        g.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
        g.rotation.set((rand() - 0.5) * 0.3, rand() * 3, (rand() - 0.5) * 0.3);
        scene.add(g);
      }
    }
  }
}
