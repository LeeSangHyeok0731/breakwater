import Phaser from 'phaser';
import type { PhaseDef } from '../data/phases';
import { SKILL_BY_ID } from '../data/skills';
import '../ui/training.css';
import { koNum } from '../ui/format';
import type { BattleScene } from './battleScene';
import type { Monster } from './monster2d';
import { ensureScarecrow } from './scarecrow';
import { FLOOR_Y } from './world';

/** 수련장: 쓰러지지 않는 허수아비 하나를 세워 두고 DPS와 스킬별 피해를 잰다. 보상·포션 사용은 없다. */
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

/** 이 시간 동안 때리지도 스킬을 쓰지도 않으면 측정이 끝나고, 다음 타격부터 새로 잰다. */
const IDLE_END = 5;
/** 최근 DPS를 내는 구간 */
const RECENT = 3;

interface HitEntry {
  time: number;
  dmg: number;
}

/** 출처 하나(스킬·평타·특수 공격)의 집계 */
interface SourceStat {
  casts: number;
  hits: number;
  total: number;
  max: number;
  min: number;
}

function sourceName(src: string): string {
  if (src === 'basic') return '기본 공격';
  if (src === 'special') return '특수 공격';
  return SKILL_BY_ID[src]?.name ?? src;
}

type Cb = (...args: unknown[]) => void;

/**
 * 나중에 들어가는 피해(시간차 타격·트윈이 끝날 때의 폭발)도 시전한 스킬로 치도록,
 * 수련장에서만 이 씬의 타이머·트윈 콜백을 만들 때의 출처로 감싼다.
 */
function trackSources(b: BattleScene): () => void {
  const wrap = (cb: Cb | undefined): Cb | undefined => {
    if (typeof cb !== 'function') return cb;
    const src = b.src;
    return function (this: unknown, ...args: unknown[]) {
      return b.withSource(src, () => cb.apply(this, args));
    };
  };
  const time = b.time;
  const delayed = time.delayedCall.bind(time);
  time.delayedCall = ((delay: number, cb: Cb, args?: unknown[], scope?: unknown) => delayed(delay, wrap(cb)!, args as never, scope)) as typeof time.delayedCall;
  const addEvent = time.addEvent.bind(time);
  time.addEvent = ((config: Phaser.Types.Time.TimerEventConfig | Phaser.Time.TimerEvent) => {
    if (!(config instanceof Phaser.Time.TimerEvent) && config.callback) config.callback = wrap(config.callback as Cb) as never;
    return addEvent(config as never);
  }) as typeof time.addEvent;
  const keys = ['onComplete', 'onUpdate', 'onYoyo', 'onRepeat', 'onStart'] as const;
  const wrapTween = <T extends object>(config: T): T => {
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const c = config as { [k: string]: unknown };
      for (const k of keys) if (typeof c[k] === 'function') c[k] = wrap(c[k] as Cb);
    }
    return config;
  };
  const tweens = b.tweens;
  const add = tweens.add.bind(tweens);
  tweens.add = ((config: object) => add(wrapTween(config) as never)) as typeof tweens.add;
  const counter = tweens.addCounter.bind(tweens);
  tweens.addCounter = ((config: object) => counter(wrapTween(config) as never)) as typeof tweens.addCounter;
  // 씬의 타이머·트윈은 다음 전투에도 그대로 쓰이므로, 수련장을 나갈 때 원래대로 돌린다.
  return () => {
    time.delayedCall = delayed;
    time.addEvent = addEvent;
    tweens.add = add;
    tweens.addCounter = counter;
  };
}

export class TrainingRoom {
  private panel: HTMLDivElement;
  private rows: { [id: string]: HTMLSpanElement } = {};
  private last: HTMLDivElement;
  private state: HTMLDivElement;
  private table: HTMLTableSectionElement;
  private dummy: Monster | null = null;
  /** 측정 중인지, 측정 시작 시각, 마지막 타격·활동 시각 (전투 시간 기준 초) */
  private measuring = false;
  private start = 0;
  private lastHit = 0;
  private lastActive = 0;
  private now = 0;
  private total = 0;
  private hits = 0;
  private best = 0;
  private crits = 0;
  private log: HitEntry[] = [];
  private sources = new Map<string, SourceStat>();
  /** 표는 초당 4번만 다시 그린다. */
  private tableTimer = 0;
  private untrack: () => void;

