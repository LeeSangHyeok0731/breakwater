import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// KayKit (CC0) 에셋. public/assets 아래에 있다.

export const CHARACTERS = [
  'Knight',
  'Barbarian',
  'Mage',
  'Rogue',
  'Skeleton_Minion',
  'Skeleton_Mage',
  'Skeleton_Warrior',
  'Skeleton_Rogue',
] as const;
export type CharacterName = (typeof CHARACTERS)[number];

export const WEAPON_MODELS = [
  'sword_1handed',
  'sword_2handed',
  'axe_1handed',
  'staff',
  'Skeleton_Blade',
  'Skeleton_Staff',
  'Skeleton_Axe',
] as const;
export type WeaponModelName = (typeof WEAPON_MODELS)[number];

export const PROPS = [
  'gravestone',
  'grave_A',
  'grave_B',
  'grave_A_destroyed',
  'gravemarker_A',
  'gravemarker_B',
  'fence',
  'fence_broken',
  'fence_pillar',
  'tree_dead_large',
  'tree_dead_medium',
  'tree_dead_small',
  'tree_pine_orange_large',
  'tree_pine_orange_medium',
  'tree_pine_yellow_large',
  'lantern_standing',
  'post_lantern',
  'post_skull',
  'crypt',
  'coffin',
  'skull',
  'bone_A',
  'bone_B',
  'ribcage',
  'pumpkin_orange',
  'pumpkin_orange_jackolantern',
  'candle_triple',
  'arch_gate',
  'shrine_candles',
  'bench',
] as const;
export type PropName = (typeof PROPS)[number];

/** 캐릭터를 이 키(m)에 맞춘다. */
const CHARACTER_HEIGHT: Record<CharacterName, number> = {
  Knight: 1.95,
  Barbarian: 2.05,
  Mage: 1.95,
  Rogue: 1.9,
  Skeleton_Minion: 1.9,
  Skeleton_Mage: 2.05,
  Skeleton_Warrior: 2.2,
  Skeleton_Rogue: 1.9,
};

const gltfs = new Map<string, GLTF>();
const scales = new Map<string, number>();

function url(path: string): string {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}

function prepare(scene: THREE.Object3D): void {
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

/** 모든 에셋을 불러온다. 진행률(0..1)을 알려 준다. */
export async function loadAssets(onProgress?: (ratio: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const jobs: [string, string][] = [
    ...CHARACTERS.map((n): [string, string] => [n, url(`characters/${n}.glb`)]),
    ...WEAPON_MODELS.map((n): [string, string] => [n, url(`weapons/${n}.gltf`)]),
    ...PROPS.map((n): [string, string] => [n, url(`props/${n}.gltf`)]),
  ];
  let done = 0;
  await Promise.all(
    jobs.map(async ([key, path]) => {
      const gltf = await loader.loadAsync(path);
      prepare(gltf.scene);
      gltfs.set(key, gltf);
      done++;
      onProgress?.(done / jobs.length);
    }),
  );
  for (const name of CHARACTERS) {
    const box = new THREE.Box3().setFromObject(gltfs.get(name)!.scene);
    scales.set(name, CHARACTER_HEIGHT[name] / Math.max(0.01, box.max.y - box.min.y));
  }
}

export function characterGltf(name: CharacterName): { scene: THREE.Object3D; clips: THREE.AnimationClip[]; scale: number } {
  const gltf = gltfs.get(name);
  if (!gltf) throw new Error(`asset not loaded: ${name}`);
  return { scene: cloneSkinned(gltf.scene), clips: gltf.animations, scale: scales.get(name) ?? 1 };
}

/** 정적 모델(무기·소품) 복제. 재질과 지오메트리는 공유한다. */
export function cloneModel(name: WeaponModelName | PropName): THREE.Object3D {
  const gltf = gltfs.get(name);
  if (!gltf) throw new Error(`asset not loaded: ${name}`);
  return gltf.scene.clone(true);
}

/** 소품 축척: 캐릭터(기사)와 같은 비율로 맞춘다. */
export function propScale(): number {
  return scales.get('Knight') ?? 1;
}
