import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { distancesTo, snapToGuides, type Rect } from '../src/studio/guides.ts';

const box = (x: number, y: number, width = 100, height = 60): Rect => ({ x, y, width, height });

describe('snapToGuides: lines', () => {
  it('snaps a left edge to another left edge within the threshold', () => {
    const r = snapToGuides(box(205, 300, 80, 60), [box(200, 100)], 6);
    assert.equal(r.x, 200);
    assert.equal(r.snappedX, true);
    assert.equal(r.snappedY, false);
    assert.equal(r.y, 300);
    assert.deepEqual(r.guides, [{ axis: 'x', pos: 200, from: 100, to: 360 }]);
  });

  it('snaps centre to centre', () => {
    // Moving is 60 wide at 222: edges 222 and 282, centre 252. Other is 100 wide at 200: edges 200 and 300, centre 250.
    const r = snapToGuides(box(222, 300, 60, 60), [box(200, 100, 100, 60)], 6);
    assert.equal(r.x, 220, 'the centre 252 moves to 250');
    assert.equal(r.snappedX, true);
    assert.equal(r.guides.some((g) => g.axis === 'x' && g.pos === 250), true);
  });

  it('leaves the position alone beyond the threshold', () => {
    const r = snapToGuides(box(215, 330), [box(200, 100)], 6);
    assert.equal(r.snappedX, false);
    assert.equal(r.snappedY, false);
    assert.equal(r.x, 215);
    assert.equal(r.y, 330);
    assert.deepEqual(r.guides, []);
  });

  it('takes the closest of several candidates', () => {
    const r = snapToGuides(box(204, 0), [box(200, 100), box(203, 300)], 6);
    assert.equal(r.x, 203);
  });

  it('snaps both axes at once and reports a guide for each', () => {
    const r = snapToGuides(box(103, 197), [box(100, 100), box(400, 200)], 6);
    assert.equal(r.x, 100);
    assert.equal(r.y, 200);
    assert.equal(r.guides.filter((g) => g.axis === 'x').length >= 1, true);
    assert.equal(r.guides.some((g) => g.axis === 'y' && g.pos === 200), true);
  });

  it('draws one guide through every component that shares the line', () => {
    const r = snapToGuides(box(102, 400), [box(100, 100), box(100, 250)], 6);
    const g = r.guides.find((x) => x.axis === 'x' && x.pos === 100);
    assert.ok(g);
    assert.equal(g.from, 100);
    assert.equal(g.to, 460);
    assert.equal(r.guides.filter((x) => x.axis === 'x' && x.pos === 100).length, 1);
  });

  it('does not mutate its inputs', () => {
    const moving = box(205, 300);
    const others = [box(200, 100)];
    snapToGuides(moving, others, 6);
    assert.deepEqual(moving, box(205, 300));
    assert.deepEqual(others, [box(200, 100)]);
  });

  it('does nothing with no other components', () => {
    const r = snapToGuides(box(10, 10), [], 6);
    assert.deepEqual([r.x, r.y, r.snappedX, r.snappedY], [10, 10, false, false]);
  });
});

describe('snapToGuides: equal spacing', () => {
  it('centres a component between two neighbours and marks both gaps', () => {
    // a ends at 100, b starts at 400; the moving 100-wide box fits with 100 either side, so x = 200.
    const r = snapToGuides(box(205, 500, 100, 60), [box(0, 500), box(400, 500)], 6);
    assert.equal(r.x, 200);
    assert.equal(r.snappedX, true);
    const gaps = r.spacing.filter((s) => s.axis === 'x');
    assert.equal(gaps.length, 2);
    assert.deepEqual(gaps.map((g) => [g.start, g.end]).sort(), [[100, 200], [300, 400]]);
  });

  it('repeats the gap between two neighbours', () => {
    // a 0-100, b 150-250 (gap 50): the next sits at 300.
    const r = snapToGuides(box(303, 500), [box(0, 500), box(150, 500)], 6);
    assert.equal(r.x, 300);
    assert.equal(r.spacing.length >= 2, true);
  });

  it('ignores components in other rows', () => {
    const r = snapToGuides(box(205, 500), [box(0, 100), box(400, 100)], 6);
    assert.equal(r.snappedX, false);
    assert.deepEqual(r.spacing, []);
  });

  it('works vertically too', () => {
    // The gap between 100 and 400 is 300; a 60-high box leaves 120 above and below, so y = 220.
    const r = snapToGuides(box(0, 217, 100, 60), [box(0, 0, 100, 100), box(0, 400, 100, 100)], 6);
    assert.equal(r.y, 220);
    assert.equal(r.spacing.filter((s) => s.axis === 'y').length, 2);
  });
});

describe('distancesTo', () => {
  it('finds the nearest neighbour on each side in the same row or column', () => {
    const d = distancesTo(box(300, 200), [box(100, 200), box(0, 200), box(500, 200), box(300, 20), box(300, 400), box(900, 900)]);
    const by = (axis: 'x' | 'y', start: number) => d.find((x) => x.axis === axis && x.start === start);
    assert.equal(by('x', 200)?.value, 100, 'the left neighbour ends at 200');
    assert.equal(by('x', 400)?.value, 100, 'the right neighbour starts at 500');
    assert.equal(by('y', 80)?.value, 120);
    assert.equal(by('y', 260)?.value, 140);
    assert.equal(d.length, 4);
  });

  it('is empty with nothing around', () => {
    assert.deepEqual(distancesTo(box(0, 0), [box(900, 900)]), []);
  });
});

describe('snapToGuides: centre lines (the middle of a swimlane)', () => {
  const lane = { axis: 'x' as const, pos: 400, from: 0, to: 300 };

  it("snaps the moving centre to a centre line and draws a guide from the line's start", () => {
    // Moving is 100 wide at 345: centre 395, five short of the lane centre 400.
    const r = snapToGuides(box(345, 300), [], 6, [lane]);
    assert.equal(r.x, 350);
    assert.equal(r.snappedX, true);
    assert.deepEqual(r.guides, [{ axis: 'x', pos: 400, from: 0, to: 360 }]);
  });

  it('snaps only the centre, not an edge, to a centre line', () => {
    // The left edge 397 is near 400, but the centre 447 is not.
    const r = snapToGuides(box(397, 300), [], 6, [lane]);
    assert.equal(r.snappedX, false);
    assert.deepEqual(r.guides, []);
  });

  it('prefers the closer of a component line and a centre line', () => {
    // Centre 395 is 5 from the lane centre; the left edge 345 is 2 from another component's left edge 343.
    const r = snapToGuides(box(345, 300), [box(343, 100)], 6, [lane]);
    assert.equal(r.x, 343);
  });

  it('ignores a centre line beyond the threshold', () => {
    const r = snapToGuides(box(330, 300), [], 6, [lane]);
    assert.equal(r.snappedX, false);
    assert.equal(r.x, 330);
  });
});
