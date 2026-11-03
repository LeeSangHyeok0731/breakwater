import type { SaveData } from '../core/save';
import { ARMOR_SLOTS, GEAR, GEAR_SLOT_NAME, gearStatsText, SET_LINE_NAME, SETS, type GearSlot, type SetLine } from '../data/gear';
import { MATERIALS } from '../data/items';
import {
  CRYSTAL_TIME,
  RAID_DIFFICULTY,
  RAID_ESSENCE,
  RAID_LINES,
  RAID_TIME,
  RAID_UNLOCK_PHASE,
  RAID_WEAPON_ORDER,
  raidGearBonus,
  raidLoadout,
  raidWeaponUids,
  SEAL_STAGES,
  type RaidDifficulty,
  type RaidLoadout,
} from '../data/raid';
import { GRADES, WEAPON_TYPE_NAME, WEAPONS, type WeaponType } from '../data/weapons';
import { weaponIconUrl } from '../game/weaponArt';
import { button, el, iconImg } from './dom';
import { draggable, dropZone } from './drag';
import type { PanelHost } from './equipPanel';
import { gearIconUrl } from './iconArt';

/** 마왕성 문: 마왕 레이드 출격 창. 무기 5칸과 방어구 세 벌을 고른다. 마을 장비는 바뀌지 않는다. */

// 창을 다시 그려도 유지되는 선택
let difficulty: RaidDifficulty = 'normal';

const gradeRank = (g: string): number => Object.keys(GRADES).indexOf(g);

/** 고친 장비를 세이브에 넣고 창을 다시 그린다. */
function commit(host: PanelHost, fn: (lo: RaidLoadout, sv: SaveData) => void): void {
  const sv = host.getSave();
  const lo = raidLoadout(sv);
  fn(lo, sv);
  sv.raid.loadout = lo;
  host.changed();
}

function setWeapon(host: PanelHost, type: WeaponType, uid: string): void {
  commit(host, (lo) => {
    lo.weapons[type] = uid;
  });
}

/** 방어구를 한 줄의 칸에 넣는다. 다른 칸에 있던 같은 방어구는 빠진다 (한 방어구는 한 칸에만). */
function setArmor(host: PanelHost, line: SetLine, slot: GearSlot, id: string): void {
  commit(host, (lo) => {
    for (const l of RAID_LINES) for (const s of ARMOR_SLOTS) if (lo.armor[l][s] === id) lo.armor[l][s] = '';
    lo.armor[line][slot] = id;
  });
}

