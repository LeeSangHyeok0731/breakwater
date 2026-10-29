import { exportSave, importSave, type SaveData } from '../core/save';
import { DEFAULT_KEYMAP, keyLabel, SLOT_ACTIONS, type Action } from '../core/input';
import { addExp, derive, DEX_SPEED_CAP, enhanceMultiplier, expToNext, resetCost, totalStats, type Stats } from '../game/stats';
import { PHASES, SWEEP_RATE, SWEEP_TICKET_PRICE, type PhaseDef } from '../data/phases';
import { skillsFor, STARTER_SKILLS } from '../data/skills';
import { enhanceCost, GRADES, MAX_ENHANCE, WEAPON_TYPE_NAME, WEAPONS, type WeaponDef } from '../data/weapons';
import { MATERIALS } from '../data/items';
import { sfx } from '../core/audio';
import { PASSIVES, type PassiveDef } from '../data/passives';
import { GEAR, GEAR_SLOT_NAME, GEAR_SLOTS, gearBonus, gearStatsText, POTIONS, type GearDef } from '../data/gear';

export interface VillageCallbacks {
  onStartPhase(phaseId: string): void;
  /** 호출한 쪽이 세이브를 저장한다. 변경할 때마다 호출한다. */
  onSaveChanged(): void;
  /** 호출한 쪽이 자신의 세이브 객체를 이것으로 교체한다. */
  onImport(save: SaveData): void;
  /** 호출한 쪽이 세이브를 newSave() 로 교체한다. */
  onReset(): void;
  /** 창을 닫았다 (닫기 버튼, Esc, 상호작용 키) */
  onClose(): void;
}

export type Tab = 'phase' | 'char' | 'equip' | 'skill' | 'enhance' | 'exchange' | 'shop' | 'settings';
type ConfirmKey = 'statReset' | 'skillReset' | 'fullReset';
type StatKey = keyof Stats;

const TABS: { id: Tab; label: string }[] = [
  { id: 'phase', label: '출정' },
  { id: 'char', label: '캐릭터' },
  { id: 'equip', label: '장비' },
  { id: 'skill', label: '스킬' },
  { id: 'enhance', label: '강화' },
  { id: 'exchange', label: '재료 교환' },
  { id: 'shop', label: '상점' },
  { id: 'settings', label: '설정' },
];

const STAT_INFO: { key: StatKey; name: string; desc: string }[] = [
  { key: 'str', name: '힘', desc: '근접 무기(도·검) 피해 증가. 활 피해에 30% 반영.' },
  { key: 'dex', name: '민첩', desc: '활 피해 증가(70% 반영). 이동속도 증가(상한 있음).' },
  { key: 'int', name: '마력', desc: '최대 마나와 마나 회복 증가. 마법(스태프) 피해 증가.' },
  { key: 'hp', name: 'HP', desc: '최대 체력 증가 (1당 +10).' },
];

const ACTION_LABELS: Record<Action, string> = {
  left: '왼쪽',
  right: '오른쪽',
  up: '위',
  down: '아래 (앉기 · ↓+점프로 내려가기)',
  jump: '점프',
  attack: '기본 공격',
  special: '강화 공격 (누르고 있기)',
  dodge: '구르기',
  guard: '가드 (근접)',
  swap: '무기 교체',
  slot1: '스킬 슬롯 1',
  slot2: '스킬 슬롯 2',
  slot3: '스킬 슬롯 3',
  slot4: '스킬 슬롯 4',
  slot5: '스킬 슬롯 5',
  slot6: '스킬 슬롯 6',
  slot7: '스킬 슬롯 7',
  slot8: '스킬 슬롯 8',
  item1: '체력 포션',
  item2: '마나 포션',
  interact: '대화 (마을)',
  menu: '메뉴 · 일시정지',
};

const CONFIRM_TIMEOUT = 4000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function button(parent: HTMLElement, text: string, cls: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
  const b = el('button', `ui-btn ${cls}`.trim(), parent, text);
  b.disabled = !enabled;
  b.addEventListener('click', onClick);
  return b;
}

function fmt(n: number): string {
  return Math.floor(n).toLocaleString('ko-KR');
}

function phaseKindText(p: PhaseDef): string {
  if (p.mission?.kind === 'survive') return `${p.mission.seconds}초 생존`;
  if (p.mission?.kind === 'kills') return `${p.mission.target}마리 처치`;
  return p.type === 'boss' ? '보스전' : `웨이브 ${p.waves.length}개`;
}

function materialName(id: string): string {
  return MATERIALS[id]?.name ?? id;
}

/** 마을 화면. 3D 배경 위에 패널로 표시된다. 화면 전체를 매번 다시 그려도 될 만큼 가볍다. */
export class VillageUI {
  private wrap: HTMLDivElement;
  private headerEl: HTMLDivElement;
  private tabBar: HTMLDivElement;
  private body: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private fileInput: HTMLInputElement;

  private tab: Tab = 'phase';
  /** 지금 창에서 보여 줄 탭 (마을의 상호작용 대상마다 다르다) */
  private allowed: Tab[] = TABS.map((t) => t.id);
  private title = '파도막이';
  private visible = false;
  private onKey = (e: KeyboardEvent): void => this.handleKey(e);
  private confirming: ConfirmKey | null = null;
  private confirmTimer = 0;
  private toastTimer = 0;
  private importError = '';
  /** 키 변경 대기 중인 동작 */
  private rebinding: Action | null = null;
  private onRebindKey = (e: KeyboardEvent): void => this.handleRebindKey(e);

