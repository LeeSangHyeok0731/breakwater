import * as THREE from 'three';
import type { WeaponType } from '../data/weapons';
import { cloneModel } from './assets';
import { ico, makeBow, makeGun, mat } from './models';

/**
 * 손 뼈(handslot)에 붙이는 무기 모델. 손 뼈 기준으로 칼날은 +Y, 원거리 무기의 앞은 +Z.
 * KayKit에 없는 활·총은 직접 만든 모델을 쓰고, 캐릭터 축척만큼 되돌려 실제 크기를 맞춘다.
 */
export function makeHeldWeapon(type: WeaponType, characterScale: number): THREE.Object3D {
  switch (type) {
    case 'sword':
      return cloneModel('sword_1handed');
    case 'dao': {
      const m = cloneModel('sword_2handed');
      m.scale.setScalar(0.8);
      return m;
    }
    case 'staff': {
      const g = new THREE.Group();
      g.add(cloneModel('staff'));
      const orb = ico(0.16, mat(0x7fe8ff, 0x3fc8ff, 3), 1);
      orb.position.y = 1.3;
      orb.name = 'orb';
      g.add(orb);
      return g;
    }
    case 'bow': {
      const bow = makeBow();
      bow.rotation.set(0, 0, 0);
      bow.scale.setScalar(1 / characterScale);
      return bow;
    }
    case 'gun': {
      const gun = makeGun();
      gun.rotation.set(0, 0, 0);
      gun.scale.setScalar(1.4 / characterScale);
      return gun;
    }
  }
}
