import type { SaveData } from '../core/save';
import type { LegionRun } from '../data/legion';
import type { RaidRun } from '../data/raid';
import { GEAR, GEAR_SLOT_NAME, gearBonus, gearStatsText, SET_LINE_NAME, SETS, setPieces, setProgress, type GearDef, type GearSlot, type GearStats } from '../data/gear';
import { CLASS_NAME, GRADES, WEAPON_TYPE_NAME, WEAPONS, type Grade, type WeaponDef, type WeaponType } from '../data/weapons';
import { combatPower } from '../game/power';
import { baseStats, derive, DEX_SPEED_CAP, resetCost, totalStats, type Stats } from '../game/stats';
import { CLASS_PASSIVE_TIERS, classPassiveBonus } from '../data/classPassives';
import { weaponIconUrl } from '../game/weaponArt';
import { button, el, iconImg } from './dom';
import { draggable, dropZone, type DragItem } from './drag';
import { koNum } from './format';
import { gearIconUrl } from './iconArt';

/** 장비창·스킬창이 마을 창(VillageUI)에서 빌려 쓰는 것들 */
export interface PanelHost {
  body: HTMLElement;
  getSave(): SaveData;
  /** 세이브를 저장하고 창을 다시 그린다. */
  changed(): void;
  toast(text: string, kind?: 'ok' | 'warn'): void;
  /** 첫 클릭은 확인 상태로 바꾸고, 두 번째 클릭에 true */
  confirm(key: 'statReset' | 'skillReset'): boolean;
  isConfirming(key: 'statReset' | 'skillReset'): boolean;
  section(title: string, note?: string): HTMLDivElement;
  /** 직업별 캐릭터 그림 (Phaser 텍스처에서 잘라 온다) */
  portrait(type: WeaponType): HTMLCanvasElement | null;
  /** 게임 텍스처를 캔버스로 복사해 온다 (석상 그림 등) */
  art?(key: string): HTMLCanvasElement | null;
  /** 군단장 출격 (전투 기지에서만) */
  startLegion?(run: LegionRun): void;
  /** 마왕 레이드 출격 (전투 기지 마왕성 문) */
  startRaid?(run: RaidRun): void;
  /** 월드 보스 도전 (마을 골렘 석상) */
  startWorldBoss?(): void;
}

type StatKey = keyof Stats;
export type BagFilter = 'all' | 'weapon' | 'armor' | 'acc';

/**
 * 가방·장비 칸·상세 창이 '어디에 장착하는지'를 묻는 곳. 마을 장비창과 마왕성 문(레이드 장비)이 같은 화면을 쓴다.
 */
export interface BagAdapter {
  /** 가방 위 탭 */
  filters: BagFilter[];
  /** 창을 다시 그려도 유지되는 탭과 고른 아이템 */
  state: { filter: BagFilter; selected: DragItem | null };
  isEquipped(save: SaveData, item: DragItem): boolean;
  /** 더블클릭: 장착하거나 해제한다. */
  quickEquip(save: SaveData, item: DragItem): void;
  /** 장착한 방어구를 가방으로 끌어냈다. */
  unequip(save: SaveData, item: DragItem): void;
  /** 상세 창 아래쪽: 전투력 변화, 장착 버튼 */
  detailActions(host: PanelHost, box: HTMLElement, save: SaveData, item: DragItem): void;
  /** 세트 정보에 쓸 '입은 부위' (그 세트를 세는 장비 묶음) */
  wornFor(save: SaveData, setId: string): Partial<Record<GearSlot, string>>;
}

const STAT_INFO: { key: StatKey; name: string; desc: string }[] = [
  { key: 'str', name: '힘', desc: '근접 무기(도·검) 피해 증가. 활 피해에 30% 반영.' },
  { key: 'dex', name: '민첩', desc: '활 피해 증가(70% 반영). 이동속도 증가(상한 있음).' },
  { key: 'int', name: '마력', desc: '최대 마나와 마나 회복 증가. 마법(스태프) 피해 증가.' },
  { key: 'hp', name: 'HP', desc: '최대 체력 증가 (1당 +10).' },
];

const STAT_NAME = { str: '힘', dex: '민첩', int: '마력' } as const;

const ARMOR_SLOTS: GearSlot[] = ['head', 'body', 'legs', 'feet'];
const ACC_SLOTS: GearSlot[] = ['necklace', 'ring'];

