import { sfx } from '../core/audio';
import type { Keymap } from '../core/input';
import type { SaveData } from '../core/save';
import { MONSTER_NOTE } from '../data/bestiary';
import { MATERIALS } from '../data/items';
import { ELITE_MOD, MONSTERS, type MonsterKind } from '../data/monsters';
import { CHAPTER_BOOK, PHASES, SWEEP_RATE, type PhaseDef, type SpawnGroup } from '../data/phases';
import { combatPower, powerVerdict, recommendedPower } from '../game/power';
import { button, el } from './dom';
import { koNum } from './format';
import './storyBook.css';

export interface StoryBookHost {
  getSave(): SaveData;
  monsterArt(kind: MonsterKind): HTMLCanvasElement | null;
  startPhase(id: string): void;
  sweep(phase: PhaseDef): void;
  redraw(): void;
}

const CHAPTERS = [...new Set(PHASES.map((p) => p.chapter))];

const phasesOf = (chapter: number): PhaseDef[] => PHASES.filter((p) => p.chapter === chapter);
const phaseOpen = (save: SaveData, p: PhaseDef): boolean => !p.requires || save.cleared.includes(p.requires);
const bookOpen = (save: SaveData, chapter: number): boolean => phaseOpen(save, phasesOf(chapter)[0]);

interface Entry {
  kind: MonsterKind;
  elite: boolean;
  /** 웨이브에 나오는 총 수. 특별 스테이지처럼 계속 나오면 null */
  count: number | null;
}

/** 페이즈에 나오는 몬스터. 강한 몬스터가 먼저 온다. */
function entriesOf(p: PhaseDef): Entry[] {
  const map = new Map<string, Entry>();
  const add = (kind: MonsterKind, elite: boolean, count: number | null): void => {
    const key = `${kind}:${elite}`;
    const e = map.get(key);
    if (e) e.count = e.count === null || count === null ? null : e.count + count;
    else map.set(key, { kind, elite, count });
  };
  for (const wave of p.waves) for (const g of wave) add(g.kind, !!g.elite, g.count);
  for (const s of p.spawnPool ?? []) add(s.kind, !!s.elite, null);
  const rank = (e: Entry): number => {
    const d = MONSTERS[e.kind];
    return d.boss ? 3 : d.miniboss ? 2 : e.elite ? 1 : 0;
  };
  return [...map.values()].sort((a, b) => rank(b) - rank(a));
}

/** 책장과 펼친 이야기책. 창을 다시 그려도 고른 책과 페이지를 기억한다. */
export class StoryBooks {
  private chapter: number | null = null;
  private phaseId = '';
  /** 책장에서 고른 책 (키보드) */
  private cursor = 1;
  private anim: '' | 'opening' | 'turn-next' | 'turn-prev' = '';
  private art = new Map<MonsterKind, string>();

  constructor(private readonly host: StoryBookHost) {}

  /** 창을 새로 열 때: 책장에서, 지금 진행 중인 책을 고른 채로 시작한다. */
  reset(save: SaveData): void {
    this.chapter = null;
    this.cursor = CHAPTERS.filter((c) => bookOpen(save, c)).pop() ?? CHAPTERS[0];
  }

  render(parent: HTMLElement, save: SaveData): void {
    if (this.chapter === null) this.renderShelf(parent, save);
    else this.renderBook(parent, save, this.chapter);
    this.anim = '';
  }

  /** 처리한 키면 true */
  handleKey(code: string, km: Keymap): boolean {
    const save = this.host.getSave();
    if (this.chapter === null) {
      const i = CHAPTERS.indexOf(this.cursor);
      if (code === km.left || code === km.right) {
        const next = CHAPTERS[i + (code === km.left ? -1 : 1)];
        if (next !== undefined) this.cursor = next;
        sfx.play('dodge', 0.3);
      } else if (code === 'Enter') {
        if (bookOpen(save, this.cursor)) this.openBook(save, this.cursor);
      } else return false;
    } else {
      if (code === 'Escape') {
        this.closeBook();
      } else if (code === km.left || code === km.right) {
        const list = phasesOf(this.chapter);
        const i = list.findIndex((p) => p.id === this.phaseId);
        const next = list[i + (code === km.left ? -1 : 1)];
        if (next) this.turnTo(next.id, code === km.left ? 'turn-prev' : 'turn-next');
      } else if (code === 'Enter') {
        const p = PHASES.find((q) => q.id === this.phaseId);
        if (p && phaseOpen(save, p)) this.host.startPhase(p.id);
        return true;
      } else return false;
    }
    this.host.redraw();
    return true;
  }

  private openBook(save: SaveData, chapter: number): void {
    const list = phasesOf(chapter);
    // 아직 깨지 않은 첫 장을 펼친다.
    const target = list.find((p) => phaseOpen(save, p) && !save.cleared.includes(p.id)) ?? list[0];
    this.chapter = chapter;
    this.cursor = chapter;
    this.phaseId = target.id;
    this.anim = 'opening';
    sfx.play('dodge', 0.8);
  }

