export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function button(parent: HTMLElement, text: string, cls: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
  const b = el('button', `ui-btn ${cls}`.trim(), parent, text);
  b.disabled = !enabled;
  b.addEventListener('click', onClick);
  return b;
}

/** 픽셀 아이콘 이미지 (CSS로 확대해 그린다) */
export function iconImg(parent: HTMLElement, url: string, cls = ''): HTMLImageElement {
  const img = el('img', `px-icon ${cls}`.trim(), parent);
  img.src = url;
  img.draggable = false;
  img.alt = '';
  return img;
}
