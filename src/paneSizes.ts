export interface PaneSizes {
  left: number;
  right: number;
}

export const defaultPaneSizes: PaneSizes = { left: 248, right: 326 };

const COMPACT_BREAKPOINT = 1120;
const MAIN_PANE_MINIMUM = 560;
const LEFT_PANE_MINIMUM = 210;
const LEFT_PANE_MAXIMUM = 380;
const RIGHT_PANE_MINIMUM = 270;

export function normalizePaneSizes(sizes: PaneSizes, viewportWidth: number): PaneSizes {
  if (viewportWidth <= COMPACT_BREAKPOINT) return sizes;

  const availablePaneWidth = viewportWidth - MAIN_PANE_MINIMUM;
  let left = Math.min(LEFT_PANE_MAXIMUM, Math.max(LEFT_PANE_MINIMUM, sizes.left));
  const rightMaximum = Math.max(RIGHT_PANE_MINIMUM, availablePaneWidth - left);
  const right = Math.min(rightMaximum, Math.max(RIGHT_PANE_MINIMUM, sizes.right));

  if (left + right > availablePaneWidth) {
    left = Math.max(LEFT_PANE_MINIMUM, availablePaneWidth - right);
  }

  return { left: Math.round(left), right: Math.round(right) };
}
