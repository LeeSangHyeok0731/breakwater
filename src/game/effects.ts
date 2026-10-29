import * as THREE from 'three';

interface Particle {
  mesh: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
}

interface Fading {
  obj: THREE.Object3D;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  fromScale: number;
  toScale: number;
  startOpacity: number;
  /** 크기를 건드리지 않는다 (늘려 놓은 메시) */
  keepScale?: boolean;
}

interface FloatingText {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  life: number;
  maxLife: number;
}

export type TextKind = 'normal' | 'crit' | 'player' | 'info' | 'heal' | 'quiet';

const particleGeo = new THREE.IcosahedronGeometry(1, 0);

/** 가운데가 밝고 가장자리가 사라지는 원 (발광 입자용) */
function makeGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
const glowTexture = makeGlowTexture();
const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0);
const particleMats = new Map<number, THREE.SpriteMaterial>();
function particleMat(color: number): THREE.SpriteMaterial {
  let m = particleMats.get(color);
  if (!m) {
    m = new THREE.SpriteMaterial({
      color,
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    particleMats.set(color, m);
  }
  return m;
}

/** 파티클, 베기 궤적, 충격파, 데미지 숫자 같은 일회성 연출 */
export class Effects {
  private particles: Particle[] = [];
  private fading: Fading[] = [];
  private texts: FloatingText[] = [];
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private layer: HTMLElement,
  ) {}

  burst(pos: THREE.Vector3, color: number, count = 10, speed = 4, size = 0.1, life = 0.5, gravity = 9): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Sprite(particleMat(color));
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      // 발광 스프라이트는 가장자리가 투명하므로 조금 크게 그린다.
      const s = size * 2.6 * (0.6 + Math.random() * 0.8);
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, life: life, maxLife: life, size: s, gravity });
    }
  }

  /** 수평(또는 수직) 베기 궤적. yaw 방향을 중심으로 span 만큼 펼쳐진다. */
  slash(
    origin: THREE.Vector3,
    yaw: number,
    opts: { radius: number; span: number; color: number; vertical?: boolean; dur?: number; y?: number },
  ): void {
    const { radius, span, color } = opts;
    const outer = new THREE.Group();
    outer.position.copy(origin);
    outer.position.y += opts.y ?? 1.2;
    outer.rotation.y = yaw;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    let g: THREE.RingGeometry;
    const inner = new THREE.Mesh(undefined, material);
    if (opts.vertical) {
      g = new THREE.RingGeometry(radius * 0.45, radius, 20, 1, -Math.PI / 2.4, span);
      inner.rotation.y = -Math.PI / 2;
    } else {
      g = new THREE.RingGeometry(radius * 0.7, radius, 20, 1, -Math.PI / 2 - span / 2, span);
      inner.rotation.x = -Math.PI / 2;
    }
    inner.geometry = g;
    outer.add(inner);
    this.scene.add(outer);
    const life = opts.dur ?? 0.22;
    this.fading.push({ obj: outer, material, life, maxLife: life, fromScale: 1, toScale: 1.15, startOpacity: 0.55 });
  }

  /** 바닥에 퍼지는 원형 충격파 */
  ring(pos: THREE.Vector3, radius: number, color: number, dur = 0.4): void {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.08, pos.z);
    this.scene.add(m);
    this.fading.push({ obj: m, material, life: dur, maxLife: dur, fromScale: radius * 0.3, toScale: radius, startOpacity: 0.8 });
  }

  /** 순간적인 빛 덩어리 (폭발, 피격) */
  flash(pos: THREE.Vector3, radius: number, color: number, dur = 0.25): void {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(particleGeo, material);
    m.position.copy(pos);
    this.scene.add(m);
    this.fading.push({ obj: m, material, life: dur, maxLife: dur, fromScale: radius * 0.6, toScale: radius * 1.1, startOpacity: 0.9 });
  }

  /** 두 점을 잇는 빛줄기 (총알 궤적, 화살비) */
  tracer(from: THREE.Vector3, to: THREE.Vector3, color: number, width = 0.03, dur = 0.08): void {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    const m = new THREE.Mesh(tracerGeo, material);
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.scale.set(width, len, width);
    this.scene.add(m);
    this.fading.push({ obj: m, material, life: dur, maxLife: dur, fromScale: 1, toScale: 1, startOpacity: 0.9, keepScale: true });
  }

  text(pos: THREE.Vector3, text: string, kind: TextKind): void {
    const el = document.createElement('div');
    el.className = `float-text ft-${kind}`;
    el.textContent = text;
    this.layer.appendChild(el);
    const p = pos.clone();
    p.x += (Math.random() - 0.5) * 0.6;
    const life = kind === 'crit' ? 0.9 : 0.7;
    this.texts.push({ el, pos: p, life, maxLife: life });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(p.size * (p.life / p.maxLife));
    }

    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        f.material.dispose();
        f.obj.traverse((o) => {
          if (o instanceof THREE.Mesh && o.geometry !== particleGeo && o.geometry !== tracerGeo) o.geometry.dispose();
        });
        this.fading.splice(i, 1);
        continue;
      }
      const t = f.life / f.maxLife;
      f.material.opacity = f.startOpacity * t;
      if (!f.keepScale) f.obj.scale.setScalar(f.fromScale + (1 - t) * (f.toScale - f.fromScale));
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        t.el.remove();
        this.texts.splice(i, 1);
        continue;
      }
      t.pos.y += dt * 1.6;
      this.tmp.copy(t.pos).project(this.camera);
      if (this.tmp.z > 1) {
        t.el.style.display = 'none';
        continue;
      }
      t.el.style.display = '';
      const x = (this.tmp.x * 0.5 + 0.5) * w;
      const y = (-this.tmp.y * 0.5 + 0.5) * h;
      t.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      t.el.style.opacity = String(Math.min(1, (t.life / t.maxLife) * 2));
    }
  }

  clear(): void {
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const f of this.fading) {
      this.scene.remove(f.obj);
      f.material.dispose();
    }
    for (const t of this.texts) t.el.remove();
    this.particles = [];
    this.fading = [];
    this.texts = [];
  }
}
