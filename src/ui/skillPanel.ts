import { keyLabel, SLOT_ACTIONS } from '../core/input';
import { skillSlotIds, type SaveData } from '../core/save';
import { PASSIVES, type PassiveDef } from '../data/passives';
import { SKILL_BY_ID, SKILL_SLOTS, SKILL_TIER_NAME, skillsFor, STARTER_SKILLS, type SkillDef } from '../data/skills';
import { CLASS_NAME, WEAPON_TYPE_NAME, WEAPONS, type WeaponType } from '../data/weapons';
import { resetCost } from '../game/stats';
import { button, el, iconImg } from './dom';
import { draggable, dropZone } from './drag';
import type { PanelHost } from './equipPanel';
import { koNum } from './format';
import { passiveIconUrl, skillIconUrl } from './iconArt';

type Pick = { kind: 'skill'; id: string } | { kind: 'passive'; id: string };

// 창을 다시 그려도 유지되는 상태
let classTab: WeaponType | null = null;
let selected: Pick | null = null;

function equippedTypes(save: SaveData): WeaponType[] {
  const out: WeaponType[] = [];
  for (const uid of save.equipped) {
    const w = save.weapons.find((x) => x.uid === uid);
    const def = w ? WEAPONS[w.defId] : undefined;
    if (def && !out.includes(def.type)) out.push(def.type);
  }
  return out;
}

// ───────── 세이브 바꾸기 ─────────

/** 스킬 세트를 고친다. 처음 고칠 때 지금 슬롯 구성에서 시작한다. 빈칸은 ''로 저장해 자리를 지킨다. */
function editSet(save: SaveData, type: WeaponType, edit: (slots: (string | null)[]) => void): void {
  const ids = skillSlotIds(save, type);
  const slots: (string | null)[] = Array.from({ length: SKILL_SLOTS }, (_, i) => ids[i] || null);
  edit(slots);
  const out = slots.map((x) => x ?? '');
  while (out.length && !out[out.length - 1]) out.pop();
  save.skillSets[type] = out;
}

/** 세트에 들어 있는 스킬 수 (빈칸 제외) */
function filled(set: string[]): number {
  return set.filter(Boolean).length;
}

/** 스킬을 슬롯 i 에 놓는다. 이미 다른 칸에 있으면 두 칸을 맞바꾼다. */
function placeSkill(save: SaveData, type: WeaponType, id: string, i: number): void {
  editSet(save, type, (slots) => {
    const from = slots.indexOf(id);
    if (from >= 0) slots[from] = slots[i];
    slots[i] = id;
  });
}

function removeSkill(save: SaveData, type: WeaponType, id: string): void {
  editSet(save, type, (slots) => {
    const at = slots.indexOf(id);
    if (at >= 0) slots[at] = null;
  });
}

function addSkill(save: SaveData, type: WeaponType, id: string): void {
  editSet(save, type, (slots) => {
    const free = slots.indexOf(null);
    if (free >= 0 && !slots.includes(id)) slots[free] = id;
  });
}

function learn(save: SaveData, sk: SkillDef): boolean {
  if (save.skillPoints < 1 || save.level < sk.reqLevel || save.learnedSkills.includes(sk.id)) return false;
  save.skillPoints -= 1;
  save.learnedSkills.push(sk.id);
  // 직접 고른 세트가 있으면 빈자리에 새 스킬을 넣어 준다.
  if (save.skillSets[sk.weapon]) addSkill(save, sk.weapon, sk.id);
  return true;
}

function rankUp(save: SaveData, def: PassiveDef): boolean {
  const rank = save.passives[def.id] ?? 0;
  if (save.skillPoints < 1 || rank >= def.maxRank || save.level < def.reqLevel) return false;
  save.skillPoints -= 1;
  save.passives[def.id] = rank + 1;
  return true;
}

function passivePoints(save: SaveData): number {
  return Object.values(save.passives).reduce((a, b) => a + b, 0);
}

