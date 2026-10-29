import * as THREE from 'three';
import type { Input } from '../core/input';

export type ViewMode = 'third' | 'first';

/** 마우스 1픽셀당 회전량 (감도 1 기준) */
const RAD_PER_PIXEL = 0.0022;
const EYE_HEIGHT = 1.62;

/**
 * 어깨 시점(3인칭)과 1인칭을 오가는 카메라. 전투와 마을이 함께 쓴다.
 * 마우스 이동량을 그 프레임에 바로 반영하고 보간하지 않으므로 화면이 마우스와 1:1로 움직인다.
 */
export class CameraRig {
  yaw = 0;
  pitch = 0.15;
  mode: ViewMode = 'third';
  private shakeAmount = 0;
  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** 이번 프레임의 마우스 이동을 시선에 반영한다. */
  look(input: Input, sensitivity: number): void {
    const k = RAD_PER_PIXEL * sensitivity;
    this.yaw -= input.mouseDX * k;
    const [lo, hi] = this.mode === 'first' ? [-1.45, 1.45] : [-0.75, 1.0];
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * k, lo, hi);
  }

  toggle(): ViewMode {
    this.mode = this.mode === 'third' ? 'first' : 'third';
    if (this.mode === 'third') this.pitch = THREE.MathUtils.clamp(this.pitch, -0.75, 1.0);
    return this.mode;
  }

  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** 시선 방향 (단위 벡터) */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  /**
   * 발 위치(target)를 기준으로 카메라를 놓는다.
   * dt가 0이면 흔들림·시야각 보간 없이 위치만 맞춘다 (조준 계산용).
   */
  update(target: THREE.Vector3, dt: number, opts: { ads?: boolean } = {}): void {
    const cam = this.camera;
    this.forward(this.dir);
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    const targetFov = opts.ads ? 42 : this.mode === 'first' ? 75 : 65;
    if (dt > 0 && Math.abs(cam.fov - targetFov) > 0.1) {
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 12);
      cam.updateProjectionMatrix();
    }

    if (this.mode === 'first') {
      cam.position.set(target.x, target.y + EYE_HEIGHT, target.z);
      // 머리 속이 보이지 않도록 살짝 앞으로
      cam.position.addScaledVector(this.dir, 0.12);
    } else {
      cam.position.set(target.x, target.y + 1.65, target.z);
      cam.position.addScaledVector(this.dir, opts.ads ? -3.2 : -4.3).addScaledVector(this.right, opts.ads ? 0.9 : 0.75);
      if (cam.position.y < 0.4) cam.position.y = 0.4;
    }

    if (this.shakeAmount > 0 && dt > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmount;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmount;
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.5);
    }
    cam.lookAt(cam.position.x + this.dir.x, cam.position.y + this.dir.y, cam.position.z + this.dir.z);
  }
}
