import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import {
  CRYSTAL_COUNT,
  CRYSTAL_HITS,
  CRYSTAL_TIME,
  OFF_MUL,
  RAID_BOSS,
  RAID_DIFFICULTY,
  RAID_ENRAGE_PACE,
  RAID_GROGGY,
  RAID_JUDGE_WARN,
  RAID_PHASE_AT,
  RAID_TIME,
  RAID_WEAPON_ORDER,
  SEAL_STAGES,
  WEAK_MUL,
  type RaidRun,
} from '../../data/raid';
import { WEAPON_TYPE_NAME, WEAPONS, type WeaponType } from '../../data/weapons';
import type { BattleScene } from '../battleScene';
import { DEPTH } from '../fx';
import type { Monster } from '../monster2d';
import { FLOOR_Y } from '../world';

/**
 * 마왕 레이드 진행자: 봉인 단계, 페이즈마다 바뀌는 약점 무기, 봉인 해제 기믹(봉인의 결정), 심판, 제한 시간.
 * BattleScene이 하나 들고 있고, 피해 배율과 결정 타격 판정을 여기에 묻는다.
 *
 * 흐름: fight → (체력 75·50·25%) rise → seal (결정 3개, 15초) → 성공: 봉인 해제 + 그로기 / 실패: judge(절반 즉사) → fight
 */

export type RaidMode = 'intro' | 'fight' | 'rise' | 'seal' | 'judge';

/** 무기 종류마다 결정·약점 표시 색 */
export const WEAPON_COLOR: Record<WeaponType, number> = {
  sword: 0x9fd8ff,
  dao: 0xff6a5a,
  bow: 0x8aff7a,
  gun: 0xffd060,
  staff: 0xc08aff,
};

const CRIMSON = 0xd8203a;
const GOLD = 0xffd060;
/** 떠오르는 데 걸리는 시간 */
const RISE_TIME = 0.8;
/** 해제 기믹 동안 마왕이 떠 있는 높이 (몸 가운데 y) */
export const RAID_FLOAT_Y = 110;

interface Crystal {
  m: Monster;
  type: WeaponType;
  left: number;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

export class RaidFight {
  mode: RaidMode = 'intro';
  /** 봉인 단계 (SEAL_STAGES 인덱스) */
  stage = 0;
  /** 다음 해제 기믹 (RAID_PHASE_AT 인덱스). 지금 몇 번째 페이즈인지도 된다 (0~3). */
  next = 0;
  weak: WeaponType;
  /** 흐른 시간 */
  time = 0;
  boss: Monster | null = null;
  /** 들고 온 무기 종류 (Tab 순서) */
  readonly types: WeaponType[];
  private crystals: Crystal[] = [];
  /** 모드 안에서 흐른 시간 */
  private t = 0;
  private side: -1 | 1 = 1;
  private weakLabel: Phaser.GameObjects.Text;
  /** 봉인 단계가 바뀔 때 BattleScene이 스탯을 다시 계산한다 */
  onSeal: (() => void) | null = null;

  constructor(
    private readonly b: BattleScene,
    readonly run: RaidRun,
  ) {
    const owned = run.weapons.map((uid) => WEAPONS[b.save.weapons.find((w) => w.uid === uid)?.defId ?? '']?.type).filter((t): t is WeaponType => !!t);
    this.types = RAID_WEAPON_ORDER.filter((t) => owned.includes(t));
    if (!this.types.length) this.types = ['sword'];
    this.weak = this.pickWeak(null);
    this.weakLabel = b.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffe28a', stroke: '#2a0610', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.text)
      .setVisible(false);
  }

  get sealMul(): number {
    return SEAL_STAGES[this.stage];
  }

  /** 마지막 페이즈 (체력 25% 아래) */
  get enraged(): boolean {
    return this.next >= RAID_PHASE_AT.length;
  }

  /** 패턴 대기 시간 배율: 난이도 · 광폭화 */
  pace(): number {
    return RAID_DIFFICULTY[this.run.difficulty].pace * (this.enraged ? RAID_ENRAGE_PACE : 1);
  }

  /** 마왕에게 들어가는 피해 배율: 약점 무기 ×3, 다른 무기 ×0.3 */
  damageMul(type: WeaponType): number {
    return type === this.weak ? WEAK_MUL : OFF_MUL;
  }