// ───────── 그리기 ─────────

export function renderSkillPanel(host: PanelHost, save: SaveData): void {
  const types = equippedTypes(save);
  if (!classTab || !types.includes(classTab)) classTab = types[0] ?? null;
  const type = classTab;
  if (!type) return;

  const root = el('div', 'sk', host.body);
  const top = el('div', 'sk-top', root);
  const tabs = el('div', 'sk-tabs', top);
  for (const t of types) {
    const b = el('button', `sk-tab${t === type ? ' active' : ''}`, tabs, `${CLASS_NAME[t]} · ${WEAPON_TYPE_NAME[t]}`);
    b.addEventListener('click', () => {
      classTab = t;
      host.changed();
    });
  }
  el('span', `sk-points${save.skillPoints > 0 ? ' hot' : ''}`, top, `스킬 포인트 ${save.skillPoints}`);

  const main = el('div', 'sk-main', root);
  const books = el('div', 'sk-books', main);
  const detail = el('div', 'sk-detail', main);
  const set = skillSlotIds(save, type);

  el('div', 'sk-book-title', books, '스킬북');
  const book = el('div', 'sk-grid', books);
  // 슬롯에서 스킬북으로 끌어내도 세트에서 빠진다.
  dropZone(
    book,
    (it) => it.kind === 'skill' && it.from !== undefined,
    (it) => {
      if (it.kind === 'skill') removeSkill(host.getSave(), type, it.id);
      host.changed();
    },
  );
  for (const sk of skillsFor(type)) {
    const learned = save.learnedSkills.includes(sk.id);
    const cell = iconCell(host, book, skillIconUrl(sk), { kind: 'skill', id: sk.id }, detail);
    cell.classList.add(learned ? 'learned' : 'unlearned');
    if (sk.tier) cell.classList.add(`tier${sk.tier}`);
    if (!learned && save.level < sk.reqLevel) el('span', 'sk-lock', cell, `Lv${sk.reqLevel}`);
    else if (!learned && save.skillPoints > 0) el('span', 'sk-can', cell, '+');
    const at = set.indexOf(sk.id);
    if (at >= 0) el('span', 'sk-key', cell, keyLabel(save.keymap[SLOT_ACTIONS[at]]));
    if (learned) draggable(cell, () => ({ kind: 'skill', id: sk.id }), skillIconUrl(sk));
  }

  el('div', 'sk-book-title', books, '공용 패시브');
  const pgrid = el('div', 'sk-grid', books);
  for (const def of PASSIVES) {
    const rank = save.passives[def.id] ?? 0;
    const cell = iconCell(host, pgrid, passiveIconUrl(def), { kind: 'passive', id: def.id }, detail);
    cell.classList.add(rank > 0 ? 'learned' : 'unlearned');
    const pips = el('span', 'sk-pips', cell);
    for (let i = 0; i < def.maxRank; i++) el('span', `sk-pip${i < rank ? ' on' : ''}`, pips);
    if (rank < def.maxRank && save.level < def.reqLevel) el('span', 'sk-lock', cell, `Lv${def.reqLevel}`);
  }

  renderDetail(host, detail, save, selected);
  renderBar(host, root, save, type, set);
  renderReset(host, save);
}

