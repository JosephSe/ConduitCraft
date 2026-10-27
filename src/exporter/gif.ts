/** Short looping GIF of the telemetry dash, plus the encoder that writes it. */

/** Longest edge. Diagrams smaller than this export at their stage size. */
export const GIF_MAX_EDGE = 2048;
export const GIF_FRAME_COUNT = 8;
export const GIF_FRAME_DELAY_CS = 12;
export const GIF_DASH_PERIOD = 18;
export const GIF_MAX_COLORS = 256;

/** Ordered dither added only when a pixel is far from the palette. */
const DITHER_LIMIT = 12;
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52,
  20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5,
  37, 63, 31, 55, 23, 61, 29, 53, 21,
];

export function gifPixelSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height, 1);
  const scale = Math.min(1, GIF_MAX_EDGE / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** One dash cycle, split across the looping frames. */
export function gifFrameDashOffset(index: number): number {
  const step = GIF_DASH_PERIOD / GIF_FRAME_COUNT;
  const offset = Math.round(step * (index % GIF_FRAME_COUNT) * 100) / 100;
  return offset === 0 ? 0 : -offset;
}

export function gifFrameCount(animatedWires: number): number {
  return animatedWires > 0 ? GIF_FRAME_COUNT : 1;
}

interface ColorBox {
  colors: number[];
}

function channel(color: number, axis: number): number {
  return (color >> ((2 - axis) * 8)) & 255;
}

function boxRange(colors: number[]): { axis: number; range: number } {
  let bestAxis = 0;
  let bestRange = -1;
  for (let axis = 0; axis < 3; axis += 1) {
    let min = 255;
    let max = 0;
    for (const color of colors) {
      const value = channel(color, axis);
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const range = max - min;
    if (range > bestRange) {
      bestRange = range;
      bestAxis = axis;
    }
  }
  return { axis: bestAxis, range: bestRange };
}

function averageColor(colors: number[]): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const color of colors) {
    r += channel(color, 0);
    g += channel(color, 1);
    b += channel(color, 2);
  }
  const count = Math.max(1, colors.length);
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function medianCut(samples: number[], maxColors: number): Array<[number, number, number]> {
  const boxes: ColorBox[] = [{ colors: samples.length > 0 ? samples : [0xf8fafc] }];
  while (boxes.length < maxColors) {
    let splitAt = -1;
    let widest = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      const { range } = boxRange(boxes[i].colors);
      if (range > widest) {
        widest = range;
        splitAt = i;
      }
    }
    if (splitAt < 0) break;
    const box = boxes[splitAt];
    const { axis } = boxRange(box.colors);
    const sorted = box.colors.slice().sort((a, b) => channel(a, axis) - channel(b, axis));
    const mid = Math.max(1, Math.floor(sorted.length / 2));
    if (mid >= sorted.length) break;
    boxes.splice(splitAt, 1, { colors: sorted.slice(0, mid) }, { colors: sorted.slice(mid) });
  }
  return boxes.map((box) => averageColor(box.colors));
}

function pushSamples(frame: Uint8ClampedArray, step: number, samples: number[]): void {
  const stride = Math.max(1, step) * 4;
  for (let i = 0; i < frame.length; i += stride) {
    samples.push((frame[i] << 16) | (frame[i + 1] << 8) | frame[i + 2]);
  }
}

/** Every pixel of the first frame, then a thinner pass over the later frames. */
function sampleFrames(frames: Uint8ClampedArray[], maxSamples: number): number[] {
  const samples: number[] = [];
  const firstPixels = frames[0].length / 4;
  pushSamples(frames[0], firstPixels <= maxSamples ? 1 : Math.ceil(firstPixels / maxSamples), samples);
  const budget = Math.max(0, maxSamples - samples.length);
  const restPixels = frames.slice(1).reduce((sum, frame) => sum + frame.length / 4, 0);
  if (budget > 0 && restPixels > 0) {
    const step = Math.max(1, Math.floor(restPixels / budget));
    for (const frame of frames.slice(1)) pushSamples(frame, step, samples);
  }
  return samples;
}

