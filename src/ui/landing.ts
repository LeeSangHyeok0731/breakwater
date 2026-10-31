import './landing.css';

/**
 * 첫 화면. 몬스터 떼가 파도처럼 밀려와 방파제 위의 주인공에게 부딪힌다.
 * 저해상도 캔버스에 게임 도트를 그대로 그려 정수 배로 키운다.
 * 시작하면 주인공이 파도를 베어 내고, 게임 준비가 끝나는 대로 마을로 들어간다.
 */

const BASE = `${import.meta.env.BASE_URL}assets2d/`;

interface SheetDef {
  file: string;
  w: number;
  h: number;
}

const GROUND: SheetDef[] = [
  { file: 'mobs/burning-ghoul.png', w: 57, h: 60 },
  { file: 'mobs/hell-beast-idle.png', w: 55, h: 67 },
  { file: 'mobs/hound-run.png', w: 67, h: 32 },
  { file: 'mobs/wolf-run.png', w: 56, h: 32 },
  { file: 'mobs/hell-cat.png', w: 96, h: 53 },
  { file: 'mobs/wizard.png', w: 81, h: 66 },
];
const FLYING: SheetDef[] = [
  { file: 'mobs/ghost-idle.png', w: 64, h: 80 },
  { file: 'mobs/ghost-lantern.png', w: 37, h: 65 },
  { file: 'mobs/skull.png', w: 54, h: 70 },
];
const HERO_IDLE: SheetDef = { file: 'hero/idle.png', w: 38, h: 48 };
const HERO_ATTACK: SheetDef = { file: 'hero/attack.png', w: 96, h: 48 };

/** 뒤쪽 줄일수록 바다색 그림자로 물든다. */
const DEPTH_TINT: [string, number][] = [
  ['#0f3236', 1],
  ['#175055', 0.82],
  ['#123a40', 0.42],
];

const SKY = ['#071a20', '#0b252b', '#0f3035', '#123a3e', '#19494d', '#256064'];
const SEA = '#0c2a2f';
const FOAM = '#d8fff0';
const MOON = '#d9f6e6';
const STONE = '#39474d';
const STONE_DARK = '#2f3d43';
const STONE_HI = '#62757a';
const STONE_LO = '#1b2529';
const GOLD = '#ffc95a';
const SLASH_MS = 520;
const LEAVE_MS = 660;

interface LoadedSheet {
  def: SheetDef;
  frames: number;
  /** 층별로 물들인 시트 */
  tinted: HTMLCanvasElement[];
}

interface Mob {
  sheet: LoadedSheet;
  x: number;
  y: number;
  layer: number;
  phase: number;
  scale: number;
}

interface Foam {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

function loadImage(file: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = BASE + file;
  });
}