const FILTER_NAME: Record<BagFilter, string> = { all: '전체', weapon: '무기', armor: '방어구', acc: '장신구' };

function weaponOf(save: SaveData, uid: string): { def: WeaponDef; enhance: number } | null {
  const w = save.weapons.find((x) => x.uid === uid);
  const def = w ? WEAPONS[w.defId] : undefined;
  return w && def ? { def, enhance: w.enhance } : null;
}

export function iconOf(save: SaveData, item: DragItem): string {
  if (item.kind === 'weapon') {
    const w = weaponOf(save, item.uid);
    return w ? weaponIconUrl(w.def) : '';
  }
  if (item.kind === 'gear') return GEAR[item.id] ? gearIconUrl(GEAR[item.id]) : '';
  return '';
}

// ───────── 세이브 바꾸기 ─────────

function equipWeapon(save: SaveData, uid: string, slot: number): void {
  const other = 1 - slot;
  // 다른 칸에 이미 있으면 두 칸을 맞바꾼다.
  if (save.equipped[other] === uid) save.equipped[other] = save.equipped[slot];
  save.equipped[slot] = uid;
}

function equipGear(save: SaveData, id: string): void {
  const def = GEAR[id];
  if (def && save.gear.owned.includes(id)) save.gear.equipped[def.slot] = id;
}

function unequipGear(save: SaveData, id: string): void {
  const def = GEAR[id];
  if (def && save.gear.equipped[def.slot] === id) delete save.gear.equipped[def.slot];
}

/** 장착했을 때의 전투력 변화 (이미 장착 중이면 해제했을 때) */
function powerDelta(save: SaveData, item: DragItem): number {
  const next = structuredClone(save);
  if (item.kind === 'weapon') {
    if (next.equipped.includes(item.uid)) return 0;
    equipWeapon(next, item.uid, 0);
  } else if (item.kind === 'gear') {
    if (next.gear.equipped[GEAR[item.id]?.slot] === item.id) unequipGear(next, item.id);
    else equipGear(next, item.id);
  }
  return combatPower(next) - combatPower(save);
}

// ───────── 마을 장비 ─────────

const TOWN: BagAdapter = {
  filters: ['all', 'weapon', 'armor', 'acc'],
  state: { filter: 'all', selected: null },
  isEquipped(save, item) {
    if (item.kind === 'weapon') return save.equipped.includes(item.uid);
    if (item.kind === 'gear') return save.gear.equipped[GEAR[item.id]?.slot] === item.id;
    return false;
  },
  quickEquip(save, item) {
    // 무기는 직업 1에 넣고, 방어구·장신구는 장착하거나 해제한다.
    if (item.kind === 'weapon') equipWeapon(save, item.uid, 0);
    else if (item.kind === 'gear') {
      if (this.isEquipped(save, item)) unequipGear(save, item.id);
      else equipGear(save, item.id);
    }
  },
  unequip(save, item) {
    if (item.kind === 'gear') unequipGear(save, item.id);
  },
  detailActions(host, box, save, item) {
    const equipped = this.isEquipped(save, item);
    const delta = powerDelta(save, item);
    if (delta !== 0) {
      const d = el('div', `eq-delta ${delta > 0 ? 'up' : 'down'}`, box);
      el('span', '', d, equipped ? '해제 시 전투력' : item.kind === 'weapon' ? '직업 1에 장착 시 전투력' : '장착 시 전투력');
      el('b', '', d, `${delta > 0 ? '▲' : '▼'} ${koNum(Math.abs(delta))}`);
    }
    const actions = el('div', 'v-actions', box);
    if (item.kind === 'weapon') {
      for (const i of [0, 1]) {
        button(actions, `직업 ${i + 1}에 장착`, i === 0 ? 'primary small' : 'small', save.equipped[i] !== item.uid, () => {
          equipWeapon(host.getSave(), item.uid, i);
          host.changed();
        });
      }
    } else if (item.kind === 'gear') {
      if (equipped)
        button(actions, '해제', 'small', true, () => {
          unequipGear(host.getSave(), item.id);
          host.changed();
        });
      else
        button(actions, '장착', 'primary small', true, () => {
          equipGear(host.getSave(), item.id);
          host.changed();
        });
    }
  },
  wornFor: (save) => save.gear.equipped,
};

// ───────── 그리기 ─────────