  constructor(
    private readonly b: BattleScene,
    root: HTMLElement,
  ) {
    this.untrack = trackSources(b);
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

    // 스킬별 표
    const t = document.createElement('table');
    t.className = 'dps-table';
    const head = t.createTHead().insertRow();
    for (const h of ['스킬', '발동', '타격', '총 피해', '비중', '최대', '최소', '평균']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    this.table = t.createTBody();
    this.panel.appendChild(t);

    this.last = document.createElement('div');
    this.last.className = 'dps-last';
    this.panel.appendChild(this.last);
    const note = document.createElement('div');
    note.className = 'dps-note';
    note.textContent = `허수아비를 때리거나 스킬을 쓰면 측정이 시작되고, ${IDLE_END}초 동안 아무것도 하지 않으면 끝납니다. 마나와 재사용 시간은 실제 전투와 같습니다. 발동은 스킬을 쓴 횟수이고, 최대·최소·평균은 한 대 기준입니다.`;
    this.panel.appendChild(note);
    root.appendChild(this.panel);
    this.render(true);
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

  private begin(): void {
    this.measuring = true;
    this.start = this.now;
    this.lastHit = this.now;
    this.total = 0;
    this.hits = 0;
    this.best = 0;
    this.crits = 0;
    this.log = [];
    this.sources.clear();
  }

  private stat(src: string): SourceStat {
    let s = this.sources.get(src);
    if (!s) {
      s = { casts: 0, hits: 0, total: 0, max: 0, min: Infinity };
      this.sources.set(src, s);
    }
    return s;
  }

  /** 스킬을 썼다. 측정 중이 아니면 이때부터 잰다. */
  cast(id: string): void {
    if (!this.measuring) this.begin();
    this.lastActive = this.now;
    this.stat(id).casts++;
  }

  /** 플레이어의 타격이 들어갈 때마다 불린다. */
  record(m: Monster, dmg: number, crit: boolean, src: string): void {
    if (m !== this.dummy) return;
    if (!this.measuring) this.begin();
    this.lastHit = this.now;
    this.lastActive = this.now;
    this.total += dmg;
    this.hits++;
    if (crit) this.crits++;
    this.best = Math.max(this.best, dmg);
    this.log.push({ time: this.now, dmg });
    const s = this.stat(src);
    s.hits++;
    s.total += dmg;
    s.max = Math.max(s.max, dmg);
    s.min = Math.min(s.min, dmg);
  }

  update(dt: number): void {
    this.now += dt;
    if (this.measuring && this.now - this.lastActive > IDLE_END) {
      this.measuring = false;
      // 마지막 타격까지를 측정 시간으로 친다.
      const span = Math.max(1, this.lastHit - this.start);
      this.last.textContent = `지난 측정 · 평균 DPS ${koNum(Math.round(this.total / span))} · ${span.toFixed(1)}초 · 총 ${koNum(Math.round(this.total))}`;
      this.render(true);
      return;
    }
    this.tableTimer -= dt;
    const redraw = this.tableTimer <= 0;
    if (redraw) this.tableTimer = 0.25;
    this.render(redraw);
  }

  private render(table: boolean): void {
    const r = this.rows;
    const span = this.measuring ? Math.max(1, this.now - this.start) : Math.max(1, this.lastHit - this.start);
    this.log = this.log.filter((e) => e.time >= this.now - RECENT - 0.01);
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
    if (table) this.renderTable();
  }

  /** 스킬별 표: 총 피해가 큰 순서. 평타·특수 공격은 발동 대신 '-'. */
  private renderTable(): void {
    const body = this.table;
    body.replaceChildren();
    const list = [...this.sources.entries()].sort((a, c) => c[1].total - a[1].total);
    if (!list.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 8;
      cell.className = 'dps-empty';
      cell.textContent = '아직 기록이 없습니다';
      return;
    }
    for (const [src, s] of list) {
      const row = body.insertRow();
      const share = this.total > 0 ? (s.total / this.total) * 100 : 0;
      const skill = src !== 'basic' && src !== 'special';
      const cells = [
        sourceName(src),
        skill ? `${s.casts}` : '-',
        `${s.hits}`,
        koNum(Math.round(s.total)),
        `${share.toFixed(1)}%`,
        s.hits ? koNum(Math.round(s.max)) : '-',
        s.hits ? koNum(Math.round(s.min)) : '-',
        s.hits ? koNum(Math.round(s.total / s.hits)) : '-',
      ];
      cells.forEach((text, i) => {
        const c = row.insertCell();
        c.textContent = text;
        if (i === 0) c.className = 'dps-name';
        if (i === 4) {
          c.className = 'dps-share';
          c.style.setProperty('--share', `${Math.min(100, share)}%`);
        }
      });
    }
  }

  destroy(): void {
    this.untrack();
    this.panel.remove();
  }
}
