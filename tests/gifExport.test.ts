import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import {
  GIF_FRAME_COUNT,
  encodeGif,
  gifFrameCount,
  gifFrameDashOffset,
  gifPixelSize,
} from '../src/exporter/gif.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';

describe('gif export', () => {
  it('keeps a short picture inside the size cap and steps the dash across one loop', () => {
    assert.deepEqual(gifPixelSize(1680, 920), { width: 1680, height: 920 });
    assert.deepEqual(gifPixelSize(400, 200), { width: 400, height: 200 });
    assert.deepEqual(gifPixelSize(3000, 1500), { width: 2048, height: 1024 });
    assert.equal(gifFrameCount(0), 1);
    assert.equal(gifFrameCount(2), GIF_FRAME_COUNT);
    const offsets = new Set(Array.from({ length: GIF_FRAME_COUNT }, (_, index) => gifFrameDashOffset(index)));
    assert.equal(offsets.size, GIF_FRAME_COUNT);
    assert.equal(gifFrameDashOffset(0), 0);
    assert.ok(gifFrameDashOffset(1) < 0);
  });

  it('draws a moving dash only on an animation frame', () => {
    const doc = createBlankDocument();
    const left = createNodeFromStencil('service', 40, 40, 0);
    const right = createNodeFromStencil('core', 320, 40, 1);
    doc.nodes.push(left, right);
    doc.edges.push({
      id: 'wire-1',
      from: left.id,
      to: right.id,
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'straight',
      label: '',
      animated: true,
    });
    const still = renderDiagramSvg(doc);
    const moving = renderDiagramSvg(doc, { dashOffset: gifFrameDashOffset(3) });
    assert.doesNotMatch(still, /stroke-dashoffset=/);
    assert.match(moving, /stroke-dasharray="8 10" stroke-dashoffset="-6.75"/);
  });

  it('writes a looping GIF89a that is smaller than the raw frames', () => {
    const width = 12;
    const height = 8;
    const frames = [0, 1].map((step) => {
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        const pixel = i / 4;
        const on = (pixel + step) % 4 === 0;
        rgba[i] = on ? 29 : 248;
        rgba[i + 1] = on ? 78 : 250;
        rgba[i + 2] = on ? 216 : 252;
        rgba[i + 3] = 255;
      }
      return rgba;
    });
    const gif = encodeGif({ width, height, frames, delayCs: 12, maxColors: 8 });
    assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a');
    assert.equal(gif[6], width);
    assert.equal(gif[8], height);
    assert.equal(gif[gif.length - 1], 0x3b);
    assert.ok(Buffer.from(gif).includes(Buffer.from('NETSCAPE2.0')));
    assert.ok(gif.length < width * height * frames.length);
  });

  it('keeps later frames to the pixels that moved', () => {
    const width = 16;
    const height = 8;
    const paint = (step: number) => {
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          const moved = x === 12 && y === 3 + step;
          rgba[i] = moved ? 220 : 16;
          rgba[i + 1] = moved ? 48 : 24;
          rgba[i + 2] = moved ? 64 : 36;
          rgba[i + 3] = 255;
        }
      }
      return rgba;
    };
    const gif = encodeGif({ width, height, frames: [paint(0), paint(1)], delayCs: 8, maxColors: 16 });
    const images = gifImageBounds(gif);
    assert.equal(images.length, 2);
    assert.deepEqual(images[0], { left: 0, top: 0, width, height });
    assert.ok(images[1].width < width);
    assert.ok(images[1].height < height);
    assert.ok(images[1].left > 0);
    const controls = gifGraphicControls(gif);
    assert.deepEqual(controls, [0x04, 0x05]);
  });

  it('leaves the first picture in place on the third frame', () => {
    const width = 24;
    const height = 16;
    const paint = (step: number) => {
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          const moved = x === 4 + step && y === 8;
          rgba[i] = moved ? 220 : 236;
          rgba[i + 1] = moved ? 48 : 242;
          rgba[i + 2] = moved ? 64 : 248;
          rgba[i + 3] = 255;
        }
      }
      return rgba;
    };
    const gif = encodeGif({
      width,
      height,
      frames: [paint(0), paint(1), paint(2)],
      delayCs: 8,
      maxColors: 16,
    });
    const controls = gifGraphicControls(gif);
    assert.equal(controls.length, 3);
    assert.equal(controls[0] & 0x1c, 0x04);
    for (const packed of controls.slice(1)) {
      assert.equal(packed & 1, 1);
      assert.equal((packed >> 2) & 7, 1);
    }
  });
});

function gifGraphicControls(gif: Uint8Array): number[] {
  let offset = 13;
  if (gif[10] & 0x80) offset += 3 * (2 << (gif[10] & 7));
  const controls: number[] = [];
  while (offset < gif.length) {
    const marker = gif[offset];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      if (gif[offset + 1] === 0xf9) controls.push(gif[offset + 3]);
      offset += 2;
      offset = skipSubBlocks(gif, offset);
      continue;
    }
    if (marker !== 0x2c) break;
    offset += 10;
    if (gif[offset - 1] & 0x80) offset += 3 * (2 << (gif[offset - 1] & 7));
    offset += 1;
    offset = skipSubBlocks(gif, offset);
  }
  return controls;
}

function gifImageBounds(gif: Uint8Array): Array<{ left: number; top: number; width: number; height: number }> {
  let offset = 6;
  const packed = gif[10];
  offset = 13;
  if (packed & 0x80) offset += 3 * (2 << (packed & 7));
  const images: Array<{ left: number; top: number; width: number; height: number }> = [];
  while (offset < gif.length) {
    const marker = gif[offset];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      offset += 2;
      offset = skipSubBlocks(gif, offset);
      continue;
    }
    if (marker !== 0x2c) break;
    const left = gif[offset + 1] | (gif[offset + 2] << 8);
    const top = gif[offset + 3] | (gif[offset + 4] << 8);
    const width = gif[offset + 5] | (gif[offset + 6] << 8);
    const height = gif[offset + 7] | (gif[offset + 8] << 8);
    images.push({ left, top, width, height });
    offset += 10;
    if (gif[offset - 1] & 0x80) offset += 3 * (2 << (gif[offset - 1] & 7));
    offset += 1;
    offset = skipSubBlocks(gif, offset);
  }
  return images;
}

function skipSubBlocks(gif: Uint8Array, offset: number): number {
  while (offset < gif.length && gif[offset] !== 0) offset += 1 + gif[offset];
  return offset + 1;
}
