import type { SaveData } from '../core/save';
import { ARMOR_SLOTS, GEAR, GEAR_SLOT_NAME, gearStatsText, SET_LINE_NAME, setProgress, SETS, type SetLine } from '../data/gear';
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
import { button, el } from './dom';
import type { DragItem } from './drag';
import { renderBagAndDetail, slotCell, sumStats, type BagAdapter, type PanelHost } from './equipPanel';

/**
 * 마왕성 문: 마왕 레이드 출격 창. 마을 장비창과 같은 화면(장비 칸 · 가방 표 · 상세 창)으로
 * 무기 5칸과 방어구 세 벌을 고른다. 마을 장비는 바뀌지 않는다.
 */

// 창을 다시 그려도 유지되는 선택
let difficulty: RaidDifficulty = 'normal';

/** 레이드 장비를 고쳐 세이브에 넣는다 (다시 그리기는 부른 쪽이 한다). */
function edit(save: SaveData, fn: (lo: RaidLoadout) => void): void {
  const lo = raidLoadout(save);
  fn(lo);
  save.raid.loadout = lo;
}

const typeOf = (save: SaveData, uid: string): WeaponType | undefined => WEAPONS[save.weapons.find((w) => w.uid === uid)?.defId ?? '']?.type;

/** 방어구가 들어 있는 줄 */
function lineOf(lo: RaidLoadout, id: string): SetLine | undefined {
  return RAID_LINES.find((l) => ARMOR_SLOTS.some((s) => lo.armor[l][s] === id));
}

/** 방어구를 한 줄의 칸에 넣는다. 다른 칸에 있던 같은 방어구는 빠진다 (한 방어구는 한 칸에만). */
function putArmor(lo: RaidLoadout, line: SetLine, id: string): void {
  const slot = GEAR[id]?.slot;
  if (!slot || !ARMOR_SLOTS.includes(slot)) return;
  removeArmor(lo, id);
  lo.armor[line][slot] = id;
}

function removeArmor(lo: RaidLoadout, id: string): void {
  for (const l of RAID_LINES) for (const s of ARMOR_SLOTS) if (lo.armor[l][s] === id) lo.armor[l][s] = '';
}

/** 더블클릭 기본 줄: 세트 방어구는 그 계열 줄, 아니면 그 부위가 빈 첫 줄 (없으면 근접) */
function defaultLine(lo: RaidLoadout, id: string): SetLine {
  const def = GEAR[id];
  const setLine = def?.set ? SETS[def.set]?.line : undefined;
  return setLine ?? RAID_LINES.find((l) => !lo.armor[l][def.slot]) ?? 'melee';
}

