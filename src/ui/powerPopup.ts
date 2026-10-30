import { koNum } from './format';

const SHOW_MS = 2200;
const COUNT_MS = 650;

/**
 * 전투력이 바뀌면 화면 위쪽 가운데에 "전투력 1만 2430 ▲ 520"을 띄운다.
 * 숫자는 이전 값에서 새 값으로 굴러 올라가고, 오르면 금빛, 내리면 붉은빛으로 반짝인다.
 */
export class PowerPopup {
  private wrap: HTMLDivElement;
  private num: HTMLSpanElement;
  private delta: HTMLSpanElement;
  private last: number | null = null;
  private hideTimer = 0;
  private raf = 0;

  constructor(root: HTMLElement) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'power-pop';
    const label = document.createElement('span');
    label.className = 'power-pop-label';
    label.textContent = '전투력';
    this.num = document.createElement('span');
    this.num.className = 'power-pop-num';
    this.delta = document.createElement('span');
    this.delta.className = 'power-pop-delta';
    this.wrap.append(label, this.num, this.delta);
    root.appendChild(this.wrap);
  }

  /** 처음 부르면 값만 기억한다. 그 뒤로는 값이 바뀔 때마다 띄운다. */
  check(power: number): void {
    const prev = this.last;
    this.last = power;
    if (prev === null || prev === power) return;
    this.show(prev, power);
  }

  private show(from: number, to: number): void {
    const up = to > from;
    this.delta.textContent = `${up ? '▲' : '▼'} ${koNum(Math.abs(to - from))}`;
    this.wrap.classList.toggle('down', !up);
    // 애니메이션을 처음부터 다시 돌린다.
    this.wrap.classList.remove('show');
    void this.wrap.offsetWidth;
    this.wrap.classList.add('show');

    cancelAnimationFrame(this.raf);
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const e = 1 - Math.pow(1 - t, 3);
      this.num.textContent = koNum(from + (to - from) * e);
      if (t < 1) this.raf = requestAnimationFrame(tick);
    };
    this.num.textContent = koNum(from);
    this.raf = requestAnimationFrame(tick);

    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.wrap.classList.remove('show');
      // 창이 가려져 rAF가 멈춰 있었더라도 최종 값은 맞춰 둔다.
      this.num.textContent = koNum(to);
    }, SHOW_MS);
  }
}