function iconCell(host: PanelHost, parent: HTMLElement, url: string, pick: Pick, detail: HTMLElement): HTMLDivElement {
  const cell = el('div', 'sk-cell', parent);
  iconImg(cell, url);
  if (selected && selected.kind === pick.kind && selected.id === pick.id) cell.classList.add('selected');
  cell.addEventListener('click', () => {
    selected = pick;
    for (const c of host.body.querySelectorAll('.sk-cell.selected')) c.classList.remove('selected');
    cell.classList.add('selected');
    renderDetail(host, detail, host.getSave(), pick);
  });
  cell.addEventListener('mouseenter', () => renderDetail(host, detail, host.getSave(), pick));
  cell.addEventListener('mouseleave', () => renderDetail(host, detail, host.getSave(), selected));
  cell.addEventListener('dblclick', () => {
    // 더블클릭: 배운 스킬은 세트에 넣거나 빼고, 안 배운 것은 배운다.
    const save = host.getSave();
    if (pick.kind === 'skill') {
      const sk = SKILL_BY_ID[pick.id];
      if (!sk) return;
      if (!save.learnedSkills.includes(sk.id)) learn(save, sk);
      else if (skillSlotIds(save, sk.weapon).includes(sk.id)) removeSkill(save, sk.weapon, sk.id);
      else addSkill(save, sk.weapon, sk.id);
    } else {
      const def = PASSIVES.find((p) => p.id === pick.id);
      if (def) rankUp(save, def);
    }
    host.changed();
  });
  return cell;
}

function renderDetail(host: PanelHost, box: HTMLElement, save: SaveData, pick: Pick | null): void {
  box.replaceChildren();
  if (!pick) {
    el('p', 'eq-detail-empty', box, '아이콘에 마우스를 올리면 설명이 나옵니다. 배운 스킬을 아래 슬롯으로 끌어다 놓으면 그 키에 들어갑니다.');
    return;
  }
  const head = el('div', 'eq-detail-head', box);
  const icon = el('div', 'sk-cell', head);
  const info = el('div', 'eq-detail-info', head);
  const actions = el('div', 'v-actions');

  if (pick.kind === 'skill') {
    const sk = SKILL_BY_ID[pick.id];
    if (!sk) return;
    iconImg(icon, skillIconUrl(sk));
    if (sk.tier) icon.classList.add(`tier${sk.tier}`);
    const learned = save.learnedSkills.includes(sk.id);
    el('div', 'eq-detail-name', info, sk.name);
    const sub = el('div', 'sk-sub', info);
    if (sk.tier) el('span', `v-badge tier${sk.tier}`, sub, SKILL_TIER_NAME[sk.tier]);
    el('span', 'v-muted', sub, learned ? '습득' : '미습득');
    const meta = el('div', 'v-meta', box);
    el('span', '', meta, `마나 ${sk.mana}`);
    el('span', '', meta, `쿨타임 ${sk.cooldown}초`);
    el('span', save.level < sk.reqLevel ? 'v-short' : '', meta, `요구 레벨 ${sk.reqLevel}`);
    el('p', 'v-desc', box, sk.desc);
    const set = skillSlotIds(save, sk.weapon);
    if (!learned) {
      button(actions, '배우기 (스킬 포인트 1)', 'primary small', save.skillPoints >= 1 && save.level >= sk.reqLevel, () => {
        learn(host.getSave(), sk);
        host.changed();
      });
      if (save.level < sk.reqLevel) el('span', 'v-muted', actions, `Lv ${sk.reqLevel}부터`);
    } else if (set.includes(sk.id)) {
      el('span', 'sk-key big', actions, keyLabel(save.keymap[SLOT_ACTIONS[set.indexOf(sk.id)]]));
      button(actions, '세트에서 빼기', 'small', true, () => {
        removeSkill(host.getSave(), sk.weapon, sk.id);
        host.changed();
      });
    } else {
      button(actions, '세트에 넣기', 'primary small', filled(set) < SKILL_SLOTS, () => {
        addSkill(host.getSave(), sk.weapon, sk.id);
        host.changed();
      });
      if (filled(set) >= SKILL_SLOTS) el('span', 'v-muted', actions, '슬롯이 가득 찼습니다');
    }
  } else {
    const def = PASSIVES.find((p) => p.id === pick.id);
    if (!def) return;
    iconImg(icon, passiveIconUrl(def));
    const rank = save.passives[def.id] ?? 0;
    el('div', 'eq-detail-name', info, def.name);
    el('div', 'v-muted', info, `공용 패시브 · ${rank} / ${def.maxRank}단계`);
    el('p', 'v-desc', box, def.desc);
    if (rank >= def.maxRank) el('span', 'v-muted', actions, '최대 단계');
    else {
      button(actions, rank === 0 ? '배우기 (스킬 포인트 1)' : '강화 (스킬 포인트 1)', 'primary small', save.skillPoints >= 1 && save.level >= def.reqLevel, () => {
        rankUp(host.getSave(), def);
        host.changed();
      });
      if (save.level < def.reqLevel) el('span', 'v-muted', actions, `Lv ${def.reqLevel}부터`);
    }
  }
  box.appendChild(actions);
}

