// One original vector family shared by the toolbar, menus and map labels.
export function icon(name) {
  return `<svg class="farm-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="./icons.svg#${name}"></use></svg>`;
}