export function renderEquipPanel(host: PanelHost, save: SaveData): void {
  const root = el('div', 'eq', host.body);
  const left = el('div', 'eq-left', root);
  const right = el('div', 'eq-right', root);

  renderDoll(host, left, save);
  renderBagAndDetail(host, right, save, TOWN);

  renderStats(host, save);
}

/** 오른쪽 칸: 가방 표와 그 아래 상세 창 */
export function renderBagAndDetail(host: PanelHost, parent: HTMLElement, save: SaveData, ad: BagAdapter): void {
  const detail = el('div', 'eq-detail');
  renderBag(host, parent, save, detail, ad);
  parent.appendChild(detail);
  renderDetail(host, detail, save, ad.state.selected, ad);
}

export function slotCell(
  host: PanelHost,
  parent: HTMLElement,
  save: SaveData,
  label: string,
  item: DragItem | null,
  accepts: (it: DragItem) => boolean,
  drop: (it: DragItem) => void,
  ad: BagAdapter = TOWN,
): HTMLDivElement {
  const cell = el('div', `eq-slot${item ? '' : ' empty'}`, parent);
  cell.title = label;
  el('span', 'eq-slot-label', cell, label);
  const detail = (): HTMLElement | null => host.body.querySelector('.eq-detail');
  if (item) {
    const url = iconOf(save, item);
    iconImg(cell, url);
    gradeFrame(cell, save, item);
    draggable(cell, () => item, url);
    cell.addEventListener('click', () => select(host, item, cell, ad));
    cell.addEventListener('mouseenter', () => hover(host, detail(), item, ad));
    cell.addEventListener('mouseleave', () => hover(host, detail(), null, ad));
    // 마을 장비창의 장비 칸은 원래 더블클릭이 없다 (끌어내서 해제).
    if (ad !== TOWN)
      cell.addEventListener('dblclick', () => {
        ad.quickEquip(host.getSave(), item);
        host.changed();
      });
  }
  dropZone(cell, accepts, (it) => {
    drop(it);
    host.changed();
  });
  return cell;
}

/** 등급 색 테두리 */
export function gradeFrame(cell: HTMLElement, save: SaveData, item: DragItem): void {
  let grade: string | undefined;
  if (item.kind === 'weapon') grade = weaponOf(save, item.uid)?.def.grade;
  else if (item.kind === 'gear') grade = GEAR[item.id]?.grade;
  if (grade) cell.dataset.grade = grade;
  const enh = item.kind === 'weapon' ? (weaponOf(save, item.uid)?.enhance ?? 0) : item.kind === 'gear' ? (save.gear.enhance[item.id] ?? 0) : 0;
  if (enh > 0) el('span', 'eq-enh', cell, `+${enh}`);
  if (item.kind === 'gear' && GEAR[item.id]?.set) cell.classList.add('set');
}

function renderDoll(host: PanelHost, parent: HTMLElement, save: SaveData): void {
  const doll = el('div', 'eq-doll', parent);
  const gearCol = (slots: GearSlot[], cls: string): void => {
    const col = el('div', `eq-col ${cls}`, doll);
    for (const slot of slots) {
      const id = save.gear.equipped[slot];
      slotCell(
        host,
        col,
        save,
        GEAR_SLOT_NAME[slot],
        id ? { kind: 'gear', id, equipped: true } : null,
        (it) => it.kind === 'gear' && GEAR[it.id]?.slot === slot,
        (it) => it.kind === 'gear' && equipGear(host.getSave(), it.id),
      );
    }
  };
  gearCol(ARMOR_SLOTS, 'left');

  // 가운데: 직업 1의 캐릭터 그림
  const stage = el('div', 'eq-stage', doll);
  const main = weaponOf(save, save.equipped[0]);
  const pic = main ? host.portrait(main.def.type) : null;
  if (pic) {
    pic.className = 'eq-portrait';
    stage.appendChild(pic);
  }
  if (main) el('div', 'eq-class', stage, CLASS_NAME[main.def.type]);

  gearCol(ACC_SLOTS, 'right');

  const weapons = el('div', 'eq-weapons', parent);
  save.equipped.forEach((uid, i) => {
    slotCell(
      host,
      weapons,
      save,
      `직업 ${i + 1}`,
      { kind: 'weapon', uid, from: i },
      (it) => it.kind === 'weapon' && it.from !== i,
      (it) => it.kind === 'weapon' && equipWeapon(host.getSave(), it.uid, i),
    ).classList.add('weapon');
  });

  const power = el('div', 'eq-power', parent);
  el('span', 'eq-power-label', power, '전투력');
  el('span', 'eq-power-num', power, koNum(combatPower(save)));

  // 입고 있는 세트와 켜진 효과
  for (const pr of setProgress(save.gear.equipped, save.gear.enhance)) {
    const box = el('div', 'eq-setsum', parent);
    const head = el('div', 'eq-setsum-head', box);
    const name = el('span', 'eq-set-name', head, pr.set.name);
    name.style.color = GRADES[pr.set.grade].color;
    el('span', 'eq-set-count', head, `${pr.worn} / 4`);
    el('span', 'v-muted', head, `강화 합 +${pr.enhanceSum}`);
    // 같은 종류의 효과는 합쳐서 보여 준다.
    if (pr.active.length) el('div', 'eq-set-on', box, gearStatsText(sumStats(pr.active)));
    else el('div', 'v-muted', box, '2부위부터 세트 효과가 켜집니다');
  }
}

