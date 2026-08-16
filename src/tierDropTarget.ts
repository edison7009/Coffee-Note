export interface TierDropCardBounds {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TierDropVisualLine {
  centerY: number;
  cards: TierDropCardBounds[];
}

const VISUAL_LINE_TOLERANCE_PX = 4;

/**
 * Treats every wrapped visual line as one continuous drop channel. Card centers
 * are the only horizontal boundaries, so the visual gaps between cards can
 * never fall through to a row-level "append" result.
 */
export function getTierInsertionIndex(
  clientX: number,
  clientY: number,
  cards: readonly TierDropCardBounds[],
): number {
  if (cards.length === 0) return 0;

  const lines: TierDropVisualLine[] = [];
  const sortedCards = [...cards].sort((left, right) =>
    left.top - right.top || left.left - right.left,
  );

  for (const card of sortedCards) {
    const centerY = card.top + card.height / 2;
    const line = lines.at(-1);
    if (!line || Math.abs(line.centerY - centerY) > VISUAL_LINE_TOLERANCE_PX) {
      lines.push({ centerY, cards: [card] });
      continue;
    }
    line.cards.push(card);
    line.centerY = line.cards.reduce(
      (total, item) => total + item.top + item.height / 2,
      0,
    ) / line.cards.length;
  }

  const selectedLine = lines.reduce((closest, line) =>
    Math.abs(line.centerY - clientY) < Math.abs(closest.centerY - clientY)
      ? line
      : closest,
  );
  selectedLine.cards.sort((left, right) => left.left - right.left);

  const nextCard = selectedLine.cards.find(
    (card) => clientX < card.left + card.width / 2,
  );
  return nextCard?.index
    ?? selectedLine.cards[selectedLine.cards.length - 1].index + 1;
}