  private closeBook(): void {
    this.chapter = null;
    sfx.play('dodge', 0.4);
  }

  private turnTo(id: string, anim: 'turn-next' | 'turn-prev'): void {
    this.phaseId = id;
    this.anim = anim;
    sfx.play('dodge', 0.4);
  }

  private artUrl(kind: MonsterKind): string {
    let url = this.art.get(kind);
    if (url === undefined) {
      url = this.host.monsterArt(kind)?.toDataURL() ?? '';
      // 게임을 불러오는 중에는 비워 둔 채 다음에 다시 그린다.
      if (url) this.art.set(kind, url);
    }
    return url;
  }

  private portrait(parent: HTMLElement, kind: MonsterKind, cls: string): HTMLImageElement {
    const img = el('img', cls, parent);
    img.src = this.artUrl(kind);
    img.alt = '';
    img.draggable = false;
    return img;
  }

  // ───────── 책장 ─────────

  private renderShelf(parent: HTMLElement, save: SaveData): void {
    const root = el('div', 'sb-shelf', parent);
    const row = el('div', 'sb-shelf-row', root);
    for (const ch of CHAPTERS) {
      const info = CHAPTER_BOOK[ch];
      const list = phasesOf(ch);
      const open = bookOpen(save, ch);
      const done = list.filter((p) => save.cleared.includes(p.id)).length;
      const book = el('button', `sb-cover${open ? '' : ' locked'}${this.cursor === ch ? ' cursor' : ''}${done === list.length ? ' complete' : ''}`, row);
      book.style.setProperty('--book', info.color);
      el('span', 'sb-cover-no', book, `제 ${ch} 권`);
      el('span', 'sb-cover-title', book, info.title);
      if (open) {
        this.portrait(el('span', 'sb-cover-emblem', book), info.boss, 'sb-cover-art');
        el('span', 'sb-cover-tag', book, info.tagline);
        el('span', 'sb-cover-progress', book, done === list.length ? '완독' : `${done} / ${list.length}장`);
      } else {
        el('span', 'sb-cover-lock', book, '봉인');
        const req = PHASES.find((q) => q.id === list[0].requires);
        el('span', 'sb-cover-tag', book, `${list[0].requires} ${req?.name ?? ''}을(를) 클리어하면 열립니다.`);
      }
      book.disabled = !open;
      book.addEventListener('click', () => {
        this.openBook(save, ch);
        this.host.redraw();
      });
    }
    el('div', 'sb-plank', root);
    el('p', 'sb-hint', root, '책을 골라 펼치세요.  ← → 고르기  ·  Enter 펼치기');
  }

  // ───────── 펼친 책 ─────────

  private renderBook(parent: HTMLElement, save: SaveData, chapter: number): void {
    const info = CHAPTER_BOOK[chapter];
    const list = phasesOf(chapter);
    const phase = list.find((p) => p.id === this.phaseId) ?? list[0];
    const open = phaseOpen(save, phase);

    const book = el('div', `sb-book ${this.anim}`.trim(), parent);
    book.style.setProperty('--book', info.color);
    const spread = el('div', 'sb-spread', book);
    const left = el('div', 'sb-page left', spread);
    el('div', 'sb-gutter', spread);
    const right = el('div', 'sb-page right', spread);
    this.renderMonsters(left, phase, open);
    this.renderStory(right, save, phase, open, chapter);
    if (this.anim === 'opening') el('div', 'sb-flap', spread);

    // 페이즈 책갈피
    const marks = el('div', 'sb-marks', book);
    for (const p of list) {
      const cleared = save.cleared.includes(p.id);
      const m = el('button', `sb-mark${p.id === phase.id ? ' on' : ''}${phaseOpen(save, p) ? '' : ' locked'}${cleared ? ' cleared' : ''}${p.type === 'boss' ? ' boss' : ''}`, marks, p.id);
      m.addEventListener('click', () => {
        if (p.id === this.phaseId) return;
        this.turnTo(p.id, list.indexOf(p) < list.indexOf(phase) ? 'turn-prev' : 'turn-next');
        this.host.redraw();
      });
    }

    const back = el('button', 'sb-back', book, '← 책장으로');
    back.addEventListener('click', () => {
      this.closeBook();
      this.host.redraw();
    });
  }

