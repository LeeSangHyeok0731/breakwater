import type { SaveData } from '../core/save';
import { keyLabel } from '../core/input';
import { expToNext } from '../game/stats';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** 마을 HUD: 왼쪽 위 레벨·경험치, 오른쪽 위 골드, 아래 상호작용 안내 */
export class TownHud {
  private wrap: HTMLDivElement;
  private level: HTMLSpanElement;
  private expFill: HTMLDivElement;
  private expText: HTMLSpanElement;
  private gold: HTMLSpanElement;
  private tickets: HTMLSpanElement;
  private points: HTMLDivElement;
  private prompt: HTMLDivElement;
  private promptKey: HTMLSpanElement;
  private promptText: HTMLSpanElement;
  private hints: HTMLDivElement;
  private resume: HTMLDivElement;
  private resumeText: HTMLDivElement;
  private last = '';

  constructor(root: HTMLElement) {
    this.wrap = el('div', 'town-hud', root);

    const plate = el('div', 'th-plate', this.wrap);
    const badge = el('div', 'th-badge', plate);
    el('span', 'th-badge-lv', badge, 'LV');
    this.level = el('span', 'th-badge-num', badge);
    const info = el('div', 'th-info', plate);
    el('div', 'th-name', info, '모험가');
    const exp = el('div', 'th-exp', info);
    this.expFill = el('div', 'th-exp-fill', exp);
    this.expText = el('span', 'th-exp-text', info);
    this.points = el('div', 'th-points', this.wrap);

    const wallet = el('div', 'th-wallet', this.wrap);
    const g = el('div', 'th-coin-row', wallet);
    el('span', 'th-coin', g);
    this.gold = el('span', 'th-gold', g);
    const t = el('div', 'th-coin-row small', wallet);
    el('span', 'th-ticket', t);
    this.tickets = el('span', 'th-tickets', t);

    this.prompt = el('div', 'th-prompt', this.wrap);
    this.promptKey = el('span', 'th-key', this.prompt);
    this.promptText = el('span', 'th-prompt-text', this.prompt);

    this.hints = el('div', 'th-hints', this.wrap);

    this.resume = el('div', 'th-resume', this.wrap);
    this.resumeText = el('div', 'th-resume-text', this.resume, '클릭해서 시작');
    el('div', 'th-resume-sub', this.resume, '방향키로 이동하세요');
    this.resume.style.display = 'none';
  }

  show(): void {
    this.wrap.style.display = '';
  }

  hide(): void {
    this.wrap.style.display = 'none';
  }

  /** 클릭해서 계속하는 안내 */
  showResume(text: string, onClick: () => void): void {
    this.resumeText.textContent = text;
    this.resume.style.display = '';
    this.resume.onclick = (): void => onClick();
  }

  hideResume(): void {
    this.resume.style.display = 'none';
  }

  update(save: SaveData, prompt: string | null): void {
    const need = expToNext(save.level);
    const key = `${save.level}|${save.exp}|${save.gold}|${save.sweepTickets}|${save.statPoints}|${save.skillPoints}|${prompt}|${save.keymap.interact}`;
    if (key === this.last) return;
    this.last = key;
    this.level.textContent = String(save.level);
    this.expFill.style.width = `${Math.min(100, (save.exp / need) * 100).toFixed(1)}%`;
    this.expText.textContent = `${save.exp.toLocaleString('ko-KR')} / ${need.toLocaleString('ko-KR')}`;
    this.gold.textContent = save.gold.toLocaleString('ko-KR');
    this.tickets.textContent = `소탕권 ${save.sweepTickets}`;
    const pts: string[] = [];
    if (save.statPoints > 0) pts.push(`스탯 포인트 ${save.statPoints}`);
    if (save.skillPoints > 0) pts.push(`스킬 포인트 ${save.skillPoints}`);
    this.points.textContent = pts.length ? `${pts.join(' · ')} — 교관에게 가세요` : '';
    this.points.style.display = pts.length ? '' : 'none';

    if (prompt) {
      this.prompt.style.display = '';
      this.promptKey.textContent = keyLabel(save.keymap.interact);
      this.promptText.textContent = prompt;
    } else {
      this.prompt.style.display = 'none';
    }
    const k = (a: keyof SaveData['keymap']): string => keyLabel(save.keymap[a]);
    this.hints.replaceChildren();
    for (const [keys, label] of [
      [`${k('left')}${k('right')}`, '이동'],
      [k('jump'), '점프'],
      [k('interact'), '대화'],
      [k('menu'), '메뉴'],
    ]) {
      const row = el('span', 'th-hint', this.hints);
      el('span', 'th-key small', row, keys);
      el('span', '', row, label);
    }
  }

  destroy(): void {
    this.wrap.remove();
  }
}