const GRADE_ORDER = Object.keys(GRADES) as Grade[];
const TYPE_ORDER: WeaponType[] = ['sword', 'dao', 'bow', 'gun', 'staff'];

/** 표의 한 칸에 들어가는 것: 가진 아이템, 또는 아직 없는 아이템의 그림자 */
type BagEntry = { item: DragItem } | { ghost: string; name: string };

interface BagTable {
  columns: string[];
  /** 위에서부터 등급 높은 순 */
  rows: { grade: Grade; cells: BagEntry[][] }[];
}

/** 가로는 종류(부위), 세로는 등급. 등급은 실제로 있는 것만 줄로 만든다. */
function makeTable<D extends { grade: Grade }>(columns: string[], defsFor: (col: number) => D[], entry: (def: D) => BagEntry): BagTable {
  const rows: BagTable['rows'] = [];
  for (const grade of [...GRADE_ORDER].reverse()) {
    const cells = columns.map((_, i) => defsFor(i).filter((d) => d.grade === grade).map(entry));
    if (cells.some((c) => c.length)) rows.push({ grade, cells });
  }
  return { columns, rows };
}

function weaponTable(save: SaveData): BagTable {
  const all = Object.values(WEAPONS);
  return makeTable(
    TYPE_ORDER.map((t) => WEAPON_TYPE_NAME[t]),
    (i) => all.filter((d) => d.type === TYPE_ORDER[i]),
    (def) => {
      const w = save.weapons.filter((o) => o.defId === def.id).sort((x, y) => y.enhance - x.enhance)[0];
      return w ? { item: { kind: 'weapon', uid: w.uid } } : { ghost: weaponIconUrl(def), name: def.name };
    },
  );
}

function gearTable(save: SaveData, slots: GearSlot[]): BagTable {
  const all = Object.values(GEAR);
  return makeTable(
    slots.map((sl) => GEAR_SLOT_NAME[sl]),
    (i) => all.filter((d) => d.slot === slots[i]),
    (def) => (save.gear.owned.includes(def.id) ? { item: { kind: 'gear', id: def.id } } : { ghost: gearIconUrl(def), name: def.name }),
  );
}

function bagTables(save: SaveData, filter: BagFilter): BagTable[] {
  switch (filter) {
    case 'weapon':
      return [weaponTable(save)];
    case 'armor':
      return [gearTable(save, ARMOR_SLOTS)];
    case 'acc':
      return [gearTable(save, ACC_SLOTS)];
    default:
      return [weaponTable(save), gearTable(save, [...ARMOR_SLOTS, ...ACC_SLOTS])];
  }
}

