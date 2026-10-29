import * as THREE from 'three';
import { ELITE_MOD, MONSTERS, type MonsterDef, type MonsterKind } from '../data/monsters';
import { makeEliteAura, makeMonster, type Rig } from './models';
import type { Battle } from './battle';

type State = 'move' | 'windup' | 'recover' | 'dashWind' | 'dash' | 'dive' | 'linger' | 'rise' | 'pattern';
type BossPattern = 'slam' | 'rocks' | 'shockwave' | 'charge' | 'combo' | 'leap' | 'spin';

const MINION_ALTITUDE = 3.6;

const barBgMat = new THREE.SpriteMaterial({ color: 0x1a1a1a, depthTest: false });
const barFgMat = new THREE.SpriteMaterial({ color: 0xe53935, depthTest: false });
const barEliteMat = new THREE.SpriteMaterial({ color: 0xff9a1a, depthTest: false });

export class Monster {
  readonly def: MonsterDef;
  readonly elite: boolean;
  readonly rig: Rig;
  readonly pos = new THREE.Vector3();
  /** 바닥 높이 (비행 몬스터는 고도) */
  y = 0;
  facing = 0;

  hp: number;
  readonly maxHp: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly height: number;
  readonly scale: number;

  alive = true;
  dying = 0;
  stun = 0;
  slowTime = 0;
  slowMul = 1;
  vulnTime = 0;
  vuln = 0;

  state: State = 'move';
  stateTime = 0;
  attackTimer: number;
  hitPulse = 0;
  private anim = Math.random() * 10;
  private orbit = Math.random() * Math.PI * 2;
  private orbitSign = Math.random() < 0.5 ? -1 : 1;
  private dashCd = 3 + Math.random() * 2;
  private hitDone = false;
  private readonly dir = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  // 보스
  private pattern: BossPattern = 'slam';
  private patternStep = 0;
  private summonThresholds = [0.7, 0.4];
  phase2 = false;
  private readonly leapFrom = new THREE.Vector3();

  private hpBar: THREE.Group | null = null;
  private hpFg: THREE.Sprite | null = null;
  private barWidth = 1;

  constructor(kind: MonsterKind, elite: boolean, hpMul: number) {
    this.def = MONSTERS[kind];
    this.elite = elite;
    this.scale = elite ? ELITE_MOD.scale : kind === 'golem_lord' ? 2.1 : kind === 'grave_knight' ? 1.35 : 1;
    this.maxHp = Math.round(this.def.hp * hpMul * (elite ? ELITE_MOD.hp : 1));
    this.hp = this.maxHp;
    this.damage = this.def.damage * (elite ? ELITE_MOD.damage : 1);
    this.speed = this.def.speed * (elite ? 1.15 : 1);
    this.radius = this.def.radius * (elite ? ELITE_MOD.scale : 1);
    this.height = this.def.height * (elite ? ELITE_MOD.scale : 1);
    this.attackTimer = this.def.attackCd * (0.4 + Math.random() * 0.6);
    if (this.def.flying) this.y = MINION_ALTITUDE;

    this.rig = makeMonster(kind);
    this.rig.root.scale.setScalar(this.scale);
    if (elite) this.rig.root.add(makeEliteAura(this.def.radius * 1.6));

    if (!this.showsBossBar) {
      this.barWidth = elite ? 1.6 : 1;
      this.hpBar = new THREE.Group();
      const bg = new THREE.Sprite(barBgMat);
      bg.scale.set(this.barWidth + 0.06, 0.14, 1);
      bg.renderOrder = 10;
      this.hpFg = new THREE.Sprite(elite ? barEliteMat : barFgMat);
      this.hpFg.scale.set(this.barWidth, 0.09, 1);
      this.hpFg.renderOrder = 11;
      this.hpBar.add(bg, this.hpFg);
      this.hpBar.visible = elite;
    }
  }

  get boss(): boolean {
    return !!this.def.boss;
  }

