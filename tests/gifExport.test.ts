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
    assert.deepEqual(gifPixelSize(1680, 920), { width: 720, height: 394 });
    assert.deepEqual(gifPixelSize(400, 200), { width: 400, height: 200 });
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
});
