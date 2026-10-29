import * as THREE from 'three';
import type { WeaponType } from '../data/weapons';
import { makeHeldWeapon } from './heldWeapons';
import type { Player } from './player';

/**
 * 1인칭에서 화면 오른쪽 아래에 보이는 무기. 카메라의 자식으로 붙어서 시선을 그대로 따라간다.
 * 플레이어의 동작(베기·찌르기·사격·가드·재장전)에 맞춰 절차적으로 움직인다.
 */
export class ViewModel {
  readonly root = new THREE.Group();
  private readonly holder = new THREE.Group();
  private models = new Map<WeaponType, THREE.Object3D>();
  private current: WeaponType | null = null;
  private bob = 0;
  private recoil = 0;
  private lastAction: unknown = null;

  constructor(camera: THREE.Camera) {
    this.root.add(this.holder);
    camera.add(this.root);
    this.root.visible = false;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  private model(type: WeaponType): THREE.Object3D {
    let m = this.models.get(type);
    if (!m) {
      // 손 뼈 기준 모델(칼날 +Y, 앞 +Z)을 카메라 기준(앞 -Z)으로 돌려 놓는다.
      const inner = makeHeldWeapon(type, 1);
      const wrap = new THREE.Group();
      wrap.add(inner);
      if (type === 'bow' || type === 'gun') {
        inner.rotation.y = Math.PI;
        inner.scale.multiplyScalar(type === 'gun' ? 0.5 : 0.28);
        // 활은 살짝 눕혀서 든다.
        if (type === 'bow') inner.rotation.z = -0.35;
      } else {
        inner.scale.multiplyScalar(type === 'staff' ? 0.26 : 0.27);
        // 칼날이 앞쪽 위로, 오른쪽으로 비스듬히
        inner.rotation.set(-0.55, 0, -0.35);
      }
      wrap.traverse((o) => {
        o.castShadow = false;
        o.renderOrder = 5;
      });
      m = wrap;
      this.models.set(type, m);
    }
    return m;
  }

  update(dt: number, p: Player): void {
    if (!this.root.visible) return;
    const type = p.weapon.def.type;
    if (type !== this.current) {
      this.holder.clear();
      this.holder.add(this.model(type));
      this.current = type;
    }

    const speed = Math.hypot(p.vel.x, p.vel.z);
    this.bob += dt * (p.grounded ? speed * 1.6 : 0);
    const bobX = Math.sin(this.bob) * 0.018 * Math.min(1, speed / 5);
    const bobY = Math.abs(Math.cos(this.bob)) * 0.022 * Math.min(1, speed / 5);

    const ranged = type === 'bow' || type === 'gun';
    // 기본 위치: 오른쪽 아래. 원거리 무기는 조금 더 가운데로.
    let x = ranged ? 0.2 : 0.3;
    let y = ranged ? -0.22 : -0.3;
    let z = ranged ? -0.5 : -0.55;
    let rx = 0;
    let ry = 0;
    let rz = 0;

    const a = p.action;
    if (a && a !== this.lastAction && (a.kind === 'shoot' || a.kind === 'rapid' || a.kind === 'barrage')) this.recoil = 1;
    this.lastAction = a;
    if (a && (a.kind === 'rapid' || a.kind === 'barrage' || a.kind === 'volley') && Math.sin(a.t * 60) > 0.9) this.recoil = 0.7;

    if (p.ads) {
      x = 0;
      y = -0.17;
      z = -0.42;
    } else if (p.guarding) {
      x = 0.05;
      y = -0.2;
      rz = 1.35;
      rx = 0.2;
    } else if (a) {
      const t = Math.min(1, a.t / a.dur);
      const e = 1 - Math.pow(1 - Math.min(1, t * 2), 3);
      switch (a.kind) {
        case 'slashV':
        case 'upper':
        case 'skyfall':
          rx = a.kind === 'slashV' ? 1.1 - e * 2.6 : -1.2 + e * 2.4;
          y += a.kind === 'slashV' ? 0.12 - e * 0.18 : -0.1 + e * 0.2;
          break;
        case 'slashH':
        case 'sunder':
        case 'cleave':
        case 'crescent':
        case 'hamstring':
          ry = 1.2 - e * 2.6;
          rz = 1.3;
          x = 0.3 - e * 0.5;
          break;
        case 'thrust':
        case 'iai':
          z -= e * 0.35;
          rx = -1.35;
          break;
        case 'whirl':
        case 'waves':
          ry = Math.sin(a.t * 18) * 1.4;
          rz = 1.3;
          break;
        case 'cast':
        case 'manaball':
        case 'laser':
          z -= 0.12 * e;
          rx = -0.4;
          break;
        default:
          break;
      }
    } else if (p.charge >= 0) {
      const c = Math.min(1, p.charge);
      if (type === 'bow') z += 0.08 * c;
      else if (type === 'staff') {
        y += 0.06 * c;
        rx = -0.3 * c;
      } else {
        ry = 0.9 * c;
        rz = 1.2 * c;
      }
    } else if (p.reloadTime > 0) {
      y -= 0.12;
      rx = -0.7;
      rz = 0.4;
    }

    this.recoil = Math.max(0, this.recoil - dt * 9);
    z += this.recoil * 0.06;
    rx += this.recoil * 0.25;

    // 목표 자세로 빠르게 따라간다 (동작은 날카롭게, 걷기 흔들림은 부드럽게).
    const k = Math.min(1, dt * 22);
    const h = this.holder;
    h.position.x += (x + bobX - h.position.x) * k;
    h.position.y += (y + bobY - h.position.y) * k;
    h.position.z += (z - h.position.z) * k;
    h.rotation.x += (rx - h.rotation.x) * k;
    h.rotation.y += (ry - h.rotation.y) * k;
    h.rotation.z += (rz - h.rotation.z) * k;

    const orb = h.getObjectByName('orb');
    if (orb) orb.scale.setScalar(p.charge >= 0 ? 1 + Math.min(p.charge, 1.2) * 1.2 : 1);
  }
}
