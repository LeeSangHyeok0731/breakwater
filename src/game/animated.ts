import * as THREE from 'three';
import { characterGltf, type CharacterName } from './assets';

// 뼈대 애니메이션 캐릭터. 하체(이동)와 상체(공격·조준)를 따로 재생할 수 있어서
// 달리면서 공격하는 동작이 자연스럽게 섞인다.

const LOWER_BONES = /^(root|hips|upperleg|lowerleg|foot|toes|kneeIK|control-|heelIK|IK-)/;

export type Layer = 'lower' | 'upper';

export interface PlayOpts {
  loop?: boolean;
  speed?: number;
  fade?: number;
  /** 같은 클립이라도 이 값이 바뀌면 처음부터 다시 재생한다 (연속 공격) */
  token?: unknown;
}

interface LayerState {
  clip: string;
  action: THREE.AnimationAction;
  token: unknown;
}

export interface Tint {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

const tintCache = new Map<string, THREE.Material>();

function tinted(mat: THREE.Material, tint: Tint): THREE.Material {
  const key = `${mat.uuid}|${tint.color ?? ''}|${tint.emissive ?? ''}|${tint.emissiveIntensity ?? ''}`;
  let m = tintCache.get(key);
  if (!m) {
    m = mat.clone();
    if (m instanceof THREE.MeshStandardMaterial) {
      if (tint.color !== undefined) m.color.multiply(new THREE.Color(tint.color));
      if (tint.emissive !== undefined) {
        m.emissive.set(tint.emissive);
        m.emissiveIntensity = tint.emissiveIntensity ?? 0.4;
      }
    }
    tintCache.set(key, m);
  }
  return m;
}

export class AnimatedModel {
  /** 위치·회전을 주는 바깥 그룹 */
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  readonly handR: THREE.Object3D | null;
  readonly handL: THREE.Object3D | null;
  private readonly model: THREE.Object3D;
  private clips = new Map<string, THREE.AnimationClip>();
  private splitClips = new Map<string, THREE.AnimationClip>();
  private layers: Record<Layer, LayerState | null> = { lower: null, upper: null };
  private meshes: THREE.Mesh[] = [];

  constructor(name: CharacterName, opts: { hide?: string[]; tint?: Tint } = {}) {
    const { scene, clips, scale } = characterGltf(name);
    this.model = scene;
    this.model.scale.setScalar(scale);
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const c of clips) this.clips.set(c.name, c);
    // GLTFLoader는 노드 이름의 '.'을 지운다 (handslot.r → handslotr).
    this.handR = this.model.getObjectByName('handslotr') ?? this.model.getObjectByName('handslot.r') ?? null;
    this.handL = this.model.getObjectByName('handslotl') ?? this.model.getObjectByName('handslot.l') ?? null;
    for (const n of opts.hide ?? []) {
      const o = this.model.getObjectByName(n);
      if (o) o.visible = false;
    }
    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // 숨긴 메시(기본 무기 등)는 깜빡임 대상에서 뺀다.
        if (o.visible) this.meshes.push(o);
        if (opts.tint) o.material = Array.isArray(o.material) ? o.material.map((m) => tinted(m, opts.tint!)) : tinted(o.material, opts.tint);
      }
    });
  }

  has(clip: string): boolean {
    return this.clips.has(clip);
  }

  duration(clip: string): number {
    return this.clips.get(clip)?.duration ?? 1;
  }

  /** 클립에서 하체 또는 상체 뼈의 트랙만 남긴 복사본 */
  private layerClip(clip: string, layer: Layer): THREE.AnimationClip | null {
    const key = `${clip}|${layer}`;
    let c = this.splitClips.get(key);
    if (!c) {
      const src = this.clips.get(clip);
      if (!src) return null;
      const tracks = src.tracks.filter((t) => {
        const bone = t.name.slice(0, t.name.lastIndexOf('.'));
        return LOWER_BONES.test(bone) === (layer === 'lower');
      });
      c = new THREE.AnimationClip(key, src.duration, tracks);
      this.splitClips.set(key, c);
    }
    return c;
  }

  play(layer: Layer, clip: string, opts: PlayOpts = {}): void {
    const cur = this.layers[layer];
    const speed = opts.speed ?? 1;
    if (cur && cur.clip === clip && cur.token === opts.token) {
      cur.action.timeScale = speed;
      return;
    }
    const c = this.layerClip(clip, layer);
    if (!c) return;
    const action = this.mixer.clipAction(c);
    action.reset();
    action.setLoop(opts.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = opts.loop === false;
    action.timeScale = speed;
    action.enabled = true;
    action.setEffectiveWeight(1);
    const fade = opts.fade ?? 0.15;
    if (cur && cur.action !== action) {
      action.play();
      cur.action.crossFadeTo(action, fade, false);
    } else {
      action.fadeIn(fade).play();
    }
    this.layers[layer] = { clip, action, token: opts.token };
  }

  /** 온몸에 같은 클립을 재생한다. */
  playFull(clip: string, opts: PlayOpts = {}): void {
    this.play('lower', clip, opts);
    this.play('upper', clip, opts);
  }

  current(layer: Layer): string | null {
    return this.layers[layer]?.clip ?? null;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  setVisible(v: boolean): void {
    for (const m of this.meshes) m.visible = v;
  }
}