  isCrystal(m: Monster): boolean {
    return m.def.kind === 'seal_crystal';
  }

  /** 마왕을 세운다 (오른쪽에서 떨어진다). */
  spawnBoss(): Monster {
    const b = this.b;
    const m = b.spawnMonster(RAID_BOSS, false, b.level.width - 220);
    this.boss = m;
    this.mode = 'fight';
    b.announce('종언의 마왕 아스타로트', 2.5);
    b.time.delayedCall(1600, () => this.announceWeak());
    b.fx.flashScreen(CRIMSON, 0.35, 400);
    b.fx.shake(1.2, 300);
    sfx.play('wave');
    return m;
  }

  /** 결정 타격: 맞는 무기면 한 칸, 아니면 무효. 봉인된 스탯과 상관없다. */
  hitCrystal(m: Monster, type: WeaponType): void {
    const c = this.crystals.find((x) => x.m === m);
    const b = this.b;
    if (!c || c.left <= 0) return;
    if (type !== c.type) {
      b.fx.text(m.x, m.body.top - 6, '무효', 'quiet');
      sfx.play('block', 0.3);
      return;
    }
    c.left--;
    m.onHit(b.player.x, 0, true);
    b.fx.spark(m.x + (Math.random() - 0.5) * 14, m.y + (Math.random() - 0.5) * 24, WEAPON_COLOR[c.type], 1.5, Math.random() < 0.5 ? 0 : Math.PI / 4);
    b.fx.burst(m.x, m.y, WEAPON_COLOR[c.type], 6, 110, 300);
    sfx.play('block', 0.6);
    if (c.left > 0) return;
    // 깨졌다
    b.fx.boom(m.x, m.y, 30, 'arcane');
    b.fx.burst(m.x, m.y, 0xff8a94, 18, 200, 500);
    b.fx.ring(m.x, m.y, 40, WEAPON_COLOR[c.type], 360);
    b.fx.text(m.x, m.body.top - 14, '파괴!', 'crit');
    sfx.play('boom', 0.6);
    m.kill();
    c.label.setVisible(false);
    c.ring.setVisible(false);
  }

  update(dt: number): void {
    const b = this.b;
    const m = this.boss;
    this.followLabels();
    if (!m || !m.alive || this.mode === 'intro') return;
    this.time += dt;
    this.t += dt;
    if (this.time >= RAID_TIME && !b.player.dead) {
      // 시간 초과: 의식이 완성된다.
      this.time = RAID_TIME;
      b.executePlayer('종언의 의식이 완성되었다', CRIMSON);
      return;
    }
    switch (this.mode) {
      case 'fight':
        if (this.next < RAID_PHASE_AT.length && m.hp / m.maxHp < RAID_PHASE_AT[this.next]) this.startRise();
        break;
      case 'rise':
        if (this.t >= RISE_TIME) this.startSeal();
        break;
      case 'seal': {
        if (this.crystals.every((c) => c.left <= 0)) this.sealBroken();
        else if (this.t >= CRYSTAL_TIME) this.sealFailed();
        break;
      }
      case 'judge':
        // 예고(telegraph)가 judge()를 부른다.
        break;
    }
  }

  /** HUD 상태 줄 */
  note(): string {
    const left = Math.max(0, RAID_TIME - this.time);
    const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    const seal = `봉인 ${Math.round(this.sealMul * 100)}%`;
    const head = `${seal} · ${clock}`;
    switch (this.mode) {
      case 'intro':
        return seal;
      case 'rise':
        return `${head} · 마왕이 봉인을 두른다`;
      case 'seal': {
        const done = this.crystals.filter((c) => c.left <= 0).length;
        return `${head} · 봉인의 결정 ${done}/${this.crystals.length} · ${Math.max(0, CRYSTAL_TIME - this.t).toFixed(1)}초`;
      }
      case 'judge':
        return `${head} · 종언의 심판! 반대편으로 피하라`;
      default: {
        const groggy = this.b.legionGroggy > 0 ? ` · 그로기 ${this.b.legionGroggy.toFixed(1)}초` : '';
        return `${head} · 약점 ${WEAPON_TYPE_NAME[this.weak]}${this.enraged ? ' · 광폭화' : ''}${groggy}`;
      }
    }
  }

