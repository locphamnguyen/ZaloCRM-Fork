/**
 * Ports openzca's Markdown-to-Zalo text style system into a clean utility.
 * Converts markdown-like markup into Zalo's range-based style format.
 *
 * Inline: **bold** __bold__ *italic* _italic_ ~~strike~~ ***bold+italic***
 *         {red|orange|yellow|green}text{/tag}  {underline}  {big}  {small}
 * Block:  # h1 (big+bold)  ## h2 (bold)  ### h3 (italic+bold)  #### h4 (italic)
 *         - / * / + bullet → "• item"   1. ordered   > blockquote → "│ text"
 *         ```…``` fenced code — inline markup disabled, style: 'code'
 */

export interface TextStyle {
  offset: number;
  length: number;
  style: 'bold' | 'italic' | 'strikethrough' | 'underline' | 'color' | 'big' | 'small' | 'code';
  color?: string; // hex color for 'color' style
}

export interface MentionRef {
  offset: number;
  length: number;
  rawText: string; // "@Name" or "@userId"
}

export interface FormattedMessage {
  text: string;
  styles: TextStyle[];
  mentions: MentionRef[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const COLOR_MAP: Record<string, string> = {
  red: '#e84343', orange: '#f5a623', yellow: '#f8e71c', green: '#2ecc71',
};

type StyleSpec = Omit<TextStyle, 'offset' | 'length'>;
interface Segment { text: string; styles: StyleSpec[]; verbatim?: boolean; }

type InlineRule = {
  pattern: RegExp;
  resolve: (m: RegExpExecArray) => { inner: string; styles: StyleSpec[] };
};

const INLINE_RULES: InlineRule[] = [
  {
    pattern: /\{(red|orange|yellow|green|underline|big|small)\}([\s\S]+?)\{\/\1\}/g,
    resolve: (m) => {
      const tag = m[1];
      if (tag === 'underline') return { inner: m[2], styles: [{ style: 'underline' }] };
      if (tag === 'big') return { inner: m[2], styles: [{ style: 'big' }] };
      if (tag === 'small') return { inner: m[2], styles: [{ style: 'small' }] };
      return { inner: m[2], styles: [{ style: 'color', color: COLOR_MAP[tag] }] };
    },
  },
  { pattern: /\*\*\*(.+?)\*\*\*/g, resolve: (m) => ({ inner: m[1], styles: [{ style: 'bold' }, { style: 'italic' }] }) },
  { pattern: /\*\*(.+?)\*\*/g,     resolve: (m) => ({ inner: m[1], styles: [{ style: 'bold' }] }) },
  { pattern: /(?<!\w)__(.+?)__(?!\w)/g, resolve: (m) => ({ inner: m[1], styles: [{ style: 'bold' }] }) },
  { pattern: /\*(.+?)\*/g,         resolve: (m) => ({ inner: m[1], styles: [{ style: 'italic' }] }) },
  { pattern: /(?<!\w)_(.+?)_(?!\w)/g, resolve: (m) => ({ inner: m[1], styles: [{ style: 'italic' }] }) },
  { pattern: /~~(.+?)~~/g,         resolve: (m) => ({ inner: m[1], styles: [{ style: 'strikethrough' }] }) },
];

/** Process block-level syntax; returns per-line text + style metadata. */
function processBlocks(raw: string): { lines: string[]; blockStyles: Map<number, StyleSpec[]>; verbatimSet: Set<number> } {
  const rawLines = raw.split('\n');
  const lines: string[] = [];
  const blockStyles = new Map<number, StyleSpec[]>();
  const verbatimSet = new Set<number>();
  let inCode = false;

  for (const line of rawLines) {
    if (/^```/.test(line)) { inCode = !inCode; continue; }

    if (inCode) {
      verbatimSet.add(lines.length);
      lines.push(line);
      continue;
    }

    const idx = lines.length;

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const d = h[1].length;
      const s: StyleSpec[] =
        d === 1 ? [{ style: 'big' }, { style: 'bold' }] :
        d === 2 ? [{ style: 'bold' }] :
        d === 3 ? [{ style: 'italic' }, { style: 'bold' }] :
                  [{ style: 'italic' }];
      blockStyles.set(idx, s);
      lines.push(h[2]);
      continue;
    }

    const q = line.match(/^>+\s?(.*)$/);
    if (q) { lines.push('│ ' + q[1]); continue; }

    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) { lines.push('• ' + ul[1]); continue; }

    const ol = line.match(/^(\d+)\.\s+(.*)$/);
    if (ol) { lines.push(`${ol[1]}. ${ol[2]}`); continue; }

    lines.push(line);
  }

  return { lines, blockStyles, verbatimSet };
}

/** Split segments on an inline pattern match, preserving accumulated styles. */
function applyInlineRule(segments: Segment[], rule: InlineRule): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.verbatim) { out.push(seg); continue; }
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(seg.text)) !== null) {
      if (match.index > lastIndex) {
        out.push({ text: seg.text.slice(lastIndex, match.index), styles: [...seg.styles] });
      }
      const { inner, styles: extra } = rule.resolve(match);
      out.push({ text: inner, styles: [...seg.styles, ...extra] });
      lastIndex = re.lastIndex;
    }
    if (lastIndex < seg.text.length) {
      out.push({ text: seg.text.slice(lastIndex), styles: [...seg.styles] });
    } else if (lastIndex === 0) {
      out.push(seg);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function formatMessage(raw: string): FormattedMessage {
  const { lines, blockStyles, verbatimSet } = processBlocks(raw);

  // One segment per line so block-level styles stay scoped to their line
  let segments: Segment[] = lines.map((lineText, i) => ({
    text: i < lines.length - 1 ? lineText + '\n' : lineText,
    styles: blockStyles.get(i) ?? [],
    verbatim: verbatimSet.has(i),
  }));

  for (const rule of INLINE_RULES) {
    segments = applyInlineRule(segments, rule);
  }

  // Tag verbatim segments with 'code' if not already present
  for (const seg of segments) {
    if (seg.verbatim && !seg.styles.some((s) => s.style === 'code')) {
      seg.styles.push({ style: 'code' });
    }
  }

  // Flatten to plain text + positioned styles
  let plainText = '';
  const styles: TextStyle[] = [];
  for (const seg of segments) {
    const offset = plainText.length;
    plainText += seg.text;
    for (const s of seg.styles) {
      if (seg.text.length > 0) {
        // StyleSpec is Omit<TextStyle,'offset'|'length'>, spread is safe
        styles.push({ offset, length: seg.text.length, ...s } as TextStyle);
      }
    }
  }

  // Strip trailing newline unless the input ended with one
  const text = raw.endsWith('\n') ? plainText : plainText.replace(/\n$/, '');

  // Extract @mention positions from final plain text
  const mentions: MentionRef[] = [];
  const mentionRe = /@[\w]+/g;
  let mm: RegExpExecArray | null;
  while ((mm = mentionRe.exec(text)) !== null) {
    mentions.push({ offset: mm.index, length: mm[0].length, rawText: mm[0] });
  }

  return { text, styles, mentions };
}

/**
 * Split a FormattedMessage into chunks of at most maxLength characters.
 * Splits at newline boundaries when possible; adjusts style/mention offsets
 * to be relative to each chunk.
 */
export function chunkMessage(msg: FormattedMessage, maxLength = 2000): FormattedMessage[] {
  if (msg.text.length <= maxLength) return [msg];

  const chunks: FormattedMessage[] = [];
  let start = 0;

  while (start < msg.text.length) {
    let end = Math.min(start + maxLength, msg.text.length);
    if (end < msg.text.length) {
      const nl = msg.text.lastIndexOf('\n', end);
      if (nl > start) end = nl + 1;
    }

    const text = msg.text.slice(start, end);

    const styles = msg.styles
      .filter((s) => s.offset < end && s.offset + s.length > start)
      .map((s) => ({
        ...s,
        offset: Math.max(0, s.offset - start),
        length: Math.min(s.offset + s.length, end) - Math.max(s.offset, start),
      }));

    const mentions = msg.mentions
      .filter((m) => m.offset >= start && m.offset < end)
      .map((m) => ({ ...m, offset: m.offset - start }));

    chunks.push({ text, styles, mentions });
    start = end;
  }

  return chunks;
}
