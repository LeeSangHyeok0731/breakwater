import Phaser from 'phaser';
import { SLASH_ORIGIN, SLASH_R, slashKey, type Palette, type SlashStyle } from './fxArt';
import { mix, toneOf, vary } from './tone';

export type TextKind = 'normal' | 'crit' | 'player' | 'info' | 'heal' | 'quiet';

const TEXT_STYLE: Record<TextKind, { color: string; size: number }> = {
  normal: { color: '#ffffff', size: 11 },
  crit: { color: '#ffcf3a', size: 15 },
  player: { color: '#ff5a5a', size: 12 },
  info: { color: '#9fd8ff', size: 9 },
  heal: { color: '#7dff9a', size: 11 },
  quiet: { color: '#dddddd', size: 8 },
};

export const DEPTH = {
  bg: 0,
  deco: 10,
  platform: 15,
  monster: 20,
  player: 25,
  projectile: 30,
  fx: 40,
  text: 50,
};

export interface SlashOpts {
  /** 아래에서 위로 벤다 */
  up?: boolean;
  /** 시계 방향 회전 (라디안, 바라보는 쪽 기준) */
  rot?: number;
  /** 세로 배율 (1보다 작으면 납작) */
  squash?: number;
  /** 앞쪽으로 늘이는 가로 배율 (1보다 크면 길게 뻗는다) */
  stretch?: number;
  /** 재생 속도 배율 */
  speed?: number;
  /** 무기 기운에 따른 생김새 (불꽃 혀·번개 톱니·핏방울 등) */
  style?: SlashStyle;
}

/** 한꺼번에 떠 있을 수 있는 불티 수. 넘으면 새 불티는 생략한다 (수십 마리를 동시에 칠 때). */
const MAX_SPARKS = 260;

/** 타격감 연출: 데미지 숫자, 피격 번쩍임, 히트스톱, 파티클, 화면 흔들림, 스킬 이펙트 */
export class Fx {
  /** 남은 히트스톱 시간. 0보다 크면 게임 진행을 멈춘다. */
  hitstop = 0;
  /** 지금 날아다니는 불티 수 */
  private live = 0;

