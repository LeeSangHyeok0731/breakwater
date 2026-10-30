import { DEFAULT_KEYMAP, keyLabel, type Keymap } from '../core/input';

export interface HudSlot {
  key: string;
  short: string;
  name: string;
  mana: number;
  cdLeft: number;
  /** 남은 쿨타임 비율 0..1 */
  cdRatio: number;
  /** 마나가 충분하고 쿨타임이 끝났는가 */
  usable: boolean;
  empty: boolean;
}

export interface HudState {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** 남은 흡수량 (0 = 없음) */
  shield: number;
  /** 남은 공격 차단 횟수 (0 = 없음) */
  wardHits: number;
  level: number;
  expRatio: number;
  weaponName: string;
  weaponGradeColor: string;
  otherWeaponName: string;
  swapKey: string;
  /** 항상 8개 */
  slots: HudSlot[];
  buffs: { name: string; time: number }[];
  /** 차징(스태프·도·활) 0..1, 차징 중이 아니면 -1 */
  charge: number;
  /** 총·활의 탄약/장전 상태 문구. 해당 없으면 null */
  ammo: string | null;
  /** 총 정조준 중 */
  ads: boolean;
  /** 남은 포션 (이번 페이즈에서 더 쓸 수 있는 수) */
  potions: { hp: number; mp: number; hpKey: string; mpKey: string };
  phaseName: string;
  waveText: string;
  gold: number;
  kills: number;
  boss: { name: string; hp: number; maxHp: number; phase2: boolean } | null;
  dodgeReady: boolean;
}

export interface BattleResultView {
  cleared: boolean;
  phaseName: string;
  gold: number;
  exp: number;
  materials: { name: string; count: number }[];
  kills: number;
  levelsGained: number;
}

const SLOT_COUNT = 8;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** 값이 바뀔 때만 DOM 을 건드린다. */
function setText(e: HTMLElement, s: string): void {
  if (e.textContent !== s) e.textContent = s;
}

function setStyle(e: HTMLElement, prop: 'width' | 'left' | 'transform' | 'display' | 'color', v: string): void {
  if (e.style[prop] !== v) e.style[prop] = v;
}

function setClass(e: HTMLElement, cls: string, on: boolean): void {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}

function pct(v: number): string {
  return `${(Math.max(0, Math.min(1, v)) * 100).toFixed(2)}%`;
}

function restartAnim(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}

function fmtCd(t: number): string {
  return t >= 10 ? String(Math.ceil(t)) : t.toFixed(1);
}

interface SlotEls {
  root: HTMLDivElement;
  key: HTMLSpanElement;
  short: HTMLSpanElement;
  mana: HTMLSpanElement;
  cdFill: HTMLDivElement;
  cdText: HTMLSpanElement;
}

interface BuffEls {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  time: HTMLSpanElement;
}

/** 전투 화면 HUD. update() 는 매 프레임 호출되므로 미리 만든 요소의 텍스트/스타일만 바꾼다. */
export class Hud {
  readonly layer: HTMLElement;

  private wrap: HTMLDivElement;
  private vignette: HTMLDivElement;

  private cross: HTMLDivElement;
  private ammoEl: HTMLDivElement;
  private chargeWrap: HTMLDivElement;
  private chargeFill: HTMLDivElement;

  private phaseName: HTMLDivElement;
  private waveText: HTMLDivElement;
  private bossWrap: HTMLDivElement;
  private bossName: HTMLSpanElement;
  private bossTag: HTMLSpanElement;
  private bossFill: HTMLDivElement;
  private bossLag: HTMLDivElement;
  private bossText: HTMLSpanElement;
  private bossLagRatio = 1;

  private goldText: HTMLSpanElement;
  private killText: HTMLSpanElement;

  private levelText: HTMLSpanElement;
  private expFill: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpLag: HTMLDivElement;
  private hpShield: HTMLDivElement;
  private hpText: HTMLSpanElement;
  private mpFill: HTMLDivElement;
  private mpText: HTMLSpanElement;
  private wardWrap: HTMLDivElement;
  private potionHp: HTMLSpanElement;
  private potionMp: HTMLSpanElement;
  private wardPips: HTMLSpanElement[] = [];
  private dodge: HTMLDivElement;
  private buffWrap: HTMLDivElement;
  private buffEls: BuffEls[] = [];
  private hpLagRatio = 1;