/** Power-of-two palette with the last entry reserved for unchanged pixels. */
function paletteWithTransparent(colors: Array<[number, number, number]>): Array<[number, number, number]> {
  const usable = colors.slice(0, 255);
  const palette = usable.slice();
  let size = 2;
  while (size < usable.length + 1) size *= 2;
  const fill = palette[palette.length - 1] ?? [0, 0, 0];
  while (palette.length < size - 1) palette.push([fill[0], fill[1], fill[2]]);
  palette.push([0, 0, 0]);
  return palette;
}

function colorDistance(r: number, g: number, b: number, color: [number, number, number]): number {
  const dr = r - color[0];
  const dg = g - color[1];
  const db = b - color[2];
  return dr * dr * 2 + dg * dg * 4 + db * db * 3;
}

/** 6-bit lookup. The last palette entry is reserved and never chosen. */
function buildLookup(palette: Array<[number, number, number]>): Uint8Array {
  const usable = Math.max(1, palette.length - 1);
  const lut = new Uint8Array(64 * 64 * 64);
  for (let i = 0; i < lut.length; i += 1) {
    const r = (i >> 12) << 2;
    const g = ((i >> 6) & 63) << 2;
    const b = (i & 63) << 2;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let p = 0; p < usable; p += 1) {
      const dist = colorDistance(r, g, b, palette[p]);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    lut[i] = best;
  }
  return lut;
}

function clampByte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

function lookupKey(r: number, g: number, b: number): number {
  return ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
}

function indexFrame(
  frame: Uint8ClampedArray,
  width: number,
  lut: Uint8Array,
  palette: Array<[number, number, number]>,
): Uint8Array {
  const indexed = new Uint8Array(frame.length / 4);
  const limit = DITHER_LIMIT * DITHER_LIMIT;
  for (let pixel = 0, i = 0; i < frame.length; i += 4, pixel += 1) {
    const r = frame[i];
    const g = frame[i + 1];
    const b = frame[i + 2];
    let index = lut[lookupKey(r, g, b)];
    if (colorDistance(r, g, b, palette[index]) > limit) {
      const x = pixel % width;
      const y = (pixel - x) / width;
      const jitter = ((BAYER_8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 - 0.5) * DITHER_LIMIT * 2;
      index = lut[lookupKey(
        clampByte(Math.round(r + jitter)),
        clampByte(Math.round(g + jitter)),
        clampByte(Math.round(b + jitter)),
      )];
    }
    indexed[pixel] = index;
  }
  return indexed;
}

function diffRect(
  prev: Uint8Array,
  next: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (prev[row + x] === next[row + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function cropChanged(
  prev: Uint8Array,
  next: Uint8Array,
  width: number,
  rect: { x: number; y: number; width: number; height: number },
  transparent: number,
): Uint8Array {
  const cropped = new Uint8Array(rect.width * rect.height);
  let target = 0;
  for (let y = 0; y < rect.height; y += 1) {
    let source = (rect.y + y) * width + rect.x;
    for (let x = 0; x < rect.width; x += 1, source += 1, target += 1) {
      cropped[target] = prev[source] === next[source] ? transparent : next[source];
    }
  }
  return cropped;
}

function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let dict = new Map<number, Map<number, number>>();

  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  const emit = (code: number) => {
    acc += code * 2 ** bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(acc & 255);
      acc = Math.floor(acc / 256);
      bits -= 8;
    }
    // The code just written still uses the old width. The next one grows.
    if (nextCode > (1 << codeSize) - 1 && codeSize < 12) codeSize += 1;
  };
  const reset = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };
  const lookup = (prefix: number, value: number) => dict.get(prefix)?.get(value);

  emit(clearCode);
  if (indices.length === 0) {
    emit(eoiCode);
    if (bits > 0) bytes.push(acc & 255);
    return bytes;
  }

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const value = indices[i];
    const found = lookup(prefix, value);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (nextCode < 4096) {
      let row = dict.get(prefix);
      if (!row) {
        row = new Map();
        dict.set(prefix, row);
      }
      row.set(value, nextCode);
      nextCode += 1;
    } else {
      emit(clearCode);
      reset();
    }
    prefix = value;
  }
  emit(prefix);
  emit(eoiCode);
  if (bits > 0) bytes.push(acc & 255);
  return bytes;
}

