import * as THREE from 'three';
import type { MonsterKind } from '../data/monsters';

// 로우폴리 카툰 모델을 기본 도형으로 조립한다. 나중에 CC0 glTF 에셋으로 교체할 수 있도록
// 모든 모델은 같은 Rig 구조(root/body/팔/다리/손)를 돌려준다.

const materials = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, emissive = 0x000000, emissiveIntensity = 1): THREE.MeshStandardMaterial {
  const key = `${color}|${emissive}|${emissiveIntensity}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, flatShading: true, roughness: 0.85 });
    materials.set(key, m);
  }
  return m;
}

const geometries = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.castShadow = true;
  return out;
}

export function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  return mesh(geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m);
}
export function ico(r: number, m: THREE.Material, detail = 0): THREE.Mesh {
  return mesh(geo(`ico${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail)), m);
}
export function cone(r: number, h: number, seg: number, m: THREE.Material): THREE.Mesh {
  return mesh(geo(`cone${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), m);
}
export function cyl(rt: number, rb: number, h: number, seg: number, m: THREE.Material): THREE.Mesh {
  return mesh(geo(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m);
}

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Object3D;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  hand: THREE.Group;
  wingL?: THREE.Group;
  wingR?: THREE.Group;
  /** 공격 준비 시 빛나는 부위 (마법사 오브 등) */
  glow?: THREE.Mesh;
}

interface HumanoidColors {
  skin: number;
  shirt: number;
  pants: number;
  eye?: number;
}

function humanoid(c: HumanoidColors): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.18, 0.9, 0);
  legR.position.set(0.18, 0.9, 0);
  for (const leg of [legL, legR]) {
    const l = box(0.24, 0.9, 0.26, mat(c.pants));
    l.position.y = -0.45;
    leg.add(l);
    body.add(leg);
  }

  const torso = box(0.7, 0.8, 0.4, mat(c.shirt));
  torso.position.y = 1.3;
  body.add(torso);

  const head = ico(0.28, mat(c.skin), 1);
  head.position.y = 1.98;
  body.add(head);
  const eyeMat = c.eye !== undefined ? mat(c.eye, c.eye, 1.5) : mat(0x1a1a1a);
  for (const x of [-0.1, 0.1]) {
    const eye = box(0.07, 0.07, 0.04, eyeMat);
    eye.position.set(x, 0.03, 0.25);
    head.add(eye);
  }

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.47, 1.62, 0);
  armR.position.set(0.47, 1.62, 0);
  for (const arm of [armL, armR]) {
    const a = box(0.2, 0.72, 0.2, mat(c.shirt));
    a.position.y = -0.33;
    arm.add(a);
    const fist = ico(0.12, mat(c.skin));
    fist.position.y = -0.72;
    arm.add(fist);
    body.add(arm);
  }
  const hand = new THREE.Group();
  hand.position.y = -0.74;
  armR.add(hand);

  return { root, body, head, armL, armR, legL, legR, hand };
}

export function makePlayer(): Rig {
  const rig = humanoid({ skin: 0xf2c79b, shirt: 0x3a6fd8, pants: 0x2b2f3a });
  const hair = box(0.5, 0.2, 0.5, mat(0x5a3a22));
  hair.position.set(0, 0.2, -0.03);
  rig.head.add(hair);
  const belt = box(0.74, 0.1, 0.44, mat(0x6b4a2a));
  belt.position.y = 0.95;
  rig.body.add(belt);
  const scarf = box(0.5, 0.12, 0.45, mat(0xd83a3a));
  scarf.position.y = 1.72;
  rig.body.add(scarf);
  const cape = box(0.62, 0.9, 0.05, mat(0xb52f2f));
  cape.position.set(0, 1.25, -0.24);
  rig.body.add(cape);
  return rig;
}

export function makeSword(): THREE.Group {
  const g = new THREE.Group();
  const grip = cyl(0.04, 0.04, 0.28, 6, mat(0x5a3a22));
  grip.position.y = 0.0;
  g.add(grip);
  const guard = box(0.34, 0.06, 0.08, mat(0xd9a93a, 0x3a2a00));
  guard.position.y = 0.16;
  g.add(guard);
  const blade = box(0.09, 1.05, 0.03, mat(0xdfe6ee, 0x223344, 0.4));
  blade.position.y = 0.71;
  g.add(blade);
  const tip = cone(0.064, 0.16, 4, mat(0xdfe6ee, 0x223344, 0.4));
  tip.position.y = 1.31;
  tip.rotation.y = Math.PI / 4;
  tip.scale.z = 0.35;
  g.add(tip);
  // 칼날이 손 기준 앞(+Z)을 향하도록 눕힌다.
  g.rotation.x = Math.PI / 2;
  return g;
}

export function makeStaff(): THREE.Group {
  const g = new THREE.Group();
  const shaft = cyl(0.045, 0.055, 1.7, 6, mat(0x6b4526));
  shaft.position.y = 0.35;
  g.add(shaft);
  const crown = cone(0.14, 0.25, 5, mat(0xd9a93a, 0x3a2a00));
  crown.position.y = 1.25;
  crown.rotation.x = Math.PI;
  g.add(crown);
  const orb = ico(0.15, mat(0x7fe8ff, 0x3fc8ff, 2.2), 1);
  orb.position.y = 1.38;
  orb.name = 'orb';
  g.add(orb);
  g.rotation.x = Math.PI / 2;
  return g;
}

function makeZombie(): Rig {
  const rig = humanoid({ skin: 0x8fbf6a, shirt: 0x6e5b44, pants: 0x3c4658, eye: 0xff3b2f });
  const rag = box(0.3, 0.3, 0.05, mat(0x4f4030));
  rag.position.set(0.15, 1.05, 0.22);
  rag.rotation.z = 0.3;
  rig.body.add(rag);
  rig.head.rotation.z = 0.2;
  return rig;
}

function makeMage(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const robe = cone(0.6, 1.5, 7, mat(0x5b2d8c));
  robe.position.y = 0.75;
  body.add(robe);
  const torso = box(0.5, 0.5, 0.36, mat(0x4a2275));
  torso.position.y = 1.6;
  body.add(torso);
  const head = ico(0.25, mat(0xcdbfa6), 1);
  head.position.y = 2.05;
  body.add(head);
  for (const x of [-0.09, 0.09]) {
    const eye = box(0.06, 0.05, 0.04, mat(0xff4fd0, 0xff4fd0, 2));
    eye.position.set(x, 0.02, 0.23);
    head.add(eye);
  }
  const hat = cone(0.36, 0.75, 6, mat(0x2e1450));
  hat.position.y = 0.5;
  hat.rotation.z = -0.15;
  head.add(hat);
  const brim = cyl(0.42, 0.42, 0.05, 8, mat(0x2e1450));
  brim.position.y = 0.17;
  head.add(brim);

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.34, 1.78, 0);
  armR.position.set(0.34, 1.78, 0);
  for (const arm of [armL, armR]) {
    const a = box(0.16, 0.6, 0.16, mat(0x5b2d8c));
    a.position.y = -0.28;
    arm.add(a);
    body.add(arm);
  }
  const hand = new THREE.Group();
  hand.position.y = -0.6;
  armR.add(hand);
  const staff = cyl(0.035, 0.04, 1.6, 5, mat(0x3b2a1a));
  staff.position.y = 0.2;
  hand.add(staff);
  const glow = ico(0.16, mat(0xff4fa0, 0xff2f8f, 1.2), 1);
  glow.position.y = 1.05;
  hand.add(glow);

  return { root, body, head, armL, armR, legL: new THREE.Group(), legR: new THREE.Group(), hand, glow };
}

function makeMinion(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const core = ico(0.38, mat(0x7a1f2b), 1);
  body.add(core);
  const belly = ico(0.24, mat(0xb8545e));
  belly.position.set(0, -0.08, 0.2);
  body.add(belly);
  for (const x of [-0.13, 0.13]) {
    const eye = box(0.09, 0.07, 0.05, mat(0xffe14a, 0xffd21a, 2));
    eye.position.set(x, 0.1, 0.33);
    body.add(eye);
    const horn = cone(0.06, 0.25, 4, mat(0x2a0a10));
    horn.position.set(x * 1.4, 0.38, 0.05);
    horn.rotation.z = -x * 2;
    body.add(horn);
  }
  const wingL = new THREE.Group();
  const wingR = new THREE.Group();
  wingL.position.set(-0.3, 0.05, -0.05);
  wingR.position.set(0.3, 0.05, -0.05);
  const wingMat = mat(0x3a0f18);
  const wl = box(0.9, 0.05, 0.5, wingMat);
  wl.position.x = -0.45;
  wingL.add(wl);
  const wr = box(0.9, 0.05, 0.5, wingMat);
  wr.position.x = 0.45;
  wingR.add(wr);
  body.add(wingL, wingR);
  const tail = cone(0.05, 0.4, 4, mat(0x2a0a10));
  tail.position.set(0, -0.2, -0.38);
  tail.rotation.x = -2.2;
  body.add(tail);
  return {
    root,
    body,
    head: core,
    armL: new THREE.Group(),
    armR: new THREE.Group(),
    legL: new THREE.Group(),
    legR: new THREE.Group(),
    hand: new THREE.Group(),
    wingL,
    wingR,
  };
}

function makeGolem(lord: boolean): Rig {
  const stone = lord ? 0x4a4448 : 0x8a8f96;
  const dark = lord ? 0x2e2a2d : 0x6a6f76;
  const eyeColor = lord ? 0xff4a1a : 0xffa52f;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.45, 1.0, 0);
  legR.position.set(0.45, 1.0, 0);
  for (const leg of [legL, legR]) {
    const l = box(0.55, 1.0, 0.6, mat(dark));
    l.position.y = -0.5;
    leg.add(l);
    body.add(leg);
  }
  const torso = box(1.6, 1.3, 1.0, mat(stone));
  torso.position.y = 1.85;
  body.add(torso);
  const chest = box(1.0, 0.5, 0.2, mat(dark));
  chest.position.set(0, 2.0, 0.52);
  body.add(chest);

  const head = box(0.62, 0.5, 0.56, mat(stone));
  head.position.y = 2.78;
  body.add(head);
  for (const x of [-0.14, 0.14]) {
    const eye = box(0.12, 0.08, 0.05, mat(eyeColor, eyeColor, 2.5));
    eye.position.set(x, 0.02, 0.29);
    head.add(eye);
  }

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-1.05, 2.3, 0);
  armR.position.set(1.05, 2.3, 0);
  for (const arm of [armL, armR]) {
    const a = box(0.55, 1.3, 0.6, mat(stone));
    a.position.y = -0.55;
    arm.add(a);
    const fist = box(0.75, 0.6, 0.75, mat(dark));
    fist.position.y = -1.35;
    arm.add(fist);
    body.add(arm);
  }

  if (lord) {
    const lava = mat(0xff5a1f, 0xff4a0f, 2);
    const cracks: [number, number, number, number, number][] = [
      [0.06, 0.9, -0.4, 1.9, 0.3],
      [0.06, 0.6, 0.35, 1.75, -0.5],
      [0.5, 0.06, 0.1, 1.5, 0],
    ];
    for (const [w, h, x, y, rz] of cracks) {
      const c = box(w, h, 0.04, lava);
      c.position.set(x, y, 0.51);
      c.rotation.z = rz;
      body.add(c);
    }
    const core = ico(0.18, lava, 1);
    core.position.set(0, 2.0, 0.63);
    body.add(core);
    const gold = mat(0xe0b040, 0x5a3a00);
    for (let i = 0; i < 5; i++) {
      const spike = cone(0.07, 0.3, 4, gold);
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.24, 0.35, Math.sin(a) * 0.22);
      head.add(spike);
    }
  } else {
    const moss = mat(0x5f8f3a);
    const m1 = box(0.5, 0.15, 0.5, moss);
    m1.position.set(-0.4, 2.55, 0.1);
    body.add(m1);
    const m2 = box(0.3, 0.12, 0.4, moss);
    m2.position.set(1.05, 2.62, 0);
    body.add(m2);
  }

  return { root, body, head, armL, armR, legL, legR, hand: new THREE.Group() };
}

export function makeMonster(kind: MonsterKind): Rig {
  switch (kind) {
    case 'zombie':
      return makeZombie();
    case 'mage':
      return makeMage();
    case 'minion':
      return makeMinion();
    case 'golem':
      return makeGolem(false);
    case 'golem_lord':
      return makeGolem(true);
  }
}

/** 엘리트 몬스터 발밑의 오라 */
export function makeEliteAura(radius: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.7, radius, 24),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.05;
  return m;
}
