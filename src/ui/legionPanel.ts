import type { SaveData } from '../core/save';
import { ARMOR_SLOTS, GEAR, GEAR_SLOT_NAME, gearStatsText, SET_LINE_NAME, SETS, setPieces, type SetLine } from '../data/gear';
import { MATERIALS } from '../data/items';
import {
  DIFFICULTY,
  HOPE_SHARD,
  LEGION_ORDER,
  LEGIONS,
  legionForLine,
  MODS,
  rewardMul,
  setEnhanceCost,
  setPiecePrice,
  type LegionDifficulty,
  type LegionId,
  type ModId,
} from '../data/legion';
import { GRADES, MAX_ENHANCE, WEAPON_TYPE_NAME, WEAPONS } from '../data/weapons';
import { weaponIconUrl } from '../game/weaponArt';
import { button, el, iconImg } from './dom';
import { draggable, dropZone } from './drag';
import type { PanelHost } from './equipPanel';
import { gearIconUrl } from './iconArt';

// 창을 다시 그려도 유지되는 선택
let boss: LegionId = 'knight';
let difficulty: LegionDifficulty = 'normal';
const mods = new Set<ModId>();
let shopLine: SetLine = 'melee';

const count = (save: SaveData, id: string): number => save.materials[id] ?? 0;

/** 군단장에 쓸 무기 2개. 고른 적이 없거나 맞지 않으면 그 계열에서 가장 센 무기로 채운다. */
export function legionLoadout(save: SaveData, id: LegionId): [string, string] | null {
  const allowed = LEGIONS[id].weapons;
  const ok = (uid: string): boolean => {
    const w = save.weapons.find((x) => x.uid === uid);
    return !!w && allowed.includes(WEAPONS[w.defId]?.type);
  };
  const cur = save.legion.loadout[id];
  if (cur && ok(cur[0]) && ok(cur[1])) return cur;
  const grades = Object.keys(GRADES);
  const best = save.weapons
    .filter((w) => ok(w.uid))
    .sort((a, b) => grades.indexOf(WEAPONS[b.defId].grade) - grades.indexOf(WEAPONS[a.defId].grade) || b.enhance - a.enhance);
  if (!best.length) return null;
  return [best[0].uid, (best[1] ?? best[0]).uid];
}

// ───────────────────────── 작전 지휘관: 군단장 선택 · 출격 ─────────────────────────

export function renderLegionPanel(host: PanelHost, save: SaveData): void {
  const cards = el('div', 'lg-bosses', host.body);
  for (const id of LEGION_ORDER) {
    const def = LEGIONS[id];
    const card = el('button', `lg-boss${id === boss ? ' active' : ''}${def.locked ? ' locked' : ''}`, cards);
    el('div', 'lg-boss-title', card, def.title);
    el('div', 'lg-boss-name', card, def.name);
    el('div', 'lg-boss-weapons', card, def.weapons.map((t) => WEAPON_TYPE_NAME[t]).join(' · '));
    const clears = save.legion.clears[id] ?? 0;
    el('div', 'lg-boss-sub', card, def.locked ? '준비 중' : clears ? `토벌 ${clears}회` : '미토벌');
    card.disabled = !!def.locked;
    card.addEventListener('click', () => {
      boss = id;
      host.changed();
    });
  }
  const def = LEGIONS[boss];

  const info = host.section(def.name, def.title);
  el('p', 'lg-gimmick', info, def.gimmick);

  // 난이도
  const diffRow = el('div', 'lg-diff', info);
  for (const d of ['normal', 'hard'] as LegionDifficulty[]) {
    const dd = DIFFICULTY[d];
    const b = el('button', `lg-diff-btn ${d}${d === difficulty ? ' active' : ''}`, diffRow);
    el('div', 'lg-diff-name', b, dd.name);
    el('div', 'lg-diff-sub', b, d === 'hard' ? `체력 ×${dd.hpMul} · 공격 ×${dd.dmgMul} · 희망의 조각` : '조각만 획득');
    b.addEventListener('click', () => {
      difficulty = d;
      host.changed();
    });
  }

  // 버프·디버프
  const ms = host.section('지원 효과', '고를수록 보상이 줄어듭니다');
  const grid = el('div', 'lg-mods', ms);
  for (const kind of ['buff', 'debuff'] as const) {
    const col = el('div', `lg-mod-col ${kind}`, grid);
    el('div', 'lg-mod-head', col, kind === 'buff' ? '나에게 (버프)' : '군단장에게 (디버프)');
    for (const m of MODS.filter((x) => x.kind === kind)) {
      const on = mods.has(m.id);
      const b = el('button', `lg-mod${on ? ' on' : ''}`, col);
      el('span', 'lg-mod-check', b, on ? '✔' : '');
      const t = el('span', 'lg-mod-text', b);
      el('b', '', t, m.name);
      el('span', '', t, m.desc);
      b.addEventListener('click', () => {
        if (on) mods.delete(m.id);
        else mods.add(m.id);
        host.changed();
      });
    }
  }

  // 보상 미리보기와 출격
  const run = host.section('출격');
  const picked = [...mods];
  const mul = rewardMul(picked);
  const dd = DIFFICULTY[difficulty];
  const lo = Math.max(1, Math.round(dd.shards[0] * mul));
  const hi = Math.max(1, Math.round(dd.shards[1] * mul));
  const rw = el('div', 'lg-reward', run);
  el('span', `lg-reward-mul${mul < 1 ? ' cut' : ''}`, rw, `보상 ${Math.round(mul * 100)}%`);
  el('span', '', rw, `${MATERIALS[def.shard].name} ${lo}~${hi}개`);
  if (dd.hopeChance > 0) el('span', 'lg-hope', rw, `희망의 조각 ${Math.round(dd.hopeChance * mul * 100)}%`);

  const loadout = legionLoadout(save, boss);
  const wrow = el('div', 'lg-loadout', run);
  el('span', 'v-muted', wrow, '무기');
  if (loadout) {
    for (const uid of new Set(loadout)) {
      const w = save.weapons.find((x) => x.uid === uid)!;
      const wd = WEAPONS[w.defId];
      const cell = el('div', 'eq-slot', wrow);
      cell.dataset.grade = wd.grade;
      iconImg(cell, weaponIconUrl(wd));
      if (w.enhance > 0) el('span', 'eq-enh', cell, `+${w.enhance}`);
      cell.title = wd.name;
    }
    el('span', 'v-muted', wrow, '무기고에서 바꿀 수 있습니다');
  } else el('span', 'v-short', wrow, `${def.weapons.map((t) => WEAPON_TYPE_NAME[t]).join('·')} 무기가 없습니다`);

  const actions = el('div', 'v-actions', run);
  button(actions, '출격', 'primary lg-go', !!loadout && !def.locked, () => {
    if (!loadout) return;
    host.startLegion?.({ id: boss, difficulty, mods: picked, weapons: loadout });
  });
}

