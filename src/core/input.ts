export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'dodge'
  | 'guard'
  | 'swap'
  | 'reload'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'slot7'
  | 'slot8'
  | 'item1'
  | 'item2'
  | 'view'
  | 'interact';

export type Keymap = Record<Action, string>;

// Ctrl은 Ctrl+W(탭 닫기) 같은 브라우저 단축키와 겹치므로 가드는 C로 둔다.
export const DEFAULT_KEYMAP: Keymap = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  dodge: 'ShiftLeft',
  guard: 'KeyC',
  swap: 'Tab',
  reload: 'KeyR',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
  slot4: 'Digit4',
  slot5: 'KeyQ',
  slot6: 'KeyE',
  slot7: 'KeyF',
  slot8: 'KeyG',
  item1: 'KeyZ',
  item2: 'KeyX',
  view: 'KeyV',
  // 마을 전용이라 전투 키(F = 스킬 슬롯 7)와 겹쳐도 된다.
  interact: 'KeyF',
};

export const SLOT_ACTIONS: Action[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'];

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Space') return 'Space';
  return code;
}

/** keydown 리스너 하나와 키맵 객체로 모든 동작을 처리한다. 키 변경은 키맵만 바꾸면 된다. */
export class Input {
  mouseDX = 0;
  mouseDY = 0;
  lmb = false;
  rmb = false;
  lmbPressed = false;
  rmbPressed = false;
  rmbReleased = false;
  locked = false;

  private down = new Set<Action>();
  private pressedSet = new Set<Action>();
  /** 한 키에 여러 동작이 묶일 수 있다 (마을의 상호작용과 전투의 스킬 슬롯처럼 쓰는 곳이 다를 때). */
  private codeToActions = new Map<string, Action[]>();
  private lockListeners: ((locked: boolean) => void)[] = [];

  constructor(private target: HTMLElement, keymap: Keymap) {
    this.setKeymap(keymap);

    window.addEventListener('keydown', (e) => {
      const actions = this.codeToActions.get(e.code);
      if (!actions) return;
      if (this.locked) e.preventDefault();
      for (const action of actions) {
        if (!e.repeat) this.pressedSet.add(action);
        this.down.add(action);
      }
    });
    window.addEventListener('keyup', (e) => {
      for (const action of this.codeToActions.get(e.code) ?? []) this.down.delete(action);
    });
    window.addEventListener('blur', () => this.releaseAll());

    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.lmb = true;
        this.lmbPressed = true;
      } else if (e.button === 2) {
        this.rmb = true;
        this.rmbPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      else if (e.button === 2) {
        if (this.rmb) this.rmbReleased = true;
        this.rmb = false;
      }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      if (!this.fakeLock) this.setLocked(document.pointerLockElement === this.target);
    });
    // 잠금이 거부되면(예: Esc 직후 1초 안에 다시 요청) 잠기지 않은 상태를 다시 알린다.
    document.addEventListener('pointerlockerror', () => this.setLocked(false));
    window.addEventListener('keydown', (e) => {
      if (this.fakeLock && this.locked && e.code === 'Escape') this.setLocked(false);
    });
  }

  /** 개발용: 실제 포인터 잠금 없이 잠긴 것처럼 동작한다 (자동화 테스트에서 잠금이 거부될 때). */
  fakeLock = false;

  private setLocked(locked: boolean): void {
    this.locked = locked;
    if (!locked) this.releaseAll();
    for (const fn of this.lockListeners) fn(locked);
  }

  setKeymap(keymap: Keymap): void {
    this.codeToActions.clear();
    for (const [action, code] of Object.entries(keymap) as [Action, string][]) {
      const list = this.codeToActions.get(code) ?? [];
      list.push(action);
      this.codeToActions.set(code, list);
    }
  }

  /** 포인터 잠금 변화를 구독한다. 돌려받은 함수를 호출하면 구독이 해제된다. */
  onLockChange(fn: (locked: boolean) => void): () => void {
    this.lockListeners.push(fn);
    return () => {
      this.lockListeners = this.lockListeners.filter((l) => l !== fn);
    };
  }

  requestLock(): void {
    if (this.fakeLock) {
      this.setLocked(true);
      return;
    }
    // 운영체제의 마우스 가속을 빼고 원시 이동량을 받는다 (지원하지 않는 브라우저는 일반 잠금).
    const lock = this.target.requestPointerLock as (opts?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
    const result = lock.call(this.target, { unadjustedMovement: true });
    result?.catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'NotSupportedError') {
        const plain = lock.call(this.target);
        plain?.catch(() => this.setLocked(false));
      } else {
        this.setLocked(false);
      }
    });
  }

  exitLock(): void {
    if (this.fakeLock) {
      if (this.locked) this.setLocked(false);
    } else if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  isDown(action: Action): boolean {
    return this.down.has(action);
  }

  pressed(action: Action): boolean {
    return this.pressedSet.has(action);
  }

  endFrame(): void {
    this.pressedSet.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.lmbPressed = false;
    this.rmbPressed = false;
    this.rmbReleased = false;
  }

  private releaseAll(): void {
    this.down.clear();
    this.lmb = false;
    if (this.rmb) this.rmbReleased = true;
    this.rmb = false;
  }
}
