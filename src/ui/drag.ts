/**
 * 포인터로 하는 드래그 앤 드롭. 브라우저 기본 드래그는 반투명 그림이 작고 흐려서 쓰지 않는다.
 * 아이콘을 잡고 4px 넘게 움직이면 커서를 따라가는 아이콘이 생기고, 받을 수 있는 칸이 빛난다.
 */

export type DragItem =
  | { kind: 'weapon'; uid: string; from?: number }
  | { kind: 'gear'; id: string; equipped?: boolean }
  | { kind: 'skill'; id: string; from?: number };

interface DropZone {
  el: HTMLElement;
  accepts(item: DragItem): boolean;
  drop(item: DragItem): void;
}

const zones: DropZone[] = [];
const START_DIST = 4;

/** 받는 칸을 등록한다. 화면을 다시 그리면 떨어져 나간 칸은 알아서 빠진다. */
export function dropZone(el: HTMLElement, accepts: (item: DragItem) => boolean, drop: (item: DragItem) => void): void {
  zones.push({ el, accepts, drop });
}

function liveZones(): DropZone[] {
  for (let i = zones.length - 1; i >= 0; i--) if (!zones[i].el.isConnected) zones.splice(i, 1);
  return zones;
}

/** 끌 수 있게 만든다. 끌지 않고 놓으면 그냥 클릭으로 처리된다. */
export function draggable(el: HTMLElement, item: () => DragItem | null, iconUrl: string): void {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const it = item();
    if (!it) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let ghost: HTMLImageElement | null = null;
    let over: DropZone | null = null;
    let targets: DropZone[] = [];

    const move = (ev: PointerEvent): void => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < START_DIST) return;
        ghost = document.createElement('img');
        ghost.className = 'drag-ghost';
        ghost.src = iconUrl;
        document.body.appendChild(ghost);
        el.classList.add('dragging');
        targets = liveZones().filter((z) => z.accepts(it));
        for (const z of targets) z.el.classList.add('drop-ok');
      }
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
      const hit = zoneAt(ev.clientX, ev.clientY);
      if (hit !== over) {
        over?.el.classList.remove('drop-over');
        over = hit && targets.includes(hit) ? hit : null;
        over?.el.classList.add('drop-over');
      }
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!ghost) return;
      ghost.remove();
      el.classList.remove('dragging');
      for (const z of targets) z.el.classList.remove('drop-ok', 'drop-over');
      const hit = zoneAt(ev.clientX, ev.clientY);
      // 끌고 난 뒤의 click 이 다시 선택을 바꾸지 않게 한 번 막는다.
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      if (hit && targets.includes(hit)) hit.drop(it);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

function swallow(e: Event): void {
  e.stopPropagation();
  e.preventDefault();
}

/** 커서 아래에서 가장 안쪽에 있는 받는 칸 */
function zoneAt(x: number, y: number): DropZone | null {
  let node: Element | null = document.elementFromPoint(x, y);
  const list = liveZones();
  while (node) {
    const z = list.find((q) => q.el === node);
    if (z) return z;
    node = node.parentElement;
  }
  return null;
}