// ───────────────────────── 무기고: 군단장마다 무기 2개 ─────────────────────────

export function renderArmoryPanel(host: PanelHost, save: SaveData): void {
  const tabs = el('div', 'sk-tabs lg-tabs', host.body);
  for (const id of LEGION_ORDER) {
    const b = el('button', `sk-tab${id === boss ? ' active' : ''}`, tabs, `${LEGIONS[id].name}`);
    b.addEventListener('click', () => {
      boss = id;
      host.changed();
    });
  }
  const def = LEGIONS[boss];
  const s = host.section('출격 무기', `${def.weapons.map((t) => WEAPON_TYPE_NAME[t]).join(' · ')}만 쓸 수 있습니다`);
  const loadout = legionLoadout(save, boss);
  const set = (i: number, uid: string): void => {
    const sv = host.getSave();
    const cur = legionLoadout(sv, boss) ?? [uid, uid];
    const next: [string, string] = [cur[0], cur[1]];
    // 다른 칸에 같은 무기가 있으면 맞바꾼다.
    if (next[1 - i] === uid) next[1 - i] = next[i];
    next[i] = uid;
    sv.legion.loadout[boss] = next;
    host.changed();
  };

  const slots = el('div', 'eq-weapons lg-slots', s);
  [0, 1].forEach((i) => {
    const uid = loadout?.[i];
    const w = uid ? save.weapons.find((x) => x.uid === uid) : undefined;
    const wd = w ? WEAPONS[w.defId] : undefined;
    const cell = el('div', `eq-slot weapon${wd ? '' : ' empty'}`, slots);
    el('span', 'eq-slot-label', cell, `무기 ${i + 1}`);
    if (wd && w) {
      cell.dataset.grade = wd.grade;
      iconImg(cell, weaponIconUrl(wd));
      if (w.enhance > 0) el('span', 'eq-enh', cell, `+${w.enhance}`);
      cell.title = wd.name;
    }
    dropZone(
      cell,
      (it) => it.kind === 'weapon',
      (it) => it.kind === 'weapon' && set(i, it.uid),
    );
  });

  const list = el('div', 'lg-armory', s);
  // 등급 높은 순, 같은 등급은 강화 높은 순
  const grades = Object.keys(GRADES);
  const usable = save.weapons
    .filter((w) => def.weapons.includes(WEAPONS[w.defId]?.type))
    .sort((a, b) => grades.indexOf(WEAPONS[b.defId].grade) - grades.indexOf(WEAPONS[a.defId].grade) || b.enhance - a.enhance);
  if (!usable.length) el('p', 'v-short', list, '이 군단장에게 쓸 수 있는 무기가 없습니다.');
  for (const w of usable) {
    const wd = WEAPONS[w.defId];
    const cell = el('div', 'eq-cell', list);
    cell.dataset.grade = wd.grade;
    const url = weaponIconUrl(wd);
    iconImg(cell, url);
    if (w.enhance > 0) el('span', 'eq-enh', cell, `+${w.enhance}`);
    if (loadout?.includes(w.uid)) el('span', 'eq-on', cell, 'E');
    cell.title = `${wd.name} — 끌어다 놓거나 더블클릭`;
    draggable(cell, () => ({ kind: 'weapon', uid: w.uid }), url);
    // 더블클릭: 빈 쪽(없으면 1번)에 넣는다.
    cell.addEventListener('dblclick', () => set(loadout && loadout[0] === loadout[1] ? 1 : 0, w.uid));
  }
  el('p', 'v-muted v-note', s, '무기를 칸으로 끌어다 놓으세요. 고른 무기는 이 군단장에게만 적용되고, 마을 장비는 바뀌지 않습니다.');
}