function pushBytes(target: number[], bytes: number[]): void {
  for (const byte of bytes) target.push(byte);
}

function subBlocks(target: number[], payload: number[]): void {
  for (let offset = 0; offset < payload.length; offset += 255) {
    const chunk = payload.slice(offset, offset + 255);
    target.push(chunk.length);
    pushBytes(target, chunk);
  }
  target.push(0);
}

function word(target: number[], value: number): void {
  target.push(value & 255, (value >> 8) & 255);
}

export function encodeGif(options: {
  width: number;
  height: number;
  frames: Uint8ClampedArray[];
  delayCs: number;
  maxColors?: number;
}): Uint8Array {
  const width = Math.max(1, Math.min(65535, Math.round(options.width)));
  const height = Math.max(1, Math.min(65535, Math.round(options.height)));
  const expected = width * height * 4;
  if (options.frames.length === 0) throw new Error('A GIF needs at least one frame.');
  for (const frame of options.frames) {
    if (frame.length !== expected) throw new Error('A GIF frame does not match the picture size.');
  }

  const maxColors = Math.min(256, Math.max(2, options.maxColors ?? GIF_MAX_COLORS));
  const colorSlots = Math.max(1, maxColors - 1);
  const firstPixels = options.frames[0].length / 4;
  const palette = paletteWithTransparent(
    medianCut(sampleFrames(options.frames, Math.max(firstPixels, colorSlots * 200)), colorSlots),
  );
  const transparent = palette.length - 1;
  const lut = buildLookup(palette);
  let minCodeSize = 2;
  while (1 << minCodeSize < palette.length) minCodeSize += 1;
  const colorBits = Math.round(Math.log2(palette.length)) - 1;

  const out: number[] = [];
  pushBytes(out, [...'GIF89a'].map((char) => char.charCodeAt(0)));
  word(out, width);
  word(out, height);
  out.push(0x80 | (7 << 4) | colorBits, 0, 0);
  for (const [r, g, b] of palette) out.push(r, g, b);
  pushBytes(out, [0x21, 0xff, 0x0b, ...'NETSCAPE2.0'].map((value) => (typeof value === 'number' ? value : value.charCodeAt(0))));
  out.push(3, 1, 0, 0, 0);

  const delay = Math.max(1, Math.min(65535, Math.round(options.delayCs)));
  const indexed = options.frames.map((frame) => indexFrame(frame, width, lut, palette));
  const writeImage = (
    pixels: Uint8Array,
    left: number,
    top: number,
    imageWidth: number,
    imageHeight: number,
    transparentIndex: number | null,
  ) => {
    // Disposal 1 leaves the previous picture in place. Disposal 2 would clear this
    // rectangle first, and the unchanged pixels in a delta would turn black.
    const disposal = transparentIndex === null ? 0x04 : 0x05;
    out.push(0x21, 0xf9, 0x04, disposal);
    word(out, delay);
    out.push(transparentIndex === null ? 0 : transparentIndex, 0);
    out.push(0x2c);
    word(out, left);
    word(out, top);
    word(out, imageWidth);
    word(out, imageHeight);
    out.push(0);
    out.push(minCodeSize);
    subBlocks(out, lzwEncode(pixels, minCodeSize));
  };

  writeImage(indexed[0], 0, 0, width, height, null);
  for (let frame = 1; frame < indexed.length; frame += 1) {
    const rect = diffRect(indexed[frame - 1], indexed[frame], width, height);
    if (!rect) {
      writeImage(Uint8Array.of(transparent), 0, 0, 1, 1, transparent);
      continue;
    }
    writeImage(
      cropChanged(indexed[frame - 1], indexed[frame], width, rect, transparent),
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      transparent,
    );
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}
