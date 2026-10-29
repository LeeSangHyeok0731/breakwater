import Phaser from 'phaser';

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

/** 타격감 연출: 데미지 숫자, 피격 번쩍임, 히트스톱, 파티클, 화면 흔들림 */
export class Fx {
  /** 남은 히트스톱 시간. 0보다 크면 게임 진행을 멈춘다. */
  hitstop = 0;

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

  burst(x: number, y: number, color: number, count = 8, speed = 90, life = 380, size = 1): void {
    for (let i = 0; i < count; i++) {
      const p = this.scene.add.image(x, y, 'dot').setTint(color).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
      const s = (0.3 + Math.random() * 0.5) * size;
      p.setScale(s);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(a) * v * (life / 1000),
        y: y + Math.sin(a) * v * (life / 1000) - 8,
        scale: 0,
        alpha: 0.2,
        duration: life,
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      });
    }
  }

  /** 반원 모양의 베기 궤적 */
  slash(x: number, y: number, facing: 1 | -1, radius: number, color: number, vertical = false): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    const start = vertical ? -Math.PI * 0.6 : -Math.PI * 0.35;
    const end = vertical ? Math.PI * 0.5 : Math.PI * 0.35;
    g.lineStyle(6, color, 0.9);
    g.beginPath();
    if (facing === 1) g.arc(x, y, radius, start, end, false);
    else g.arc(x, y, radius, Math.PI - start, Math.PI - end, true);
    g.strokePath();
    g.lineStyle(2, 0xffffff, 1);
    g.beginPath();
    if (facing === 1) g.arc(x, y, radius - 2, start, end, false);
    else g.arc(x, y, radius - 2, Math.PI - start, Math.PI - end, true);
    g.strokePath();
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  /** 지면에 퍼지는 고리 (충격파·폭발) */
  ring(x: number, y: number, radius: number, color: number, ms = 300): void {
    const g = this.scene.add.ellipse(x, y, 8, 3, color, 0).setStrokeStyle(3, color, 0.9).setDepth(DEPTH.fx);
    this.scene.tweens.add({
      targets: g,
      width: radius * 2,
      height: radius * 0.6,
      alpha: 0,
      duration: ms,
      ease: 'Quad.Out',
      onComplete: () => g.destroy(),
    });
  }

  /** 적이 쓰러질 때의 연기 */
  death(x: number, y: number, scale = 1): void {
    const s = this.scene.add.sprite(x, y, 'enemy-death').setDepth(DEPTH.fx).setScale(scale).setOrigin(0.5, 0.8);
    s.play('enemy-death');
    s.once('animationcomplete', () => s.destroy());
  }
}
