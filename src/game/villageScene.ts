import * as THREE from 'three';
import { box, cone, cyl, ico, makePlayer, makeSword, mat } from './models';

/** 마을 화면 뒤에 보이는 배경 씬. 카메라가 마을 한쪽에서 천천히 좌우로 움직인다. */
export class VillageScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
  private time = 0;
  private fire: THREE.Mesh;
  private player = makePlayer();

  constructor() {
    const scene = this.scene;
    scene.background = new THREE.Color(0xf0b88a);
    scene.fog = new THREE.Fog(0xf0b88a, 30, 90);
    scene.add(new THREE.HemisphereLight(0xffe2c4, 0x4a3a28, 1.0));
    const sun = new THREE.DirectionalLight(0xffc89a, 1.6);
    sun.position.set(-20, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 48), mat(0x6b8a45));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(7, 32), mat(0xa89a7a));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.01;
    plaza.receiveShadow = true;
    scene.add(plaza);

    const walls = [0xe8dcc0, 0xd8c8a8, 0xf0e4d0];
    const roofs = [0xb5492f, 0x7a4a8a, 0x3a6a9a];
    const houses: [number, number, number][] = [
      [-10, -4, 0.6],
      [-6, 9, 2.4],
      [-1, 13, 3.0],
      [11, -6, -0.9],
      [0, -13, 0],
      [-12, 6, 1.8],
    ];
    houses.forEach(([x, z, ry], i) => {
      const h = new THREE.Group();
      const body = box(4, 3, 3.5, mat(walls[i % 3]));
      body.position.y = 1.5;
      h.add(body);
      const roof = cone(3.4, 2.2, 4, mat(roofs[i % 3]));
      roof.position.y = 4.1;
      roof.rotation.y = Math.PI / 4;
      h.add(roof);
      const door = box(0.9, 1.6, 0.1, mat(0x5a3a22));
      door.position.set(0, 0.8, 1.76);
      h.add(door);
      const win = box(0.7, 0.6, 0.1, mat(0xffe08a, 0xffb040, 0.8));
      win.position.set(1.2, 1.9, 1.76);
      h.add(win);
      h.position.set(x, 0, z);
      h.rotation.y = ry;
      scene.add(h);
    });

    const trunk = mat(0x6b4a2a);
    const leaf = mat(0x4f8a3a);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + Math.sin(i * 7) * 0.2;
      const r = 27 + (i % 5) * 4;
      const t = cyl(0.25, 0.35, 1.6, 6, trunk);
      t.position.set(Math.cos(a) * r, 0.8, Math.sin(a) * r);
      scene.add(t);
      const l = cone(1.5, 3.4, 7, leaf);
      l.position.set(t.position.x, 3.1, t.position.z);
      scene.add(l);
    }

    // 광장 가운데 모닥불
    for (let i = 0; i < 6; i++) {
      const s = ico(0.25, mat(0x8a8a84));
      const a = (i / 6) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.7, 0.15, Math.sin(a) * 0.7);
      scene.add(s);
    }
    this.fire = cone(0.45, 1.1, 6, mat(0xff8a2a, 0xff6a0a, 2.5));
    this.fire.position.y = 0.55;
    scene.add(this.fire);
    const light = new THREE.PointLight(0xff9a40, 8, 12);
    light.position.y = 1.2;
    scene.add(light);

    const rig = this.player;
    rig.hand.add(makeSword());
    rig.root.position.set(1.8, 0, 1.2);
    rig.root.rotation.y = -2.3;
    rig.armR.rotation.x = -0.35;
    scene.add(rig.root);
  }

  update(dt: number): void {
    this.time += dt;
    const a = 0.6 + Math.sin(this.time * 0.06) * 0.45;
    this.camera.position.set(Math.cos(a) * 21, 12, Math.sin(a) * 21);
    this.camera.lookAt(-2, 0.5, 0);
    this.fire.scale.set(1 + Math.sin(this.time * 9) * 0.08, 1 + Math.sin(this.time * 13) * 0.15, 1);
    this.player.body.position.y = Math.sin(this.time * 2) * 0.02;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
