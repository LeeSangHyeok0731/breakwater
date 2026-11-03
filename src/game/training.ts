import type { PhaseDef } from '../data/phases';
import '../ui/training.css';
import { koNum } from '../ui/format';
import type { BattleScene } from './battleScene';
import type { Monster } from './monster2d';
import { ensureScarecrow } from './scarecrow';
import { FLOOR_Y } from './world';

/** 수련장: 쓰러지지 않는 허수아비 하나를 세워 두고 DPS를 잰다. 보상·포션 사용은 없다. */
export const TRAINING_PHASE: PhaseDef = {
  id: 'training',
  name: '수련장',
  type: 'normal',
  chapter: 0,
  desc: '',
  hpMul: 1,
  width: 1000,
  platforms: [
    [180, 240, 160],
    [660, 240, 160],
  ],
  theme: 'day',
  waves: [],
  clearReward: { gold: 0, exp: 0, materials: {}, sweepTickets: 0 },
};

/** 이 시간 동안 때리지 않으면 측정이 끝나고, 다음 타격부터 새로 잰다. */
const IDLE_END = 5;
/** 최근 DPS를 내는 구간 */
const RECENT = 3;

interface HitEntry {
  time: number;
  dmg: number;
}

export class TrainingRoom {
  private panel: HTMLDivElement;
  private rows: { [id: string]: HTMLSpanElement } = {};
  private last: HTMLDivElement;
  private state: HTMLDivElement;
  private dummy: Monster | null = null;
  /** 측정 중인지, 측정 시작 시각, 마지막 타격 시각 (전투 시간 기준 초) */
  private measuring = false;
  private start = 0;
  private lastHit = 0;
  private now = 0;
  private total = 0;
  private hits = 0;
  private best = 0;
  private crits = 0;
  private log: HitEntry[] = [];

  constructor(
    private readonly b: BattleScene,
    root: HTMLElement,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'dps-panel';
    const title = document.createElement('div');
    title.className = 'dps-title';
    title.textContent = 'DPS 측정';
    this.panel.appendChild(title);
    this.state = document.createElement('div');
    this.state.className = 'dps-state';
    this.panel.appendChild(this.state);
    const grid = document.createElement('div');
    grid.className = 'dps-grid';
    for (const [id, label] of [
      ['dps', '평균 DPS'],
      ['recent', `최근 ${RECENT}초 DPS`],
      ['total', '총 피해'],
      ['time', '측정 시간'],
      ['hits', '타격 수'],
      ['best', '최대 한 방'],
      ['crit', '치명타 비율'],
    ] as const) {
      const k = document.createElement('span');
      k.className = 'dps-k';
      k.textContent = label;
      const v = document.createElement('span');
      v.className = id === 'dps' ? 'dps-v big' : 'dps-v';
      grid.append(k, v);
      this.rows[id] = v;
    }
    this.panel.appendChild(grid);
    this.last = document.createElement('div');
    this.last.className = 'dps-last';
    this.panel.appendChild(this.last);
    const note = document.createElement('div');
    note.className = 'dps-note';
    note.textContent = `허수아비를 때리면 측정이 시작되고, ${IDLE_END}초 동안 때리지 않으면 끝납니다. 마나와 재사용 시간은 실제 전투와 같습니다.`;
    this.panel.appendChild(note);
    root.appendChild(this.panel);
    this.render();
  }

  /** 허수아비를 세운다 (전투 시작 연출이 끝난 뒤). */
  spawn(): void {
    ensureScarecrow(this.b);
    this.dummy = this.b.spawnMonster('scarecrow', false, this.b.phase.width / 2 + 60);
    // 수련용이라 크게 세우고, 맞는 몸통도 그림만큼 키운다.
    this.dummy.sprite.setScale(1.6);
    this.dummy.zone.setSize(38, 80);
    this.dummy.body.setSize(38, 80, true);
    // 몸통을 키운 만큼 바닥 위로 다시 세운다 (그대로 두면 땅에 박혀 빠진다).
    this.dummy.body.reset(this.dummy.x, FLOOR_Y - 42);
    this.b.announce('허수아비를 때려 DPS를 재 보세요', 2);
  }

  /** 플레이어의 타격이 들어갈 때마다 불린다. */
  record(m: Monster, dmg: number, crit: boolean): void {
    if (m !== this.dummy) return;
    if (!this.measuring) {
      this.measuring = true;
      this.start = this.now;
      this.total = 0;
      this.hits = 0;
      this.best = 0;
      this.crits = 0;
      this.log = [];
    }
    this.lastHit = this.now;
    this.total += dmg;
    this.hits++;
    if (crit) this.crits++;
    this.best = Math.max(this.best, dmg);
    this.log.push({ time: this.now, dmg });
  }

  update(dt: number): void {
    this.now += dt;
    if (this.measuring && this.now - this.lastHit > IDLE_END) {
      this.measuring = false;
      // 마지막 타격까지를 측정 시간으로 친다.
      const span = Math.max(1, this.lastHit - this.start);
      this.last.textContent = `지난 측정 · 평균 DPS ${koNum(Math.round(this.total / span))} · ${span.toFixed(1)}초 · 총 ${koNum(Math.round(this.total))}`;
    }
    this.render();
  }

  private render(): void {
    const r = this.rows;
    const span = this.measuring ? Math.max(1, this.now - this.start) : Math.max(1, this.lastHit - this.start);
    const recentFrom = this.now - RECENT;
    this.log = this.log.filter((e) => e.time >= recentFrom - 0.01);
    const recent = this.measuring ? this.log.reduce((a, e) => a + e.dmg, 0) / Math.min(RECENT, Math.max(1, this.now - this.start)) : 0;
    const has = this.hits > 0;
    this.state.textContent = this.measuring ? '측정 중' : has ? '측정 끝' : '대기 중';
    this.state.className = `dps-state${this.measuring ? ' on' : ''}`;
    r.dps.textContent = has ? koNum(Math.round(this.total / span)) : '-';
    r.recent.textContent = this.measuring ? koNum(Math.round(recent)) : '-';
    r.total.textContent = has ? koNum(Math.round(this.total)) : '-';
    r.time.textContent = has ? `${span.toFixed(1)}초` : '-';
    r.hits.textContent = has ? `${this.hits}` : '-';
    r.best.textContent = has ? koNum(Math.round(this.best)) : '-';
    r.crit.textContent = has ? `${Math.round((this.crits / this.hits) * 100)}%` : '-';
  }

  destroy(): void {
    this.panel.remove();
  }
}
