// Mini-parser for Lightroom develop-settings Lua text.
//
// We walk the outer table at depth 1 only, skipping nested braces and
// strings, and extract scalar assignments - both `Key = number` and
// `["Key"] = number` forms - so nested tables like
// `Presets = { { Exposure2012 = ... } }` don't pollute the top-level reads.

const KEY_NUM = /^([A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/;
const BRACKET_KEY_NUM = /^\["((?:[^"\\]|\\.)+)"\]\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/;

function skipString(text: string, i: number): number {
  // text[i] === '"'
  let j = i + 1;
  while (j < text.length) {
    const c = text[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '"') return j + 1;
    j++;
  }
  return j;
}

function skipLongBracket(text: string, i: number, level: number): number {
  // text[i..i+level+1] === '[' + '='*level + '['
  const closing = ']' + '='.repeat(level) + ']';
  const end = text.indexOf(closing, i);
  return end === -1 ? text.length : end + closing.length;
}

function skipLineComment(text: string, i: number): number {
  // text[i..i+2] === '--'
  let j = i + 2;
  // long-bracket comment: --[[...]] or --[=...=[
  if (text[j] === '[') {
    let level = 0;
    let k = j + 1;
    while (text[k] === '=') {
      level++;
      k++;
    }
    if (text[k] === '[') return skipLongBracket(text, j, level);
  }
  // plain line comment
  while (j < text.length && text[j] !== '\n') j++;
  return j;
}

export function parseDevelopSettings(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!text) return out;

  const open = text.indexOf('{');
  if (open === -1) return out;

  let i = open + 1;
  let depth = 1; // we're inside the outer table

  while (i < text.length && depth > 0) {
    const c = text[i];

    if (c === '-' && text[i + 1] === '-') {
      i = skipLineComment(text, i);
      continue;
    }
    if (c === '"') {
      i = skipString(text, i);
      continue;
    }
    if (c === '{') {
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      i++;
      continue;
    }

    if (depth === 1) {
      // try ["Key"] = number first
      const tail = text.slice(i);
      if (c === '[') {
        const m = tail.match(BRACKET_KEY_NUM);
        if (m) {
          out[m[1]] = parseFloat(m[2]);
          i += m[0].length;
          continue;
        }
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = tail.match(KEY_NUM);
        if (m) {
          out[m[1]] = parseFloat(m[2]);
          i += m[0].length;
          continue;
        }
      }
    }

    i++;
  }

  return out;
}