  destroy(): void {
    this.weakLabel.destroy();
    for (const c of this.crystals) {
      c.label.destroy();
      c.ring.destroy();
    }
    this.crystals = [];
  }

  // ───────── 내부 ─────────

  /** 앞 약점과 겹치지 않게 무작위 (무기가 하나뿐이면 계속 그 무기) */
  private pickWeak(prev: WeaponType | null): WeaponType {
    const pool = this.types.length > 1 ? this.types.filter((t) => t !== prev) : this.types;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private announceWeak(): void {
    const b = this.b;
    if (!this.boss?.alive) return;
    b.announce(`약점: ${WEAPON_TYPE_NAME[this.weak]}! 다른 무기는 피해가 크게 준다`, 2);
    b.fx.ring(this.boss.x, this.boss.y, 70, WEAPON_COLOR[this.weak], 420);
  }

  private setMode(mode: RaidMode): void {
    this.mode = mode;
    this.t = 0;
  }

  /** 체력 기준을 지났다: 마왕이 가운데로 떠올라 무적이 된다. */
  private startRise(): void {
    const b = this.b;
    const m = this.boss!;
    // 한 번에 여러 기준을 넘어도 한 번만 한다.
    while (this.next < RAID_PHASE_AT.length && m.hp / m.maxHp < RAID_PHASE_AT[this.next]) this.next++;
    this.setMode('rise');
    m.hitShield = -1;
    m.stun = 0;
    m.vuln = 0;
    b.legionGroggy = 0;
    b.fx.flashScreen(CRIMSON, 0.3, 300);
    b.fx.burst(m.x, m.y, CRIMSON, 24, 180, 500);
    b.announce('마왕이 봉인을 두른다!', 1.4);
    sfx.play('magic', 0.9);
  }

  /** 봉인의 결정 3개를 세운다. 결정마다 깨야 하는 무기가 다르다. */
  private startSeal(): void {
    const b = this.b;
    const W = b.level.width;
    this.setMode('seal');
    const pool = [...this.types].sort(() => Math.random() - 0.5);
    const xs = [W * 0.15, W * 0.5, W * 0.85];
    for (let i = 0; i < CRYSTAL_COUNT; i++) {
      const type = pool[i % pool.length];
      const x = xs[i];
      const y = FLOOR_Y - 34;
      const cm = b.spawnMonster('seal_crystal', false, x);
      cm.body.reset(x, y);
      cm.body.setVelocity(0, 0);
      cm.sprite.setTint(0xffffff);
      const color = WEAPON_COLOR[type];
      const ring = b.add.circle(x, y, 22).setStrokeStyle(2, color, 0.9).setDepth(DEPTH.monster - 1).setBlendMode(Phaser.BlendModes.ADD);
      const label = b.add
        .text(x, y - 30, '', { fontFamily: 'monospace', fontSize: '11px', color: hex(color), stroke: '#140408', strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.text);
      this.crystals.push({ m: cm, type, left: CRYSTAL_HITS, label, ring });
      b.fx.pillar(x, FLOOR_Y, color, 160, 500);
      b.fx.burst(x, y, color, 12, 140, 400);
    }
    b.fx.ring(this.boss!.x, this.boss!.y, 90, CRIMSON, 400);
    b.announce(`봉인의 결정을 ${CRYSTAL_TIME}초 안에 깨라! 결정마다 맞는 무기로`, 2.2);
    sfx.play('magic', 1);
  }

  private clearCrystals(): void {
    for (const c of this.crystals) {
      if (c.m.alive) c.m.kill();
      c.label.destroy();
      c.ring.destroy();
    }
    this.crystals = [];
  }

  /** 결정을 다 깼다: 봉인 한 단계 해제 + 그로기 */
  private sealBroken(): void {
    const b = this.b;
    const m = this.boss!;
    this.clearCrystals();
    this.stage = Math.min(SEAL_STAGES.length - 1, this.stage + 1);
    this.onSeal?.();
    this.land(m);
    m.stun = RAID_GROGGY;
    m.vuln = Math.max(m.vuln, 1);
    m.vulnTime = RAID_GROGGY;
    b.legionGroggy = RAID_GROGGY;
    this.weak = this.pickWeak(this.weak);
    this.setMode('fight');
    b.announce(`봉인 해제! 힘이 ${Math.round(this.sealMul * 100)}%로 돌아왔다`, 1.8);
    b.time.delayedCall(1900, () => this.announceWeak());
    b.fx.stop(0.15);
    b.fx.flashScreen(GOLD, 0.45, 320);
    b.fx.shake(1.4, 260);
    const p = b.player;
    b.fx.pillar(p.x, p.feet, GOLD, 200, 700);
    b.fx.embers(p.x, p.feet, GOLD, 24, 20, 70, 900);
    for (let i = 0; i < 3; i++) b.time.delayedCall(i * 70, () => b.fx.ring(m.x, m.y, 60 + i * 40, i === 1 ? GOLD : CRIMSON, 380));
    sfx.play('boom', 0.9);
  }

  /** 시간 안에 못 깼다: 한쪽 절반에 심판을 예고한다. 봉인은 그대로. */
  private sealFailed(): void {
    const b = this.b;
    const W = b.level.width;
    this.clearCrystals();
    this.setMode('judge');
    const pSide: -1 | 1 = b.player.x < W / 2 ? -1 : 1;
    this.side = Math.random() < 0.65 ? pSide : ((-pSide) as -1 | 1);
    const x0 = this.side === -1 ? 0 : W / 2;
    b.announce(this.side === -1 ? '왼쪽에 종언의 심판! 오른쪽으로 피하라' : '오른쪽에 종언의 심판! 왼쪽으로 피하라', RAID_JUDGE_WARN);
    b.fx.dim(0x2a0610, 0.35, RAID_JUDGE_WARN * 1000);
    b.addTelegraph(x0, 0, W / 2, FLOOR_Y, RAID_JUDGE_WARN, this.boss, () => this.judge(), CRIMSON);
    sfx.play('magic', 1);
  }

  private judge(): void {
    const b = this.b;
    const W = b.level.width;
    const x0 = this.side === -1 ? 0 : W / 2;
    for (let i = 0; i < 7; i++) {
      const x = x0 + (i + 0.5) * (W / 2 / 7);
      b.time.delayedCall(i * 35, () => {
        b.fx.pillar(x, FLOOR_Y, CRIMSON, 360, 800);
        b.fx.burst(x, FLOOR_Y - 8, 0xff8a94, 8, 160, 500);
      });
    }
    b.fx.flashScreen(CRIMSON, 0.6, 500);
    b.fx.shake(2, 400);
    sfx.play('boom', 1);
    const p = b.player;
    if (p.x >= x0 && p.x <= x0 + W / 2) b.executePlayer('종언의 심판', CRIMSON);
    const m = this.boss;
    if (m?.alive) {
      this.land(m);
      m.attackTimer = 1.2;
    }
    this.weak = this.pickWeak(this.weak);
    this.setMode('fight');
    b.time.delayedCall(800, () => this.announceWeak());
  }

  /** 떠 있던 마왕을 땅에 내린다. */
  private land(m: Monster): void {
    m.hitShield = 0;
    m.body.reset(m.x, FLOOR_Y - m.body.height / 2);
    m.body.setVelocity(0, 0);
  }

  /** 약점 표시와 결정 글씨가 따라다닌다. */
  private followLabels(): void {
    const m = this.boss;
    const show = !!m?.alive && this.mode === 'fight';
    this.weakLabel.setVisible(show);
    if (show && m) {
      this.weakLabel.setText(`약점 · ${WEAPON_TYPE_NAME[this.weak]}`).setColor(hex(WEAPON_COLOR[this.weak]));
      this.weakLabel.setPosition(m.x, m.body.top - 18);
    }
    for (const c of this.crystals) {
      if (c.left <= 0) continue;
      c.label.setText(`${WEAPON_TYPE_NAME[c.type]} ${c.left}`);
      c.label.setPosition(c.m.x, c.m.body.top - 6);
      c.ring.setPosition(c.m.x, c.m.y);
      c.ring.setScale(1 + Math.sin(this.b.time.now / 180) * 0.08);
    }
  }
}