  constructor(private readonly scene: Phaser.Scene) {
    if (!scene.textures.exists('dot')) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('dot', 8, 8);
      g.destroy();
    }
  }

  text(x: number, y: number, text: string, kind: TextKind): void {
    const st = TEXT_STYLE[kind];
    const t = this.scene.add
      .text(x + Phaser.Math.Between(-6, 6), y, text, {
        fontFamily: '"Black Han Sans", "Malgun Gothic", sans-serif',
        fontSize: `${st.size}px`,
        color: st.color,
        stroke: '#1a0a0a',
        strokeThickness: 3,
        resolution: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.text);
    if (kind === 'crit') t.setScale(1.6);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.Out' });
    this.scene.tweens.add({
      targets: t,
      y: y - 26,
      alpha: 0,
      delay: kind === 'crit' ? 300 : 200,
      duration: 500,
      ease: 'Quad.In',
      onComplete: () => t.destroy(),
    });
  }

  /** 맞은 대상을 잠깐 하얗게 */
  flash(sprite: Phaser.GameObjects.Sprite, color = 0xffffff, ms = 70): void {
    sprite.setTintFill(color);
    this.scene.time.delayedCall(ms, () => {
      if (sprite.active) sprite.clearTint();
    });
  }

  /** 맞는 순간 아주 잠깐 멈춰서 타격이 묵직하게 느껴지게 한다. */
  stop(seconds: number): void {
    this.hitstop = Math.max(this.hitstop, seconds);
  }

  shake(intensity: number, ms = 120): void {
    this.scene.cameras.main.shake(ms, intensity * 0.006);
  }

  /** 사방으로 흩어지는 네모 픽셀. gravity를 주면 떨어진다. */
  burst(x: number, y: number, color: number, count = 8, speed = 90, life = 380, size = 1, gravity = 0): void {
    for (let i = 0; i < count; i++) {
      const p = this.scene.add.image(x, y, 'fx-px').setTint(vary(color, i)).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
      p.setScale(Math.max(1, Math.round((1 + Math.random() * 2) * size)));
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      const t = life / 1000;
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(a) * v * t,
        y: y + Math.sin(a) * v * t - 8 + 0.5 * gravity * t * t,
        alpha: 0,
        duration: life * (0.7 + Math.random() * 0.5),
        ease: gravity ? 'Quad.In' : 'Quad.Out',
        onComplete: () => p.destroy(),
      });
    }
  }

  /** 위로 피어오르는 불씨·기운 */
  embers(x: number, y: number, color: number, count = 6, spreadX = 14, rise = 40, life = 700): void {
    for (let i = 0; i < count; i++) {
      const p = this.scene.add
        .image(x + (Math.random() - 0.5) * 2 * spreadX, y + (Math.random() - 0.5) * 6, 'fx-px')
        .setTint(vary(color, i))
        .setDepth(DEPTH.fx)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(Math.random() < 0.3 ? 2 : 1);
      this.scene.tweens.add({
        targets: p,
        y: p.y - rise * (0.6 + Math.random() * 0.8),
        x: p.x + (Math.random() - 0.5) * 10,
        alpha: 0,
        duration: life * (0.6 + Math.random() * 0.6),
        delay: Math.random() * 120,
        onComplete: () => p.destroy(),
      });
    }
  }

  /**
   * 초승달 모양의 베기 잔상. (x, y)는 원의 중심이고, 기본은 위에서 아래로 앞쪽을 벤다.
   * wide: 크게 휘두르기. 나머지는 SlashOpts 참고.
   */
  slash(x: number, y: number, facing: 1 | -1, radius: number, color: number, wide = false, o: SlashOpts = {}): void {
    const key = slashKey(wide, o.style);
    const scale = radius / SLASH_R;
    // 잔상은 한 색이 아니라 칼끝 쪽은 밝게, 꼬리 쪽은 테두리 색으로 흐른다 (네 귀퉁이 색을 달리한다).
    const tone = toneOf(color);
    const make = (k: string, tint: number, grade: boolean): void => {
      const s = this.scene.add
        .sprite(x, y, k)
        .setDepth(DEPTH.fx)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setOrigin(facing === 1 ? SLASH_ORIGIN.x : 1 - SLASH_ORIGIN.x, SLASH_ORIGIN.y)
        .setFlipX(facing === -1)
        .setFlipY(!!o.up)
        .setScale(scale * (o.stretch ?? 1), scale * (o.squash ?? 1))
        .setRotation((o.rot ?? 0) * facing);
      if (grade) s.setTint(mix(tint, tone.alt, 0.45), tint, tint, tone.rim);
      else s.setTint(tint);
      s.play(k);
      if (o.speed) s.anims.timeScale = o.speed;
      s.once('animationcomplete', () => s.destroy());
    };
    make(key, color, true);
    // 하얀 날도 무기 색을 살짝 머금게 한다 (하양 60% + 무기 색 40%).
    make(`${key}-core`, mix(0xffffff, color, 0.4), false);
  }

  /** 베인 자국: 양 끝이 뾰족한 빛줄기가 쭉 그어졌다가 가늘어지며 사라진다. */
  cut(x: number, y: number, angle: number, length: number, color: number): void {
    for (const [tint, thick] of [
      [color, 1],
      [0xffffff, 0.45],
    ]) {
      const s = this.scene.add
        .image(x, y, 'fx-cut')
        .setTint(tint)
        .setDepth(DEPTH.fx + 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(angle)
        .setScale((length / 64) * 0.25, thick);
      this.scene.tweens.add({ targets: s, scaleX: length / 64, duration: 60, ease: 'Quad.Out' });
      this.scene.tweens.add({ targets: s, scaleY: 0, alpha: 0.3, delay: 70, duration: 150, ease: 'Quad.In', onComplete: () => s.destroy() });
    }
  }

  /**
   * 불티: 날아가는 방향으로 길쭉한 빛 조각이 튀었다가 떨어진다.
   * angle 쪽으로 ±spread 안에서 흩어진다 (spread가 π면 사방).
   */
  sparks(x: number, y: number, color: number, count = 5, angle = 0, spread = Math.PI, speed = 160, life = 280, gravity = 260): void {
    for (let i = 0; i < count; i++) {
      if (this.live >= MAX_SPARKS) return;
      const a = angle + (Math.random() - 0.5) * 2 * spread;
      const v = speed * (0.45 + Math.random() * 0.75);
      const vx = Math.cos(a) * v;
      const vy = Math.sin(a) * v;
      const len = 5 + Math.random() * 7;
      const T = (life * (0.6 + Math.random() * 0.7)) / 1000;
      const s = this.scene.add
        .image(x, y, 'fx-streak')
        .setOrigin(1, 0.5)
        .setTint(i % 3 === 0 ? 0xffffff : vary(color, i))
        .setDepth(DEPTH.fx)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(len / 32, 1)
        .setRotation(a);
      this.live++;
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: T * 1000,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 1;
          const t = k * T;
          // 처음에 확 튀고 점점 느려진다.
          const e = (1 - (1 - k) * (1 - k)) * T * 0.75;
          s.setPosition(x + vx * e, y + vy * e + 0.5 * gravity * t * t)
            .setRotation(Math.atan2(vy * (1 - k) + gravity * t, vx * (1 - k) + 0.001))
            .setScale((len / 32) * (1 - k * 0.7), 1)
            .setAlpha(1 - k * k);
        },
        onComplete: () => {
          s.destroy();
          this.live--;
        },
      });
    }
  }

  /** 터지는 고리 (도트). squash로 납작하게 세우면 활시위·총구 앞의 충격 고리가 된다. */
  pop(x: number, y: number, color: number, scale = 1, squash = 1, rot = 0): void {
    const s = this.scene.add
      .sprite(x, y, 'fx-pop')
      .setTint(color)
      .setDepth(DEPTH.fx)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(scale * squash, scale)
      .setRotation(rot);
    s.play('fx-pop');
    s.once('animationcomplete', () => s.destroy());
  }

  /** 작은 별 반짝임 */
  twinkle(x: number, y: number, color: number, delay = 0): void {
    const s = this.scene.add.sprite(x, y, 'fx-twinkle').setTint(color).setDepth(DEPTH.fx + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(delay <= 0);
    s.once('animationcomplete', () => s.destroy());
    if (delay <= 0) s.play('fx-twinkle');
    else
      this.scene.time.delayedCall(delay, () => {
        if (s.active) s.setVisible(true).play('fx-twinkle');
      });
  }

  /** 맞은 자리에서 터지는 여덟 갈래 빛 */
  spark(x: number, y: number, color: number, scale = 1, rot = 0): void {
    const s = this.scene.add
      .sprite(x, y, 'fx-spark')
      .setTint(color)
      .setDepth(DEPTH.fx + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(Math.max(1, Math.round(scale)))
      .setRotation(rot);
    s.play('fx-spark');
    s.once('animationcomplete', () => s.destroy());
  }

  /** 도트 폭발. radius는 대략 불덩이의 반지름 */
  boom(x: number, y: number, radius: number, palette: Palette = 'fire'): void {
    const k = `fx-boom-${palette}`;
    const s = this.scene.add.sprite(x, y, k).setDepth(DEPTH.fx).setScale(Math.max(1, radius / 20));
    s.play(k);
    s.once('animationcomplete', () => s.destroy());
  }

  /** 피어오르는 연기 */
  smoke(x: number, y: number, scale = 1, tint = 0x8a8078, drift = -18): void {
    const s = this.scene.add.sprite(x, y, 'fx-smoke').setTint(tint).setDepth(DEPTH.fx - 1).setScale(Math.max(1, Math.round(scale)));
    s.play('fx-smoke');
    this.scene.tweens.add({ targets: s, y: y + drift, x: x + (Math.random() - 0.5) * 8, duration: 420 });
    s.once('animationcomplete', () => s.destroy());
  }

  /** 마법진. vertical이면 세로로 세운다 (지팡이 끝·화살 앞). ms 뒤 저절로 사라진다. */
  circle(x: number, y: number, color: number, width: number, ms = 700, vertical = false, depth = DEPTH.fx - 1): Phaser.GameObjects.Sprite {
    const s = this.scene.add.sprite(x, y, 'fx-circle').setTint(color).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    const k = width / 64;
    s.setScale(k * 0.4).setAlpha(0);
    if (vertical) s.setRotation(Math.PI / 2);
    s.play('fx-circle');
    this.scene.tweens.add({ targets: s, scale: k, alpha: 1, duration: 140, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: s, alpha: 0, scale: k * 1.15, delay: Math.max(0, ms - 200), duration: 200, onComplete: () => s.destroy() });
    return s;
  }

  /** 발밑에서 솟는 빛기둥 (버프) */
  pillar(x: number, feetY: number, color: number, height = 96, ms = 650): void {
    const s = this.scene.add
      .sprite(x, feetY + 2, 'fx-pillar')
      .setOrigin(0.5, 1)
      .setTint(color)
      .setDepth(DEPTH.fx)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.3, height / 96);
    s.play('fx-pillar');
    // 테두리 색의 넓은 겹이 뒤에서 함께 솟는다.
    const back = this.scene.add
      .sprite(x, feetY + 2, 'fx-pillar')
      .setOrigin(0.5, 1)
      .setTint(toneOf(color).rim)
      .setDepth(DEPTH.fx - 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.7)
      .setFlipX(true)
      .setScale(0.4, (height / 96) * 0.92);
    back.play({ key: 'fx-pillar', startFrame: 1 });
    this.scene.tweens.add({ targets: back, scaleX: 1.9, duration: 160, ease: 'Quad.Out' });
    this.scene.tweens.add({ targets: back, scaleX: 0, alpha: 0, delay: ms - 220, duration: 220, onComplete: () => back.destroy() });
    this.scene.tweens.add({ targets: s, scaleX: 1.2, duration: 120, ease: 'Quad.Out' });
    this.scene.tweens.add({ targets: s, scaleX: 0, alpha: 0, delay: ms - 220, duration: 220, onComplete: () => s.destroy() });
  }

  /** 화면 전체가 번쩍인다. */
  flashScreen(color: number, alpha = 0.5, ms = 160): void {
    const cam = this.scene.cameras.main;
    const r = this.scene.add
      .rectangle(0, 0, cam.width, cam.height, color, alpha)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.text - 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
  }

  /** 배경을 어둡게 가라앉힌다 (몬스터·플레이어·이펙트는 그 위에 그대로). 궁극기 연출용 */
  dim(color: number, alpha: number, ms: number): void {
    const cam = this.scene.cameras.main;
    const r = this.scene.add
      .rectangle(0, 0, cam.width, cam.height, color, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.monster - 1);
    this.scene.tweens.add({ targets: r, fillAlpha: alpha, duration: 160 });
    this.scene.tweens.add({ targets: r, fillAlpha: 0, delay: Math.max(160, ms - 260), duration: 260, onComplete: () => r.destroy() });
  }

  /** 화면을 가로지르는 거대한 참격선: 넓은 빛 + 색 + 하얀 심이 펼쳐졌다 사라진다. */
  bigSlash(x1: number, y1: number, x2: number, y2: number, color: number, width = 10, ms = 380): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.fx + 1).setBlendMode(Phaser.BlendModes.ADD);
    const tone = toneOf(color);
    let t = 0;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    // 섬광 옆으로 갈라져 나가는 가는 곁가지 [시작 위치, 길이, 옆으로 벗어난 거리]
    const twigs = Array.from({ length: 6 }, (_, i) => ({ at: 0.1 + Math.random() * 0.6, len: 0.12 + Math.random() * 0.22, off: (Math.random() - 0.5) * width * 2.4, color: i % 3 === 0 ? 0xffffff : i % 3 === 1 ? tone.alt : tone.rim }));
    const draw = (): void => {
      // 처음 80ms 동안 한쪽 끝에서 반대쪽으로 그어 나간다.
      const k = Math.min(1, t / 80);
      const ex = x1 + (x2 - x1) * k;
      const ey = y1 + (y2 - y1) * k;
      // 가장 굵은 곳은 머리에서 조금 뒤. 양 끝은 뾰족하다.
      const mx = x1 + (ex - x1) * 0.7;
      const my = y1 + (ey - y1) * 0.7;
      g.clear();
      const blade = (w: number, c: number, a: number): void => {
        g.fillStyle(c, a);
        g.fillTriangle(x1, y1, mx - uy * w, my + ux * w, mx + uy * w, my - ux * w);
        g.fillTriangle(ex, ey, mx - uy * w, my + ux * w, mx + uy * w, my - ux * w);
      };
      blade(width * 1.7, tone.rim, 0.3);
      blade(width * 1.1, color, 0.35);
      blade(width * 0.6, mix(color, tone.alt, 0.3), 0.9);
      blade(Math.max(1, width / 5), 0xffffff, 1);
      for (const tw of twigs) {
        if (tw.at > k) continue;
        const sx = x1 + ux * len * tw.at - uy * tw.off;
        const sy = y1 + uy * len * tw.at + ux * tw.off;
        const l = Math.min(len * tw.len, len * (k - tw.at));
        g.lineStyle(1, tw.color, 0.85).lineBetween(sx, sy, sx + ux * l, sy + uy * l);
      }
    };
    draw();
    const ev = this.scene.time.addEvent({
      delay: 16,
      repeat: 6,
      callback: () => {
        t += 16;
        draw();
      },
    });
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      delay: 120,
      duration: ms,
      ease: 'Quad.In',
      onComplete: () => {
        ev.remove();
        g.destroy();
      },
    });
  }

  /** 지그재그 번개. 곁가지가 하나 갈라진다. */
  lightning(x1: number, y1: number, x2: number, y2: number, color: number, width = 2, ms = 160): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.fx + 1).setBlendMode(Phaser.BlendModes.ADD);
    const path = (ax: number, ay: number, bx: number, by: number, jag: number): Phaser.Math.Vector2[] => {
      const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) / 10));
      const nx = -(by - ay);
      const ny = bx - ax;
      const len = Math.hypot(nx, ny) || 1;
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const off = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 2 * jag;
        pts.push(new Phaser.Math.Vector2(ax + (bx - ax) * t + (nx / len) * off, ay + (by - ay) * t + (ny / len) * off));
      }
      return pts;
    };
    const rim = toneOf(color).rim;
    const draw = (pts: Phaser.Math.Vector2[], w: number): void => {
      g.lineStyle(w + 4, rim, 0.4).strokePoints(pts);
      g.lineStyle(w, color, 1).strokePoints(pts);
      g.lineStyle(1, 0xffffff, 1).strokePoints(pts);
    };
    const main = path(x1, y1, x2, y2, 7);
    draw(main, width);
    const from = main[Math.floor(main.length / 2)];
    draw(path(from.x, from.y, from.x + (Math.random() - 0.5) * 40, from.y + Math.random() * 30, 5), Math.max(1, width - 1));
    this.scene.tweens.add({ targets: g, alpha: 0, duration: ms, ease: 'Quad.In', onComplete: () => g.destroy() });
  }

  /** 빛나는 꼬리 선. (x, y)가 머리이고 angle 방향을 향한다. ms가 0이면 사라지지 않는다. */
  streak(x: number, y: number, angle: number, length: number, color: number, ms = 160, thick = 1): Phaser.GameObjects.Image {
    const s = this.scene.add
      .image(x, y, 'fx-streak')
      .setOrigin(1, 0.5)
      .setTint(color)
      .setDepth(DEPTH.fx)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(angle)
      .setScale(length / 32, thick);
    if (ms > 0) this.scene.tweens.add({ targets: s, alpha: 0, scaleY: 0, duration: ms, onComplete: () => s.destroy() });
    return s;
  }

  /** 총알 궤적: 넓은 빛 + 하얀 심 */
  tracer(x1: number, y1: number, x2: number, y2: number, color: number, width: number, ms = 110): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(width + 3, toneOf(color).rim, 0.35).lineBetween(x1, y1, x2, y2);
    g.lineStyle(width, color, 0.9).lineBetween(x1, y1, x2, y2);
    g.lineStyle(Math.max(1, width - 2), 0xffffff, 1).lineBetween(x1, y1, x2, y2);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: ms, onComplete: () => g.destroy() });
  }

  /**
   * 날아가는 총알의 빛: 총구 쪽은 뾰족하고 맞은 쪽이 굵은 쐐기. 꼬리가 머리를 따라잡으며 사라진다.
   */
  shot(x1: number, y1: number, x2: number, y2: number, color: number, width: number, ms = 110): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const rim = toneOf(color).rim;
    const draw = (k: number): void => {
      g.clear();
      const s = Math.pow(k, 0.6) * 0.92;
      const sx = x1 + dx * s;
      const sy = y1 + dy * s;
      const a = 1 - k * k;
      const wedge = (w: number, c: number, alpha: number): void => {
        g.fillStyle(c, alpha * a).fillTriangle(sx, sy, x2 + nx * w, y2 + ny * w, x2 - nx * w, y2 - ny * w);
      };
      wedge(width * 1.6 + 1.5, rim, 0.35);
      wedge(width * 0.8 + 0.5, color, 0.9);
      wedge(Math.max(0.6, width * 0.3), 0xffffff, 1);
    };
    draw(0);
    this.scene.tweens.addCounter({ from: 0, to: 1, duration: ms, onUpdate: (tw) => draw(tw.getValue() ?? 1), onComplete: () => g.destroy() });
  }

  /** 총구 화염. tint를 주면 그 색으로 물든다 (비전 소총의 보랏빛 등). */
  muzzle(x: number, y: number, facing: 1 | -1, scale = 1, rot = 0, tint?: number): void {
    const s = this.scene.add
      .sprite(x, y, 'fx-muzzle')
      .setFlipX(facing === -1)
      .setOrigin(facing === 1 ? 0.05 : 0.95, 0.5)
      .setDepth(DEPTH.fx)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(Math.max(1, Math.round(scale)))
      .setRotation(rot * facing);
    if (tint !== undefined) s.setTint(tint);
    s.play('fx-muzzle');
    s.once('animationcomplete', () => s.destroy());
  }

  /** 튕겨 나가는 탄피 */
  casing(x: number, y: number, facing: 1 | -1, floorY: number): void {
    const c = this.scene.add.image(x, y, 'fx-casing').setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: c, x: x - facing * (20 + Math.random() * 20), duration: 500 });
    this.scene.tweens.add({
      targets: c,
      y: y - 12,
      duration: 150,
      ease: 'Quad.Out',
      onComplete: () => this.scene.tweens.add({ targets: c, y: floorY - 1, duration: 280, ease: 'Bounce.Out' }),
    });
    this.scene.tweens.add({ targets: c, angle: 720 * -facing, duration: 430 });
    this.scene.tweens.add({ targets: c, alpha: 0, delay: 700, duration: 300, onComplete: () => c.destroy() });
  }

  /** 땅에서 솟는 얼음 가시. holdMs 동안 버티다 부서진다. */
  iceSpike(x: number, groundY: number, scale = 1, holdMs = 600, delay = 0): void {
    this.scene.time.delayedCall(delay, () => {
      const s = this.scene.add.sprite(x, groundY + 1, 'fx-ice').setOrigin(0.5, 1).setDepth(DEPTH.fx).setScale(scale);
      s.play('fx-ice-rise');
      this.burst(x, groundY - 4, 0xbff6ff, 3, 50, 300);
      this.scene.time.delayedCall(holdMs, () => {
        if (!s.active) return;
        s.play('fx-ice-break');
        s.once('animationcomplete', () => s.destroy());
      });
    });
  }

  /** 흔들리는 불꽃 하나. ms가 0이면 직접 지워야 한다. */
  flame(x: number, groundY: number, scale = 1, ms = 800): Phaser.GameObjects.Sprite {
    const s = this.scene.add
      .sprite(x, groundY + 1, 'fx-flame')
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.fx)
      .setScale(scale)
      .setBlendMode(Phaser.BlendModes.ADD);
    s.play({ key: 'fx-flame', startFrame: Math.floor(Math.random() * 6) });
    if (ms > 0) this.scene.tweens.add({ targets: s, alpha: 0, scaleY: scale * 0.3, delay: ms * 0.6, duration: ms * 0.4, onComplete: () => s.destroy() });
    return s;
  }

  /** 지면에 퍼지는 고리 (충격파·폭발) */
  ring(x: number, y: number, radius: number, color: number, ms = 300): void {
    const outer = this.scene.add.ellipse(x, y, 8, 3, color, 0).setStrokeStyle(3, color, 0.9).setDepth(DEPTH.fx);
    const inner = this.scene.add
      .ellipse(x, y, 6, 2, 0xffffff, 0)
      .setStrokeStyle(1, 0xffffff, 0.9)
      .setDepth(DEPTH.fx)
      .setBlendMode(Phaser.BlendModes.ADD);
    // 테두리 색의 넓은 물결이 한 겹 더 뒤따른다.
    const wake = this.scene.add.ellipse(x, y, 8, 3, color, 0).setStrokeStyle(2, toneOf(color).rim, 0.8).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    for (const [t, k] of [
      [outer, 1],
      [inner, 0.8],
      [wake, 1.18],
    ] as const) {
      this.scene.tweens.add({
        targets: t,
        width: radius * 2 * k,
        height: radius * 0.6 * k,
        alpha: 0,
        duration: ms,
        ease: 'Quad.Out',
        onComplete: () => t.destroy(),
      });
    }
  }

  /** 적이 쓰러질 때의 연기와 파편 */
  death(x: number, y: number, scale = 1): void {
    const s = this.scene.add.sprite(x, y, 'enemy-death', 1).setDepth(DEPTH.fx).setScale(scale).setOrigin(0.5, 0.8);
    s.play('enemy-death');
    s.once('animationcomplete', () => s.destroy());
    this.burst(x, y - 14 * scale, 0xffd9b0, Math.round(8 * scale), 110, 420, 1, 300);
  }
}