  constructor(
    root: HTMLElement,
    private getSave: () => SaveData,
    private cb: VillageCallbacks,
  ) {
    this.wrap = el('div', 'village', root);
    const panel = el('div', 'village-panel', this.wrap);
    const close = el('button', 'village-close', panel, '×');
    close.title = '닫기';
    close.addEventListener('click', () => this.close());
    this.headerEl = el('div', 'village-header', panel);
    this.tabBar = el('div', 'village-tabs', panel);
    this.body = el('div', 'village-body', panel);
    this.toastEl = el('div', 'village-toast', this.wrap);

    this.fileInput = el('input', '', this.wrap);
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json,application/json';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => void this.handleImport());

    for (const t of TABS) {
      const b = el('button', 'village-tab', this.tabBar, t.label);
      b.dataset.tab = t.id;
      b.addEventListener('click', () => {
        if (this.tab === t.id) return;
        this.tab = t.id;
        this.clearConfirm();
        this.stopRebind();
        this.importError = '';
        this.refresh();
        this.body.scrollTop = 0;
      });
    }
    this.hide();
  }

  get isOpen(): boolean {
    return this.visible;
  }

  /** 마을의 상호작용 대상이 여는 창. 주어진 탭만 보여 준다. */
  open(tabs: Tab[], title: string): void {
    this.allowed = tabs;
    this.tab = tabs[0];
    this.title = title;
    this.importError = '';
    this.show();
    this.body.scrollTop = 0;
  }

  close(): void {
    if (!this.visible) return;
    this.hide();
    this.cb.onClose();
  }

  show(): void {
    this.wrap.style.display = '';
    this.visible = true;
    window.removeEventListener('keydown', this.onKey);
    window.addEventListener('keydown', this.onKey);
    this.refresh();
  }

  hide(): void {
    this.wrap.style.display = 'none';
    this.visible = false;
    window.removeEventListener('keydown', this.onKey);
    this.clearConfirm();
    this.stopRebind();
  }