// ───────────────────────── 조각 상인: 세트 방어구 구매 · 강화 ─────────────────────────

export function renderShardPanel(host: PanelHost, save: SaveData): void {
  const tabs = el('div', 'sk-tabs lg-tabs', host.body);
  for (const line of ['melee', 'ranged', 'magic'] as SetLine[]) {
    const b = el('button', `sk-tab${line === shopLine ? ' active' : ''}`, tabs, `${SET_LINE_NAME[line]} 세트`);
    b.addEventListener('click', () => {
      shopLine = line;
      host.changed();
    });
  }
  const legion = legionForLine(shopLine);
  const shard = legion.shard;
  const wallet = el('div', 'lg-wallet', host.body);
  el('span', 'lg-shard', wallet, `${MATERIALS[shard].name} ${count(save, shard)}`);
  el('span', 'lg-shard hope', wallet, `${MATERIALS[HOPE_SHARD].name} ${count(save, HOPE_SHARD)}`);
  el('span', 'v-muted', wallet, `${legion.name}을(를) 토벌하면 얻습니다`);

  for (const set of Object.values(SETS).filter((x) => x.line === shopLine)) {
    const s = host.section(set.name, `${GRADES[set.grade].name} ${SET_LINE_NAME[set.line]} 세트`);
    const bonus = el('div', 'lg-setbonus', s);
    for (const [n, st] of set.pieces) el('span', '', bonus, `${n}세트 ${gearStatsText(st)}`);
    const row = el('div', 'lg-pieces', s);
    setPieces(set.id).forEach((id, i) => {
      const def = GEAR[id];
      const owned = save.gear.owned.includes(id);
      const enh = save.gear.enhance[id] ?? 0;
      const card = el('div', `lg-piece${owned ? ' owned' : ''}`, row);
      const icon = el('div', `eq-slot set${owned ? '' : ' unowned'}`, card);
      icon.dataset.grade = def.grade;
      iconImg(icon, gearIconUrl(def));
      if (enh > 0) el('span', 'eq-enh', icon, `+${enh}`);
      const name = el('div', 'lg-piece-name', card, def.name);
      name.style.color = GRADES[def.grade].color;
      el('div', 'v-muted', card, `${GEAR_SLOT_NAME[ARMOR_SLOTS[i]]} · ${gearStatsText(def.stats)}`);
      const act = el('div', 'lg-piece-act', card);
      if (!owned) {
        const price = setPiecePrice(def.grade, def.slot);
        const can = count(save, shard) >= price.shards && count(save, HOPE_SHARD) >= price.hope;
        const label = `구매 · 조각 ${price.shards}${price.hope ? ` + 희망 ${price.hope}` : ''}`;
        button(act, label, 'primary small', can, () => {
          const sv = host.getSave();
          if (count(sv, shard) < price.shards || count(sv, HOPE_SHARD) < price.hope) return;
          sv.materials[shard] -= price.shards;
          if (price.hope) sv.materials[HOPE_SHARD] -= price.hope;
          sv.gear.owned.push(id);
          host.changed();
          host.toast(`${def.name}을(를) 얻었습니다! 장비창(I)에서 장착하세요`);
        });
      } else if (enh >= MAX_ENHANCE) {
        el('span', 'v-muted', act, `+${MAX_ENHANCE} 최대`);
      } else {
        const cost = setEnhanceCost(def.grade, enh);
        button(act, `강화 +${enh + 1} · 조각 ${cost}`, 'small', count(save, shard) >= cost, () => {
          const sv = host.getSave();
          if (count(sv, shard) < cost) return;
          sv.materials[shard] -= cost;
          sv.gear.enhance[id] = enh + 1;
          host.changed();
          host.toast(`${def.name} +${enh + 1} 강화 성공!`);
        });
      }
    });
    el('p', 'v-muted v-note', s, '입은 세트 부위의 강화 수치 합이 10·20·30·40이 될 때마다 강화 합 효과가 켜집니다.');
  }
}
