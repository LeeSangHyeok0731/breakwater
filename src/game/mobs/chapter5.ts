import Phaser from 'phaser';
import type { MonsterKind } from '../../data/monsters';
import { DEPTH } from '../fx';
import type { Behavior } from '../monster2d';
import { FLOOR_Y } from '../world';
import { hover } from './chapter2';
import { CHAPTER3 } from './chapter3';

// 챕터 5(공허의 문) 몬스터의 행동

// ─── 공허 지옥견: 지옥견처럼 달려들고, 빠르게 움직일 때 청록 잔상을 남긴다 ───
const voidHound: Behavior = (m, dt) => {
  CHAPTER3.hell_hound?.(m, dt);
  m.aux -= dt;
  if (m.aux > 0 || Math.abs(m.body.velocity.x) < 150) return;
  m.aux = 0.05;
  const s = m.sprite;
  const ghost = m.scene.add
    .image(s.x, s.y, s.texture.key, s.frame.name)
    .setOrigin(s.originX, s.originY)
    .setFlipX(s.flipX)
    .setScale(s.scaleX, s.scaleY)
    .setDepth(DEPTH.monster - 1)
    .setTint(0x7ff0ff)
    .setAlpha(0.45)
    .setBlendMode(Phaser.BlendModes.ADD);
  m.scene.tweens.add({ targets: ghost, alpha: 0, duration: 240, onComplete: () => ghost.destroy() });
};

// ─── 공허 천사: 높이 떠서 청록 깃털을 부채꼴로 쏜다 ───
const voidAngel: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  m.attackTimer -= dt;
  m.stateTime -= dt;
  hover(m, 170, FLOOR_Y - 130, 0.7);
  if (m.stateTime <= 0) m.play(m.look.walk);
  if (m.attackTimer > 0 || Math.abs(p.x - m.x) > 360) return;
  m.attackTimer = m.def.attackCd * (0.8 + Math.random() * 0.4);
  m.play(m.look.attack);
  m.stateTime = 0.4;
  const n = m.elite ? 7 : 5;
  const base = Math.atan2(p.y - m.y, p.x - m.x);
  for (let i = 0; i < n; i++) {
    const a = base + (i / (n - 1) - 0.5) * 0.7;
    b.spawnEnemyBolt(m.x, m.y, Math.cos(a) * 190, Math.sin(a) * 190, m.damage, m, 0, { kind: 'feather', tint: 0x7ff0ff });
  }
  b.fx.burst(m.x, m.y, 0x7ff0ff, 8, 100, 300);
};

export const CHAPTER5: Partial<Record<MonsterKind, Behavior>> = {
  void_hound: voidHound,
  void_angel: voidAngel,
};