export function renderRaidPanel(host: PanelHost, save: SaveData): void {
  if (!save.cleared.includes(RAID_UNLOCK_PHASE)) {
    const s = host.section('봉인된 문', '마왕성');
    el('p', 'lg-gimmick', s, '굳게 닫힌 마왕성의 문. 10-5에서 마왕 벨제로스를 쓰러뜨리면 열린다.');
    return;
  }
  const lo = raidLoadout(save);

  // ── 소개와 난이도
  const info = host.section('종언의 마왕 아스타로트', `마왕 레이드 · 토벌 ${save.raid.clears}회`);
  const seal = SEAL_STAGES.map((k) => `${Math.round(k * 100)}%`).join(' → ');
  el(
    'p',
    'lg-gimmick',
    info,
    `마왕이 힘·민첩·마력을 봉인한다 (${seal}). 페이즈마다 약점 무기가 바뀌니 Tab으로 무기를 돌려 쳐라. ` +
      `체력 75·50·25%에 봉인의 결정이 솟는다. 결정마다 정해진 무기로 ${CRYSTAL_TIME}초 안에 모두 깨면 봉인이 풀리고, 못 깨면 맵 절반에 심판이 내린다. 제한 시간 ${RAID_TIME / 60}분.`,
  );
  const diffRow = el('div', 'lg-diff', info);
  for (const d of ['normal', 'hard'] as RaidDifficulty[]) {
    const dd = RAID_DIFFICULTY[d];
    const b = el('button', `lg-diff-btn ${d}${d === difficulty ? ' active' : ''}`, diffRow);
    el('div', 'lg-diff-name', b, dd.name);
    el('div', 'lg-diff-sub', b, d === 'hard' ? `체력 ×${dd.hpMul} · 공격 ×${dd.dmgMul} · 패턴 빠름` : '기본');
    b.addEventListener('click', () => {
      difficulty = d;
      host.changed();
    });
  }

  // ── 무기 5칸
  const ws = host.section('무기', 'Tab으로 이 순서대로 돌아갑니다 · 칸을 더블클릭하면 비웁니다');
  const wslots = el('div', 'eq-weapons lg-slots raid-weapons', ws);
  for (const type of RAID_WEAPON_ORDER) {
    const uid = lo.weapons[type];
    const w = uid ? save.weapons.find((x) => x.uid === uid) : undefined;
    const wd = w ? WEAPONS[w.defId] : undefined;
    const cell = el('div', `eq-slot weapon${wd ? '' : ' empty'}`, wslots);
    el('span', 'eq-slot-label', cell, WEAPON_TYPE_NAME[type]);
    if (wd && w) {
      cell.dataset.grade = wd.grade;
      iconImg(cell, weaponIconUrl(wd));
      if (w.enhance > 0) el('span', 'eq-enh', cell, `+${w.enhance}`);
      cell.title = `${wd.name} — 더블클릭하면 비웁니다`;
      cell.addEventListener('dblclick', () => setWeapon(host, type, ''));
    }
    dropZone(
      cell,
      (it) => it.kind === 'weapon' && WEAPONS[save.weapons.find((x) => x.uid === it.uid)?.defId ?? '']?.type === type,
      (it) => it.kind === 'weapon' && setWeapon(host, type, it.uid),
    );
  }
  const wlist = el('div', 'lg-armory', ws);
  const weapons = [...save.weapons].sort(
    (a, b) =>
      RAID_WEAPON_ORDER.indexOf(WEAPONS[a.defId].type) - RAID_WEAPON_ORDER.indexOf(WEAPONS[b.defId].type) ||
      gradeRank(WEAPONS[b.defId].grade) - gradeRank(WEAPONS[a.defId].grade) ||
      b.enhance - a.enhance,
  );
  for (const w of weapons) {
    const wd = WEAPONS[w.defId];
    const cell = el('div', 'eq-cell', wlist);
    cell.dataset.grade = wd.grade;
    const url = weaponIconUrl(wd);
    iconImg(cell, url);
    if (w.enhance > 0) el('span', 'eq-enh', cell, `+${w.enhance}`);
    if (lo.weapons[wd.type] === w.uid) el('span', 'eq-on', cell, 'E');
    cell.title = `${wd.name} — 끌어다 놓거나 더블클릭`;
    draggable(cell, () => ({ kind: 'weapon', uid: w.uid }), url);
    cell.addEventListener('dblclick', () => setWeapon(host, wd.type, w.uid));
  }

  // ── 방어구 세 벌
  const as = host.section('방어구 세 벌', '세 줄의 세트 효과가 모두 켜집니다 · 칸을 더블클릭하면 비웁니다');
  for (const line of RAID_LINES) {
    const row = el('div', 'raid-armor-row', as);
    el('span', 'raid-armor-line', row, SET_LINE_NAME[line]);
    const slots = el('div', 'raid-armor-slots', row);
    for (const slot of ARMOR_SLOTS) {
      const id = lo.armor[line][slot];
      const def = id ? GEAR[id] : undefined;
      const cell = el('div', `eq-slot${def ? (def.set ? ' set' : '') : ' empty'}`, slots);
      el('span', 'eq-slot-label', cell, GEAR_SLOT_NAME[slot]);
      if (def && id) {
        cell.dataset.grade = def.grade;
        iconImg(cell, gearIconUrl(def));
        const enh = save.gear.enhance[id] ?? 0;
        if (enh > 0) el('span', 'eq-enh', cell, `+${enh}`);
        cell.title = `${def.name} · ${gearStatsText(def.stats)} — 더블클릭하면 비웁니다`;
        cell.addEventListener('dblclick', () =>
          commit(host, (l) => {
            l.armor[line][slot] = '';
          }),
        );
      }
      dropZone(
        cell,
        (it) => it.kind === 'gear' && GEAR[it.id]?.slot === slot,
        (it) => it.kind === 'gear' && setArmor(host, line, slot, it.id),
      );
    }
  }
  const total = raidGearBonus(save, lo.armor);
  el('p', 'v-muted raid-armor-total', as, `합친 장비 효과 (장신구 포함): ${gearStatsText(total) || '없음'}`);

  const alist = el('div', 'lg-armory', as);
  const armor = save.gear.owned
    .map((id) => GEAR[id])
    .filter((d) => d && ARMOR_SLOTS.includes(d.slot))
    .sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade) || ARMOR_SLOTS.indexOf(a.slot) - ARMOR_SLOTS.indexOf(b.slot));
  if (!armor.length) el('p', 'v-short', alist, '가진 방어구가 없습니다.');
  const worn = new Set(RAID_LINES.flatMap((l) => Object.values(lo.armor[l])));
  for (const def of armor) {
    const cell = el('div', 'eq-cell', alist);
    cell.dataset.grade = def.grade;
    const url = gearIconUrl(def);
    iconImg(cell, url);
    const enh = save.gear.enhance[def.id] ?? 0;
    if (enh > 0) el('span', 'eq-enh', cell, `+${enh}`);
    if (worn.has(def.id)) el('span', 'eq-on', cell, 'E');
    cell.title = `${def.name} · ${gearStatsText(def.stats)} — 끌어다 놓거나 더블클릭`;
    draggable(cell, () => ({ kind: 'gear', id: def.id }), url);
    // 더블클릭: 세트 방어구는 그 계열 줄, 아니면 그 부위가 빈 첫 줄 (없으면 근접)
    cell.addEventListener('dblclick', () => {
      const setLine = def.set ? SETS[def.set]?.line : undefined;
      const line = setLine ?? RAID_LINES.find((l) => !lo.armor[l][def.slot]) ?? 'melee';
      setArmor(host, line, def.slot, def.id);
    });
  }

  // ── 출격
  const run = host.section('출격');
  const uids = raidWeaponUids(lo);
  const dd = RAID_DIFFICULTY[difficulty];
  const rw = el('div', 'lg-reward', run);
  el('span', '', rw, `${MATERIALS[RAID_ESSENCE].name} ${dd.essence[0]}~${dd.essence[1]}개`);
  el('span', 'v-muted', rw, '신화 장비 보상은 준비 중입니다');
  const actions = el('div', 'v-actions', run);
  if (!uids.length) el('span', 'v-short', actions, '무기를 하나 이상 넣으세요');
  button(actions, `출격 · 무기 ${uids.length}자루`, 'primary lg-go', uids.length > 0, () => {
    const sv = host.getSave();
    const cur = raidLoadout(sv);
    sv.raid.loadout = cur;
    host.startRaid?.({ difficulty, weapons: raidWeaponUids(cur), armor: cur.armor });
  });
}
