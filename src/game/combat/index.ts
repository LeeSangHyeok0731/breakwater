// 플레이어의 공격 입력: 키를 읽어 평타·강화 공격·스킬을 시작하고, 진행 중인 동작의 타격 시점을 챙긴다.

import { SLOT_ACTIONS } from '../../core/input';
import { sfx } from '../../core/audio';
import type { BattleScene } from '../battleScene';
import { BASIC_ACTIONS } from '../player2d';
import { releaseOrb, fireArrow, SLASH_TIMING, comboPop, gunCombo, startReload } from './basic';
import { performHit, updateLaser } from './hits';
import { CHANNELS, combatState } from './shared';
import { tryCast } from './skills';

export function updatePlayerCombat(b: BattleScene, dt: number): void {
  const p = b.player;
  const input = b.keys;
  // 궁극기 채널 중에는 공격·스킬·구르기·무기 교체를 못 한다 (혈월 발도를 모으는 동안은 걸을 수는 있다).
  if (p.dead || p.hoverTime > 0 || b.ult?.lock) return;

  // 무기 교체는 대기 시간 없이 바로 (구르는 중에도). 이어지는 채널 스킬 중에만 막는다.
  if (input.pressed('swap') && !(p.action && CHANNELS.has(p.action.kind))) {
    p.swapWeapon();
    b.hud.flashWeapon();
  }
  if (input.pressed('skillPage') && p.nextSkillPage()) sfx.play('parry', 0.5);
  // 구르기 (마법사는 블링크). 대기 시간이 끝나기 직전에 누른 것도 먹는다.
  p.tryDodge(input);

  // 타락한 엘프전에서는 원거리 무기도 가드키로 짧게 패링 자세를 잡는다 (막지는 못하고 파란 화살만 튕긴다).
  if (!p.isMelee && b.legion?.id === 'elf' && input.pressed('guard') && p.parryCd <= 0 && p.dodgeTime <= 0) {
    p.parryTimer = 0.3 + p.derived.passive.parryWindow;
    p.parryCd = 0.8;
    b.fx.ring(p.x + p.facing * 10, p.y, 18, 0x9fdcff, 220);
    b.fx.spark(p.x + p.facing * 12, p.y - 4, 0xffffff, 1);
  }
  const wantGuard = p.isMelee && input.isDown('guard') && !p.action && p.dodgeTime <= 0 && p.grounded;
  if (wantGuard && !p.guarding) p.parryTimer = 0.22 + p.derived.passive.parryWindow;
  p.guarding = wantGuard;

  advance(b, dt);

  const free = !p.action && !p.guarding && p.dodgeTime <= 0;
  const type = p.weapon.def.type;
  const attack = input.pressed('attack') || input.isDown('attack');
  p.ads = type === 'gun' && input.isDown('special') && p.grounded && p.dodgeTime <= 0;

  switch (type) {
    case 'sword':
    case 'dao':
      if (type === 'dao' && p.charge >= 0) {
        p.charge += dt;
        if (!input.isDown('special')) {
          combatState.cleaveCharge = Math.min(p.charge, 1);
          p.charge = -1;
          p.startAction('cleave', 0.45, [0.15]);
        }
      } else if (free && attack) {
        if (!p.grounded) {
          p.resetCombo();
          p.startAction('airSlash', 0.32, [0.1]);
        } else if (p.crouching) {
          p.resetCombo();
          p.startAction('crouchSlash', 0.28, [0.08]);
        } else {
          const n = p.nextCombo();
          comboPop(b, n);
          const [dur, hits] = SLASH_TIMING[n - 1];
          p.startAction('slash', dur, hits);
        }
      } else if (free && input.pressed('special')) {
        if (type === 'sword') p.startAction('thrust', 0.5, [0.18]);
        else p.charge = 0;
      }
      break;
    case 'staff':
      if (p.charge >= 0) {
        p.charge += dt;
        if (!input.isDown('special')) b.withSource('special', () => releaseOrb(b));
      } else if (free && input.pressed('special')) p.charge = 0;
      else if (free && attack) {
        comboPop(b, p.nextCombo());
        p.startAction('manaball', 0.36, [0.08]);
      }
      break;
    case 'bow':
      if (p.charge >= 0) {
        p.charge += dt;
        if (!input.isDown('special')) {
          const c = Math.min(p.charge, 1.2) / 1.2;
          p.charge = -1;
          b.withSource('special', () => fireArrow(b, c));
        }
      } else if (free && p.drawCd <= 0 && input.pressed('special')) p.charge = 0;
      else if (free && p.drawCd <= 0 && attack) {
        comboPop(b, p.nextCombo());
        fireArrow(b, 0);
      }
      break;
    case 'gun':
      if (free && attack && p.fireCd <= 0 && p.reloadTime <= 0) {
        if (p.weapon.ammo > 0) {
          p.weapon.ammo--;
          p.fireCd = 0.24;
          const n = p.nextCombo();
          comboPop(b, n);
          gunCombo(b, n);
          p.startAction('shoot', n >= 4 ? 0.22 : 0.14);
          if (p.weapon.ammo === 0) startReload(b);
        } else startReload(b);
      }
      break;
  }

  for (let i = 0; i < SLOT_ACTIONS.length; i++) {
    if (input.pressed(SLOT_ACTIONS[i])) tryCast(b, p.weapon.slots[i], i);
  }
}

function advance(b: BattleScene, dt: number): void {
  const p = b.player;
  const a = p.action;
  if (!a) return;
  a.t += dt;
  // 이 동작의 피해 출처: 스킬이 시작한 동작이면 그 스킬, 아니면 평타·특수 공격
  const src = a.src ?? (BASIC_ACTIONS.has(a.kind) ? 'basic' : 'special');
  while (a.done < a.hits.length && a.t >= a.hits[a.done]) {
    const i = a.done;
    b.withSource(src, () => performHit(b, a.kind, i));
    a.done++;
  }
  if (a.kind === 'laser') b.withSource(src, () => updateLaser(b, dt));
  if (a.t >= a.dur) {
    if (a.kind === 'laser') b.setBeam(false);
    p.action = null;
  }
}