  private slots: SlotEls[] = [];
  private toastWrap: HTMLDivElement;

  private weaponPanel: HTMLDivElement;
  private weaponName: HTMLDivElement;
  private otherWeapon: HTMLSpanElement;
  private swapKey: HTMLSpanElement;

  private banner: HTMLDivElement;
  private modal: HTMLDivElement | null = null;
  private modalKind: 'pause' | 'result' | 'start' | null = null;
  private timers = new Set<number>();

  constructor(root: HTMLElement) {
    const w = el('div', 'hud', root);
    this.wrap = w;

    this.layer = el('div', 'hud-float-layer', w);
    this.vignette = el('div', 'hud-vignette', w);

    // 크로스헤어 + 차징 바
    this.cross = el('div', 'hud-crosshair', w);
    el('span', 'ch-dot', this.cross);
    for (const d of ['t', 'b', 'l', 'r']) el('span', `ch-line ch-${d}`, this.cross);
    this.chargeWrap = el('div', 'hud-charge', w);
    this.chargeFill = el('div', 'hud-charge-fill', this.chargeWrap);

    // 상단 중앙: 페이즈 / 웨이브 / 보스
    const top = el('div', 'hud-top', w);
    this.phaseName = el('div', 'hud-phase', top);
    this.waveText = el('div', 'hud-wave', top);
    this.bossWrap = el('div', 'hud-boss', top);
    const bossHead = el('div', 'hud-boss-head', this.bossWrap);
    this.bossName = el('span', 'hud-boss-name', bossHead);
    this.bossTag = el('span', 'hud-boss-tag', bossHead, '격노');
    this.bossText = el('span', 'hud-boss-num', bossHead);
    const bossBar = el('div', 'hud-bar hud-boss-bar', this.bossWrap);
    this.bossLag = el('div', 'hud-bar-lag', bossBar);
    this.bossFill = el('div', 'hud-bar-fill', bossBar);
    this.bossWrap.style.display = 'none';

    // 우상단: 골드 / 처치
    const tr = el('div', 'hud-topright hud-panel', w);
    const g = el('div', 'hud-stat-row', tr);
    el('span', 'hud-stat-label', g, '획득 골드');
    this.goldText = el('span', 'hud-stat-val hud-gold', g);
    const k = el('div', 'hud-stat-row', tr);
    el('span', 'hud-stat-label', k, '처치');
    this.killText = el('span', 'hud-stat-val', k);

    // 좌하단: 버프 / 레벨 / HP / MP
    const bl = el('div', 'hud-bottomleft', w);
    this.buffWrap = el('div', 'hud-buffs', bl);
    const vit = el('div', 'hud-vitals hud-panel', bl);
    const head = el('div', 'hud-vitals-head', vit);
    const lv = el('div', 'hud-level', head);
    el('span', 'hud-level-label', lv, 'Lv');
    this.levelText = el('span', 'hud-level-num', lv);
    const expBar = el('div', 'hud-exp', head);
    this.expFill = el('div', 'hud-exp-fill', expBar);
    this.wardWrap = el('div', 'hud-ward', head);
    this.dodge = el('div', 'hud-dodge', head, '구르기');

    const hpBar = el('div', 'hud-bar hud-hp', vit);
    this.hpLag = el('div', 'hud-bar-lag', hpBar);
    this.hpFill = el('div', 'hud-bar-fill', hpBar);
    this.hpShield = el('div', 'hud-bar-shield', hpBar);
    this.hpText = el('span', 'hud-bar-text', hpBar);
    const mpBar = el('div', 'hud-bar hud-mp', vit);
    this.mpFill = el('div', 'hud-bar-fill', mpBar);
    this.mpText = el('span', 'hud-bar-text', mpBar);
    const pots = el('div', 'hud-potions', vit);
    this.potionHp = el('span', 'hud-potion hp', pots);
    this.potionMp = el('span', 'hud-potion mp', pots);

    // 하단 중앙: 토스트 + 스킬 슬롯
    const bc = el('div', 'hud-bottomcenter', w);
    this.toastWrap = el('div', 'hud-toasts', bc);
    const slotRow = el('div', 'hud-slots', bc);
    for (let i = 0; i < SLOT_COUNT; i++) {
      const root = el('div', 'hud-slot', slotRow);
      const cdFill = el('div', 'hud-slot-cd', root);
      const key = el('span', 'hud-slot-key', root);
      const short = el('span', 'hud-slot-short', root);
      const mana = el('span', 'hud-slot-mana', root);
      const cdText = el('span', 'hud-slot-cdtext', root);
      this.slots.push({ root, key, short, mana, cdFill, cdText });
    }

    // 우하단: 직업 (무기)
    this.weaponPanel = el('div', 'hud-weapon hud-panel', w);
    el('div', 'hud-weapon-label', this.weaponPanel, '현재 직업');
    this.weaponName = el('div', 'hud-weapon-name', this.weaponPanel);
    const other = el('div', 'hud-weapon-other', this.weaponPanel);
    this.swapKey = el('span', 'hud-key', other);
    this.otherWeapon = el('span', 'hud-weapon-other-name', other);
    this.ammoEl = el('div', 'hud-weapon-ammo', this.weaponPanel);
    this.weaponPanel.insertBefore(this.ammoEl, other);

    this.banner = el('div', 'hud-banner', w);
  }