function renderBag(host: PanelHost, parent: HTMLElement, save: SaveData, detail: HTMLElement, ad: BagAdapter): void {
  const head = el('div', 'eq-bag-head', parent);
  el('span', 'eq-bag-title', head, '가방');
  const tabs = el('div', 'eq-bag-tabs', head);
  if (!ad.filters.includes(ad.state.filter)) ad.state.filter = ad.filters[0];
  for (const f of ad.filters) {
    const b = el('button', `eq-bag-tab${ad.state.filter === f ? ' active' : ''}`, tabs, FILTER_NAME[f]);
    b.addEventListener('click', () => {
      ad.state.filter = f;
      host.changed();
    });
  }

  const bag = el('div', 'eq-bag', parent);
  // 장착한 방어구·장신구를 가방으로 끌어내면 해제한다.
  dropZone(
    bag,
    (it) => it.kind === 'gear' && !!it.equipped,
    (it) => {
      ad.unequip(host.getSave(), it);
      host.changed();
    },
  );
  for (const table of bagTables(save, ad.state.filter)) {
    const grid = el('div', 'eq-table', bag);
    grid.style.gridTemplateColumns = `auto repeat(${table.columns.length}, minmax(0, 1fr))`;
    el('span', 'eq-th corner', grid);
    for (const c of table.columns) el('span', 'eq-th', grid, c);
    for (const row of table.rows) {
      const label = el('span', 'eq-th row', grid, GRADES[row.grade].name);
      label.style.color = GRADES[row.grade].color;
      for (const entries of row.cells) {
        const td = el('div', 'eq-td', grid);
        for (const e of entries) {
          if ('ghost' in e) {
            const cell = el('div', 'eq-cell ghost', td);
            iconImg(cell, e.ghost);
            cell.title = `미보유: ${e.name}`;
          } else bagCell(host, td, save, e.item, detail, ad);
        }
      }
    }
  }
}

function bagCell(host: PanelHost, parent: HTMLElement, save: SaveData, item: DragItem, detail: HTMLElement, ad: BagAdapter): void {
  const cell = el('div', 'eq-cell', parent);
  const url = iconOf(save, item);
  iconImg(cell, url);
  gradeFrame(cell, save, item);
  const on = ad.isEquipped(save, item);
  if (on) el('span', 'eq-on', cell, 'E');
  if (sameItem(item, ad.state.selected)) cell.classList.add('selected');
  draggable(cell, () => (item.kind === 'gear' && on ? { ...item, equipped: true } : item), url);
  cell.addEventListener('click', () => select(host, item, cell, ad));
  cell.addEventListener('mouseenter', () => hover(host, detail, item, ad));
  cell.addEventListener('mouseleave', () => hover(host, detail, null, ad));
  cell.addEventListener('dblclick', () => {
    ad.quickEquip(host.getSave(), item);
    host.changed();
  });
}

function sameItem(a: DragItem | null, b: DragItem | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'weapon' && b.kind === 'weapon') return a.uid === b.uid;
  if (a.kind === 'gear' && b.kind === 'gear') return a.id === b.id;
  return false;
}

/** 클릭으로 고른 아이템. 창을 통째로 다시 그리면 더블클릭이 끊기므로 표시만 바꾼다. */
function select(host: PanelHost, item: DragItem, cell: HTMLElement, ad: BagAdapter): void {
  ad.state.selected = item;
  for (const c of host.body.querySelectorAll('.eq-cell.selected')) c.classList.remove('selected');
  if (cell.classList.contains('eq-cell')) cell.classList.add('selected');
  const detail = host.body.querySelector<HTMLElement>('.eq-detail');
  if (detail) renderDetail(host, detail, host.getSave(), item, ad);
}

function hover(host: PanelHost, detail: HTMLElement | null, item: DragItem | null, ad: BagAdapter): void {
  if (detail) renderDetail(host, detail, host.getSave(), item ?? ad.state.selected, ad);
}

function renderDetail(host: PanelHost, box: HTMLElement, save: SaveData, item: DragItem | null, ad: BagAdapter): void {
  box.replaceChildren();
  if (!item || (item.kind === 'weapon' && !weaponOf(save, item.uid)) || (item.kind === 'gear' && !GEAR[item.id])) {
    el('p', 'eq-detail-empty', box, '아이템에 마우스를 올리거나 클릭하면 여기에 정보가 나옵니다. 아이콘을 장비 칸으로 끌어다 놓으면 장착합니다.');
    return;
  }
  const head = el('div', 'eq-detail-head', box);
  const icon = el('div', 'eq-slot', head);
  iconImg(icon, iconOf(save, item));
  gradeFrame(icon, save, item);
  const info = el('div', 'eq-detail-info', head);

  if (item.kind === 'weapon') {
    const w = weaponOf(save, item.uid)!;
    const name = el('div', 'eq-detail-name', info, `${w.def.name}${w.enhance > 0 ? ` +${w.enhance}` : ''}`);
    name.style.color = GRADES[w.def.grade].color;
    el('div', 'v-muted', info, `${GRADES[w.def.grade].name} ${WEAPON_TYPE_NAME[w.def.type]} · ${CLASS_NAME[w.def.type]}`);
    const meta = el('div', 'v-meta', box);
    el('span', '', meta, `공격력 ${w.def.attack}`);
    el('span', '', meta, w.def.type === 'gun' ? `치명타 보정 ${(w.def.critChance * 100).toFixed(0)}%` : `치명타 ${(w.def.critChance * 100).toFixed(0)}%`);
    if (w.def.magazine) el('span', '', meta, `탄창 ${w.def.magazine}발`);
    el('p', 'v-desc', box, w.def.desc);
  } else if (item.kind === 'gear') {
    const def: GearDef = GEAR[item.id];
    const enh = save.gear.enhance[def.id] ?? 0;
    const name = el('div', 'eq-detail-name', info, `${def.name}${enh > 0 ? ` +${enh}` : ''}`);
    name.style.color = GRADES[def.grade].color;
    el('div', 'v-muted', info, `${GRADES[def.grade].name} ${GEAR_SLOT_NAME[def.slot]}`);
    el('div', 'v-meta', box, gearStatsText(def.stats));
    if (def.set) setInfo(box, save, def.set, ad.wornFor(save, def.set));
  }
  ad.detailActions(host, box, save, item);
}