  /** Esc나 상호작용 키로 창을 닫는다 (키 변경 중에는 무시). */
  private handleKey(e: KeyboardEvent): void {
    if (!this.visible || this.rebinding || e.repeat) return;
    if (e.code === 'Escape' || e.code === this.getSave().keymap.interact) {
      e.preventDefault();
      this.close();
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.stopRebind();
    window.clearTimeout(this.confirmTimer);
    window.clearTimeout(this.toastTimer);
    this.wrap.remove();
  }

  refresh(): void {
    const save = this.getSave();
    this.renderHeader(save);
    for (const b of Array.from(this.tabBar.children) as HTMLElement[]) {
      b.classList.toggle('active', b.dataset.tab === this.tab);
      b.style.display = this.allowed.includes(b.dataset.tab as Tab) ? '' : 'none';
    }
    this.tabBar.style.display = this.allowed.length > 1 ? '' : 'none';
    const scroll = this.body.scrollTop;
    this.body.replaceChildren();
    switch (this.tab) {
      case 'phase':
        this.renderPhases(save);
        break;
      case 'char':
        this.renderChar(save);
        break;
      case 'equip':
        this.renderEquip(save);
        break;
      case 'skill':
        this.renderSkills(save);
        break;
      case 'enhance':
        this.renderEnhance(save);
        break;
      case 'shop':
        this.renderShop(save);
        break;
      case 'exchange':
        this.renderExchange(save);
        break;
      case 'settings':
        this.renderSettings(save);
        break;
    }
    this.body.scrollTop = scroll;
  }

  // ---- 공통 ----

  private changed(): void {
    this.clearConfirm();
    this.cb.onSaveChanged();
    this.refresh();
  }

  private toast(text: string, kind: 'ok' | 'warn' = 'ok'): void {
    this.toastEl.textContent = text;
    this.toastEl.className = `village-toast show ${kind}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.className = 'village-toast';
    }, 2600);
  }

  /** 첫 클릭은 확인 상태로 바꾸고, 두 번째 클릭에 true 를 돌려준다. */
  private confirm(key: ConfirmKey): boolean {
    if (this.confirming === key) {
      this.clearConfirm();
      return true;
    }
    this.confirming = key;
    window.clearTimeout(this.confirmTimer);
    this.confirmTimer = window.setTimeout(() => {
      this.confirming = null;
      this.refresh();
    }, CONFIRM_TIMEOUT);
    this.refresh();
    return false;
  }

  private clearConfirm(): void {
    this.confirming = null;
    window.clearTimeout(this.confirmTimer);
  }

  private section(title: string, note?: string): HTMLDivElement {
    const s = el('div', 'v-section', this.body);
    const h = el('div', 'v-section-head', s);
    el('h3', 'v-section-title', h, title);
    if (note) el('span', 'v-muted', h, note);
    return s;
  }

  private renderHeader(save: SaveData): void {
    const h = this.headerEl;
    h.replaceChildren();
    const top = el('div', 'vh-top', h);
    el('h1', 'vh-title', top, this.title);
    const lv = el('div', 'vh-level', top);
    el('span', 'vh-level-label', lv, 'Lv');
    el('span', 'vh-level-num', lv, String(save.level));

    const need = expToNext(save.level);
    const exp = el('div', 'vh-exp', h);
    const bar = el('div', 'vh-exp-bar', exp);
    el('div', 'vh-exp-fill', bar).style.width = `${Math.min(100, (save.exp / need) * 100).toFixed(1)}%`;
    el('span', 'vh-exp-text', exp, `경험치 ${fmt(save.exp)} / ${fmt(need)}`);

    const chips = el('div', 'vh-chips', h);
    const chip = (label: string, value: string, cls = ''): void => {
      const c = el('div', `vh-chip ${cls}`.trim(), chips);
      el('span', 'vh-chip-label', c, label);
      el('span', 'vh-chip-val', c, value);
    };
    chip('골드', fmt(save.gold), 'gold');
    chip('소탕권', String(save.sweepTickets));
    chip('스탯 포인트', String(save.statPoints), save.statPoints > 0 ? 'hot' : '');
    chip('스킬 포인트', String(save.skillPoints), save.skillPoints > 0 ? 'hot' : '');
  }

  // ---- 출정 ----

  private renderPhases(save: SaveData): void {
    const s = this.section('출정', '페이즈를 골라 도전하세요');
    for (const p of PHASES) {
      const locked = !!p.requires && !save.cleared.includes(p.requires);
      const cleared = save.cleared.includes(p.id);
      const card = el('div', `v-card phase${locked ? ' locked' : ''}`, s);
      const head = el('div', 'v-card-head', card);
      el('span', 'v-phase-id', head, p.id);
      el('span', 'v-card-title', head, p.name);
      if (p.type === 'boss') el('span', 'v-badge boss', head, '보스');
      if (p.type === 'special') el('span', 'v-badge special', head, '특별');
      if (cleared) el('span', 'v-badge clear', head, '클리어');
      el('p', 'v-desc', card, p.desc);

      const info = el('div', 'v-meta', card);
      el('span', '', info, phaseKindText(p));
      el('span', '', info, `보상: 골드 ${fmt(p.clearReward.gold)} · 경험치 ${fmt(p.clearReward.exp)}`);
      const mats = Object.entries(p.clearReward.materials).map(([id, n]) => `${materialName(id)} x${n}`);
      if (p.clearReward.sweepTickets > 0) mats.push(`소탕권 x${p.clearReward.sweepTickets}`);
      if (mats.length) el('span', '', info, mats.join(', '));

      const actions = el('div', 'v-actions', card);
      if (locked) {
        const req = PHASES.find((q) => q.id === p.requires);
        el('span', 'v-lock', actions, `잠김: ${p.requires} ${req ? req.name : ''} 클리어 필요`);
      } else {
        button(actions, '도전', 'primary', true, () => this.cb.onStartPhase(p.id));
        if (cleared) {
          button(actions, '소탕 (소탕권 1)', '', save.sweepTickets >= 1, () => this.sweep(p));
        }
      }
    }
    el('p', 'v-muted v-note', s, `소탕: 클리어한 페이즈를 소탕권 1장으로 즉시 완료하고 클리어 보상의 ${Math.round(SWEEP_RATE * 100)}%를 받습니다. (소탕권 보상 제외)`);
  }

  private sweep(p: PhaseDef): void {
    const save = this.getSave();
    if (save.sweepTickets < 1 || !save.cleared.includes(p.id)) return;
    save.sweepTickets -= 1;
    const gold = Math.floor(p.clearReward.gold * SWEEP_RATE);
    const exp = Math.floor(p.clearReward.exp * SWEEP_RATE);
    save.gold += gold;
    const levels = addExp(save, exp);
    const parts = [`골드 +${fmt(gold)}`, `경험치 +${fmt(exp)}`];
    for (const [id, count] of Object.entries(p.clearReward.materials)) {
      const n = Math.max(1, Math.floor(count * SWEEP_RATE));
      save.materials[id] = (save.materials[id] ?? 0) + n;
      parts.push(`${materialName(id)} +${n}`);
    }
    let msg = `소탕 완료: ${parts.join(', ')}`;
    if (levels > 0) msg += `  ·  레벨 업! Lv ${save.level}`;
    this.changed();
    this.toast(msg);
  }

  // ---- 캐릭터 ----

  private renderChar(save: SaveData): void {
    const stats = totalStats(save);
    const d = derive(stats, save.passives, gearBonus(save.gear.equipped));

    const s = this.section('스탯', `남은 포인트 ${save.statPoints}`);
    for (const info of STAT_INFO) {
      const row = el('div', 'v-stat-row', s);
      const left = el('div', 'v-stat-left', row);
      const name = el('div', 'v-stat-name', left);
      el('span', '', name, info.name);
      el('span', 'v-stat-val', name, String(stats[info.key]));
      const alloc = save.allocated[info.key];
      if (alloc > 0) el('span', 'v-muted', name, `(분배 +${alloc})`);
      el('div', 'v-desc', left, info.desc);
      const btns = el('div', 'v-stat-btns', row);
      button(btns, '+1', 'small', save.statPoints >= 1, () => this.allocate(info.key, 1));
      button(btns, '+5', 'small', save.statPoints >= 5, () => this.allocate(info.key, 5));
    }
    el('p', 'v-muted v-note', s, '레벨이 오를 때마다 모든 기본 스탯이 1씩 자동으로 오르고, 스탯 포인트 5를 받습니다.');

    const ds = this.section('능력치');
    const grid = el('div', 'v-kv', ds);
    const kv = (k: string, v: string, note?: string): void => {
      el('span', 'v-kv-k', grid, k);
      const ve = el('span', 'v-kv-v', grid, v);
      if (note) el('span', 'v-muted', ve, `  ${note}`);
    };
    kv('최대 HP', fmt(d.maxHp));
    kv('최대 마나', fmt(d.maxMp), d.manaInt > stats.int ? `(마나용 마력 ${d.manaInt.toFixed(1)})` : undefined);
    kv('마나 회복', `초당 ${d.mpRegen.toFixed(2)}`);
    const bonus = Math.min(stats.dex * 0.005, DEX_SPEED_CAP);
    kv('이동속도', `${d.moveSpeed.toFixed(2)} m/s`, `(스탯 보너스 +${(bonus * 100).toFixed(1)}%, 최대 +${DEX_SPEED_CAP * 100}%)`);
    if (d.passive.speedMul > 0) kv('패시브 이동속도', `+${(d.passive.speedMul * 100).toFixed(0)}%`, '(상한 없음)');
    if (d.passive.critBonus > 0) kv('치명타 확률 보너스', `+${(d.passive.critBonus * 100).toFixed(0)}%`);

    const rs = this.section('스탯 초기화', '분배한 포인트를 모두 돌려받습니다');
    const cost = resetCost(save.level);
    const allocated = save.allocated.str + save.allocated.dex + save.allocated.int + save.allocated.hp;
    const confirming = this.confirming === 'statReset';
    const actions = el('div', 'v-actions', rs);
    button(
      actions,
      confirming ? `정말 초기화? (${fmt(cost)} 골드)` : `스탯 초기화 (${fmt(cost)} 골드)`,
      confirming ? 'danger' : '',
      allocated > 0 && save.gold >= cost,
      () => {
        if (this.confirm('statReset')) this.resetStats();
      },
    );
    if (allocated === 0) el('span', 'v-muted', actions, '분배한 포인트가 없습니다');
    else if (save.gold < cost) el('span', 'v-short', actions, '골드가 부족합니다');
  }

  private allocate(key: StatKey, n: number): void {
    const save = this.getSave();
    if (save.statPoints < n) return;
    save.statPoints -= n;
    save.allocated[key] += n;
    this.changed();
  }

  private resetStats(): void {
    const save = this.getSave();
    const cost = resetCost(save.level);
    if (save.gold < cost) return;
    const a = save.allocated;
    const total = a.str + a.dex + a.int + a.hp;
    save.gold -= cost;
    save.statPoints += total;
    save.allocated = { str: 0, dex: 0, int: 0, hp: 0 };
    this.changed();
    this.toast(`스탯을 초기화했습니다. 포인트 ${total} 반환`);
  }

  // ---- 장비 ----

  private renderEquip(save: SaveData): void {
    const s = this.section('장착 무기', '전투 중 무기 교체 키로 두 무기를 바꿔 씁니다');
    const slots = el('div', 'v-equip-slots', s);
    save.equipped.forEach((uid, i) => {
      const w = save.weapons.find((x) => x.uid === uid);
      const def = w ? WEAPONS[w.defId] : undefined;
      const box = el('div', 'v-equip-slot', slots);
      el('span', 'v-muted', box, `무기 ${i + 1}`);
      const name = el('span', 'v-card-title', box, def ? `${def.name}${w && w.enhance > 0 ? ` +${w.enhance}` : ''}` : '없음');
      if (def) name.style.color = GRADES[def.grade].color;
      if (def) el('span', 'v-muted', box, WEAPON_TYPE_NAME[def.type]);
    });

    const list = this.section('보유 무기', `${save.weapons.length}개`);
    for (const w of save.weapons) {
      const def = WEAPONS[w.defId];
      if (!def) continue;
      const card = el('div', 'v-card', list);
      const head = el('div', 'v-card-head', card);
      const name = el('span', 'v-card-title', head, def.name);
      name.style.color = GRADES[def.grade].color;
      if (w.enhance > 0) el('span', 'v-enh', head, `+${w.enhance}`);
      el('span', 'v-muted', head, `${GRADES[def.grade].name} ${WEAPON_TYPE_NAME[def.type]}`);
      const slot = save.equipped.indexOf(w.uid);
      if (slot >= 0) el('span', 'v-badge clear', head, `무기 ${slot + 1}`);
      el('p', 'v-desc', card, def.desc);
      this.weaponMeta(card, def);
      const actions = el('div', 'v-actions', card);
      for (const i of [0, 1]) {
        button(actions, `무기 ${i + 1}에 장착`, i === 0 ? 'primary' : '', save.equipped[i] !== w.uid, () => this.equip(w.uid, i));
      }
    }
    el('p', 'v-muted v-note', list, '새 무기는 상점에서 사거나 재료로 교환해 얻습니다.');

    const gs = this.section('방어구·장신구', '방어구는 HP·스탯, 장신구는 특수 효과');
    const grid = el('div', 'v-gear-slots', gs);
    for (const slot of GEAR_SLOTS) {
      const id = save.gear.equipped[slot];
      const def = id ? GEAR[id] : undefined;
      const box = el('div', `v-gear-slot${def ? '' : ' empty'}`, grid);
      el('span', 'v-muted', box, GEAR_SLOT_NAME[slot]);
      const name = el('span', 'v-gear-name', box, def ? def.name : '비어 있음');
      if (def) {
        name.style.color = GRADES[def.grade].color;
        el('span', 'v-gear-stats', box, gearStatsText(def.stats));
        button(box, '해제', 'small', true, () => {
          delete this.getSave().gear.equipped[slot];
          this.changed();
        });
      }
    }

    const owned = save.gear.owned.map((gid) => GEAR[gid]).filter((d): d is GearDef => !!d);
    if (!owned.length) {
      el('p', 'v-muted v-note', gs, '보유한 방어구·장신구가 없습니다. 상점에서 사거나 재료로 교환하세요.');
      return;
    }
    for (const def of owned) {
      const equipped = save.gear.equipped[def.slot] === def.id;
      const card = el('div', 'v-card', gs);
      const head = el('div', 'v-card-head', card);
      const name = el('span', 'v-card-title', head, def.name);
      name.style.color = GRADES[def.grade].color;
      el('span', 'v-muted', head, `${GRADES[def.grade].name} ${GEAR_SLOT_NAME[def.slot]}`);
      if (equipped) el('span', 'v-badge clear', head, '장착');
      el('div', 'v-meta', card, gearStatsText(def.stats));
      const actions = el('div', 'v-actions', card);
      button(actions, equipped ? '장착 중' : '장착', 'primary small', !equipped, () => {
        this.getSave().gear.equipped[def.slot] = def.id;
        this.changed();
      });
    }
  }

  private weaponMeta(card: HTMLElement, def: WeaponDef): void {
    const meta = el('div', 'v-meta', card);
    el('span', '', meta, `공격력 ${def.attack}`);
    el('span', '', meta, def.type === 'gun' ? `치명타 보정 ${(def.critChance * 100).toFixed(0)}%` : `치명타 ${(def.critChance * 100).toFixed(0)}%`);
    if (def.magazine) el('span', '', meta, `탄창 ${def.magazine}발`);
  }

  private equip(uid: string, slot: number): void {
    const save = this.getSave();
    const other = 1 - slot;
    // 다른 칸에 이미 있으면 두 칸을 맞바꾼다.
    if (save.equipped[other] === uid) save.equipped[other] = save.equipped[slot];
    save.equipped[slot] = uid;
    this.changed();
  }

  private addWeapon(defId: string): void {
    const save = this.getSave();
    const next = save.weapons.reduce((n, w) => Math.max(n, Number(w.uid.slice(1)) || 0), 0) + 1;
    save.weapons.push({ uid: `w${next}`, defId, enhance: 0 });
  }

  // ---- 스킬 ----

  private equippedDefs(save: SaveData): WeaponDef[] {
    const out: WeaponDef[] = [];
    for (const uid of save.equipped) {
      const w = save.weapons.find((x) => x.uid === uid);
      const def = w ? WEAPONS[w.defId] : undefined;
      if (def) out.push(def);
    }
    return out;
  }

  private renderSkills(save: SaveData): void {
    this.renderPassives(save);
    const seen = new Set<string>();
    for (const def of this.equippedDefs(save)) {
      if (seen.has(def.type)) continue;
      seen.add(def.type);
      const s = this.section(`${WEAPON_TYPE_NAME[def.type]} 스킬`, def.name);
      const list = skillsFor(def.type);
      let slot = 0;
      for (const sk of list) {
        const learned = save.learnedSkills.includes(sk.id);
        const card = el('div', `v-card skill${learned ? ' learned' : ''}`, s);
        const head = el('div', 'v-card-head', card);
        el('span', 'v-card-title', head, sk.name);
        if (learned) {
          const action = SLOT_ACTIONS[slot];
          slot++;
          el('span', 'v-badge clear', head, '습득');
          if (action) el('span', 'v-key', head, keyLabel(save.keymap[action]));
          else el('span', 'v-muted', head, '슬롯 없음');
        }
        const meta = el('div', 'v-meta', card);
        el('span', '', meta, `마나 ${sk.mana}`);
        el('span', '', meta, `쿨타임 ${sk.cooldown}초`);
        el('span', save.level < sk.reqLevel ? 'v-short' : '', meta, `요구 레벨 ${sk.reqLevel}`);
        el('p', 'v-desc', card, sk.desc);
        if (!learned) {
          const actions = el('div', 'v-actions', card);
          button(actions, '배우기 (스킬 포인트 1)', 'primary', save.skillPoints >= 1 && save.level >= sk.reqLevel, () =>
            this.learn(sk.id),
          );
          if (save.level < sk.reqLevel) el('span', 'v-muted', actions, `Lv ${sk.reqLevel}부터 배울 수 있습니다`);
        }
      }
    }
    el(
      'p',
      'v-muted v-note',
      this.body,
      `배운 스킬은 해당 무기의 슬롯에 목록 순서대로 자동 배치됩니다 (${SLOT_ACTIONS.map((a) => keyLabel(this.getSave().keymap[a])).join(' ')}).`,
    );

    const rs = this.section('스킬 초기화', '기본 스킬을 제외한 스킬과 패시브의 포인트를 모두 돌려받습니다');
    const cost = resetCost(save.level);
    const refundable = save.learnedSkills.filter((id) => !STARTER_SKILLS.includes(id)).length + this.passivePoints(save);
    const confirming = this.confirming === 'skillReset';
    const actions = el('div', 'v-actions', rs);
    button(
      actions,
      confirming ? `정말 초기화? (${fmt(cost)} 골드)` : `스킬 초기화 (${fmt(cost)} 골드)`,
      confirming ? 'danger' : '',
      refundable > 0 && save.gold >= cost,
      () => {
        if (this.confirm('skillReset')) this.resetSkills();
      },
    );
    if (refundable === 0) el('span', 'v-muted', actions, '초기화할 스킬이 없습니다');
    else if (save.gold < cost) el('span', 'v-short', actions, '골드가 부족합니다');
  }

  private passivePoints(save: SaveData): number {
    return Object.values(save.passives).reduce((a, b) => a + b, 0);
  }

  private renderPassives(save: SaveData): void {
    const s = this.section('공용 패시브', '무기와 상관없이 항상 적용됩니다');
    const grid = el('div', 'v-passives', s);
    for (const def of PASSIVES) {
      const rank = save.passives[def.id] ?? 0;
      const maxed = rank >= def.maxRank;
      const card = el('div', `v-passive${rank > 0 ? ' learned' : ''}`, grid);
      const head = el('div', 'v-card-head', card);
      el('span', 'v-card-title', head, def.name);
      const pips = el('span', 'v-pips', head);
      for (let i = 0; i < def.maxRank; i++) el('span', `v-pip${i < rank ? ' on' : ''}`, pips);
      el('p', 'v-desc', card, def.desc);
      const actions = el('div', 'v-actions', card);
      if (maxed) {
        el('span', 'v-muted', actions, '최대 단계');
        continue;
      }
      const canLevel = save.level >= def.reqLevel;
      button(actions, rank === 0 ? '배우기 (1)' : `강화 (1)`, 'small', save.skillPoints >= 1 && canLevel, () => this.rankUp(def));
      if (!canLevel) el('span', 'v-muted', actions, `Lv ${def.reqLevel}부터`);
    }
  }

  private rankUp(def: PassiveDef): void {
    const save = this.getSave();
    const rank = save.passives[def.id] ?? 0;
    if (save.skillPoints < 1 || rank >= def.maxRank || save.level < def.reqLevel) return;
    save.skillPoints -= 1;
    save.passives[def.id] = rank + 1;
    this.changed();
  }

  private learn(id: string): void {
    const save = this.getSave();
    if (save.skillPoints < 1 || save.learnedSkills.includes(id)) return;
    save.skillPoints -= 1;
    save.learnedSkills.push(id);
    this.changed();
  }

  private resetSkills(): void {
    const save = this.getSave();
    const cost = resetCost(save.level);
    if (save.gold < cost) return;
    const keep = save.learnedSkills.filter((id) => STARTER_SKILLS.includes(id));
    const refund = save.learnedSkills.length - keep.length + this.passivePoints(save);
    save.gold -= cost;
    save.learnedSkills = keep;
    save.passives = {};
    save.skillPoints += refund;
    this.changed();
    this.toast(`스킬을 초기화했습니다. 스킬 포인트 ${refund} 반환`);
  }

  // ---- 강화 ----

  private renderEnhance(save: SaveData): void {
    const s = this.section('무기 강화', '강화는 항상 성공합니다');
    for (const w of save.weapons) {
      const def = WEAPONS[w.defId];
      if (!def) continue;
      const grade = GRADES[def.grade];
      const card = el('div', 'v-card enhance', s);
      const head = el('div', 'v-card-head', card);
      const name = el('span', 'v-card-title', head, def.name);
      name.style.color = grade.color;
      el('span', 'v-enh', head, `+${w.enhance}`);
      el('span', 'v-muted', head, `${grade.name} ${WEAPON_TYPE_NAME[def.type]}`);
      if (save.equipped.includes(w.uid)) el('span', 'v-badge clear', head, '장착');

      const maxed = w.enhance >= MAX_ENHANCE;
      const cur = enhanceMultiplier(def.type, w.enhance);
      const meta = el('div', 'v-meta', card);
      el('span', '', meta, `공격력 ${def.attack}`);
      el('span', '', meta, `치명타 ${(def.critChance * 100).toFixed(0)}%`);
      el(
        'span',
        'v-mult',
        meta,
        maxed ? `피해 배율 x${cur.toFixed(2)} (최대)` : `피해 배율 x${cur.toFixed(2)} → x${enhanceMultiplier(def.type, w.enhance + 1).toFixed(2)}`,
      );

      const actions = el('div', 'v-actions', card);
      if (maxed) {
        el('span', 'v-muted', actions, `최대 강화 단계(+${MAX_ENHANCE})입니다`);
        continue;
      }
      const cost = enhanceCost(def.type, w.enhance);
      const costs = el('div', 'v-costs', card);
      let ok = save.gold >= cost.gold;
      el('span', save.gold >= cost.gold ? 'v-cost' : 'v-cost short', costs, `골드 ${fmt(save.gold)} / ${fmt(cost.gold)}`);
      for (const [id, need] of Object.entries(cost.materials)) {
        const have = save.materials[id] ?? 0;
        if (have < need) ok = false;
        el('span', have >= need ? 'v-cost' : 'v-cost short', costs, `${materialName(id)} ${have} / ${need}`);
      }
      card.insertBefore(costs, actions);
      button(actions, `강화 (+${w.enhance + 1})`, 'primary', ok, () => this.enhance(w.uid));
    }

    const inv = this.section('보유 재료');
    const entries = Object.entries(save.materials).filter(([, n]) => n > 0);
    if (!entries.length) {
      el('p', 'v-muted', inv, '보유한 재료가 없습니다. 페이즈에서 몬스터를 처치해 얻으세요.');
      return;
    }
    const grid = el('div', 'v-mats', inv);
    for (const [id, n] of entries) {
      const m = el('div', 'v-mat', grid);
      m.title = MATERIALS[id]?.desc ?? '';
      el('span', 'v-mat-name', m, materialName(id));
      el('span', 'v-mat-count', m, `x${n}`);
    }
  }

  private enhance(uid: string): void {
    const save = this.getSave();
    const w = save.weapons.find((x) => x.uid === uid);
    const def = w ? WEAPONS[w.defId] : undefined;
    if (!w || !def || w.enhance >= MAX_ENHANCE) return;
    const cost = enhanceCost(def.type, w.enhance);
    if (save.gold < cost.gold) return;
    for (const [id, need] of Object.entries(cost.materials)) {
      if ((save.materials[id] ?? 0) < need) return;
    }
    save.gold -= cost.gold;
    for (const [id, need] of Object.entries(cost.materials)) save.materials[id] -= need;
    w.enhance++;
    this.changed();
    this.toast(`${def.name} +${w.enhance} 강화 성공!`);
  }

  // ---- 상점 ----

  private renderShop(save: SaveData): void {
    const owned = new Set(save.weapons.map((w) => w.defId));

    const ws = this.section('무기 상점', '골드로 삽니다');
    for (const def of Object.values(WEAPONS)) {
      if (def.price === undefined) continue;
      const card = el('div', 'v-card', ws);
      const head = el('div', 'v-card-head', card);
      const name = el('span', 'v-card-title', head, def.name);
      name.style.color = GRADES[def.grade].color;
      el('span', 'v-muted', head, `${GRADES[def.grade].name} ${WEAPON_TYPE_NAME[def.type]}`);
      if (owned.has(def.id)) el('span', 'v-badge clear', head, '보유');
      el('p', 'v-desc', card, def.desc);
      this.weaponMeta(card, def);
      const actions = el('div', 'v-actions', card);
      if (owned.has(def.id)) continue;
      const price = def.price;
      button(actions, `구매 (${fmt(price)} 골드)`, 'primary', save.gold >= price, () => {
        const sv = this.getSave();
        if (sv.gold < price) return;
        sv.gold -= price;
        this.addWeapon(def.id);
        this.changed();
        this.toast(`${def.name}을(를) 샀습니다. 장비 탭에서 장착하세요`);
      });
      if (save.gold < price) el('span', 'v-short', actions, '골드가 부족합니다');
    }

    const gs = this.section('방어구·장신구 상점', '골드로 삽니다');
    for (const def of Object.values(GEAR)) {
      if (def.price === undefined) continue;
      this.gearCard(gs, save, def);
    }

    const s = this.section('소모품');
    for (const pot of POTIONS) {
      const pc = el('div', 'v-card', s);
      const ph = el('div', 'v-card-head', pc);
      el('span', 'v-card-title', ph, pot.name);
      el('span', 'v-muted', ph, `보유 ${save.potions[pot.id]}개`);
      el('p', 'v-desc', pc, `${pot.desc} 한 페이즈에 최대 5개까지 쓸 수 있습니다.`);
      const pa = el('div', 'v-actions', pc);
      for (const n of [1, 5]) {
        button(pa, `${n}개 구매 (${fmt(pot.price * n)} 골드)`, n === 1 ? 'primary' : '', save.gold >= pot.price * n, () => {
          const sv = this.getSave();
          if (sv.gold < pot.price * n) return;
          sv.gold -= pot.price * n;
          sv.potions[pot.id] += n;
          this.changed();
          this.toast(`${pot.name} ${n}개를 샀습니다`);
        });
      }
    }
    const card = el('div', 'v-card', s);
    const head = el('div', 'v-card-head', card);
    el('span', 'v-card-title', head, '소탕권');
    el('span', 'v-muted', head, `보유 ${save.sweepTickets}장`);
    el('p', 'v-desc', card, '클리어한 페이즈를 즉시 완료하고 클리어 보상의 일부를 받습니다.');
    const actions = el('div', 'v-actions', card);
    button(actions, `구매 (${fmt(SWEEP_TICKET_PRICE)} 골드)`, 'primary', save.gold >= SWEEP_TICKET_PRICE, () => {
      const sv = this.getSave();
      if (sv.gold < SWEEP_TICKET_PRICE) return;
      sv.gold -= SWEEP_TICKET_PRICE;
      sv.sweepTickets += 1;
      this.changed();
      this.toast('소탕권 1장을 구매했습니다');
    });
    if (save.gold < SWEEP_TICKET_PRICE) el('span', 'v-short', actions, '골드가 부족합니다');

  }

  private renderExchange(save: SaveData): void {
    const owned = new Set(save.weapons.map((w) => w.defId));
    const xs = this.section('재료 교환', '모은 재료로 강력한 무기와 장비를 얻습니다');
    for (const def of Object.values(WEAPONS)) {
      const ex = def.exchange;
      if (!ex) continue;
      const card = el('div', 'v-card', xs);
      const head = el('div', 'v-card-head', card);
      const name = el('span', 'v-card-title', head, def.name);
      name.style.color = GRADES[def.grade].color;
      el('span', 'v-muted', head, `${GRADES[def.grade].name} ${WEAPON_TYPE_NAME[def.type]}`);
      if (owned.has(def.id)) el('span', 'v-badge clear', head, '보유');
      el('p', 'v-desc', card, def.desc);
      this.weaponMeta(card, def);
      if (owned.has(def.id)) continue;
      const costs = el('div', 'v-costs', card);
      let ok = save.gold >= ex.gold;
      el('span', save.gold >= ex.gold ? 'v-cost' : 'v-cost short', costs, `골드 ${fmt(save.gold)} / ${fmt(ex.gold)}`);
      for (const [id, need] of Object.entries(ex.materials)) {
        const have = save.materials[id] ?? 0;
        if (have < need) ok = false;
        el('span', have >= need ? 'v-cost' : 'v-cost short', costs, `${materialName(id)} ${have} / ${need}`);
      }
      const actions = el('div', 'v-actions', card);
      button(actions, '교환', 'primary', ok, () => this.exchange(def));
    }
    for (const def of Object.values(GEAR)) {
      if (def.exchange) this.gearCard(xs, save, def);
    }

  }

  /** 방어구·장신구 카드: 골드 구매 또는 재료 교환 */
  private gearCard(parent: HTMLElement, save: SaveData, def: GearDef): void {
    const owned = save.gear.owned.includes(def.id);
    const card = el('div', 'v-card', parent);
    const head = el('div', 'v-card-head', card);
    const name = el('span', 'v-card-title', head, def.name);
    name.style.color = GRADES[def.grade].color;
    el('span', 'v-muted', head, `${GRADES[def.grade].name} ${GEAR_SLOT_NAME[def.slot]}`);
    if (owned) el('span', 'v-badge clear', head, '보유');
    el('div', 'v-meta', card, gearStatsText(def.stats));
    if (owned) return;
    const actions = el('div', 'v-actions', card);
    if (def.price !== undefined) {
      const price = def.price;
      button(actions, `구매 (${fmt(price)} 골드)`, 'primary', save.gold >= price, () => {
        const sv = this.getSave();
        if (sv.gold < price || sv.gear.owned.includes(def.id)) return;
        sv.gold -= price;
        sv.gear.owned.push(def.id);
        this.changed();
        this.toast(`${def.name}을(를) 샀습니다. 장비 탭에서 장착하세요`);
      });
      if (save.gold < price) el('span', 'v-short', actions, '골드가 부족합니다');
      return;
    }
    const ex = def.exchange;
    if (!ex) return;
    const costs = el('div', 'v-costs', card);
    let ok = save.gold >= ex.gold;
    el('span', save.gold >= ex.gold ? 'v-cost' : 'v-cost short', costs, `골드 ${fmt(save.gold)} / ${fmt(ex.gold)}`);
    for (const [id, need] of Object.entries(ex.materials)) {
      const have = save.materials[id] ?? 0;
      if (have < need) ok = false;
      el('span', have >= need ? 'v-cost' : 'v-cost short', costs, `${materialName(id)} ${have} / ${need}`);
    }
    card.insertBefore(costs, actions);
    button(actions, '교환', 'primary', ok, () => {
      const sv = this.getSave();
      if (sv.gear.owned.includes(def.id) || sv.gold < ex.gold) return;
      for (const [id, need] of Object.entries(ex.materials)) if ((sv.materials[id] ?? 0) < need) return;
      sv.gold -= ex.gold;
      for (const [id, need] of Object.entries(ex.materials)) sv.materials[id] -= need;
      sv.gear.owned.push(def.id);
      this.changed();
      this.toast(`${def.name}을(를) 얻었습니다. 장비 탭에서 장착하세요`);
    });
  }

  private exchange(def: WeaponDef): void {
    const save = this.getSave();
    const ex = def.exchange;
    if (!ex || save.weapons.some((w) => w.defId === def.id) || save.gold < ex.gold) return;
    for (const [id, need] of Object.entries(ex.materials)) {
      if ((save.materials[id] ?? 0) < need) return;
    }
    save.gold -= ex.gold;
    for (const [id, need] of Object.entries(ex.materials)) save.materials[id] -= need;
    this.addWeapon(def.id);
    this.changed();
    this.toast(`${def.name}을(를) 얻었습니다. 장비 탭에서 장착하세요`);
  }

  // ---- 설정 ----

  private renderSettings(save: SaveData): void {
    const vs = this.section('소리');
    const vrow = el('div', 'v-slider-row', vs);
    el('span', '', vrow, '효과음 음량');
    const vol = el('input', 'v-slider', vrow);
    vol.type = 'range';
    vol.min = '0';
    vol.max = '1';
    vol.step = '0.05';
    vol.value = String(save.sfxVolume);
    const vval = el('span', 'v-slider-val', vrow, `${Math.round(save.sfxVolume * 100)}%`);
    vol.addEventListener('input', () => {
      const v = Math.round(Number(vol.value) * 100) / 100;
      this.getSave().sfxVolume = v;
      vval.textContent = `${Math.round(v * 100)}%`;
    });
    vol.addEventListener('change', () => {
      this.cb.onSaveChanged();
      sfx.play('hit');
    });

    const ks = this.section('키 설정', '키를 누른 뒤 바꿀 키를 입력하세요 (Esc: 취소)');
    const grid = el('div', 'v-kv keys', ks);
    for (const [action, label] of Object.entries(ACTION_LABELS) as [Action, string][]) {
      el('span', 'v-kv-k', grid, label);
      const v = el('span', 'v-kv-v', grid);
      const listening = this.rebinding === action;
      const b = button(v, listening ? '키를 누르세요...' : keyLabel(save.keymap[action]), `small v-keybtn${listening ? ' listening' : ''}`, true, () =>
        this.startRebind(action),
      );
      b.title = '클릭해서 변경';
    }

    const kr = el('div', 'v-actions', ks);
    button(kr, '기본 키로 되돌리기', 'small', true, () => {
      this.stopRebind();
      this.getSave().keymap = { ...DEFAULT_KEYMAP };
      this.changed();
      this.toast('키 설정을 기본값으로 되돌렸습니다');
    });

    const ds = this.section('세이브 데이터', '진행 상황은 브라우저에 자동 저장됩니다');
    const actions = el('div', 'v-actions', ds);
    button(actions, '세이브 내보내기', '', true, () => exportSave(this.getSave()));
    button(actions, '세이브 불러오기', '', true, () => {
      this.importError = '';
      this.fileInput.value = '';
      this.fileInput.click();
    });
    const confirming = this.confirming === 'fullReset';
    button(actions, confirming ? '정말 처음부터? (모든 진행 삭제)' : '처음부터 다시', 'danger', true, () => {
      if (!this.confirm('fullReset')) return;
      this.cb.onReset();
      this.refresh();
      this.toast('새로 시작합니다');
    });
    if (this.importError) el('p', 'v-short v-note', ds, `불러오기 실패: ${this.importError}`);
  }

  private startRebind(action: Action): void {
    this.rebinding = action;
    window.removeEventListener('keydown', this.onRebindKey, true);
    window.addEventListener('keydown', this.onRebindKey, true);
    this.refresh();
  }

  private stopRebind(): void {
    if (!this.rebinding) return;
    this.rebinding = null;
    window.removeEventListener('keydown', this.onRebindKey, true);
  }

  /** 다른 동작이 쓰던 키를 고르면 두 동작의 키를 맞바꾼다. */
  private handleRebindKey(e: KeyboardEvent): void {
    const action = this.rebinding;
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      this.stopRebind();
      this.refresh();
      return;
    }
    const keymap = this.getSave().keymap;
    const prev = keymap[action];
    const owner = (Object.keys(keymap) as Action[]).find((a) => a !== action && keymap[a] === e.code);
    if (owner) keymap[owner] = prev;
    keymap[action] = e.code;
    this.stopRebind();
    this.changed();
    if (owner) this.toast(`${ACTION_LABELS[owner]}의 키와 맞바꿨습니다`);
  }

  private async handleImport(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (!file) return;
    try {
      const save = await importSave(file);
      this.importError = '';
      this.cb.onImport(save);
      this.refresh();
      this.toast('세이브를 불러왔습니다');
    } catch (e) {
      this.importError = e instanceof SyntaxError ? 'JSON 파일이 아닙니다.' : e instanceof Error ? e.message : '알 수 없는 오류';
      this.refresh();
    }
  }
}
