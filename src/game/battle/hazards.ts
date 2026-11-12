// 전투의 장판·예고·충격파와 적의 큰 공격.

import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { afterglow, column, flutter, glow, hues, impactBurst, PAL, rays, shockwave, wash, wisps } from '../vfx';
import { DEPTH } from '../fx';
import type { Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import type { BattleScene } from '../battleScene';

export interface FieldSpec {
  x: number;
  w: number;
  life: number;
  tickEvery: number;
  damage: number;
  slow?: number;
  color: number;
  hitsAir?: boolean;
  rain?: boolean;
  /** 독 웅덩이: 몬스터가 아니라 플레이어를 해친다 */
  poison?: boolean;
  /** 겉모습: 서리(얼음 가시), 불길, 화살비, 독, 기본 */
  style?: 'frost' | 'fire' | 'rain' | 'poison' | 'plain';
  /** 적이 남긴 장판: 그 위 땅에 선 플레이어가 틱마다 받는 피해 (가드 불가) */
  hurt?: number;
  /** 피해 출처 (플레이어 장판). 비우면 깐 순간의 출처를 쓴다. */
  src?: string;
}

interface Field extends FieldSpec {
  rect: Phaser.GameObjects.Rectangle;
  /** 장판이 사라질 때 함께 지울 장식 (불꽃 등) */
  deco: Phaser.GameObjects.GameObject[];
  tickTimer: number;
  age: number;
}

interface Telegraph {
  rect: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  time: number;
  dur: number;
  owner: Monster | null;
  onFire: (() => void) | null;
}

interface Wave {
  obj: Phaser.GameObjects.Rectangle;
  x: number;
  dir: 1 | -1;
  dist: number;
  damage: number;
  owner: Monster;
  hit: boolean;
}

/**
 * 땅과 하늘의 위험: 장판, 공격 예고, 충격파, 불기둥·빛기둥·운석, 그리고 플레이어의 레이저 줄기.
 * 전투마다 새로 만든다.
 */
export class Hazards {
  private fields: Field[] = [];
  private telegraphs: Telegraph[] = [];
  private waves: Wave[] = [];
  private beam: Phaser.GameObjects.Rectangle;
  private beamGlow: Phaser.GameObjects.Rectangle;
  /** 레이저를 쏘는 동안 지팡이 끝에 서는 마법진 */
  private beamCircle: Phaser.GameObjects.Sprite | null = null;

  constructor(private readonly b: BattleScene) {
    this.beamGlow = this.b.add.rectangle(0, 0, 10, 14, 0x3fc8ff, 0.35).setOrigin(0, 0.5).setDepth(DEPTH.projectile).setVisible(false);
    this.beam = this.b.add.rectangle(0, 0, 10, 5, 0xe6fbff, 0.95).setOrigin(0, 0.5).setDepth(DEPTH.projectile).setVisible(false);
    this.beam.setBlendMode(Phaser.BlendModes.ADD);
    this.beamGlow.setBlendMode(Phaser.BlendModes.ADD);
  }

  update(dt: number): void {
    this.updateFields(dt);
    this.updateTelegraphs(dt);
    this.updateWavesFx(dt);
    this.updateBeam();
  }

  /** 바닥에서 솟는 불기둥: 경고 뒤 폭 w, 높이 150의 기둥이 선다. */
  firePillar(x: number, damage: number, owner: Monster, delay = 0.9, w = 40): void {
    const top = FLOOR_Y - 150;
    this.addTelegraph(x - w / 2, top, w, 150, delay, owner, () => {
      const s = this.b.add.sprite(x, FLOOR_Y + 4, 'beast-burn').setOrigin(0.5, 1).setDepth(DEPTH.fx).setScale(w / 40, 1);
      s.play('fire-pillar');
      this.b.tweens.add({ targets: s, alpha: 0, delay: 420, duration: 200, onComplete: () => s.destroy() });
      this.b.fx.burst(x, FLOOR_Y - 10, 0xffa040, 10, 120, 400);
      this.b.fx.shake(0.4, 100);
      this.b.areaHit(x - w / 2, top, w, 150, damage, owner, false);
    });
  }

  /** 하늘에서 내리꽂히는 빛기둥 (타락천사) */
  lightBeam(x: number, damage: number, owner: Monster, delay = 0.9, w = 36, color = 0xfff0c0): void {
    const top = 0;
    this.addTelegraph(x - w / 2, top, w, FLOOR_Y, delay, owner, () => {
      this.b.fx.pillar(x, FLOOR_Y, color, FLOOR_Y + 20, 420);
      this.b.fx.tracer(x, 0, x, FLOOR_Y, color, 6, 260);
      this.b.fx.spark(x, FLOOR_Y - 6, 0xffffff, 2);
      this.b.fx.ring(x, FLOOR_Y, 40, color);
      this.b.areaHit(x - w / 2, top, w, FLOOR_Y, damage, owner, false);
    });
  }

  /** 적이 부르는 운석: 경고 원 → 낙하 → 폭발 (플레이어만 맞는다) */
  enemyMeteor(x: number, damage: number, owner: Monster, delay = 0): void {
    this.b.time.delayedCall(delay * 1000, () => {
      if (this.b.ended) return;
      this.b.fx.circle(x, FLOOR_Y - 1, 0xff3a2a, 110, 1000, false, DEPTH.fx - 2);
      const sx = x - 90;
      const rock = this.b.add.sprite(sx, -20, 'fx-meteor').play('fx-meteor').setScale(1.5).setDepth(DEPTH.projectile).setTint(0xd8a0ff);
      rock.setOrigin(26 / 40, 26 / 40);
      this.b.tweens.add({
        targets: rock,
        x,
        y: FLOOR_Y - 14,
        delay: 200,
        duration: 750,
        ease: 'Quad.In',
        onUpdate: () => this.b.fx.burst(rock.x - 4, rock.y - 4, 0xc080ff, 1, 30, 260),
        onComplete: () => {
          rock.destroy();
          sfx.play('boom', 0.8);
          this.b.fx.boom(x, FLOOR_Y - 20, 40, 'dark');
          this.b.fx.ring(x, FLOOR_Y, 70, 0xc060ff, 380);
          this.b.fx.shake(0.9, 180);
          this.b.areaHit(x - 50, FLOOR_Y - 110, 100, 110, damage, owner, false);
        },
      });
    });
  }

  /** 불타는 해골의 자폭: 주변을 태우고 스스로 사라진다 (처치로 치지 않는다). */
  selfDestruct(m: Monster, radius: number): void {
    if (!m.alive) return;
    sfx.play('boom', 0.6);
    this.b.fx.boom(m.x, m.y, radius * 0.6, 'fire');
    this.b.fx.ring(m.x, Math.min(m.y + 10, FLOOR_Y), radius, 0xff7a1a);
    this.b.areaHit(m.x - radius, m.y - radius, radius * 2, radius * 2, m.damage, m, false);
    m.kill();
  }


  addField(spec: FieldSpec): void {
    const style = spec.style ?? (spec.poison ? 'poison' : spec.rain ? 'rain' : 'plain');
    const rect = this.b.add
      .rectangle(spec.x, FLOOR_Y - 2, spec.w, style === 'plain' || style === 'poison' ? 8 : 4, spec.color, 0.5)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.fx)
      .setBlendMode(Phaser.BlendModes.ADD);
    const deco: Phaser.GameObjects.GameObject[] = [];
    const ms = spec.life * 1000;
    const cx = spec.x + spec.w / 2;
    if (style === 'frost') {
      // 얼음 가시가 안쪽부터 바깥으로 차례로 솟는다.
      this.b.fx.circle(cx, FLOOR_Y - 1, 0x8fe0ff, spec.w + 20, ms, false, DEPTH.fx - 2);
      const n = Math.max(3, Math.floor(spec.w / 13));
      for (let i = 0; i < n; i++) {
        const x = spec.x + ((i + 0.5) * spec.w) / n + (Math.random() - 0.5) * 4;
        const delay = Math.abs(x - cx) * 2.2;
        this.b.fx.iceSpike(x, FLOOR_Y, 0.7 + Math.random() * 0.5, Math.max(200, ms - delay - 150), delay);
      }
      this.b.fx.burst(cx, FLOOR_Y - 8, 0xdff8ff, 16, 120, 450);
      glow(this.b, cx, FLOOR_Y, spec.w * 0.8, 0x6a4aff, ms, 0.5, 0.3);
    } else if (style === 'fire') {
      glow(this.b, cx, FLOOR_Y, spec.w * 0.8, 0xd0186a, ms, 0.5, 0.3);
      const n = Math.max(3, Math.floor(spec.w / 12));
      for (let i = 0; i < n; i++) deco.push(this.b.fx.flame(spec.x + ((i + 0.5) * spec.w) / n, FLOOR_Y, 0.8 + Math.random() * 0.7, 0));
    } else if (style === 'rain') {
      // 하늘에 금빛 마법진이 열리고 그 아래로 화살이 쏟아진다.
      deco.push(this.b.fx.circle(cx, FLOOR_Y - 150, 0xffe08a, spec.w + 30, ms + 200, false, DEPTH.fx));
    }
    this.fields.push({ ...spec, src: spec.src ?? this.b.src, style, rect, deco, tickTimer: 0, age: 0 });
  }

  /** 장판이 살아 있는 동안의 연출 */
  private fieldFx(f: Field, dt: number): void {
    const x = f.x + Math.random() * f.w;
    switch (f.style) {
      case 'rain':
        if (Math.random() < dt * 34) {
          const top = FLOOR_Y - 146;
          const arrow = this.b.add.image(x, top, 'fx-arrow').setRotation(Math.PI / 2).setDepth(DEPTH.projectile);
          // 빗줄기마다 금빛·분홍·민트로 꼬리 색이 다르다.
          const hue = [0xffe08a, 0xffa0c8, 0x9affc0, 0xfff0c0][Math.floor(Math.random() * 4)];
          const tail = this.b.fx.streak(x, top, Math.PI / 2, 30, hue, 0);
          this.b.tweens.add({
            targets: [arrow, tail],
            y: FLOOR_Y - 4,
            duration: 200,
            ease: 'Quad.In',
            onComplete: () => {
              arrow.destroy();
              tail.destroy();
              this.b.fx.spark(x, FLOOR_Y - 3, hue);
              this.b.fx.burst(x, FLOOR_Y - 2, hue, 2, 40, 220, 1, 300);
            },
          });
        }
        break;
      case 'frost':
        if (Math.random() < dt * 8) this.b.fx.smoke(x, FLOOR_Y - 6, 2, 0x8fc8e8, -10);
        if (Math.random() < dt * 14) this.b.fx.embers(x, FLOOR_Y - 4, 0xdff8ff, 1, 4, 24, 700);
        if (Math.random() < dt * 9) flutter(this.b, x, FLOOR_Y - 60 - Math.random() * 30, 'snow', [0xb8ffe8, 0x9ff0ff, 0xc8b0ff, 0xffffff], 1, { spread: 4, speed: 10, gravity: 60, sway: 10, life: 1100 });
        break;
      case 'fire':
        if (Math.random() < dt * 18) this.b.fx.embers(x, FLOOR_Y - 8, Math.random() < 0.5 ? 0xffc040 : 0xff7a1a, 1, 4, 40, 700);
        if (Math.random() < dt * 4) this.b.fx.smoke(x, FLOOR_Y - 16, 1, 0x5a4a44, -14);
        if (Math.random() < dt * 8) flutter(this.b, x, FLOOR_Y - 10, 'flame', hues(PAL.flame), 1, { spread: 3, speed: 30, cone: 0.4, gravity: -90, life: 800 });
        break;
      default:
        if (Math.random() < dt * 10) this.b.fx.burst(x, FLOOR_Y - 6, f.color, 1, 30, 600);
    }
  }

  private updateFields(dt: number): void {
    const p = this.b.player;
    this.fields = this.fields.filter((f) => {
      f.life -= dt;
      f.age += dt;
      f.tickTimer -= dt;
      const glow = f.style === 'plain' || f.style === 'poison' ? 0.35 : 0.22;
      f.rect.setAlpha((glow + Math.sin(f.age * 6) * 0.12) * Math.min(1, f.life * 2));
      this.fieldFx(f, dt);
      if (f.tickTimer <= 0) {
        f.tickTimer = f.tickEvery;
        if (f.poison || f.hurt) {
          // 독 웅덩이·용암 불길: 플레이어를 해친다 (가드 불가).
          if (p.x > f.x && p.x < f.x + f.w && p.grounded && !p.onPlatform) {
            this.b.damagePlayer(f.hurt ?? 6, { x: p.x, melee: false, unblockable: true });
          }
        } else {
          for (const m of this.b.monsters) {
            if (!m.alive) continue;
            if (m.x < f.x - 6 || m.x > f.x + f.w + 6) continue;
            this.b.src = f.src ?? 'basic';
            if (!f.hitsAir && m.body.bottom < FLOOR_Y - 60) continue;
            this.b.hitMonster(m, f.damage, { quiet: true, slow: f.slow ? [f.slow, 0.6] : undefined });
          }
        }
      }
      if (f.life <= 0) {
        f.rect.destroy();
        for (const d of f.deco) {
          // 불꽃은 사그라들며 사라진다.
          if (d instanceof Phaser.GameObjects.Sprite && d.texture.key === 'fx-flame') {
            this.b.tweens.add({ targets: d, alpha: 0, scaleY: 0.2, duration: 300, onComplete: () => d.destroy() });
          } else if (d.active && !(d instanceof Phaser.GameObjects.Sprite && d.texture.key === 'fx-circle')) d.destroy();
        }
        return false;
      }
      return true;
    });
  }

  addTelegraph(x: number, y: number, w: number, h: number, dur: number, owner: Monster | null, onFire: (() => void) | null, color = 0xff3a2a): void {
    const rect = this.b.add.rectangle(x, y, w, h, color, 0).setOrigin(0, 0).setStrokeStyle(1, color, 0.9).setDepth(DEPTH.fx);
    const fill = this.b.add.rectangle(x, y + h, w, 0, color, 0.3).setOrigin(0, 1).setDepth(DEPTH.fx);
    this.telegraphs.push({ rect, fill, time: 0, dur, owner, onFire });
  }

  private updateTelegraphs(dt: number): void {
    this.telegraphs = this.telegraphs.filter((t) => {
      t.time += dt;
      t.fill.height = t.rect.height * Math.min(1, t.time / t.dur);
      const cancelled = t.owner !== null && (!t.owner.alive || t.owner.stun > 0);
      if (t.time >= t.dur || cancelled) {
        if (!cancelled) t.onFire?.();
        t.rect.destroy();
        t.fill.destroy();
        return false;
      }
      return true;
    });
  }

  /** 바닥을 타고 양옆으로 퍼지는 충격파. 점프하거나 발판 위에 있으면 피한다. */
  addShockwave(x: number, damage: number, owner: Monster): void {
    for (const dir of [-1, 1] as const) {
      const obj = this.b.add.rectangle(x, FLOOR_Y - 6, 10, 12, 0xffa040, 0.8).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
      this.waves.push({ obj, x, dir, dist: 0, damage, owner, hit: false });
    }
  }

  private updateWavesFx(dt: number): void {
    const p = this.b.player;
    this.waves = this.waves.filter((w) => {
      const step = 260 * dt;
      w.x += w.dir * step;
      w.dist += step;
      w.obj.setPosition(w.x, FLOOR_Y - 6).setAlpha(0.9 * (1 - w.dist / 360));
      if (Math.random() < 0.6) this.b.fx.burst(w.x, FLOOR_Y - 4, 0xffa040, 1, 30, 300);
      if (!w.hit && Math.abs(p.x - w.x) < 10 && p.grounded && !p.onPlatform) {
        w.hit = true;
        this.b.damagePlayer(w.damage, { x: w.x, monster: w.owner, melee: false });
      }
      if (w.dist >= 360) {
        w.obj.destroy();
        return false;
      }
      return true;
    });
  }

  /** 메테오: 하늘에 마법진이 열리고, 불타는 운석이 떨어져 터진 뒤 불길이 남는다. */
  castMeteor(x: number, damage: number, burn: number): void {
    const sx = x - 120;
    const sy = 26;
    this.b.fx.circle(sx, sy, 0xff8a3a, 90, 900, false, DEPTH.fx);
    this.b.fx.circle(x, FLOOR_Y - 1, 0xff5a2a, 140, 1000, false, DEPTH.fx - 2);
    const rock = this.b.add.sprite(sx, sy, 'fx-meteor').play('fx-meteor').setScale(2).setDepth(DEPTH.projectile);
    rock.setOrigin(26 / 40, 26 / 40);
    let trailAcc = 0;
    this.b.tweens.add({
      targets: rock,
      x,
      y: FLOOR_Y - 18,
      delay: 120,
      duration: 780,
      ease: 'Quad.In',
      onUpdate: () => {
        trailAcc++;
        this.b.fx.burst(rock.x - 6, rock.y - 6, trailAcc % 2 ? 0xffc040 : 0xff7a1a, 2, 40, 300);
        if (trailAcc % 3 === 0) this.b.fx.smoke(rock.x - 14, rock.y - 14, 2, 0x6a3a5a, -6);
        // 운석 꼬리: 노랑 → 주황 → 자홍으로 식어 가는 불꽃 혀
        if (trailAcc % 2 === 0) flutter(this.b, rock.x - 8, rock.y - 8, 'flame', hues(PAL.flame), 2, { spread: 6, speed: 50, angle: -2.4, cone: 0.6, gravity: -30, life: 520 });
        if (trailAcc % 4 === 0) glow(this.b, rock.x, rock.y, 46, 0xd0186a, 260, 0.5);
      },
      onComplete: () => {
        rock.destroy();
        sfx.play('boom');
        this.b.fx.flashScreen(0xffa040, 0.45, 260);
        this.b.fx.boom(x, FLOOR_Y - 26, 62, 'fire');
        this.b.time.delayedCall(90, () => {
          this.b.fx.boom(x - 34, FLOOR_Y - 16, 30, 'fire');
          this.b.fx.boom(x + 36, FLOOR_Y - 14, 28, 'fire');
        });
        this.b.fx.ring(x, FLOOR_Y, 110, 0xff6a1a, 450);
        this.b.fx.ring(x, FLOOR_Y, 70, 0xffd060, 300);
        // 거대한 불기둥과 땅을 타는 충격파
        impactBurst(this.b, x, FLOOR_Y - 30, 90, PAL.flame, FLOOR_Y);
        column(this.b, x, FLOOR_Y, 44, 360, PAL.flame, 650);
        shockwave(this.b, x, FLOOR_Y, 260, PAL.gold, 600);
        rays(this.b, x, FLOOR_Y - 30, 16, 200, PAL.flame, 460);
        // 화면이 위는 자홍, 아래는 주황으로 물들고, 불꽃 결이 터져 오른 뒤 잔불이 남는다.
        wash(this.b, 0xd0186a, 0xff7a1a, 0.2, 460);
        shockwave(this.b, x, FLOOR_Y, 180, PAL.crimson, 520, 0.3, 6);
        wisps(this.b, x, FLOOR_Y - 10, PAL.flame, 9, 150, 620, { angle: -Math.PI / 2, cone: 1.3, curl: 2.4, width: 9 });
        flutter(this.b, x, FLOOR_Y - 20, 'flame', hues(PAL.flame), 26, { spread: 40, spreadY: 16, speed: 230, cone: 1.1, gravity: 120, life: 1000 });
        afterglow(this.b, x, FLOOR_Y, 220, PAL.flame, 'flame', 1300);
        this.b.fx.burst(x, FLOOR_Y - 16, 0xffb050, 26, 240, 650, 1, 500);
        this.b.fx.burst(x, FLOOR_Y - 10, 0x8a6a50, 14, 200, 700, 1.5, 700);
        for (let i = 0; i < 6; i++) this.b.time.delayedCall(150 + i * 50, () => this.b.fx.smoke(x + (i - 2.5) * 22, FLOOR_Y - 18, 3, 0x6a5a54, -24));
        this.b.fx.shake(1.6, 280);
        this.b.hitArea(x - 60, FLOOR_Y - 140, 120, 150, damage, { knock: 120 });
        this.addField({ x: x - 55, w: 110, life: 3, tickEvery: 0.5, damage: burn, color: 0xff6a2a, style: 'fire' });
      },
    });
  }

  setBeam(on: boolean): void {
    this.beam.setVisible(on);
    this.beamGlow.setVisible(on);
    if (on && !this.beamCircle) {
      this.beamCircle = this.b.add.sprite(0, 0, 'fx-circle').play('fx-circle').setTint(0x7fe8ff).setRotation(Math.PI / 2).setScale(0.6, 0.9);
      this.beamCircle.setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
    } else if (!on && this.beamCircle) {
      const c = this.beamCircle;
      this.beamCircle = null;
      this.b.tweens.add({ targets: c, alpha: 0, scaleY: 0, duration: 160, onComplete: () => c.destroy() });
    }
  }

  /** 레이저: 굵은 빛 줄기와 하얀 심, 지팡이 끝 마법진, 줄기를 타고 튀는 전류와 끝의 불꽃 */
  private updateBeam(): void {
    if (!this.beam.visible) return;
    const p = this.b.player;
    const m = p.muzzle();
    const len = 380;
    const f = p.facing;
    const x = f === 1 ? m.x : m.x - len;
    const t = this.b.time.now;
    this.beam.setPosition(x, m.y).setSize(len, 3 + Math.sin(t * 0.05) * 1.2);
    this.beamGlow.setPosition(x, m.y).setSize(len, 12 + Math.sin(t * 0.031) * 3);
    this.beamCircle?.setPosition(m.x + f * 3, m.y);
    // 프리즘처럼 색이 흐른다: 바깥 빛이 하늘색 → 보라 → 분홍으로 돌고, 전류와 별빛도 색이 섞인다.
    const prism = [0x3fc8ff, 0x8a6aff, 0xff7ad8, 0x7fffd8];
    this.beamGlow.setFillStyle(prism[Math.floor(t / 90) % prism.length], 0.4);
    if (Math.random() < 0.35) this.b.fx.lightning(m.x, m.y, m.x + f * (60 + Math.random() * 300), m.y + (Math.random() - 0.5) * 6, prism[Math.floor(Math.random() * 4)], 1, 90);
    if (Math.random() < 0.5) this.b.fx.spark(m.x + f * len, m.y, prism[Math.floor(Math.random() * 4)], 1 + Math.round(Math.random()));
    if (Math.random() < 0.6) this.b.fx.burst(m.x + f * Math.random() * len, m.y, 0xd8fbff, 1, 40, 250);
    if (Math.random() < 0.3) flutter(this.b, m.x + f * Math.random() * len, m.y, 'star', prism, 1, { spread: 2, speed: 40, life: 500 });
    if (Math.random() < 0.12) glow(this.b, m.x + f * (20 + Math.random() * (len - 20)), m.y, 34, prism[Math.floor(Math.random() * 4)], 220, 0.5);
    if (Math.random() < 0.1) wisps(this.b, m.x + f * 4, m.y, PAL.arcane, 2, 50, 300, { angle: f === 1 ? 0 : Math.PI, cone: 1.0, curl: 2.6, width: 4 });
  }
}
