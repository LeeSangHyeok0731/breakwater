export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'attack'
  | 'special'
  | 'dodge'
  | 'guard'
  | 'swap'
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
  | 'interact'
  | 'inventory'
  | 'skills'
  | 'menu';

export type Keymap = Record<Action, string>;

/** 이동은 방향키, 나머지는 모두 키보드. 기본 공격은 R. */
export const DEFAULT_KEYMAP: Keymap = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  jump: 'Space',
  attack: 'KeyR',
  special: 'KeyT',
  dodge: 'ShiftLeft',
  guard: 'KeyC',
  swap: 'Tab',
  slot1: 'KeyQ',
  slot2: 'KeyW',
  slot3: 'KeyE',
  slot4: 'KeyA',
  slot5: 'KeyS',
  slot6: 'KeyD',
  slot7: 'KeyF',
  slot8: 'KeyG',
  item1: 'KeyZ',
  item2: 'KeyX',
  // NPC 앞에서 위쪽 방향키로 대화한다 (위 방향과 같은 키).
  interact: 'ArrowUp',
  // 마을에서 장비창·스킬창을 바로 연다.
  inventory: 'KeyI',
  skills: 'KeyK',
  menu: 'Escape',
};

export const SLOT_ACTIONS: Action[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'];

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    Space: 'Space',
    Escape: 'Esc',
    Tab: 'Tab',
    Enter: 'Enter',
  };
  return names[code] ?? code;
}

/** 키보드 입력. 한 키에 여러 동작이 묶일 수 있다 (예: ↑ = 위·대화). */
export class Input {
  /** 창이 열려 있을 때처럼 게임 입력을 막는다. */
  enabled = true;

  private down = new Set<Action>();
  private pressedSet = new Set<Action>();
  private releasedSet = new Set<Action>();
  private codeToActions = new Map<string, Action[]>();

  constructor(keymap: Keymap) {
    this.setKeymap(keymap);
    window.addEventListener('keydown', (e) => {
      const actions = this.codeToActions.get(e.code);
      if (!actions) return;
      // 스크롤·포커스 이동 같은 브라우저 기본 동작을 막는다.
      if (this.enabled && e.code !== 'Escape') e.preventDefault();
      if (e.repeat) return;
      for (const a of actions) {
        this.pressedSet.add(a);
        this.down.add(a);
      }
    });
    window.addEventListener('keyup', (e) => {
      for (const a of this.codeToActions.get(e.code) ?? []) {
        if (this.down.has(a)) this.releasedSet.add(a);
        this.down.delete(a);
      }
    });
    window.addEventListener('blur', () => {
      for (const a of this.down) this.releasedSet.add(a);
      this.down.clear();
    });
  }

  setKeymap(keymap: Keymap): void {
    this.codeToActions.clear();
    for (const [action, code] of Object.entries(keymap) as [Action, string][]) {
      const list = this.codeToActions.get(code) ?? [];
      list.push(action);
      this.codeToActions.set(code, list);
    }
  }

  isDown(a: Action): boolean {
    return this.enabled && this.down.has(a);
  }

  pressed(a: Action): boolean {
    return this.enabled && this.pressedSet.has(a);
  }

  released(a: Action): boolean {
    return this.releasedSet.has(a);
  }

  endFrame(): void {
    this.pressedSet.clear();
    this.releasedSet.clear();
  }
}