  /** 왼쪽 면: 등장 몬스터 */
  private renderMonsters(page: HTMLElement, p: PhaseDef, open: boolean): void {
    el('h3', 'sb-heading', page, '등장 몬스터');
    if (!open) {
      el('p', 'sb-sealed', page, '아직 읽지 못한 장입니다.');
      return;
    }
    const list = el('div', 'sb-mon-list', page);
    for (const e of entriesOf(p)) {
      const def = MONSTERS[e.kind];
      const row = el('div', `sb-mon${def.boss ? ' boss' : def.miniboss ? ' mini' : e.elite ? ' elite' : ''}`, list);
      this.portrait(el('div', 'sb-mon-art', row), e.kind, e.elite ? 'elite' : '');
      const body = el('div', 'sb-mon-body', row);
      const head = el('div', 'sb-mon-head', body);
      el('span', 'sb-mon-name', head, def.name);
      if (def.boss) el('span', 'sb-tag boss', head, '보스');
      else if (def.miniboss) el('span', 'sb-tag mini', head, '미니보스');
      if (e.elite) el('span', 'sb-tag elite', head, '정예');
      if (def.flying) el('span', 'sb-tag', head, '비행');
      el('span', 'sb-mon-count', head, e.count === null ? '계속 등장' : `×${e.count}`);

      const hp = Math.round(def.hp * p.hpMul * (e.elite ? ELITE_MOD.hp : 1));
      const dmg = Math.round(def.damage * (p.dmgMul ?? 1) * (e.elite ? ELITE_MOD.damage : 1));
      const stats = el('div', 'sb-mon-stats', body);
      el('span', '', stats, `체력 ${koNum(hp)}`);
      el('span', '', stats, `공격력 ${koNum(dmg)}`);
      const note = MONSTER_NOTE[e.kind];
      if (note) el('p', 'sb-mon-note', body, note);
      if (def.drops.length) el('p', 'sb-mon-drop', body, `전리품: ${def.drops.map((d) => MATERIALS[d.id]?.name ?? d.id).join(', ')}`);
    }
  }

  /** 오른쪽 면: 이야기, 웨이브, 보상, 출정 */
  private renderStory(page: HTMLElement, save: SaveData, p: PhaseDef, open: boolean, chapter: number): void {
    const head = el('div', 'sb-story-head', page);
    el('span', 'sb-story-id', head, `제 ${chapter} 권 · ${p.id}`);
    el('h2', 'sb-story-title', head, p.name);
    if (!open) {
      const req = PHASES.find((q) => q.id === p.requires);
      el('p', 'sb-sealed', page, `${p.requires} ${req?.name ?? ''}을(를) 클리어하면 이어서 읽을 수 있습니다.`);
      return;
    }
    el('p', 'sb-story-desc', page, p.desc);

    const body = el('div', 'sb-waves', page);
    if (p.mission) {
      const row = el('div', 'sb-wave mission', body);
      el('span', 'sb-wave-no', row, p.mission.kind === 'survive' ? `${p.mission.seconds}초 생존` : `${p.mission.target}마리 처치`);
      this.chips(row, (p.spawnPool ?? []).map((s) => ({ kind: s.kind, elite: s.elite, count: 0 })));
    } else {
      p.waves.forEach((wave, i) => {
        const row = el('div', 'sb-wave', body);
        el('span', 'sb-wave-no', row, p.type === 'boss' ? '결전' : `제 ${i + 1} 웨이브`);
        this.chips(row, wave);
      });
    }

    const foot = el('div', 'sb-foot', page);
    const need = recommendedPower(p.id);
    const mine = combatPower(save);
    const v = powerVerdict(mine, need);
    const power = el('div', 'sb-power', foot);
    el('span', '', power, `권장 전투력 ${koNum(need)}`);
    el('span', `v-power-verdict ${v.cls}`, power, v.label);
    el('span', 'sb-muted', power, `내 전투력 ${koNum(mine)}`);

    const r = p.clearReward;
    const rewards = [`골드 ${koNum(r.gold)}`, `경험치 ${koNum(r.exp)}`, ...Object.entries(r.materials).map(([id, n]) => `${MATERIALS[id]?.name ?? id} ×${n}`)];
    if (r.sweepTickets > 0) rewards.push(`소탕권 ×${r.sweepTickets}`);
    el('p', 'sb-reward', foot, `보상: ${rewards.join(' · ')}`);

    const actions = el('div', 'sb-actions', foot);
    button(actions, '출정', 'primary', true, () => this.host.startPhase(p.id));
    if (save.cleared.includes(p.id)) {
      const b = button(actions, `소탕 (보유 ${save.sweepTickets})`, '', save.sweepTickets >= 1, () => this.host.sweep(p));
      b.title = `소탕권 1장으로 즉시 완료하고 클리어 보상의 ${Math.round(SWEEP_RATE * 100)}%를 받습니다. (소탕권 보상 제외)`;
    }
  }

  private chips(parent: HTMLElement, groups: SpawnGroup[]): void {
    const wrap = el('div', 'sb-chips', parent);
    for (const g of groups) {
      const chip = el('span', `sb-chip${g.elite ? ' elite' : ''}`, wrap);
      chip.title = `${g.elite ? '정예 ' : ''}${MONSTERS[g.kind].name}`;
      this.portrait(chip, g.kind, '');
      if (g.count > 0) el('span', 'sb-chip-n', chip, `×${g.count}`);
    }
  }
}
