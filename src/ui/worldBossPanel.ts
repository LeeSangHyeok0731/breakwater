import type { SaveData } from '../core/save';
import { MATERIALS } from '../data/items';
import { REWARD_TIERS, today, totalReward, WORLD_BOSS_BARS, WORLD_BOSS_DAILY, WORLD_BOSS_NAME, WORLD_BOSS_TIME, type Reward } from '../data/worldBoss';
import { button, el } from './dom';
import type { PanelHost } from './equipPanel';
import { koNum } from './format';

/** 날짜가 바뀌었으면 하루 횟수를 되돌린다. */
function refreshDay(save: SaveData): void {
  const d = today();
  if (save.worldBoss.day !== d) {
    save.worldBoss.day = d;
    save.worldBoss.used = 0;
  }
}

export function worldBossTriesLeft(save: SaveData): number {
  refreshDay(save);
  return Math.max(0, WORLD_BOSS_DAILY - save.worldBoss.used);
}

/** 오늘 횟수를 하나 쓴다 (도전·소탕). 남은 횟수가 없으면 false. */
export function useWorldBossTry(save: SaveData): boolean {
  if (worldBossTriesLeft(save) <= 0) return false;
  save.worldBoss.used++;
  return true;
}

/** 보상을 세이브에 넣는다. */
function grant(save: SaveData, r: Reward): void {
  save.gold += r.gold;
  save.sweepTickets += r.sweepTickets;
  for (const [id, n] of Object.entries(r.materials)) save.materials[id] = (save.materials[id] ?? 0) + n;
}

function rewardText(r: Reward): string {
  const parts = [`골드 ${koNum(r.gold)}`];
  for (const [id, n] of Object.entries(r.materials)) parts.push(`${MATERIALS[id]?.name ?? id} ${n}`);
  if (r.sweepTickets) parts.push(`소탕권 ${r.sweepTickets}`);
  return parts.join(' · ');
}

/** 마을 골렘 석상: 월드 보스 도전 · 소탕 · 보상표 */
export function renderWorldBossPanel(host: PanelHost, save: SaveData): void {
  const left = worldBossTriesLeft(save);
  const wb = save.worldBoss;
  const wrap = el('div', 'wb-panel', host.body);

  // 왼쪽: 석상 그림, 남은 횟수, 최고 기록, 버튼
  const art = el('div', 'wb-art', wrap);
  const pic = host.art?.('golem-statue');
  if (pic) art.appendChild(pic);
  const tries = el('div', 'wb-tries', art, '오늘 남은 횟수 ');
  for (let i = 0; i < WORLD_BOSS_DAILY; i++) el('span', `dot${i < WORLD_BOSS_DAILY - left ? ' used' : ''}`, tries);
  const best = el('div', 'wb-best', art);
  if (wb.bestBars > 0 || wb.bestDamage > 0) {
    best.innerHTML = '';
    el('div', '', best, '최고 기록');
    el('b', '', best, `${wb.bestBars}줄`);
    el('div', '', best, `총 피해 ${koNum(wb.bestDamage)}`);
  } else best.textContent = '아직 기록이 없습니다';
  const btns = el('div', 'wb-buttons', art);
  button(btns, `도전 (${WORLD_BOSS_TIME / 60}분)`, 'primary', left > 0, () => host.startWorldBoss?.());
  button(btns, wb.bestBars > 0 ? `소탕 (${wb.bestBars}줄 보상)` : '소탕 (기록 없음)', '', left > 0 && wb.bestBars > 0, () => {
    if (!useWorldBossTry(save)) return;
    const r = totalReward(wb.bestBars);
    grant(save, r);
    host.toast(`소탕 완료: ${rewardText(r)}`);
    host.changed();
  });

  // 오른쪽: 설명과 보상표
  const info = el('div', '', wrap);
  const how = host.section(WORLD_BOSS_NAME, `공격하지 않는 거대한 골렘을 ${WORLD_BOSS_TIME / 60}분 동안 때려 ${WORLD_BOSS_BARS}줄 체력바를 최대한 많이 깨세요.`);
  info.appendChild(how);
  el('div', 'wb-sum', how, '깬 줄마다 보상이 쌓이고, 뒤 줄일수록 한 줄 보상이 커집니다. 소탕은 최고 기록만큼 보상을 바로 받으며 하루 횟수를 함께 씁니다.');
  const tiers = host.section('줄별 보상', '이 줄부터 열리는 보상');
  info.appendChild(tiers);
  const list = el('div', 'wb-tiers', tiers);
  for (const t of REWARD_TIERS) {
    const row = el('div', `wb-tier${wb.bestBars >= t.from ? ' reached' : ''}`, list);
    el('span', 'from', row, `${t.from}줄~`);
    el('span', '', row, t.text);
  }
  if (wb.bestBars > 0) el('div', 'wb-sum', tiers, `최고 기록(${wb.bestBars}줄) 보상: ${rewardText(totalReward(wb.bestBars))}`);
}