  show(): void {
    this.wrap.style.display = '';
  }

  hide(): void {
    this.wrap.style.display = 'none';
  }

  destroy(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    this.wrap.remove();
    this.modal = null;
    this.modalKind = null;
  }

  update(s: HudState): void {
    // 크로스헤어 차징
    if (s.charge >= 0) {
      setStyle(this.chargeWrap, 'display', '');
      setStyle(this.chargeFill, 'width', pct(s.charge));
      setClass(this.chargeWrap, 'full', s.charge >= 1);
    } else {
      setStyle(this.chargeWrap, 'display', 'none');
    }

    setText(this.phaseName, s.phaseName);
    setText(this.waveText, s.waveText);

    if (s.boss) {
      const b = s.boss;
      const r = b.maxHp > 0 ? b.hp / b.maxHp : 0;
      setStyle(this.bossWrap, 'display', '');
      setText(this.bossName, b.name);
      setStyle(this.bossTag, 'display', b.phase2 ? '' : 'none');
      setClass(this.bossWrap, 'enraged', b.phase2);
      setText(this.bossText, `${Math.ceil(Math.max(0, b.hp))} / ${Math.round(b.maxHp)}`);
      setStyle(this.bossFill, 'width', pct(r));
      this.bossLagRatio = r > this.bossLagRatio ? r : this.bossLagRatio + (r - this.bossLagRatio) * 0.06;
      setStyle(this.bossLag, 'width', pct(this.bossLagRatio));
    } else {
      setStyle(this.bossWrap, 'display', 'none');
      this.bossLagRatio = 1;
    }

    setText(this.goldText, String(Math.floor(s.gold)));
    setText(this.killText, String(s.kills));

    // HP: 보호막이 있으면 HP 바 뒤에 하늘색 구간으로 붙인다. 넘치면 전체 눈금을 늘린다.
    const total = Math.max(s.maxHp, s.hp + s.shield, 1);
    const hpR = Math.max(0, s.hp) / total;
    setStyle(this.hpFill, 'width', pct(hpR));
    this.hpLagRatio = hpR > this.hpLagRatio ? hpR : this.hpLagRatio + (hpR - this.hpLagRatio) * 0.08;
    setStyle(this.hpLag, 'width', pct(this.hpLagRatio));
    if (s.shield > 0) {
      setStyle(this.hpShield, 'display', '');
      setStyle(this.hpShield, 'left', pct(hpR));
      setStyle(this.hpShield, 'width', pct(s.shield / total));
    } else {
      setStyle(this.hpShield, 'display', 'none');
    }
    const hpStr = `${Math.ceil(Math.max(0, s.hp))} / ${Math.round(s.maxHp)}`;
    setText(this.hpText, s.shield > 0 ? `${hpStr}  (+${Math.ceil(s.shield)})` : hpStr);
    setClass(this.hpFill, 'low', s.hp / Math.max(1, s.maxHp) < 0.3);

    setStyle(this.mpFill, 'width', pct(s.maxMp > 0 ? s.mp / s.maxMp : 0));
    setText(this.mpText, `${Math.floor(Math.max(0, s.mp))} / ${Math.round(s.maxMp)}`);

    setText(this.levelText, String(s.level));
    setStyle(this.expFill, 'width', pct(s.expRatio));
    setClass(this.dodge, 'ready', s.dodgeReady);

    // 방어막 횟수 표시
    const pips = Math.max(0, Math.floor(s.wardHits));
    while (this.wardPips.length < pips) this.wardPips.push(el('span', 'hud-ward-pip', this.wardWrap));
    for (let i = 0; i < this.wardPips.length; i++) setStyle(this.wardPips[i], 'display', i < pips ? '' : 'none');

    // 버프
    while (this.buffEls.length < s.buffs.length) {
      const root = el('div', 'hud-buff', this.buffWrap);
      const name = el('span', 'hud-buff-name', root);
      const time = el('span', 'hud-buff-time', root);
      this.buffEls.push({ root, name, time });
    }
    for (let i = 0; i < this.buffEls.length; i++) {
      const b = this.buffEls[i];
      const buff = s.buffs[i];
      if (!buff) {
        setStyle(b.root, 'display', 'none');
        continue;
      }
      setStyle(b.root, 'display', '');
      setText(b.name, buff.name);
      setText(b.time, `${Math.ceil(buff.time)}초`);
      setClass(b.root, 'ending', buff.time < 3);
    }

    // 스킬 슬롯
    for (let i = 0; i < SLOT_COUNT; i++) {
      const e = this.slots[i];
      const slot = s.slots[i];
      if (!slot) continue;
      setText(e.key, slot.key);
      setClass(e.root, 'empty', slot.empty);
      if (slot.empty) {
        setText(e.short, '');
        setText(e.mana, '');
        setText(e.cdText, '');
        setStyle(e.cdFill, 'transform', 'scaleY(0)');
        setClass(e.root, 'unusable', false);
        setClass(e.root, 'cooling', false);
        if (e.root.title !== '') e.root.title = '';
        continue;
      }
      setText(e.short, slot.short);
      setText(e.mana, String(slot.mana));
      if (e.root.title !== slot.name) e.root.title = slot.name;
      const cooling = slot.cdLeft > 0;
      setClass(e.root, 'cooling', cooling);
      setClass(e.root, 'unusable', !slot.usable);
      setClass(e.root, 'nomana', !slot.usable && !cooling);
      setStyle(e.cdFill, 'transform', `scaleY(${cooling ? Math.max(0, Math.min(1, slot.cdRatio)).toFixed(3) : '0'})`);
      setText(e.cdText, cooling ? fmtCd(slot.cdLeft) : '');
    }

    // 무기
    setText(this.weaponName, s.weaponName);
    setStyle(this.weaponName, 'color', s.weaponGradeColor);
    setText(this.otherWeapon, s.otherWeaponName);
    setText(this.swapKey, s.swapKey);
    if (s.ammo) {
      setStyle(this.ammoEl, 'display', '');
      setText(this.ammoEl, s.ammo);
      setClass(this.ammoEl, 'busy', s.ammo.endsWith('...'));
    } else {
      setStyle(this.ammoEl, 'display', 'none');
    }
    setClass(this.cross, 'ads', s.ads);
    setText(this.potionHp, `${s.potions.hpKey} 체력 포션 ${s.potions.hp}`);
    setText(this.potionMp, `${s.potions.mpKey} 마나 포션 ${s.potions.mp}`);
    setClass(this.potionHp, 'empty', s.potions.hp <= 0);
    setClass(this.potionMp, 'empty', s.potions.mp <= 0);
  }