  /** 보스 체력바로 보여 주는 몬스터 (보스·미니보스) */
  get showsBossBar(): boolean {
    return !!this.def.boss || !!this.def.miniboss;
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.rig.root);
    if (this.hpBar) scene.add(this.hpBar);
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
    if (this.hpBar) scene.remove(this.hpBar);
  }

  center(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos.x, this.y + this.height / 2, this.pos.z);
  }

  get removable(): boolean {
    return !this.alive && this.dying <= 0;
  }

  onHit(): void {
    this.hitPulse = 0.12;
    if (this.hpBar) this.hpBar.visible = true;
  }

  kill(): void {
    this.alive = false;
    this.dying = 0.45;
    if (this.hpBar) this.hpBar.visible = false;
  }

  update(dt: number, b: Battle): void {
    this.anim += dt;
    this.hitPulse = Math.max(0, this.hitPulse - dt);

    if (!this.alive) {
      this.dying -= dt;
      const t = Math.max(0, this.dying / 0.45);
      this.rig.root.scale.setScalar(this.scale * (0.3 + 0.7 * t));
      this.rig.root.rotation.z = (1 - t) * 1.2;
      if (this.def.flying) this.y = Math.max(0, this.y - dt * 8);
      this.syncModel();
      return;
    }

    if (this.slowTime > 0) {
      this.slowTime -= dt;
      if (this.slowTime <= 0) this.slowMul = 1;
    }
    if (this.vulnTime > 0) {
      this.vulnTime -= dt;
      if (this.vulnTime <= 0) this.vuln = 0;
    }

    if (this.stun > 0) {
      this.stun -= dt;
      // 기절한 비행 몬스터는 낮게 떨어져 근접 공격에 맞는다.
      if (this.def.flying) this.y = Math.max(0.6, this.y - dt * 6);
      else if (this.y > 0) this.y = Math.max(0, this.y - dt * 10);
      if (this.stun <= 0) {
        this.state = this.def.flying ? 'rise' : 'move';
      }
    } else {
      switch (this.def.kind) {
        case 'zombie':
        case 'poison_zombie':
          this.updateZombie(dt, b);
          break;
        case 'mage':
        case 'fire_mage':
          this.updateMage(dt, b);
          break;
        case 'grave_knight':
          this.updateKnight(dt, b);
          break;
        case 'minion':
          this.updateMinion(dt, b);
          break;
        case 'golem':
          this.updateGolem(dt, b);
          break;
        case 'golem_lord':
          this.updateBoss(dt, b);
          break;
      }
    }

    // 경기장 밖으로 나가지 않는다.
    const r = Math.hypot(this.pos.x, this.pos.z);
    const limit = b.arenaRadius - this.radius;
    if (r > limit) {
      this.pos.x *= limit / r;
      this.pos.z *= limit / r;
    }

    this.animate();
    this.syncModel();
  }

  private syncModel(): void {
    const root = this.rig.root;
    root.position.set(this.pos.x, this.def.flying ? this.y + 0.4 * this.scale : this.y, this.pos.z);
    root.rotation.y = this.facing;
    if (this.alive) {
      const pulse = this.hitPulse > 0 ? 1 + this.hitPulse * 1.2 : 1;
      root.scale.set(this.scale * pulse, this.scale / pulse, this.scale * pulse);
    }
    if (this.hpBar && this.hpFg) {
      this.hpBar.position.set(this.pos.x, this.y + this.height + 0.45, this.pos.z);
      const ratio = Math.max(0, this.hp / this.maxHp);
      this.hpFg.scale.x = this.barWidth * ratio;
    }
  }

  private animate(): void {
    const rig = this.rig;
    const moving = this.state === 'move' || this.state === 'dash';
    const walk = moving && this.stun <= 0 ? Math.sin(this.anim * this.speed * 2.6) * 0.6 : 0;
    rig.legL.rotation.x = walk;
    rig.legR.rotation.x = -walk;

    switch (this.def.kind) {
      case 'grave_knight': {
        const wind = this.state === 'pattern' && this.stateTime > 0;
        rig.armR.rotation.x = wind ? -2.8 : this.state === 'pattern' ? -0.4 : -0.6;
        rig.armL.rotation.x = -walk * 0.5;
        break;
      }
      case 'zombie':
      case 'poison_zombie': {
        const wind = this.state === 'windup' || this.state === 'dashWind';
        const arms = wind ? -2.4 : -1.45 + Math.sin(this.anim * 3) * 0.1;
        rig.armL.rotation.x = arms;
        rig.armR.rotation.x = arms + (wind ? 0 : 0.15);
        break;
      }
      case 'mage':
      case 'fire_mage': {
        const wind = this.state === 'windup';
        rig.armR.rotation.x = wind ? -2.6 : -0.4;
        rig.armL.rotation.x = wind ? -1.4 : -0.2;
        rig.body.position.y = Math.sin(this.anim * 2) * 0.08;
        if (rig.glow) rig.glow.scale.setScalar(wind ? 1.4 + Math.sin(this.anim * 30) * 0.3 : 1);
        break;
      }
      case 'minion': {
        const flap = Math.sin(this.anim * (this.state === 'dive' ? 30 : 16)) * 0.7;
        if (rig.wingL) rig.wingL.rotation.z = flap;
        if (rig.wingR) rig.wingR.rotation.z = -flap;
        rig.body.rotation.x = this.state === 'dive' ? 0.8 : 0;
        break;
      }
      case 'golem':
      case 'golem_lord': {
        const wind = this.state === 'windup' || this.state === 'pattern';
        const arms = wind ? -2.7 : Math.sin(this.anim * this.speed * 2.6) * 0.3;
        rig.armL.rotation.x = arms;
        rig.armR.rotation.x = wind ? arms : -arms;
        break;
      }
    }
    if (this.stun > 0) rig.body.rotation.z = Math.sin(this.anim * 12) * 0.15;
    else if (this.def.kind !== 'minion') rig.body.rotation.z = 0;
  }

  private toPlayer(b: Battle): { dx: number; dz: number; dist: number } {
    const dx = b.player.pos.x - this.pos.x;
    const dz = b.player.pos.z - this.pos.z;
    return { dx, dz, dist: Math.hypot(dx, dz) };
  }

  private face(dx: number, dz: number): void {
    if (dx !== 0 || dz !== 0) this.facing = Math.atan2(dx, dz);
  }

  private move(dx: number, dz: number, speed: number, dt: number, faceIt = true): void {
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const s = speed * this.slowMul * dt;
    this.pos.x += (dx / len) * s;
    this.pos.z += (dz / len) * s;
    if (faceIt) this.face(dx, dz);
  }

  private meleeReach(): number {
    return this.def.range + this.radius + 0.5;
  }

  private updateZombie(dt: number, b: Battle): void {
    const { dx, dz, dist } = this.toPlayer(b);
    this.stateTime -= dt;
    switch (this.state) {
      case 'move':
        this.move(dx, dz, this.speed, dt);
        if (this.elite) {
          this.dashCd -= dt;
          if (this.dashCd <= 0 && dist > 4 && dist < 12) {
            this.state = 'dashWind';
            this.stateTime = 0.5;
            this.hitDone = false;
            break;
          }
        }
        if (dist < this.meleeReach()) {
          this.state = 'windup';
          this.stateTime = this.elite ? 0.35 : 0.45;
        }
        break;
      case 'windup':
        this.face(dx, dz);
        if (this.stateTime <= 0) {
          if (dist < this.meleeReach() + 0.3 && b.player.pos.y < 1.6) {
            b.damagePlayer(this.damage, { pos: this.pos, monster: this, melee: true });
          }
          this.state = 'recover';
          this.stateTime = 0.6;
        }
        break;
      case 'dashWind':
        this.face(dx, dz);
        if (this.stateTime <= 0) {
          this.dir.set(dx, 0, dz).normalize();
          this.state = 'dash';
          this.stateTime = 0.45;
        }
        break;
      case 'dash':
        this.pos.addScaledVector(this.dir, 13 * dt);
        if (!this.hitDone && dist < this.radius + 0.8 && b.player.pos.y < 1.6) {
          this.hitDone = true;
          b.damagePlayer(this.damage * 1.2, { pos: this.pos, monster: this, melee: true });
        }
        if (this.stateTime <= 0) {
          this.state = 'recover';
          this.stateTime = 0.7;
          this.dashCd = 5;
        }
        break;
      default:
        if (this.stateTime <= 0) this.state = 'move';
    }
  }

  private updateMage(dt: number, b: Battle): void {
    const { dx, dz, dist } = this.toPlayer(b);
    this.stateTime -= dt;
    this.attackTimer -= dt;
    if (this.state === 'move') {
      if (dist > 15) this.move(dx, dz, this.speed, dt);
      else if (dist < 9) this.move(-dx, -dz, this.speed, dt, false);
      else this.move(-dz * this.orbitSign, dx * this.orbitSign, this.speed * 0.5, dt, false);
      this.face(dx, dz);
      if (this.attackTimer <= 0 && dist < this.def.range) {
        this.state = 'windup';
        this.stateTime = 0.7;
      }
    } else if (this.state === 'windup') {
      this.face(dx, dz);
      if (this.stateTime <= 0) {
        const origin = new THREE.Vector3(this.pos.x, this.y + 2.0 * this.scale, this.pos.z);
        const aim = b.player.pos.clone();
        aim.y += 1.1;
        const base = aim.sub(origin).normalize();
        const spreads = this.elite ? [-0.25, 0, 0.25] : [0];
        const fire = this.def.kind === 'fire_mage';
        for (const s of spreads) {
          const v = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s).multiplyScalar(fire ? 11 : 13);
          // 화염 마법사의 불덩이는 맞거나 땅에 닿으면 폭발한다.
          b.spawnEnemyBolt(origin, v, this.damage, fire ? 0xff7a1a : 0xff4fa0, this, fire ? 2.2 : 0);
        }
        this.attackTimer = this.def.attackCd;
        this.state = 'move';
      }
    }
  }

  private updateMinion(dt: number, b: Battle): void {
    const player = b.player;
    this.stateTime -= dt;
    switch (this.state) {
      case 'move': {
        this.orbit += dt * 0.9 * this.orbitSign;
        this.target.set(player.pos.x + Math.cos(this.orbit) * 7, 0, player.pos.z + Math.sin(this.orbit) * 7);
        this.move(this.target.x - this.pos.x, this.target.z - this.pos.z, this.speed, dt, false);
        this.face(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        this.y += (MINION_ALTITUDE - this.y) * Math.min(1, dt * 3);
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          this.state = 'dive';
          this.stateTime = 1.4;
          this.hitDone = false;
          this.target.set(player.pos.x, player.pos.y + 0.7, player.pos.z);
        }
        break;
      }
      case 'dive': {
        const dx = this.target.x - this.pos.x;
        const dy = this.target.y - this.y;
        const dz = this.target.z - this.pos.z;
        const len = Math.hypot(dx, dy, dz);
        const step = 12 * dt;
        if (len > step) {
          this.pos.x += (dx / len) * step;
          this.pos.z += (dz / len) * step;
          this.y += (dy / len) * step;
          this.face(dx, dz);
        }
        const pdx = player.pos.x - this.pos.x;
        const pdz = player.pos.z - this.pos.z;
        const pdy = player.pos.y + 1 - (this.y + 0.4);
        if (!this.hitDone && Math.hypot(pdx, pdy, pdz) < 1.2) {
          this.hitDone = true;
          b.damagePlayer(this.damage, { pos: this.pos, monster: this, melee: true });
        }
        if (len <= step || this.stateTime <= 0) {
          this.state = 'linger';
          this.stateTime = 0.7;
        }
        break;
      }
      case 'linger':
        if (this.stateTime <= 0) this.state = 'rise';
        break;
      case 'rise':
        this.y += dt * 3.5;
        if (this.y >= MINION_ALTITUDE - 0.1) {
          this.state = 'move';
          this.attackTimer = this.def.attackCd * (this.elite ? 0.6 : 1) * (0.8 + Math.random() * 0.4);
        }
        break;
      default:
        this.state = 'rise';
    }
  }

  private updateGolem(dt: number, b: Battle): void {
    const { dx, dz, dist } = this.toPlayer(b);
    this.stateTime -= dt;
    this.attackTimer -= dt;
    switch (this.state) {
      case 'move':
        this.move(dx, dz, this.speed, dt);
        if (dist < this.def.range + this.radius && this.attackTimer <= 0) {
          this.state = 'windup';
          this.stateTime = 1.1;
          const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
          const at = this.pos.clone().addScaledVector(fwd, this.radius + 1.2);
          const radius = this.elite ? 3.8 : 3.0;
          b.addTelegraph(at, radius, 1.1, this, () => {
            b.groundSlam(at, radius, this.damage, this);
            if (this.elite) b.addShockwave(this.pos, 9, 8, this.damage * 0.5, this);
          });
        }
        break;
      case 'windup':
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

  private updateBoss(dt: number, b: Battle): void {
    const { dx, dz, dist } = this.toPlayer(b);
    const ratio = this.hp / this.maxHp;
    if (!this.phase2 && ratio < 0.5) {
      this.phase2 = true;
      b.announce('골렘 군주가 격노했다!');
    }
    if (this.summonThresholds.length && ratio < this.summonThresholds[0]) {
      this.summonThresholds.shift();
      b.announce('골렘 군주가 하수인을 부른다!');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const at = new THREE.Vector3(this.pos.x + Math.cos(a) * 6, 0, this.pos.z + Math.sin(a) * 6);
        b.spawnMonster(i < 4 ? 'zombie' : 'minion', false, at);
      }
      if (this.phase2) b.spawnMonster('golem', true, new THREE.Vector3(-this.pos.x * 0.5, 0, -this.pos.z * 0.5));
    }

    const speedMul = this.phase2 ? 1.3 : 1;
    this.stateTime -= dt;
    this.attackTimer -= dt;

    if (this.state === 'move') {
      if (dist > 6) this.move(dx, dz, this.speed * speedMul, dt);
      else this.face(dx, dz);
      if (this.attackTimer <= 0) this.startBossPattern(b, dist);
      return;
    }

    if (this.state === 'recover') {
      if (this.stateTime <= 0) this.state = 'move';
      return;
    }

    // pattern 진행
    const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    switch (this.pattern) {
      case 'slam':
        if (this.stateTime <= 0) this.endPattern();
        break;
      case 'rocks': {
        this.face(dx, dz);
        const count = this.phase2 ? 3 : 1;
        if (this.patternStep < count && this.stateTime <= -0.35 * this.patternStep) {
          const spread = this.patternStep === 0 ? 0 : 3.5;
          const target = b.player.pos.clone();
          target.y = 0;
          target.x += (Math.random() - 0.5) * spread * 2;
          target.z += (Math.random() - 0.5) * spread * 2;
          const origin = new THREE.Vector3(this.pos.x, this.height * 0.85, this.pos.z).addScaledVector(fwd, 1.5);
          b.throwRock(origin, target, 1.1, this.damage * 0.7, this);
          this.patternStep++;
        }
        if (this.stateTime <= -0.35 * count - 0.2) this.endPattern();
        break;
      }
      case 'shockwave':
        if (this.stateTime <= 0 && this.patternStep < (this.phase2 ? 2 : 1)) {
          b.addShockwave(this.pos, 22, 10, this.damage * 0.8, this);
          b.effects.ring(this.pos, 7, 0xffa040, 0.5);
          b.shake(0.5);
          this.patternStep++;
          this.stateTime = 0.7;
        } else if (this.stateTime <= 0) {
          this.endPattern();
        }
        break;
      case 'charge':
        if (this.patternStep === 0) {
          this.face(dx, dz);
          if (this.stateTime <= 0) {
            this.dir.set(dx, 0, dz).normalize();
            this.patternStep = 1;
            this.stateTime = 0.75;
            this.hitDone = false;
          }
        } else {
          this.pos.addScaledVector(this.dir, 18 * dt);
          if (!this.hitDone && dist < this.radius + 1 && b.player.pos.y < 2) {
            this.hitDone = true;
            b.damagePlayer(this.damage, { pos: this.pos, monster: this, melee: true });
          }
          if (this.stateTime <= 0) this.endPattern();
        }
        break;
    }
  }

  /** 무덤 기사: 3연속 베기, 도약 내려찍기, 체력 절반 이하에서 회전 베기와 소환 */
  private updateKnight(dt: number, b: Battle): void {
    const { dx, dz, dist } = this.toPlayer(b);
    if (!this.phase2 && this.hp / this.maxHp < 0.5) {
      this.phase2 = true;
      b.announce('무덤 기사가 망자를 일으킨다!', 1.6);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + this.facing;
        b.spawnMonster('zombie', false, new THREE.Vector3(this.pos.x + Math.cos(a) * 4, 0, this.pos.z + Math.sin(a) * 4));
      }
    }
    this.stateTime -= dt;
    this.attackTimer -= dt;

    if (this.state === 'move') {
      this.move(dx, dz, this.speed * (this.phase2 ? 1.2 : 1), dt);
      if (this.attackTimer > 0) return;
      this.state = 'pattern';
      this.patternStep = 0;
      if (this.phase2 && dist < 6 && Math.random() < 0.4) {
        this.pattern = 'spin';
        this.stateTime = 0.95;
        const at = this.pos.clone();
        b.addTelegraph(at, 4.5, 0.9, this, () => {
          b.groundSlam(at, 4.5, this.damage * 1.3, this);
          b.effects.slash(at, this.facing, { radius: 4.5, span: Math.PI * 2, color: 0xff5a4a, dur: 0.3 });
        });
      } else if (dist > 7) {
        this.pattern = 'leap';
        this.stateTime = 0.55;
        this.target.set(b.player.pos.x, 0, b.player.pos.z);
        b.addTelegraph(this.target, 3, 1.25, null, null);
      } else {
        this.pattern = 'combo';
        this.stateTime = 0.45;
      }
      return;
    }

    if (this.state === 'recover') {
      if (this.stateTime <= 0) this.state = 'move';
      return;
    }

    switch (this.pattern) {
      case 'combo':
        this.face(dx, dz);
        if (this.stateTime <= 0) {
          const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
          this.pos.addScaledVector(fwd, 1.0);
          b.effects.slash(this.pos, this.facing, {
            radius: 3.4,
            span: Math.PI * 0.6,
            color: 0xff6a5a,
            vertical: this.patternStep === 1,
            y: 0.8,
          });
          const toX = b.player.pos.x - this.pos.x;
          const toZ = b.player.pos.z - this.pos.z;
          const d = Math.hypot(toX, toZ);
          const inFront = d < 0.1 || (toX * fwd.x + toZ * fwd.z) / d > 0.45;
          if (d < 3.4 + 0.4 && inFront && b.player.pos.y < 1.6) {
            b.damagePlayer(this.damage, { pos: this.pos, monster: this, melee: true });
          }
          this.patternStep++;
          if (this.patternStep < 3) this.stateTime = 0.38;
          else this.endKnight();
        }
        break;
      case 'leap':
        if (this.patternStep === 0) {
          this.face(this.target.x - this.pos.x, this.target.z - this.pos.z);
          if (this.stateTime <= 0) {
            this.patternStep = 1;
            this.leapFrom.copy(this.pos);
            this.stateTime = 0.7;
          }
        } else {
          const t = Math.min(1, 1 - this.stateTime / 0.7);
          this.pos.lerpVectors(this.leapFrom, this.target, t);
          this.y = Math.sin(Math.PI * t) * 4;
          if (this.stateTime <= 0) {
            this.y = 0;
            b.groundSlam(this.target, 3, this.damage * 1.2, this);
            b.shake(0.35);
            this.endKnight();
          }
        }
        break;
      case 'spin':
        if (this.stateTime <= 0) this.endKnight();
        break;
      default:
        this.endKnight();
    }
  }

  private endKnight(): void {
    this.y = 0;
    this.state = 'recover';
    this.stateTime = 0.6;
    this.attackTimer = this.def.attackCd * (this.phase2 ? 0.7 : 1);
  }

  private startBossPattern(b: Battle, dist: number): void {
    const options: BossPattern[] = dist < 9 ? ['slam', 'slam', 'shockwave', 'rocks'] : ['rocks', 'rocks', 'shockwave'];
    if (this.phase2) options.push('charge', 'charge');
    this.pattern = options[Math.floor(Math.random() * options.length)];
    this.patternStep = 0;
    this.state = 'pattern';
    const fast = this.phase2 ? 0.75 : 1;
    switch (this.pattern) {
      case 'slam': {
        const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
        const at = this.pos.clone().addScaledVector(fwd, this.radius + 2.2);
        const dur = 1.2 * fast;
        this.stateTime = dur + 0.2;
        b.addTelegraph(at, 5, dur, this, () => {
          b.groundSlam(at, 5, this.damage * 1.2, this);
          b.shake(0.6);
        });
        break;
      }
      case 'rocks':
        this.stateTime = 0.6;
        break;
      case 'shockwave':
        this.stateTime = 1.0 * fast;
        b.announce('점프로 충격파를 피하라!', 1.2);
        break;
      case 'charge':
        this.stateTime = 0.8;
        break;
    }
  }

  private endPattern(): void {
    this.state = 'recover';
    this.stateTime = this.phase2 ? 0.6 : 1.0;
    this.attackTimer = this.def.attackCd * (this.phase2 ? 0.7 : 1);
  }
}