export function sumStats(list: GearStats[]): GearStats {
  const out: Record<string, number> = {};
  for (const st of list) for (const [k, v] of Object.entries(st)) out[k] = (out[k] ?? 0) + (v ?? 0);
  return out as GearStats;
}

/** 상세 창의 세트 정보: 부위별 착용 여부, 세트 효과, 강화 합 효과. 켜진 줄은 밝게 표시한다. */
function setInfo(box: HTMLElement, save: SaveData, setId: string, wornMap: Partial<Record<GearSlot, string>>): void {
  const set = SETS[setId];
  if (!set) return;
  const pr = setProgress(wornMap, save.gear.enhance).find((p) => p.set.id === setId);
  const worn = pr?.worn ?? 0;
  const sum = pr?.enhanceSum ?? 0;
  const wrap = el('div', 'eq-set', box);
  const head = el('div', 'eq-set-head', wrap);
  const name = el('span', 'eq-set-name', head, set.name);
  name.style.color = GRADES[set.grade].color;
  el('span', 'v-muted', head, `${GRADES[set.grade].name} ${SET_LINE_NAME[set.line]} 세트`);
  el('span', 'eq-set-count', head, `${worn} / 4`);

  const parts = el('div', 'eq-set-parts', wrap);
  for (const id of setPieces(setId)) {
    const on = Object.values(wornMap).includes(id);
    el('span', on ? 'on' : '', parts, GEAR[id]?.name ?? id);
  }
  for (const [n, st] of set.pieces) el('div', `eq-set-line${worn >= n ? ' on' : ''}`, wrap, `${n}세트 · ${gearStatsText(st)}`);
  el('div', 'eq-set-sub', wrap, `강화 합 +${sum} / ${set.enhance[set.enhance.length - 1][0]} (입은 세트 부위의 강화 수치 합)`);
  for (const [n, st] of set.enhance) el('div', `eq-set-line${sum >= n ? ' on' : ''}`, wrap, `강화 합 ${n} · ${gearStatsText(st)}`);
}

// ───────── 스탯 (마을 창의 캐릭터 탭에서 옮겨 왔다) ─────────