  notify(text: string, duration = 1.2): void {
    const t = el('div', 'hud-toast', this.toastWrap, text);
    t.style.animationDuration = `${duration}s`;
    while (this.toastWrap.children.length > 4) this.toastWrap.firstElementChild?.remove();
    this.later(() => t.remove(), duration * 1000);
  }

  announce(text: string, duration = 2): void {
    this.banner.textContent = text;
    this.banner.style.animationDuration = `${duration}s`;
    restartAnim(this.banner, 'show');
  }

  flashSlot(index: number): void {
    const s = this.slots[index];
    if (s) restartAnim(s.root, 'flash');
  }

  flashWeapon(): void {
    restartAnim(this.weaponPanel, 'flash');
  }

  hurt(): void {
    restartAnim(this.vignette, 'hit');
  }

  showPause(onResume: () => void, onGiveUp: () => void): void {
    const box = this.openModal('pause');
    el('h2', 'hud-modal-title', box, '일시정지');
    el('p', 'hud-modal-text', box, '포기하면 페이즈 실패로 처리되며, 이번 전투에서 얻은 골드·경험치·재료를 모두 잃습니다.');
    const btns = el('div', 'hud-modal-buttons', box);
    const resume = el('button', 'ui-btn primary', btns, '계속하기 (클릭)');
    const giveUp = el('button', 'ui-btn danger', btns, '포기하고 마을로');
    resume.addEventListener('click', () => {
      this.hidePause();
      onResume();
    });
    giveUp.addEventListener('click', () => {
      this.hidePause();
      onGiveUp();
    });
  }

