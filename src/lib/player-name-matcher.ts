/**
 * Player name normalisation used when joining Yahoo roster names against
 * external data sources (Statcast game logs, Pitcher List, prospect rankings).
 *
 * All matching pipelines use this single implementation so that names are
 * normalised consistently across every view.
 */

/**
 * Normalise a player display name to a lowercase ASCII key suitable for
 * fuzzy string matching.
 *
 * Steps:
 * 1. Repair double-encoded UTF-8 sequences (e.g. `Ã©` → `é`).
 * 2. Strip diacritic combining marks via NFD decomposition.
 * 3. Remove name suffixes (Jr, Sr, II, III, IV).
 * 4. Drop every non-letter, non-space character.
 * 5. Lowercase and trim.
 */
export function normalizePlayerName(name: string): string {
  let normalizedInput = name;
  if (/[ÃÂ]/.test(normalizedInput)) {
    try {
      normalizedInput = decodeURIComponent(escape(normalizedInput));
    } catch {
      normalizedInput = name;
    }
  }

  return normalizedInput
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '')
    .replace(/[^a-zA-Z ]/g, '')
    .toLowerCase()
    .trim();
}
