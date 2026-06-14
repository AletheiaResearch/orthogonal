const WORDS_PER_MINUTE = 200;

/** Reading time in whole minutes from plain text. Always at least 1. */
export function readingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