const RAID: BagAdapter = {
  // 장신구는 마을 장착 그대로 쓰므로 가방에 무기·방어구만 보인다.
  filters: ['weapon', 'armor'],
  state: { filter: 'weapon', selected: null },
  isEquipped(save, item) {
    const lo = raidLoadout(save);
    if (item.kind === 'weapon') {
      const t = typeOf(save, item.uid);
      return !!t && lo.weapons[t] === item.uid;
    }
    if (item.kind === 'gear') return !!lineOf(lo, item.id);
    return false;
  },
  quickEquip(save, item) {
    edit(save, (lo) => {
      if (item.kind === 'weapon') {
        const t = typeOf(save, item.uid);
        if (t) lo.weapons[t] = lo.weapons[t] === item.uid ? '' : item.uid;
      } else if (item.kind === 'gear') {
        if (lineOf(lo, item.id)) removeArmor(lo, item.id);
        else putArmor(lo, defaultLine(lo, item.id), item.id);
      }
    });
  },
  unequip(save, item) {
    if (item.kind === 'gear') edit(save, (lo) => removeArmor(lo, item.id));
  },
  detailActions(host, box, save, item) {
    const lo = raidLoadout(save);
    const actions = el('div', 'v-actions', box);
    if (item.kind === 'weapon') {
      const t = typeOf(save, item.uid);
      if (!t) return;
      const on = lo.weapons[t] === item.uid;
      button(actions, on ? `${WEAPON_TYPE_NAME[t]} 칸에서 빼기` : `${WEAPON_TYPE_NAME[t]} 칸에 넣기`, on ? 'small' : 'primary small', true, () => {
        edit(host.getSave(), (l) => {
          l.weapons[t] = on ? '' : item.uid;
        });
        host.changed();
      });
    } else if (item.kind === 'gear') {
      const cur = lineOf(lo, item.id);
      for (const line of RAID_LINES) {
        button(actions, `${SET_LINE_NAME[line]} 줄에 장착`, line === defaultLine(lo, item.id) && !cur ? 'primary small' : 'small', cur !== line, () => {
          edit(host.getSave(), (l) => putArmor(l, line, item.id));
          host.changed();
        });
      }
      if (cur)
        button(actions, '해제', 'small', true, () => {
          edit(host.getSave(), (l) => removeArmor(l, item.id));
          host.changed();
        });
    }
  },
  wornFor(save, setId) {
    // 그 세트 부위를 가장 많이 넣은 줄 (없으면 세트 계열 줄)
    const lo = raidLoadout(save);
    const count = (l: SetLine): number => ARMOR_SLOTS.filter((s) => GEAR[lo.armor[l][s] ?? '']?.set === setId).length;
    const best = [...RAID_LINES].sort((a, b) => count(b) - count(a))[0];
    return lo.armor[count(best) > 0 ? best : (SETS[setId]?.line ?? 'melee')];
  },
};

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

  // ── 출격 장비: 마을 장비창과 같은 화면 (왼쪽 장비 칸, 오른쪽 가방·상세)
  const sec = host.section('출격 장비', '끌어다 놓거나 더블클릭 · 장착한 방어구를 가방으로 끌어내면 해제');
  const root = el('div', 'eq', sec);
  const left = el('div', 'eq-left', root);
  const right = el('div', 'eq-right', root);

  // 방어구 세 줄
  const doll = el('div', 'eq-doll raid-doll', left);
  for (const line of RAID_LINES) {
    el('span', 'raid-armor-line', doll, SET_LINE_NAME[line]);
    for (const slot of ARMOR_SLOTS) {
      const id = lo.armor[line][slot];
      const item: DragItem | null = id ? { kind: 'gear', id, equipped: true } : null;
      slotCell(
        host,
        doll,
        save,
        GEAR_SLOT_NAME[slot],
        item,
        (it) => it.kind === 'gear' && GEAR[it.id]?.slot === slot,
        (it) => it.kind === 'gear' && edit(host.getSave(), (l) => putArmor(l, line, it.id)),
        RAID,
      );
    }
  }

  // 무기 5칸 (Tab 순서)
  const weapons = el('div', 'eq-weapons raid-weapons', left);
  for (const type of RAID_WEAPON_ORDER) {
    const uid = lo.weapons[type];
    slotCell(
      host,
      weapons,
      save,
      WEAPON_TYPE_NAME[type],
      uid ? { kind: 'weapon', uid } : null,
      (it) => it.kind === 'weapon' && typeOf(save, it.uid) === type,
      (it) =>
        it.kind === 'weapon' &&
        edit(host.getSave(), (l) => {
          l.weapons[type] = it.uid;
        }),
      RAID,
    ).classList.add('weapon');
  }

  // 줄마다 켜진 세트 효과와 합친 효과
  for (const line of RAID_LINES) {
    for (const pr of setProgress(lo.armor[line], save.gear.enhance)) {
      const box = el('div', 'eq-setsum', left);
      const head = el('div', 'eq-setsum-head', box);
      el('span', 'raid-setsum-line', head, SET_LINE_NAME[line]);
      const name = el('span', 'eq-set-name', head, pr.set.name);
      name.style.color = GRADES[pr.set.grade].color;
      el('span', 'eq-set-count', head, `${pr.worn} / 4`);
      el('span', 'v-muted', head, `강화 합 +${pr.enhanceSum}`);
      if (pr.active.length) el('div', 'eq-set-on', box, gearStatsText(sumStats(pr.active)));
      else el('div', 'v-muted', box, '2부위부터 세트 효과가 켜집니다');
    }
  }
  el('p', 'v-muted raid-armor-total', left, `합친 장비 효과 (장신구 포함): ${gearStatsText(raidGearBonus(save, lo.armor)) || '없음'}`);

  renderBagAndDetail(host, right, save, RAID);

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
