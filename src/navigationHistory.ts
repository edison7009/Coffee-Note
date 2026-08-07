export interface NavigationHistory<T> {
  back: T[];
  forward: T[];
}

export function createNavigationHistory<T>(): NavigationHistory<T> {
  return { back: [], forward: [] };
}

export function recordNavigation<T>(
  history: NavigationHistory<T>,
  current: T,
  next: T,
  matches: (left: T, right: T) => boolean,
): NavigationHistory<T> {
  if (matches(current, next)) return history;
  return { back: [...history.back, current], forward: [] };
}

export function stepBack<T>(
  history: NavigationHistory<T>,
  current: T,
): { target: T | null; history: NavigationHistory<T> } {
  const target = history.back.at(-1) ?? null;
  if (!target) return { target, history };
  return {
    target,
    history: {
      back: history.back.slice(0, -1),
      forward: [...history.forward, current],
    },
  };
}

export function stepForward<T>(
  history: NavigationHistory<T>,
  current: T,
): { target: T | null; history: NavigationHistory<T> } {
  const target = history.forward.at(-1) ?? null;
  if (!target) return { target, history };
  return {
    target,
    history: {
      back: [...history.back, current],
      forward: history.forward.slice(0, -1),
    },
  };
}
