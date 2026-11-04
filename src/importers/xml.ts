/**
 * A small XML reader for importers (B6). It reads elements, attributes, text, CDATA and the five standard entities
 * plus numeric ones. It does not load DTDs or external entities, so a hostile file cannot reach out. It is written
 * by hand, not on `DOMParser`, so the importers run under Node in the unit tests too.
 */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Text directly inside the element, joined. */
  text: string;
}

export const MAX_XML_CHARS = 20_000_000;
const MAX_DEPTH = 256;

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(raw: string): string {
  if (!raw.includes('&')) return raw;
  return raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) attrs[match[1]] = decodeEntities(match[2] ?? match[3] ?? '');
  return attrs;
}

/** Parse the first element in `input`. Throws an Error with a plain message when the text is not well-formed. */
export function parseXml(input: string): XmlNode {
  if (input.length > MAX_XML_CHARS) throw new Error('This file is too large to read.');
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const lt = input.indexOf('<', i);
    const current = stack[stack.length - 1];
    if (lt === -1) {
      current.text += decodeEntities(input.slice(i));
      break;
    }
    if (lt > i) current.text += decodeEntities(input.slice(i, lt));
    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('This file is not valid XML (a comment is never closed).');
      i = end + 3;
    } else if (input.startsWith('<![CDATA[', lt)) {
      const end = input.indexOf(']]>', lt + 9);
      if (end === -1) throw new Error('This file is not valid XML (a CDATA section is never closed).');
      current.text += input.slice(lt + 9, end);
      i = end + 3;
    } else if (input.startsWith('<?', lt)) {
      const end = input.indexOf('?>', lt + 2);
      if (end === -1) throw new Error('This file is not valid XML.');
      i = end + 2;
    } else if (input.startsWith('<!', lt)) {
      // A DOCTYPE. Its contents are never used, so entities it declares are never expanded.
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const ch = input[j];
        if (ch === '[') depth += 1;
        else if (ch === ']') depth -= 1;
        else if (ch === '>' && depth <= 0) break;
      }
      i = j + 1;
    } else if (input[lt + 1] === '/') {
      const end = input.indexOf('>', lt + 2);
      if (end === -1) throw new Error('This file is not valid XML.');
      const name = input.slice(lt + 2, end).trim();
      if (stack.length <= 1 || stack[stack.length - 1].name !== name) {
        throw new Error(`This file is not valid XML (unexpected </${name}>).`);
      }
      stack.pop();
      i = end + 1;
    } else {
      // A start tag; attribute values may hold ">" so scan with quotes in mind.
      let j = lt + 1;
      let quote = '';
      for (; j < n; j++) {
        const ch = input[j];
        if (quote) {
          if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
      }
      if (j >= n) throw new Error('This file is not valid XML (a tag is never closed).');
      let body = input.slice(lt + 1, j);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const nameMatch = /^[^\s/>]+/.exec(body);
      if (!nameMatch) throw new Error('This file is not valid XML.');
      const node: XmlNode = { name: nameMatch[0], attrs: parseAttrs(body.slice(nameMatch[0].length)), children: [], text: '' };
      current.children.push(node);
      if (!selfClosing) {
        if (stack.length > MAX_DEPTH) throw new Error('This file is nested too deeply to read.');
        stack.push(node);
      }
      i = j + 1;
    }
  }
  if (stack.length > 1) throw new Error(`This file is not valid XML (<${stack[stack.length - 1].name}> is never closed).`);
  const first = root.children[0];
  if (!first) throw new Error('This file has no XML content.');
  return first;
}

export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => child.name === name);
}