function renderStats(host: PanelHost, save: SaveData): void {
  const stats = totalStats(save);
  const d = derive(stats, save.passives, gearBonus(save.gear.equipped, save.gear.enhance), save.level);
  const cp = classPassiveBonus(baseStats(save), save.level);

  const s = host.section('스탯', `남은 포인트 ${save.statPoints}`);
  for (const info of STAT_INFO) {
    const row = el('div', 'v-stat-row', s);
    const left = el('div', 'v-stat-left', row);
    const name = el('div', 'v-stat-name', left);
    el('span', '', name, info.name);
    el('span', 'v-stat-val', name, String(stats[info.key]));
    const alloc = save.allocated[info.key];
    if (alloc > 0) el('span', 'v-muted', name, `(분배 +${alloc})`);
    const fromClass = info.key === 'hp' ? 0 : cp.add[info.key];
    if (fromClass > 0) el('span', 'v-cls', name, `(직업 패시브 +${fromClass})`);
    el('div', 'v-desc', left, info.desc);
    const btns = el('div', 'v-stat-btns', row);
    button(btns, '+1', 'small', save.statPoints >= 1, () => allocate(host, info.key, 1));
    button(btns, '+5', 'small', save.statPoints >= 5, () => allocate(host, info.key, 5));
    // 남은 포인트를 이 스탯에 한 번에 모두 넣는다.
    button(btns, save.statPoints > 0 ? `전부 +${save.statPoints}` : '전부', 'small', save.statPoints >= 1, () =>
      allocate(host, info.key, host.getSave().statPoints),
    );
  }
  el('p', 'v-muted v-note', s, '레벨이 오를 때마다 모든 기본 스탯이 1씩 자동으로 오르고, 스탯 포인트 5를 받습니다.');
  const cls = el('p', 'v-note v-cls-note', s);
  if (cp.tier > 0) cls.textContent = `직업 패시브 · ${cp.def.name} ${cp.tier}단계 — ${cp.def.desc(cp.rate)} 가장 높은 기본 스탯(${STAT_NAME[cp.def.stat]})으로 정해지고, 어떤 무기를 들어도 적용됩니다.`;
  else cls.textContent = `직업 패시브는 Lv ${CLASS_PASSIVE_TIERS[0][0]}에 열립니다. 가장 높은 기본 스탯에 맞는 계열 하나가 켜집니다.`;

  const ds = host.section('능력치');
  const grid = el('div', 'v-kv', ds);
  const kv = (k: string, v: string, note?: string): void => {
    el('span', 'v-kv-k', grid, k);
    const ve = el('span', 'v-kv-v', grid, v);
    if (note) el('span', 'v-muted', ve, `  ${note}`);
  };
  kv('최대 HP', koNum(d.maxHp));
  kv('최대 마나', koNum(d.maxMp), d.manaInt > stats.int ? `(마나용 마력 ${d.manaInt.toFixed(1)})` : undefined);
  kv('마나 회복', `초당 ${d.mpRegen.toFixed(2)}`);
  const bonus = Math.min(stats.dex * 0.005, DEX_SPEED_CAP);
  kv('이동속도', `${d.moveSpeed.toFixed(2)} m/s`, `(스탯 보너스 +${(bonus * 100).toFixed(1)}%, 최대 +${DEX_SPEED_CAP * 100}%)`);
  if (d.passive.speedMul > 0) kv('패시브 이동속도', `+${(d.passive.speedMul * 100).toFixed(0)}%`, '(상한 없음)');
  if (d.passive.critBonus > 0) kv('치명타 확률 보너스', `+${(d.passive.critBonus * 100).toFixed(0)}%`);
  if (d.gunCritDamage > 0) kv('총 숙련 (직업 패시브)', `치명타 피해 +${Math.round(d.gunCritDamage * 100)}% · 치명타 확률 +${(d.gunCritChance * 100).toFixed(1)}%`, '(총을 쓸 때만)');

  const rs = host.section('스탯 초기화', '분배한 포인트를 모두 돌려받습니다');
  const cost = resetCost(save.level);
  const a = save.allocated;
  const allocated = a.str + a.dex + a.int + a.hp;
  const confirming = host.isConfirming('statReset');
  const actions = el('div', 'v-actions', rs);
  button(
    actions,
    confirming ? `정말 초기화? (${koNum(cost)} 골드)` : `스탯 초기화 (${koNum(cost)} 골드)`,
    confirming ? 'danger' : '',
    allocated > 0 && save.gold >= cost,
    () => {
      if (host.confirm('statReset')) resetStats(host);
    },
  );
  if (allocated === 0) el('span', 'v-muted', actions, '분배한 포인트가 없습니다');
  else if (save.gold < cost) el('span', 'v-short', actions, '골드가 부족합니다');
}

function allocate(host: PanelHost, key: StatKey, n: number): void {
  const save = host.getSave();
  if (n <= 0 || save.statPoints < n) return;
  save.statPoints -= n;
  save.allocated[key] += n;
  host.changed();
}

function resetStats(host: PanelHost): void {
  const save = host.getSave();
  const cost = resetCost(save.level);
  if (save.gold < cost) return;
  const a = save.allocated;
  const total = a.str + a.dex + a.int + a.hp;
  save.gold -= cost;
  save.statPoints += total;
  save.allocated = { str: 0, dex: 0, int: 0, hp: 0 };
  host.changed();
  host.toast(`스탯을 초기화했습니다. 포인트 ${total} 반환`);
}
