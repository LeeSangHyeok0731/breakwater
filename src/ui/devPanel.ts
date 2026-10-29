import type { SaveData } from '../core/save';
import { GEAR } from '../data/gear';
import { MATERIALS } from '../data/items';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { PASSIVES } from '../data/passives';
import { PHASES } from '../data/phases';
import { SKILLS } from '../data/skills';
import { MAX_ENHANCE, WEAPONS } from '../data/weapons';
import { dev } from '../game/dev';
import { STAT_POINTS_PER_LEVEL } from '../game/stats';

/** 전투 중에만 쓰는 기능 (BattleScene이 제공) */
export interface DevBattle {
  devKillAll(): void;
  devHeal(): void;
  devClear(): void;
  spawnMonster(kind: MonsterKind, elite: boolean): unknown;
}

export interface DevActions {
  getSave(): SaveData;
  /** 세이브를 저장하고 화면(HUD 등)을 갱신한다 */
  saveChanged(): void;
  battle(): DevBattle | null;
  onClose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** 개발자 모드: ` 키로 연다. 수치 조정, 아이템 지급, 진행 해금, 전투 치트. */
export class DevPanel {
  private wrap: HTMLDivElement;
  private body: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private visible = false;
  private toastTimer = 0;

  constructor(
    root: HTMLElement,
    private readonly actions: DevActions,
  ) {
    this.wrap = el('div', 'dev-panel', root);
    const head = el('div', 'dev-head', this.wrap);
    el('span', 'dev-title', head, '개발자 모드');
    el('span', 'dev-hint', head, '` 키로 열고 닫기');
    const close = el('button', 'village-close dev-close', head, '×');
    close.addEventListener('click', () => this.close());
    this.body = el('div', 'dev-body', this.wrap);
    this.toastEl = el('div', 'dev-toast', this.wrap);
    this.wrap.style.display = 'none';
  }

  get isOpen(): boolean {
    return this.visible;
  }

  toggle(): void {
    if (this.visible) this.close();
    else this.open();
  }

  open(): void {
    this.visible = true;
    this.wrap.style.display = '';
    this.render();
  }

  close(): void {
    if (!this.visible) return;
    this.visible = false;
    this.wrap.style.display = 'none';
    this.actions.onClose();
  }

  private toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1600);
  }

  private section(title: string, note?: string): HTMLDivElement {
    const s = el('div', 'dev-section', this.body);
    const h = el('div', 'dev-section-head', s);
    el('span', 'dev-section-title', h, title);
    if (note) el('span', 'dev-note', h, note);
    return s;
  }

  private button(parent: HTMLElement, label: string, onClick: () => string | void, cls = ''): void {
    const b = el('button', `ui-btn small ${cls}`.trim(), parent, label);
    b.addEventListener('click', () => {
      const msg = onClick();
      if (msg) this.toast(msg);
    });
  }

  /** 세이브를 바꾸는 버튼: 바꾼 뒤 저장하고 다시 그린다. */
  private saveButton(parent: HTMLElement, label: string, change: (s: SaveData) => string): void {
    this.button(parent, label, () => {
      const msg = change(this.actions.getSave());
      this.actions.saveChanged();
      this.render();
      return msg;
    });
  }

  private toggleRow(parent: HTMLElement, label: string, key: 'god' | 'infiniteMp' | 'noCooldown' | 'oneHit'): void {
    const row = el('label', 'dev-toggle', parent);
    const box = el('input', '', row);
    box.type = 'checkbox';
    box.checked = dev[key];
    box.addEventListener('change', () => (dev[key] = box.checked));
    el('span', '', row, label);
  }

  private sliderRow(parent: HTMLElement, label: string, key: 'damageMul' | 'monsterHpMul', min: number, max: number, step: number): void {
    const row = el('div', 'dev-slider', parent);
    el('span', 'dev-slider-label', row, label);
    const input = el('input', 'v-slider', row);
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(dev[key]);
    const val = el('span', 'dev-slider-val', row, `x${dev[key]}`);
    input.addEventListener('input', () => {
      dev[key] = Number(input.value);
      val.textContent = `x${dev[key]}`;
    });
  }

  private render(): void {
    const save = this.actions.getSave();
    const scroll = this.body.scrollTop;
    this.body.replaceChildren();

    // ── 전투 치트 ──
    const c = this.section('전투 치트', '바로 적용');
    this.toggleRow(c, '무적 (피해를 받지 않음)', 'god');
    this.toggleRow(c, '마나 무한', 'infiniteMp');
    this.toggleRow(c, '쿨타임 없음', 'noCooldown');
    this.toggleRow(c, '한 방에 처치', 'oneHit');
    this.sliderRow(c, '주는 피해', 'damageMul', 0.5, 20, 0.5);
    this.sliderRow(c, '몬스터 체력 (새로 나오는 적)', 'monsterHpMul', 0.1, 5, 0.1);

    // ── 전투 중 ──
    const battle = this.actions.battle();
    const bs = this.section('전투 중', battle ? '' : '전투 중에만 사용할 수 있습니다');
    const brow = el('div', 'dev-row', bs);
    if (battle) {
      this.button(brow, '몬스터 모두 처치', () => (battle.devKillAll(), '모두 처치했습니다'));
      this.button(brow, '체력·마나 회복', () => (battle.devHeal(), '회복했습니다'));
      this.button(brow, '페이즈 즉시 클리어', () => (battle.devClear(), '클리어 처리했습니다'), 'primary');
      const srow = el('div', 'dev-row', bs);
      const select = el('select', 'dev-select', srow);
      for (const m of Object.values(MONSTERS)) {
        const o = el('option', '', select, m.name);
        o.value = m.kind;
      }
      const eliteLabel = el('label', 'dev-toggle inline', srow);
      const elite = el('input', '', eliteLabel);
      elite.type = 'checkbox';
      el('span', '', eliteLabel, '엘리트');
      this.button(srow, '소환', () => {
        battle.spawnMonster(select.value as MonsterKind, elite.checked);
        return `${MONSTERS[select.value as MonsterKind].name} 소환`;
      });
    }

    // ── 캐릭터 ──
    const ch = this.section('캐릭터', `Lv ${save.level} · 골드 ${save.gold.toLocaleString('ko-KR')}`);
    const lrow = el('div', 'dev-row', ch);
    el('span', 'dev-slider-label', lrow, '레벨');
    const lv = el('input', 'dev-number', lrow);
    lv.type = 'number';
    lv.min = '1';
    lv.max = '99';
    lv.value = String(save.level);
    this.saveButton(lrow, '적용', (s) => {
      const n = Math.max(1, Math.min(99, Math.floor(Number(lv.value) || 1)));
      const diff = n - s.level;
      // 레벨을 올리면 그만큼 포인트도 준다 (내릴 때는 포인트를 그대로 둔다).
      if (diff > 0) {
        s.statPoints += diff * STAT_POINTS_PER_LEVEL;
        s.skillPoints += diff;
      }
      s.level = n;
      s.exp = 0;
      return `레벨 ${n}`;
    });
    const grow = el('div', 'dev-row', ch);
    this.saveButton(grow, '골드 +1,000', (s) => ((s.gold += 1000), '골드 +1,000'));
    this.saveButton(grow, '골드 +100,000', (s) => ((s.gold += 100000), '골드 +100,000'));
    this.saveButton(grow, '스탯 포인트 +10', (s) => ((s.statPoints += 10), '스탯 포인트 +10'));
    this.saveButton(grow, '스킬 포인트 +5', (s) => ((s.skillPoints += 5), '스킬 포인트 +5'));
    const krow = el('div', 'dev-row', ch);
    this.saveButton(krow, '모든 스킬 배우기', (s) => {
      s.learnedSkills = SKILLS.map((k) => k.id);
      return '모든 스킬을 배웠습니다';
    });
    this.saveButton(krow, '패시브 최대', (s) => {
      for (const p of PASSIVES) s.passives[p.id] = p.maxRank;
      return '모든 패시브 최대 단계';
    });

    // ── 아이템 ──
    const it = this.section('아이템', '장비·스탯 변경은 다음 전투부터 적용');
    const irow = el('div', 'dev-row', it);
    this.saveButton(irow, '모든 무기 지급', (s) => {
      let next = s.weapons.reduce((n, w) => Math.max(n, Number(w.uid.slice(1)) || 0), 0);
      let added = 0;
      for (const def of Object.values(WEAPONS)) {
        if (s.weapons.some((w) => w.defId === def.id)) continue;
        s.weapons.push({ uid: `w${++next}`, defId: def.id, enhance: 0 });
        added++;
      }
      return `무기 ${added}개 지급`;
    });
    this.saveButton(irow, '모든 장비 지급', (s) => {
      s.gear.owned = Object.keys(GEAR);
      return '방어구·장신구를 모두 지급했습니다';
    });
    this.saveButton(irow, '모든 무기 최대 강화', (s) => {
      for (const w of s.weapons) w.enhance = MAX_ENHANCE;
      return `모든 무기 +${MAX_ENHANCE}`;
    });
    const mrow = el('div', 'dev-row', it);
    this.saveButton(mrow, '재료 각 +20', (s) => {
      for (const id of Object.keys(MATERIALS)) s.materials[id] = (s.materials[id] ?? 0) + 20;
      return '모든 재료 +20';
    });
    this.saveButton(mrow, '포션 각 +10', (s) => {
      s.potions.hp += 10;
      s.potions.mp += 10;
      return '포션 +10';
    });
    this.saveButton(mrow, '소탕권 +10', (s) => ((s.sweepTickets += 10), '소탕권 +10'));

    // ── 진행 ──
    const pr = this.section('진행');
    const prow = el('div', 'dev-row', pr);
    this.saveButton(prow, '모든 페이즈 열기', (s) => {
      s.cleared = PHASES.map((p) => p.id);
      return '모든 페이즈를 열었습니다';
    });

    this.body.scrollTop = scroll;
  }
}