  hidePause(): void {
    if (this.modalKind === 'pause') this.closeModal();
  }

  showResult(r: BattleResultView, onContinue: () => void): void {
    const box = this.openModal('result');
    box.classList.add(r.cleared ? 'cleared' : 'failed');
    el('div', 'hud-modal-sub', box, r.phaseName);
    el('h2', 'hud-modal-title', box, r.cleared ? '페이즈 클리어' : '페이즈 실패');

    const list = el('div', 'hud-result-list' + (r.cleared ? '' : ' lost'), box);
    const row = (label: string, value: string, cls = ''): void => {
      const e = el('div', 'hud-result-row ' + cls, list);
      el('span', 'hud-result-label', e, label);
      el('span', 'hud-result-val', e, value);
    };
    row('골드', `+${Math.floor(r.gold)}`, 'gold');
    row('경험치', `+${Math.floor(r.exp)}`);
    for (const m of r.materials) row(m.name, `x${m.count}`);
    const kills = el('div', 'hud-result-row', box);
    el('span', 'hud-result-label', kills, '처치한 몬스터');
    el('span', 'hud-result-val', kills, String(r.kills));

    if (r.cleared && r.levelsGained > 0) {
      el('div', 'hud-result-levelup', box, `레벨 업! (+${r.levelsGained})  스탯·스킬 포인트를 마을에서 분배하세요.`);
    }
    if (!r.cleared) {
      el('p', 'hud-modal-text warn', box, '페이즈에 실패하여 이번 전투의 보상을 모두 잃었습니다.');
    }
    const btns = el('div', 'hud-modal-buttons', box);
    const cont = el('button', 'ui-btn primary', btns, '마을로 돌아가기');
    cont.addEventListener('click', () => {
      this.closeModal();
      onContinue();
    });
  }

  /** keymap 을 넘기면 실제 지정된 키로 조작법을 보여준다. */
  showStartHint(onStart: () => void, keymap: Keymap = DEFAULT_KEYMAP): void {
    const box = this.openModal('start');
    box.classList.add('start');
    el('h2', 'hud-modal-title', box, '조작법');
    const k = (a: keyof Keymap): string => keyLabel(keymap[a]);
    const controls: [string, string][] = [
      ['이동', `${k('left')} ${k('right')}`],
      ['앉기 / 내려가기', `${k('down')} / ${k('down')} + ${k('jump')}`],
      ['점프', k('jump')],
      ['기본 공격', k('attack')],
      ['강화 공격', `${k('special')} (누르고 있다가 놓기)`],
      ['구르기', k('dodge')],
      ['가드 (근접)', `${k('guard')} 누르고 있기`],
      ['직업 교체', k('swap')],
      ['스킬', [k('slot1'), k('slot2'), k('slot3'), k('slot4'), k('slot5'), k('slot6'), k('slot7'), k('slot8')].join(' ')],
      ['일시정지', 'Esc'],
    ];
    const grid = el('div', 'hud-controls', box);
    for (const [label, key] of controls) {
      el('span', 'hud-controls-label', grid, label);
      el('span', 'hud-controls-key', grid, key);
    }
    this.modal?.addEventListener('click', () => {
      this.hideStartHint();
      onStart();
    });
  }

  hideStartHint(): void {
    if (this.modalKind === 'start') this.closeModal();
  }

  private openModal(kind: 'pause' | 'result' | 'start'): HTMLDivElement {
    this.closeModal();
    const m = el('div', 'hud-modal', this.wrap);
    this.modal = m;
    this.modalKind = kind;
    return el('div', 'hud-modal-box', m);
  }

  private closeModal(): void {
    this.modal?.remove();
    this.modal = null;
    this.modalKind = null;
  }

  private later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }
}