function tintSheet(img: HTMLImageElement, color: string, amount: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = amount;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export class Landing {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly fill: HTMLDivElement;
  private readonly still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private W = 480;
  private H = 270;
  private ground: LoadedSheet[] = [];
  private flying: LoadedSheet[] = [];
  private idle: HTMLImageElement | null = null;
  private attack: HTMLImageElement | null = null;
  private mobs: Mob[] = [];
  private foam: Foam[] = [];
  private stones: HTMLCanvasElement | null = null;

  private raf = 0;
  private readonly startedAt = performance.now();
  private lastDraw = 0;
  private slashAt = 0;
  private slashDone = false;
  private leaving = false;
  private enterGame: (() => void) | null = null;

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    e.preventDefault();
    e.stopPropagation();
    this.begin();
  };
  private readonly onResize = (): void => this.layout();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'landing';
    this.root.innerHTML = `
      <canvas class="landing-scene" aria-hidden="true"></canvas>
      <div class="landing-flash"></div>
      <div class="landing-copy">
        <h1 class="landing-title">파도막이</h1>
        <p class="landing-tagline">밀려오는 몬스터를 막아 내는 도트 액션 RPG</p>
        <button class="landing-start" type="button">시작하기</button>
        <div class="landing-progress" role="progressbar" aria-label="게임 불러오는 중"><div class="landing-fill"></div></div>
        <p class="landing-note">키보드로 플레이합니다</p>
      </div>`;
    parent.appendChild(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.g = this.canvas.getContext('2d')!;
    this.fill = this.root.querySelector('.landing-fill')!;
    const button = this.root.querySelector('button')!;
    button.addEventListener('click', () => this.begin());
    button.focus({ preventScroll: true });
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.layout();
    void this.loadArt();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** 게임 로딩 진행률 (0~1) */
  setProgress(ratio: number): void {
    this.fill.style.width = `${Math.round(ratio * 100)}%`;
  }

  /** 게임 준비가 끝나면 부른다. enter는 시작 버튼을 누른 뒤에 실행된다. */
  ready(enter: () => void): void {
    this.enterGame = enter;
    this.tryLeave();
  }

  private async loadArt(): Promise<void> {
    const load = async (defs: SheetDef[]): Promise<LoadedSheet[]> => {
      const out = await Promise.all(
        defs.map(async (def) => {
          const img = await loadImage(def.file);
          if (!img) return null;
          return { def, frames: Math.max(1, Math.floor(img.width / def.w)), tinted: DEPTH_TINT.map(([c, a]) => tintSheet(img, c, a)) };
        }),
      );
      return out.filter((s): s is LoadedSheet => s !== null);
    };
    const [ground, flying, idle, attack] = await Promise.all([load(GROUND), load(FLYING), loadImage(HERO_IDLE.file), loadImage(HERO_ATTACK.file)]);
    this.ground = ground;
    this.flying = flying;
    this.idle = idle;
    this.attack = attack;
    this.buildWave();
  }

  /** 화면 크기에 맞춰 정수 배 저해상도 캔버스를 잡는다. */
  private layout(): void {
    const scale = Math.max(2, Math.round(window.innerHeight / 270));
    this.W = Math.ceil(window.innerWidth / scale);
    this.H = Math.ceil(window.innerHeight / scale);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.g.imageSmoothingEnabled = false;
    this.buildStones();
    this.buildWave();
  }

  private get floorY(): number {
    return Math.round(this.H * 0.86);
  }

  private get heroX(): number {
    return Math.round(this.W * (this.W < this.H ? 0.68 : 0.56));
  }

  private get crestX(): number {
    return this.heroX - 62;
  }

  /** x에서 파도 윗면의 높이 (바닥 기준). 마루까지 가파르게 솟는다. */
  private waveHeight(x: number): number {
    const k = Math.min(1, Math.max(0, x / this.crestX));
    return 18 + this.H * 0.64 * Math.pow(k, 1.7);
  }

  private buildWave(): void {
    this.mobs = [];
    if (!this.ground.length || !this.flying.length) return;
    const rnd = seeded(7);
    const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length) % a.length];
    const count = Math.round(this.crestX * 0.55) + 30;
    for (let i = 0; i < count; i++) {
      const x = rnd() * (this.crestX + 40) - 30;
      const up = Math.pow(rnd(), 0.8) * this.waveHeight(x) * 0.82;
      const high = up > this.H * 0.16;
      this.mobs.push({
        sheet: pick(high ? this.flying : this.ground),
        x,
        y: this.floorY - up,
        layer: rnd() < 0.55 ? 0 : rnd() < 0.75 ? 1 : 2,
        phase: rnd() * Math.PI * 2,
        scale: high ? 0.6 + rnd() * 0.25 : 0.8 + rnd() * 0.25,
      });
    }
    // 마루 끝: 앞으로 쏟아지는 유령들
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      this.mobs.push({
        sheet: pick(this.flying),
        x: this.crestX - 30 + t * 40,
        y: this.floorY - this.H * 0.56 + t * t * this.H * 0.2 + rnd() * 6,
        layer: 1 + (i % 2),
        phase: rnd() * Math.PI * 2,
        scale: 0.7,
      });
    }
    // 앞줄 바닥 몬스터
    const front = Math.max(4, Math.round(this.crestX / 46));
    for (let i = 0; i < front; i++) {
      this.mobs.push({ sheet: pick(this.ground), x: (i / front) * this.crestX + rnd() * 20, y: this.floorY + 2, layer: 2, phase: rnd() * 6, scale: 1 });
    }
    this.mobs.sort((a, b) => a.layer - b.layer);
  }

  /** 방파제 돌담은 한 번만 그려 둔다. */
  private buildStones(): void {
    const w = Math.max(1, this.W - this.heroX + 30);
    const h = Math.max(1, this.H - this.floorY + 6);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const rnd = seeded(11);
    for (let row = 0, y = 0; y < h; row++, y += 11) {
      for (let x = row % 2 ? -9 : 0; x < w; ) {
        const bw = 15 + Math.floor(rnd() * 12);
        g.fillStyle = STONE_LO;
        g.fillRect(x, y, bw, 11);
        g.fillStyle = rnd() < 0.3 ? STONE_DARK : STONE;
        g.fillRect(x + 1, y + 1, bw - 2, 9);
        g.fillStyle = STONE_HI;
        g.fillRect(x + 1, y + 1, bw - 2, 1);
        x += bw;
      }
    }
    this.stones = c;
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    this.draw(now);
  };

  private draw(now: number): void {
    const { g, W, H } = this;
    const t = this.still ? 0 : (now - this.startedAt) / 1000;
    const slash = this.slashAt ? Math.min(1, (now - this.slashAt) / SLASH_MS) : 0;
    const dt = this.lastDraw ? Math.min(0.05, (now - this.lastDraw) / 1000) : 0;
    this.lastDraw = now;

    this.drawSky();

    // 파도가 밀려왔다 물러난다. 베면 크게 밀려난다.
    const surge = Math.sin(t * 1.15) * 7;
    const pushed = (1 - Math.pow(1 - slash, 3)) * W * 0.55;

    this.drawWaveBody(surge - pushed);

    for (const m of this.mobs) {
      const d = m.sheet.def;
      const fi = this.still ? 0 : Math.floor(t * 9 + m.phase * 3) % m.sheet.frames;
      const sway = Math.sin(t * 1.7 + m.x * 0.03 + m.phase * 0.25);
      const lift = (m.x / Math.max(1, this.crestX)) * surge * 0.6;
      const dw = Math.round(d.w * m.scale);
      const dh = Math.round(d.h * m.scale);
      const x = Math.round(m.x + surge - pushed * (0.7 + m.layer * 0.2) + sway * 3);
      const y = Math.round(m.y + sway * 2 - lift - dh);
      g.save();
      g.translate(x + dw / 2, y);
      g.scale(-1, 1); // 원본은 왼쪽을 본다. 주인공 쪽으로 뒤집는다.
      g.drawImage(m.sheet.tinted[m.layer], fi * d.w, 0, d.w, d.h, -dw / 2, 0, dw, dh);
      g.restore();
    }

    // 바다
    g.fillStyle = SEA;
    g.fillRect(0, this.floorY, W, H - this.floorY);
    g.fillStyle = '#1b5a5c';
    for (let x = 0; x < W; x += 2) g.fillRect(x, this.floorY + Math.round(Math.sin(x * 0.09 + t * 2) * 1.5), 2, 2);

    this.drawWaveFoamLine(t, surge - pushed);
    this.drawFoam(dt, surge, pushed);

    if (this.stones) g.drawImage(this.stones, this.heroX - 26, this.floorY - 4);
    this.drawHero(t, slash);
    if (slash > 0 && slash < 1) this.drawCrescent(slash);
  }

  /** 파도 윗면과 말려 내려오는 마루 끝의 점들 (왼쪽에서 오른쪽으로) */
  private waveOutline(off: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let x = -60; x <= this.crestX; x += 6) pts.push([x + off, this.floorY - this.waveHeight(x)]);
    const cx = this.crestX + off;
    const top = this.floorY - this.waveHeight(this.crestX);
    // 앞으로 말린 입술
    for (let a = -1.25; a <= 1.3; a += 0.2) pts.push([cx + 10 + Math.cos(a) * 30, top + 26 + Math.sin(a) * 26]);
    return pts;
  }

  private drawWaveBody(off: number): void {
    const { g } = this;
    const fillWave = (color: string, shift: number, inset: number): void => {
      const pts = this.waveOutline(off + shift);
      const cx = this.crestX + off + shift;
      const top = this.floorY - this.waveHeight(this.crestX);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(-200, this.floorY + 4);
      for (const [x, y] of pts) g.lineTo(x, y + inset);
      // 입술 안쪽으로 파인 뒤 바닥까지 쏟아진다.
      g.lineTo(cx + 24, top + 38 + inset);
      g.lineTo(cx + 12, top + 30 + inset);
      g.lineTo(cx + 4, top + 44 + inset);
      g.lineTo(cx + 18, this.floorY - (this.floorY - top) * 0.35);
      g.lineTo(cx + 30, this.floorY + 4);
      g.closePath();
      g.fill();
    };
    fillWave('#2aa6a0', 0, 0);
    fillWave('#1a8086', -10, 9);
    fillWave('#126069', -24, 24);
    fillWave('#0d4852', -44, 46);
  }

  /** 파도 윗면을 따라 흐르는 흰 거품 띠 */
  private drawWaveFoamLine(t: number, off: number): void {
    const { g } = this;
    const pts = this.waveOutline(off);
    g.fillStyle = FOAM;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 2);
      // 마루에 가까울수록 굵다.
      const k = i / pts.length;
      for (let j = 0; j < n; j++) {
        const u = j / n;
        const x = ax + (bx - ax) * u;
        const y = ay + (by - ay) * u;
        const bump = Math.sin(x * 0.4 + t * 4) + Math.sin(x * 0.13 - t * 2);
        const thick = Math.max(2, Math.round(2 + k * k * 8 + bump * 1.4));
        g.globalAlpha = 1;
        g.fillRect(Math.round(x), Math.round(y) - 2, 2, thick);
        // 아래로 흩어지는 물보라
        if ((Math.round(x) >> 1) % 3 === 0) g.fillRect(Math.round(x), Math.round(y) + thick + 1, 1, 1);
      }
    }
    g.globalAlpha = 1;
  }

  private drawSky(): void {
    const { g, W, H } = this;
    const bandH = Math.ceil((this.floorY + 2) / SKY.length);
    SKY.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(0, i * bandH, W, bandH + 1);
      // 띠 경계는 망점으로 잇는다.
      g.fillStyle = SKY[i + 1] ?? c;
      for (let y = (i + 1) * bandH - 6; y < (i + 1) * bandH; y += 2) {
        for (let x = (y >> 1) % 2 ? 0 : 2; x < W; x += 4) g.fillRect(x, y, 1, 1);
      }
    });
    const mx = Math.round(W * 0.86);
    const my = Math.round(H * 0.68);
    g.fillStyle = MOON;
    g.globalAlpha = 0.08;
    g.beginPath();
    g.arc(mx, my, 34, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.75;
    g.beginPath();
    g.arc(mx, my, 17, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  private drawFoam(dt: number, surge: number, pushed: number): void {
    const { g } = this;
    const crest = this.crestX + 26 + surge - pushed;
    const crestY = this.floorY - this.H * 0.52;
    if (!this.still && !this.slashAt && this.foam.length < 90) {
      for (let i = 0; i < 2; i++) {
        const k = Math.random();
        this.foam.push({
          x: crest - 20 + k * 44,
          y: crestY + k * k * this.H * 0.32 + Math.random() * 10,
          vx: 22 + Math.random() * 34,
          vy: 20 + Math.random() * 42,
          life: 0.5 + Math.random() * 0.6,
        });
      }
    }
    g.fillStyle = FOAM;
    this.foam = this.foam.filter((f) => {
      f.life -= dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 90 * dt;
      if (f.life <= 0 || f.y > this.floorY) return false;
      g.globalAlpha = Math.min(1, f.life * 2);
      const s = f.life > 0.45 ? 2 : 1;
      g.fillRect(Math.round(f.x), Math.round(f.y), s, s);
      return true;
    });
    g.globalAlpha = 1;
  }

  private drawHero(t: number, slash: number): void {
    const { g } = this;
    const attacking = slash > 0 && this.attack !== null;
    const def = attacking ? HERO_ATTACK : HERO_IDLE;
    const img = attacking ? this.attack : this.idle;
    if (!img) return;
    const frames = Math.max(1, Math.floor(img.width / def.w));
    const fi = attacking ? Math.min(frames - 1, Math.floor(slash * frames)) : this.still ? 0 : Math.floor(t * 6) % frames;
    g.save();
    g.translate(this.heroX, this.floorY - 4 - def.h);
    g.scale(-1, 1); // 시트는 오른쪽을 본다. 파도가 있는 왼쪽으로 뒤집는다.
    g.drawImage(img, fi * def.w, 0, def.w, def.h, attacking ? -32 : -def.w / 2, 0, def.w, def.h);
    g.restore();
  }

  /** 시작하면 긋는 거대한 금빛 초승달 */
  private drawCrescent(k: number): void {
    const { g } = this;
    const cx = this.heroX;
    const cy = this.floorY - 30;
    const r = 40 + (1 - Math.pow(1 - k, 2)) * this.W * 0.42;
    const steps = 24;
    const edge = (w: number, i: number): void => {
      const a = Math.PI * 0.5 + (i / steps) * Math.PI;
      const pr = r + (w * Math.sin((i / steps) * Math.PI)) / 2;
      g.lineTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
    };
    const layer = (w: number, color: string, alpha: number): void => {
      g.fillStyle = color;
      g.globalAlpha = alpha * (1 - k);
      g.beginPath();
      for (let i = 0; i <= steps; i++) edge(w, i);
      for (let i = steps; i >= 0; i--) edge(-w, i);
      g.closePath();
      g.fill();
    };
    g.globalCompositeOperation = 'lighter';
    layer(46, '#ff8a1a', 0.6);
    layer(24, GOLD, 0.9);
    layer(8, '#fff6c0', 1);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  private begin(): void {
    if (this.slashAt) return;
    this.slashAt = performance.now();
    this.root.classList.add('started');
    // 탭이 가려져 그리기가 멈춰도 넘어가도록 타이머를 쓴다.
    window.setTimeout(
      () => {
        this.slashDone = true;
        this.tryLeave();
      },
      this.still ? 0 : SLASH_MS,
    );
  }

  private tryLeave(): void {
    if (!this.slashDone || !this.enterGame || this.leaving) return;
    this.leaving = true;
    this.enterGame();
    this.root.classList.add('leaving');
    window.setTimeout(() => this.destroy(), LEAVE_MS);
  }

  private destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}
