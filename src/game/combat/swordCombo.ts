// 검사 평타 이펙트: 몸동작(swordMotion)과 같은 순서로 타격이 나간다. 도의 평타(basic.ts의 comboSlash)는 따로 둔다.
//
//   1 왼발을 내디디며 왼쪽에서 오른쪽으로 수평 가로베기
//   2 오른발을 교차해 돌아서, 오른쪽 위에서 왼쪽 아래로 내려베기
//   3 한 바퀴 돌며 수평으로 베기 (두 번)
//   4 돌아서 왼쪽 아래로 내려베고, 등 뒤에서 넘겨 오른쪽으로 내려베기
//   5 오른쪽·왼쪽으로 검을 돌리고, 왼쪽에서 오른쪽으로 수평으로 베고, 오른발을 내디디며 찌르기
//
// 동작 시간이 도보다 길어서 타격 한 번의 피해를 키웠다 (평타 5단을 한 바퀴 치는 시간이 약 1.7배라서 DPS가 비슷하다).

import type { BattleScene } from '../battleScene';
import { crescent, PAL, rays } from '../vfx';
import { around, box, LONG, slashStyle, swingFx, swordReach } from './shared';

/** 단마다 타격별 피해 배율 [초안] */
const MUL: number[][] = [[1.6], [1.8], [1.1, 1.1], [1.2, 1.2], [0.8, 0.8, 1.2, 1.6]];

