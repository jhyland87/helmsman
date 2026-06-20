/**
 * @fileoverview Parses slicer settings embedded in a g-code file.
 *
 * Slicers record their full configuration as comments in the file. Different
 * slicers do it differently; this parser fetches only the tail of the file
 * (where Prusa/Orca/SuperSlicer write their `CONFIG_BLOCK`) via an HTTP range
 * request, then runs the file text through registered format parsers. Add a new
 * `SettingsFormatParser` to {@link FORMAT_PARSERS} to support another slicer.
 *
 * Must run somewhere that can reach the printer's HTTP API — i.e. the
 * background service worker, where extension host permissions apply.
 */

/** Parsed slicer settings: setting key → raw string value. */
export type SlicerSettings = Readonly<Record<string, string>>;

/** A function that extracts settings from g-code text, or `{}` if it can't. */
export type SettingsFormatParser = (text: string) => Record<string, string>;

/** Block-start markers used by the slicers that share the `; key = value` format. */
const BLOCK_START_MARKERS = ['CONFIG_BLOCK_START', 'prusaslicer_config = begin'] as const;
/** Block-end markers (checked before start so a marker line is never parsed). */
const BLOCK_END_MARKERS = ['CONFIG_BLOCK_END', 'prusaslicer_config = end'] as const;

/**
 * Orca / SuperSlicer (`CONFIG_BLOCK_START`…`CONFIG_BLOCK_END`) and PrusaSlicer
 * (`prusaslicer_config = begin`…`prusaslicer_config = end`) all embed settings
 * as a block of `; key = value` comment lines. The inner format is identical;
 * only the block markers differ. Marker lines themselves contain `=`, so they're
 * matched as markers and skipped. Values may contain `=`, so the key is
 * everything before the *first* `=` and the value is the remainder (trimmed) —
 * matching the canonical awk one-liner.
 */
export const parseConfigBlock: SettingsFormatParser = (text) => {
  const settings: Record<string, string> = {};
  let inBlock = false;
  for (const line of text.split(/\r?\n/)) {
    if (BLOCK_END_MARKERS.some((m) => line.includes(m))) {
      inBlock = false;
      continue;
    }
    if (BLOCK_START_MARKERS.some((m) => line.includes(m))) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    const stripped = line.replace(/^;\s?/, '');
    const eq = stripped.indexOf('=');
    if (eq === -1) continue;
    const key = stripped.slice(0, eq).trim();
    if (key) settings[key] = stripped.slice(eq + 1).trim();
  }
  return settings;
};

/** Registered format parsers, tried in order; the first non-empty result wins. */
const FORMAT_PARSERS: readonly SettingsFormatParser[] = [parseConfigBlock];

const DEFAULT_BYTE_LIMIT = 50_000;

/**
 * Fetches the tail of a g-code file and parses the slicer settings from it.
 *
 * @example
 * ```ts
 * const parser = new SlicerSettingsParser(
 *   'http://printer/server/files/gcodes/part.gcode',
 * );
 * const settings = await parser.parse();
 * console.log(settings.first_layer_temperature);
 * ```
 */
export class SlicerSettingsParser {
  /**
   * @param url - Full HTTP URL of the g-code file (the download URL).
   * @param byteLimit - How many trailing bytes to fetch. Defaults to 50000.
   */
  constructor(
    private readonly url: string,
    private readonly byteLimit: number = DEFAULT_BYTE_LIMIT,
  ) {}

  /** Fetch the file tail and return the parsed settings (empty if none found). */
  async parse(): Promise<SlicerSettings> {
    const text = await this.fetchTail();
    for (const parser of FORMAT_PARSERS) {
      const result = parser(text);
      if (Object.keys(result).length > 0) return result;
    }
    return {};
  }

  /**
   * Fetch the last {@link byteLimit} bytes via an HTTP `Range` request. A 206
   * response usually starts mid-line, so the first partial line is dropped.
   */
  private async fetchTail(): Promise<string> {
    const res = await fetch(this.url, { headers: { Range: `bytes=-${this.byteLimit}` } });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Failed to read g-code file (HTTP ${res.status})`);
    }
    const text = await res.text();
    if (res.status !== 206) return text;
    const newline = text.indexOf('\n');
    return newline >= 0 ? text.slice(newline + 1) : text;
  }
}
