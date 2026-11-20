// Preserve the illustrated farm geometry and keep every purchase target above the toolbar.
export function fitWorld(width, height, dockTop) {
  const top = width < 650 ? 112 : 76;
  const bottom = Math.max(top + 60, Math.min(height, dockTop) - 27);
  const scale = Math.max(.05, Math.min(width / 1672, (bottom - top) / 740));
  return { scale, x: (width - 1672 * scale) / 2, y: top + (bottom - top - 740 * scale) / 2 - 110 * scale };
}
export function screenToWorld(x,y,view) {return {x:(x-view.x)/view.scale,y:(y-view.y)/view.scale};}