/** 아래 슬롯바: 키 8칸. 배운 스킬을 놓으면 들어가고, 칸끼리 끌면 맞바꾼다. */
function renderBar(host: PanelHost, root: HTMLElement, save: SaveData, type: WeaponType, set: string[]): void {
  const bar = el('div', 'sk-bar', root);
  for (let i = 0; i < SKILL_SLOTS; i++) {
    const sk = set[i] ? SKILL_BY_ID[set[i]] : undefined;
    const slot = el('div', `sk-slot${sk ? '' : ' empty'}${sk?.tier ? ` tier${sk.tier}` : ''}`, bar);
    el('span', 'sk-slot-key', slot, keyLabel(save.keymap[SLOT_ACTIONS[i]]));
    if (sk) {
      const url = skillIconUrl(sk);
      iconImg(slot, url);
      slot.title = sk.name;
      draggable(slot, () => ({ kind: 'skill', id: sk.id, from: i }), url);
      slot.addEventListener('mouseenter', () => {
        const d = host.body.querySelector<HTMLElement>('.sk-detail');
        if (d) renderDetail(host, d, host.getSave(), { kind: 'skill', id: sk.id });
      });
    }
    dropZone(
      slot,
      (it) => it.kind === 'skill' && it.from !== i && SKILL_BY_ID[it.id]?.weapon === type && save.learnedSkills.includes(it.id),
      (it) => {
        if (it.kind === 'skill') placeSkill(host.getSave(), type, it.id, i);
        host.changed();
      },
    );
  }
  el('p', 'v-muted v-note', root, '배운 스킬을 슬롯으로 끌어다 놓으세요. 슬롯끼리 끌면 자리를 바꾸고, 스킬북으로 끌어내면 뺍니다. 더블클릭으로도 넣고 뺄 수 있습니다.');
}

function renderReset(host: PanelHost, save: SaveData): void {
  const rs = host.section('스킬 초기화', '기본 스킬을 제외한 스킬과 패시브의 포인트를 모두 돌려받습니다');
  const cost = resetCost(save.level);
  const refundable = save.learnedSkills.filter((id) => !STARTER_SKILLS.includes(id)).length + passivePoints(save);
  const confirming = host.isConfirming('skillReset');
  const actions = el('div', 'v-actions', rs);
  button(
    actions,
    confirming ? `정말 초기화? (${koNum(cost)} 골드)` : `스킬 초기화 (${koNum(cost)} 골드)`,
    confirming ? 'danger' : '',
    refundable > 0 && save.gold >= cost,
    () => {
      if (!host.confirm('skillReset')) return;
      const s = host.getSave();
      const keep = s.learnedSkills.filter((id) => STARTER_SKILLS.includes(id));
      const refund = s.learnedSkills.length - keep.length + passivePoints(s);
      s.gold -= cost;
      s.learnedSkills = keep;
      s.passives = {};
      s.skillPoints += refund;
      host.changed();
      host.toast(`스킬을 초기화했습니다. 스킬 포인트 ${refund} 반환`);
    },
  );
  if (refundable === 0) el('span', 'v-muted', actions, '초기화할 스킬이 없습니다');
  else if (save.gold < cost) el('span', 'v-short', actions, '골드가 부족합니다');
}
