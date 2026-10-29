import * as THREE from 'three';
import { cloneModel, propScale, type PropName } from './assets';

// 경기장·마을 공용 환경: 그라데이션 하늘, 절차적 바닥 텍스처, 풀숲, 소품 배치.

export function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 카메라를 따라다니는 하늘 구. 위·지평선·아래 색을 섞는다. */
export function makeSky(top: number, horizon: number, bottom: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      bottom: { value: new THREE.Color(bottom) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(280, 24, 12), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

/** 얼룩과 잡티가 섞인 바닥 텍스처 */
export function groundTexture(base: string, dark: string, light: string, seed: number, repeat: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // 경계에서 이어지도록 세 번 겹쳐 그린다.
  const blot = (color: string, count: number, rMin: number, rMax: number, alpha: number): void => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = rMin + rand() * (rMax - rMin);
      ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  };
  blot(dark, 60, 10, 34, 0.35);
  blot(light, 50, 8, 26, 0.3);
  blot(dark, 500, 1, 2.5, 0.5);
  blot(light, 400, 1, 2, 0.45);
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 가장자리가 부드럽게 사라지는 원형 투명도 텍스처 */
export function radialAlpha(inner: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, (size / 2) * inner, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** 풀잎을 인스턴싱으로 흩뿌린다. */
export function scatterGrass(
  count: number,
  rMin: number,
  rMax: number,
  colors: number[],
  seed: number,
  avoid?: (x: number, z: number) => boolean,
): THREE.InstancedMesh {
  const blade = new THREE.ConeGeometry(0.05, 0.36, 3, 1);
  blade.translate(0, 0.18, 0);
  const material = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
  const mesh = new THREE.InstancedMesh(blade, material, count);
  mesh.receiveShadow = true;
  const rand = seeded(seed);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 4; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rMin * rMin + rand() * (rMax * rMax - rMin * rMin));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (avoid?.(x, z)) continue;
    e.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
    q.setFromEuler(e);
    const s = 0.6 + rand() * 0.9;
    sc.set(s, s * (0.7 + rand() * 0.8), s);
    p.set(x, 0, z);
    m.compose(p, q, sc);
    mesh.setMatrixAt(placed, m);
    mesh.setColorAt(placed, c.setHex(colors[Math.floor(rand() * colors.length)]).multiplyScalar(0.8 + rand() * 0.4));
    placed++;
  }
  mesh.count = placed;
  return mesh;
}

/** KayKit 소품을 캐릭터와 같은 축척으로 놓는다. */
export function placeProp(scene: THREE.Object3D, name: PropName, x: number, z: number, rotY = 0, scale = 1): THREE.Object3D {
  const o = cloneModel(name);
  o.scale.setScalar(propScale() * scale);
  o.position.set(x, 0, z);
  o.rotation.y = rotY;
  scene.add(o);
  return o;
}
