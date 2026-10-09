export function centeredCarouselOffset(available, cardWidth, gap) {
  let visible = Math.max(1, Math.floor((available + gap) / (cardWidth + gap)));
  if (visible > 2 && visible % 2 === 0) visible--;
  return Math.max(0, (available - visible * cardWidth - (visible - 1) * gap) / 2);
}