export function swordCombo(b: BattleScene, n: number, index: number, dmg: number, color: number): void {
  const p = b.player;
  const f = p.facing;
  const r = (v: number): number => swordReach(p, v);
  const style = slashStyle(b);
  const [stretch] = LONG;
  const d = dmg * (MUL[n - 1]?.[index] ?? 1);
  /** 오른쪽 위에서 왼쪽 아래로 가르는 사선 (몸 앞을 지난다) */
  const diagonal = (): void => {
    const ang = Math.atan2(1, -f);
    b.fx.cut(p.x + f * r(14), p.y - 4, ang, r(86), color);
    b.fx.cut(p.x + f * r(10), p.y - 2, ang, r(64), 0xffffff);
    b.fx.sparks(p.x - f * r(10), p.y + 14, color, 6, f === 1 ? Math.PI * 0.75 : Math.PI * 0.25, 0.6, 210, 280);
    swingFx(b, p.x + f * r(12), p.y - 2);
  };
  switch (n) {
    case 1:
      // 수평 가로베기: 납작하고 길게 뻗는 잔상
      b.fx.slash(p.x + f * r(20), p.y - 2, f, r(58), color, true, { style, stretch: 1.7, squash: 0.4 });
      b.fx.slash(p.x + f * r(16), p.y - 1, f, r(46), 0xffffff, false, { speed: 1.4, style, stretch: 1.7, squash: 0.3 });
      b.fx.sparks(p.x + f * r(56), p.y - 2, color, 5, f === 1 ? 0 : Math.PI, 0.5, 200, 260);
      swingFx(b, p.x + f * r(46), p.y - 2);
      p.body.setVelocityX(f * 70);
      box(b, 0, r(96), 40, 2, d, { basic: true, knock: 100 });
      break;
    case 2:
      diagonal();
      p.body.setVelocityX(f * 50);
      box(b, 0, r(84), 64, 8, d, { basic: true, knock: 90 });
      break;
    case 3:
      // 한 바퀴: 첫 타는 앞과 뒤를 함께, 둘째 타는 앞으로 멀리
      if (index === 0) {
        b.fx.slash(p.x + f * r(16), p.y - 4, f, r(52), color, true, { style, stretch: 1.5, squash: 0.42, speed: 1.3 });
        b.fx.slash(p.x - f * r(10), p.y - 4, (-f) as 1 | -1, r(44), color, true, { style, stretch: 1.4, squash: 0.4, speed: 1.3 });
        b.fx.ring(p.x, p.y, r(36), color, 240);
        around(b, r(150), 46, 2, d, { basic: true, knock: 50 });
      } else {
        p.body.setVelocityX(f * 150);
        p.afterimage(color);
        b.fx.slash(p.x + f * r(18), p.y - 2, f, r(66), 0xffe08a, true, { style, stretch: 1.7, squash: 0.4, speed: 1.3 });
        b.fx.sparks(p.x + f * r(60), p.y - 2, color, 8, f === 1 ? 0 : Math.PI, 0.7, 240, 300);
        b.fx.smoke(p.x, p.feet - 4, 1, 0x9a8a70, -6);
        b.fx.shake(0.4, 90);
        box(b, 0, r(110), 48, 2, d, { basic: true, knock: 150 });
      }
      swingFx(b, p.x + f * r(40), p.y - 2);
      break;
    case 4:
      if (index === 0) {
        diagonal();
        box(b, 0, r(84), 64, 8, d, { basic: true, knock: 70 });
      } else {
        // 등 뒤에서 넘어와 오른쪽 아래로 크게 내려찍는다: 땅이 터진다
        p.body.setVelocityX(f * 160);
        p.afterimage(color);
        b.fx.slash(p.x + f * r(22), p.y - 8, f, r(66), color, true, { style, stretch, squash: 1 });
        b.fx.slash(p.x + f * r(18), p.y - 6, f, r(50), 0xffffff, false, { speed: 1.3, style, stretch, squash: 1 });
        b.fx.ring(p.x + f * r(60), p.feet, r(46), 0xffe08a, 280);
        b.fx.sparks(p.x + f * r(62), p.feet - 4, color, 9, f === 1 ? -0.9 : Math.PI + 0.9, 0.9, 240, 320);
        b.fx.smoke(p.x + f * 30, p.feet - 4, 2, 0x9a8a70, -6);
        swingFx(b, p.x + f * r(54), p.y - 4);
        b.fx.shake(0.6, 120);
        box(b, 0, r(104), 70, 6, d, { basic: true, knock: 170 });
      }
      break;
    default:
      if (index === 0 || index === 1) {
        // 검을 한 바퀴 돌린다: 오른쪽 한 번, 왼쪽 한 번
        const side = index === 0 ? f : ((-f) as 1 | -1);
        b.fx.slash(p.x + side * r(14), p.y - 10, side, r(42), color, false, { style, speed: 1.5, squash: 0.9 });
        b.fx.ring(p.x + side * r(18), p.y - 10, r(24), color, 200);
        b.fx.twinkle(p.x + side * r(40), p.y - 14, 0xffffff);
        around(b, r(130), 50, 4, d, { basic: true, knock: 30 });
      } else if (index === 2) {
        // 왼쪽에서 오른쪽으로 수평하게, 시선은 앞에 둔 채
        p.body.setVelocityX(f * 90);
        p.afterimage(color);
        b.fx.slash(p.x + f * r(20), p.y - 2, f, r(70), 0xffe08a, true, { style, stretch: 1.8, squash: 0.4, speed: 1.3 });
        b.fx.slash(p.x + f * r(16), p.y - 1, f, r(54), 0xffffff, false, { speed: 1.4, style, stretch: 1.8, squash: 0.3 });
        b.fx.sparks(p.x + f * r(60), p.y - 2, color, 8, f === 1 ? 0 : Math.PI, 0.7, 230, 300);
        swingFx(b, p.x + f * r(50), p.y - 2);
        box(b, 0, r(120), 46, 2, d, { basic: true, knock: 120 });
      } else {
        // 오른발을 내디디며 찌르기: 적을 꿰뚫는 큰 검기
        p.body.setVelocityX(f * 200);
        p.afterimage(0xffe08a);
        b.fx.streak(p.x + f * r(70), p.y - 2, f === 1 ? 0 : Math.PI, r(90), 0xdff4ff, 220, 3);
        b.fx.slash(p.x + f * r(30), p.y - 4, f, r(72), 0xffffff, true, { stretch, squash: 0.5, style });
        b.fx.ring(p.x + f * r(50), p.feet, r(80), 0xffe08a, 320);
        b.fx.pop(p.x + f * r(56), p.y - 4, 0xfff0c0, 2.2);
        b.fx.sparks(p.x + f * r(56), p.y - 4, 0xffe08a, 14, f === 1 ? 0 : Math.PI, 1.3, 280, 420);
        rays(b, p.x + f * r(56), p.y - 4, 8, r(64), PAL.gold, 300);
        for (let i = 0; i < 4; i++) b.fx.twinkle(p.x + f * r(30 + i * 22), p.y - 22 + ((i * 17) % 34), 0xfff6c0, 60 + i * 50);
        b.spawnPlayerBolt({ x: p.x + f * 20, y: p.y - 4, vx: f * 380, vy: 0, damage: dmg, basic: true, kind: 'wave', pierce: true, life: 0.75, size: 2.4, color });
        crescent(b, p.x + f * 14, p.y - 4, f, 70, PAL.gold, { from: -1.3, to: 1.3, ms: 240 });
        b.fx.shake(0.9, 160);
        b.fx.stop(0.06);
        box(b, 0, r(120), 26, 2, d, { basic: true, knock: 220 });
      }
  }
}
