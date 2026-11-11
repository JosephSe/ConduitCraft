# Sheet polish: implementation spec

**Written:** 2026-11-11, against `v3` at `be066f0` (release 3.0.0).
**Covers three findings of the 2026-11-11 review:** the diagram is hard to read at Fit, the island buttons are boxed, and the hint line still uses 2.x wording.
**Does not need** [`INSPECTOR_SPEC.md`](INSPECTOR_SPEC.md) to be done first. The two can be built in either order on separate branches.

Every CSS block in Parts A and B was injected into the running 3.0.0 app on the Marquee showcase at 1440 × 900 and looked at in both themes before it was written here. Copy it as written.

This file is written so that an agent with no memory of the project can do the work by following it top to bottom. Do the steps in section 7 in order. Do not skip ahead, and do not improve on it.

---

## Contents

1. [What is being changed](#1-what-is-being-changed)
2. [Rules you must not break](#2-rules-you-must-not-break)
3. [Before you start](#3-before-you-start)
4. [Part A: the diagram reads at Fit](#4-part-a-the-diagram-reads-at-fit)
5. [Part B: island buttons lose their boxes](#5-part-b-island-buttons-lose-their-boxes)
6. [Part C: the hint line and the count](#6-part-c-the-hint-line-and-the-count)
7. [Work order](#7-work-order)
8. [Acceptance checklist](#8-acceptance-checklist)
9. [Out of scope](#9-out-of-scope)

---

## 1. What is being changed

| Part | Today | After |
|---|---|---|
| A | At Fit on the showcase (about 41% zoom) component names are cut off: "Edge CDN +…", "Bot & Frau…", "Notificatio". Frame titles are sliced in half by their own tab. Every wire carries a label about 5 px tall. Lane subtitles are about 6 px. | Every component name reads in full. Frame titles are whole. Wire labels are hidden while zoomed out and appear, at a readable size, on the wire you point at or select. Lane subtitles are 10.5 px. |
| B | Search, Share, −, +, Fit, the Traffic transport buttons and the Review buttons each have their own border and white fill inside an island that already has a border. | Those buttons are plain text or icons on the island. Hover shows a soft well. Run stays the one filled button. |
| C | The hint line above the dock says "Drag stencils onto the grid · Drag from any port dot to draw an animated wire". The view popover says "27 nodes · 34 wires". | Plain sentences from the plan's voice table (plan section 5.5). "27 components, 34 wires". |

Nothing else changes. No behaviour, no shortcut, no file format.

---

## 2. Rules you must not break

| # | Rule |
|---|---|
| R1 | **Change only what this file names.** If a rule, string or element is not listed here, leave it alone. |
| R2 | **Colours come from tokens only.** Use `var(--cc-…)`. Never write a hex or `rgb()` value. |
| R3 | **No new dependency, no framework, no schema change** (plan decisions D2 and D7). |
| R4 | **Component box sizes do not change** (plan decision D6). Part A changes how text is drawn inside a box, never the box. |
| R5 | **Exports do not change.** Part A's rules are scoped to `#stage-world[data-lod="low"]`, which only exists in the studio. Do not edit `src/exporter/`, `src/styles/viewer.css` or `src/styles/shared.css`. |
| R6 | **Do not touch** `src/studio/interactions.ts.bak`, `e2e/zz_debug.spec.ts`, `tools/_auditTemplates.ts`, `tools/_narrow.mjs` or anything under `.claude/`. They are the owner's. |
| R7 | **Branch and PR.** Work on the `sheet-polish` branch; PRs target `v3`. Stage files by name (`git add path/to/file`), never `git add -A` or `git add .`. Do not put a `claude.ai` session link in a commit, PR or comment. |
| R8 | **Never delete or skip a test to make a step pass.** Change a test only where this file says to, or where a test asserts the exact old look this file replaces; say which in the PR description. |
| R9 | **If something in this file does not match the code**, stop and write `Blocked: <what you found>` under the step in section 7. Do not guess. |

---

## 3. Before you start

1. See today's state. Run `pnpm dev`, open `http://localhost:5180`, press Cmd/Ctrl+K, type "Load Showcase", press Enter, then click **Fit**. Look at the component names, the two frame titles ("PCI DSS scope", "After payment: tickets & messages (async)"), the wire labels and the lane headers. Press `2` and `3` and look at the buttons in the dock and the corners.
2. Record the baseline and put the pass counts in the PR description:
   ```
   pnpm build
   pnpm test
   pnpm test:e2e
   pnpm check:size
   ```
3. While working, after each step run:
   ```
   pnpm test
   pnpm test:e2e:quick
   pnpm exec playwright test --project=chromium e2e/map.spec.ts e2e/slots.spec.ts e2e/topbar.spec.ts e2e/frames.spec.ts e2e/wireProtocol.spec.ts e2e/rename.spec.ts e2e/toolRail.spec.ts e2e/runBar.spec.ts e2e/insights.spec.ts e2e/a11y.spec.ts
   ```
   Run the full `pnpm test:e2e` (about four minutes) once before the pull request. Keep the default worker count.

Line numbers below are for `be066f0`. If they have moved, find the code by the text quoted.

---

## 4. Part A: the diagram reads at Fit

### 4.1 Why names are cut off today

Below 55% zoom the stage has `data-lod="low"`. A rule there sizes every title at `12px / zoom`, so it is always 12 px on screen. At 41% zoom that is a 29 px font inside a box that is still 222 px wide, so a word like "Notifications" does not fit and is clipped.

The fix is four small things. Use the typeface's condensed width (Instrument Sans ships widths from 75% to 100%, plan decision D3). Allow a third line. Stop the font growing past 36 px in the diagram's own units, so the longest ordinary word still fits a box: at Fit on a 1440 × 900 window names are 11.5 to 12 px on screen (the existing 11 px test still passes, with or without the properties panel open), and on a 1280 × 720 window they are about 10 px but whole. And take the icon tile away while zoomed out, so the name has the whole box; the card takes a tint and an edge in its colour instead, the way shaped components already do, so each component still shows its colour.

### 4.2 Replace the zoomed-out block

Open `src/styles/studio/unlayered.css`. Find the comment that starts `/* C6 (8.6): zoomed out, the diagram reads like a transit map.` (line 2035). Replace everything from that comment down to and including the line that starts `#stage-world[data-lod="low"] .conduit-casing` (line 2057) with this block. Leave the `/* Medium: …` comment and the two `data-lod="medium"` rules after it untouched.

```css
/* C6 (8.6): zoomed out, the diagram reads like a transit map. The stage is CSS-zoomed, so a size divided by --cam-scale lands at that many screen pixels. */
#stage-world[data-lod="low"] .node-title {
  font-size: clamp(15px, calc(12px / var(--cam-scale, 1)), 36px);   /* 36px cap: the longest ordinary word still fits a 222px box */
  font-stretch: 75%;            /* the condensed width: about a fifth more letters per line */
  font-weight: 800;             /* was set by the stale stage.css rule deleted in 4.3 */
  line-height: 1.2;             /* 1.12 clipped descenders by 2px */
  text-align: center;
  white-space: normal;
  text-wrap: balance;
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* Zoomed out there is no room for the tile and a name, so the name gets the whole box. The actor keeps its figure. */
#stage-world[data-lod="low"] .arch-node:not([data-kind="actor"]) .node-top { display: none; }
#stage-world[data-lod="low"] .arch-node .node-select-hit { justify-content: center; }
/* A plain card (no drawn outline: its button has no <svg> child) shows its colour as a tint and an edge, as shaped components do. */
#stage-world[data-lod="low"] .arch-node .node-select-hit:not(:has(> svg)) {
  padding: 6px 10px;
  background: color-mix(in oklab, var(--t) 6%, var(--cc-sheet));
  border-color: color-mix(in oklab, var(--t) 50%, var(--cc-sheet));
}
#stage-world[data-lod="low"] .node-sub,
#stage-world[data-lod="low"] .node-light,
#stage-world[data-lod="low"] .node-status-badge,
#stage-world[data-lod="low"] .node-comment-badge,
#stage-world[data-lod="low"] .node-lock-badge { display: none; }
#stage-world[data-lod="low"] .arch-node { box-shadow: none; }
/* C6: the card-kind tile grows as the camera pulls back, so the kind still reads at Fit. `scale` leaves layout alone and does not fight the failed-state rotate. */
#stage-world[data-lod="low"] .arch-node .node-icon { scale: clamp(1, calc(0.55 / var(--cam-scale, 1)), 1.9); transform-origin: center; }

/* Lane headers: the number and title stay on one line; the subtitle gives way with an ellipsis in a narrow lane. */
#stage-world[data-lod="low"] .zone-title { font-size: clamp(15px, calc(12px / var(--cam-scale, 1)), 48px); }
#stage-world[data-lod="low"] .zone-num,
#stage-world[data-lod="low"] .zone-sub { font-size: clamp(12px, calc(10.5px / var(--cam-scale, 1)), 40px); }
#stage-world[data-lod="low"] .zone-banner > span:first-child { white-space: nowrap; flex: none; }
#stage-world[data-lod="low"] .zone-sub { min-width: 0; flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Frame titles: the tab grows with its text instead of clipping it at 24px. */
#stage-world[data-lod="low"] .frame-title-bar {
  font-size: clamp(15px, calc(12px / var(--cam-scale, 1)), 48px);
  font-stretch: 75%;
  height: auto;
  max-inline-size: none;        /* a narrow frame's title may run past the frame's right edge rather than be cut */
  line-height: 1.3;
  padding-block: 0.1em;
  margin-top: -0.7em;
  border-width: calc(1px / var(--cam-scale, 1));
  border-radius: calc(5px / var(--cam-scale, 1));
}

/* Wire labels (plan 8.3): zoomed out they are noise, so they wait for the wire you point at, select, or that a run lights up, and then show at a readable size. */
#stage-world[data-lod="low"] .conduit-group:not(:hover, .is-selected, .is-highlighted) .conduit-badge-hit { display: none; }
#stage-world[data-lod="low"] .conduit-badge-hit { scale: calc(0.92 / var(--cam-scale, 1)); transform-box: fill-box; transform-origin: center; }
body[data-wire-labels="always"] #stage-world[data-lod="low"] .conduit-group .conduit-badge-hit,
.workspace[data-style="print"] #stage-world[data-lod="low"] .conduit-group .conduit-badge-hit { display: revert; }

#stage-world[data-lod="low"] .conduit-rail { stroke-width: min(5px, calc(1.75px / var(--cam-scale, 1))); }
#stage-world[data-lod="low"] .conduit-casing { stroke-width: min(9px, calc(6px / var(--cam-scale, 1))); }
```

What differs from the block you replaced, so you can check your paste:

- `.node-title`: the font-size cap 48px → 36px; added `font-stretch: 75%`, `font-weight: 800`, `text-wrap: balance`, `overflow-wrap: break-word`; `line-height` 1.15 → 1.2; `-webkit-line-clamp` 2 → 3.
- New: `.node-top` hidden for every kind except the actor, the name centred, and the tint and edge on plain cards.
- `.zone-title` and `.frame-title-bar` used to share one rule; they now have their own.
- New: `.zone-num`, `.zone-sub`, `.zone-banner` rules.
- New: the `.frame-title-bar` sizing properties, including `max-inline-size: none`.
- New: the four wire-label rules.
- Unchanged: `.node-sub…` hide list, `.arch-node` shadow, `.node-icon` scale, `.conduit-rail`, `.conduit-casing`.

This block is one of the few places the app keeps rules in `unlayered.css` on purpose (it must beat the layered stage rules). Edit it in place. Do not move it.

### 4.3 Delete the stale rules it used to fight

Open `src/styles/studio/stage.css`. Find the comment `/* Level-of-Detail (LoD) rendering for low zoom (< 55%) */` (line 1616). Below it are three rules. Keep the first (the one for `.node-footer, .node-eyebrow, .node-footer-label, .micro-chip`). **Delete** the second and third:

```css
  #stage-world[data-lod="low"] .node-title {
    font-size: 1.25rem;
    font-weight: 800;
    line-height: 1.2;
  }

  #stage-world[data-lod="low"] .node-sub {
    font-size: 0.95rem;
    font-weight: 600;
  }
```

The block in 4.2 already overrode their sizes. The one thing still coming from them was the title's 800 weight, which is why the block in 4.2 now sets `font-weight: 800` itself. The look does not change.

### 4.4 The "Always show wire labels" preference

Plan section 8.3 promised a switch for people who want every label at every zoom. It follows the existing "Animate wires while designing" preference exactly.

1. `index.html`, line 870 to 877: find the `<label>` that contains `<input type="checkbox" id="chk-animate-wires" name="animate-wires">`. Copy that whole `<label>…</label>` element and paste the copy directly after it. In the copy change:
   - the `<strong>` text to `Always show wire labels`
   - the `theme-option-sub` text to `Off by default: zoomed out, a label shows when you point at its wire`
   - the input to `<input type="checkbox" id="chk-always-wire-labels" name="always-wire-labels">`
2. `src/studio/interactions.ts`, line 700: find `export function bindAnimateWiresPreference(): void`. Directly after that function's closing brace, add:
   ```ts
   /** "Always show wire labels" (8.3): off by default; zoomed out, labels wait for hover or selection. */
   export function bindAlwaysWireLabelsPreference(): void {
     const box = document.getElementById('chk-always-wire-labels') as HTMLInputElement | null;
     if (!box) return;
     const apply = () => {
       if (box.checked) document.body.setAttribute('data-wire-labels', 'always');
       else document.body.removeAttribute('data-wire-labels');
     };
     try {
       box.checked = localStorage.getItem('cc-always-wire-labels') === 'true';
     } catch {
       // Storage unavailable: the preference lasts until the page reloads.
     }
     apply();
     box.addEventListener('change', () => {
       apply();
       try {
         localStorage.setItem('cc-always-wire-labels', String(box.checked));
       } catch {
         // Ignore storage errors.
       }
     });
   }
   ```
   Read the body of `bindAnimateWiresPreference` first. If it saves the value in a different way from the `change` listener above (for example it removes the key when unchecked), copy **its** way instead, with the new key name.
3. Find where `bindAnimateWiresPreference()` is called (`grep -rn "bindAnimateWiresPreference" src`). Add a call to `bindAlwaysWireLabelsPreference()` on the next line, and add the name to the same import statement if the call is in another file.

### 4.5 Tests for Part A

Add these to `e2e/map.spec.ts`, after the existing `at Fit every component and lane title renders at 11 px or more` test. They use the same setup lines as that test (load the showcase, run the "Fit" palette command).

1. **No name is cut off at Fit.**
   ```ts
   test('at Fit no component name or frame title is cut off', async ({ page }) => {
     await page.goto('/');
     await runPaletteCommand(page, 'Load Showcase');
     await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
     await runPaletteCommand(page, 'Fit');
     const cut = await page.evaluate(() =>
       [...document.querySelectorAll<HTMLElement>('#stage-world .node-title, #stage-world .frame-title-bar')]
         .filter((el) => el.getClientRects().length > 0)
         .filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
         .map((el) => el.textContent),
     );
     expect(cut).toEqual([]);
   });
   ```
   Run this test at three window sizes by wrapping it in `for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 700 }])`, with `await page.setViewportSize(size)` as its first line and the size in the test's title. All three must pass.
2. **Wire labels wait for the pointer when zoomed out.**
   ```ts
   test('zoomed out, a wire label shows only on the wire you point at, at 10 px or more', async ({ page }) => {
     await page.goto('/');
     await runPaletteCommand(page, 'Load Showcase');
     await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
     await runPaletteCommand(page, 'Fit');
     await expect(page.locator('#stage-world')).toHaveAttribute('data-lod', 'low');
     await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
     await expect(page.locator('.conduit-badge-hit:visible')).toHaveCount(0);
     // Click the middle of a labelled wire that nothing covers (the way selectWire does in e2e/interactions.spec.ts).
     const hit = await page.evaluate(() => {
       for (const group of document.querySelectorAll<SVGGElement>('.conduit-group')) {
         if (!group.querySelector('.conduit-badge-hit')) continue;
         const path = group.querySelector<SVGPathElement>('.conduit-hit');
         const ctm = path?.getScreenCTM();
         if (!path || !ctm) continue;
         const mid = path.getPointAtLength(path.getTotalLength() / 2);
         const pt = new DOMPoint(mid.x, mid.y).matrixTransform(ctm);
         if (document.elementFromPoint(pt.x, pt.y)?.closest('.conduit-group') === group) {
           return { id: group.dataset.edgeId!, x: pt.x, y: pt.y };
         }
       }
       return null;
     });
     expect(hit, 'a labelled wire with a clear midpoint').not.toBeNull();
     await page.mouse.click(hit!.x, hit!.y);
     const label = page.locator(`.conduit-group[data-edge-id="${hit!.id}"] .route-pill-text`);
     await expect(label).toBeVisible();
     const height = await label.evaluate((el) => el.getBoundingClientRect().height);
     expect(height).toBeGreaterThanOrEqual(10);
   });
   ```
   The label sits at the wire's midpoint, so once it shows it may be under the pointer; that is fine.
3. **The preference turns them all back on.** Open the settings dialog the way an existing test does (`grep -rn "chk-animate-wires\|open-settings\|Preferences" e2e`), check `#chk-always-wire-labels`, close the dialog, and expect `page.locator('.conduit-badge-hit:visible')` to have a count greater than 10.

Existing tests that may fail, and what to do:

| Test | Why | Do |
|---|---|---|
| `e2e/v3Visual.spec.ts` (picture baselines taken at Fit) | The pictures change: that is the point. | Run `pnpm exec playwright test e2e/v3Visual.spec.ts --update-snapshots`. Open each changed PNG under `e2e/__screenshots__/` and confirm it shows whole names, whole frame titles and no small wire labels. Commit the new PNGs by name. |
| Any test that expects a wire label (`.route-pill-text`, `.conduit-badge-hit`) to be visible | It runs zoomed out below 55%. | In the test, select or hover that wire before the assertion. Do not change the CSS. |
| `tests/*.test.ts` that read `unlayered.css` or `stage.css` as text | They quote the old rules. | Update the quoted text to the new rule. |

---

## 5. Part B: island buttons lose their boxes

### 5.1 The rule

Open `src/styles/studio/ui.css`. Inside `@layer ui { … }`, directly after the `.btn.solid:hover:not(:disabled) { … }` rule (line 43 to 46), add:

```css
  /* On an island a button is not a box in a box (6.2, 6.4): it is text or an icon on the island, with a well on hover. Run (.solid) stays filled. */
  [data-island] .btn:not(.solid),
  .slot .btn:not(.solid) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
  [data-island] .btn:not(.solid):hover:not(:disabled),
  .slot .btn:not(.solid):hover:not(:disabled) {
    background: var(--cc-well);
  }
  [data-island] .btn:not(.solid)[aria-pressed="true"],
  .slot .btn:not(.solid)[aria-pressed="true"],
  [data-island] .btn:not(.solid)[aria-expanded="true"],
  .slot .btn:not(.solid)[aria-expanded="true"] {
    background: var(--cc-well);
    color: var(--cc-ink);
  }
  /* The first-run card's second and third actions keep their outline: they sit beside a filled button and must still read as buttons. */
  .first-run .btn:not(.solid) {
    border-color: var(--cc-hair-2);
    background: var(--cc-sheet);
  }
```

`border-color: transparent` keeps the 1 px border in the box model, so no button changes size and no island changes width.

### 5.2 Check each place by eye

After adding the rule, look at every one of these in light and dark. Each button must have no border and no fill at rest, a soft well on hover, and a visible focus ring when reached with Tab.

| Where | Buttons | Lens |
|---|---|---|
| Top right island | Search, Share (Run stays filled) | any |
| Bottom right island | −, the zoom readout, +, Fit | any |
| Dock | previous step, play/pause, next step, speed (1×), loop | Traffic (press `2`) |
| Dock | previous issue, next issue, the fix button (for example "Add a standby"), "Ignore this rule" | Review (press `3`) |
| Bottom left island | the page `+` button and "Key", if they use `.btn` | any |

Then check the things that must **not** have changed:

- **Run** is still ink-filled.
- A **pressed toggle** is still clearly on. In Traffic, click the loop button: it must look different from the unpressed speed button beside it (it gets the well). If an existing, more specific rule already styles a pressed `.btn` and it still shows, leave it.
- The **first-run card** (open the app in a private window): "Pick a template" and "Paste Mermaid" still have outlines.
- **Dialogs, the inspector, the command palette, toasts and menus**: their buttons look exactly as before. They are not inside `[data-island]` or `.slot`. If any of them changed, the selector caught too much: find which ancestor matched and add an exclusion for it the same way `.first-run` is excluded. Say so in the PR description.

### 5.3 Tests for Part B

Add to `e2e/slots.spec.ts`:

```ts
test('island buttons are not boxed, and Run is the one filled button', async ({ page }) => {
  await page.goto('/');
  await page.locator('#stage-world').waitFor({ state: 'attached' });
  const style = (id: string) =>
    page.locator(id).evaluate((el) => {
      const c = getComputedStyle(el);
      return { border: c.borderTopColor, fill: c.backgroundColor };
    });
  const clear = /rgba\(0, 0, 0, 0\)|transparent/;
  for (const id of ['#btn-share', '#btn-open-palette']) {
    const s = await style(id);
    expect(s.border, id).toMatch(clear);
    expect(s.fill, id).toMatch(clear);
  }
  expect((await style('#btn-run')).fill).not.toMatch(clear);
});
```

Existing tests that may fail: `e2e/v3Visual.spec.ts` baselines again (update them as in 4.5, and check the pictures show unboxed buttons), and any test in `tests/` that reads `ui.css` as text. `e2e/a11y.spec.ts` must still pass with no change: text contrast is unchanged because the island behind a button is the same colour the button's fill was.

---

## 6. Part C: the hint line and the count

### 6.1 Tool hints

`src/studio/pointerTool.ts`, the `TOOL_TIPS` object (line 11). Replace the five strings:

| Key | Old | New |
|---|---|---|
| `select` | `Drag stencils onto the grid · Drag from any port dot to draw an animated wire` | `Drag a shape onto the sheet, or drag from a port to connect.` |
| `connect` | `Connect Mode · Drag from any component or port to another component to draw an animated wire` | `Drag from one component to another to connect them.` |
| `hand` | `Hand tool · Drag anywhere to move around the canvas` | `Drag anywhere to move around the sheet.` |
| `text` | `Text tool · Click the canvas to add a text label` | `Click the sheet to add a label.` |
| `frame` | `Frame tool · Drag on the canvas to draw a frame around components` | `Drag on the sheet to draw a frame around components.` |

### 6.2 Lens hints

`src/studio/interactions.ts`, the assignment that starts `hudStatusTip.textContent =` inside the lens-switch handler (line 1579 to 1584). Replace the whole expression with:

```ts
hudStatusTip.textContent =
  app.workspaceMode === 'design'
    ? TOOL_TIPS[app.pointerTool]
    : app.lens === 'review'
      ? 'Click an issue to jump to it.'
      : 'Select a component and press X to fail it.';
```

Add `TOOL_TIPS` to the import from `./pointerTool` at the top of `interactions.ts` if it is not already imported (`grep -n "pointerTool'" src/studio/interactions.ts`). This also fixes a small bug: returning to Design used to show the Select hint even when another tool was active.

### 6.3 Placing hint

`src/studio/dock.ts`, line 88. Replace

```ts
hudStatusTip.textContent = `Click the sheet to place ${stencil.paletteTitle} · Shift keeps placing · Esc puts it back`;
```

with

```ts
hudStatusTip.textContent = `Click the sheet to place ${stencil.paletteTitle}. Shift keeps placing, Esc puts it back.`;
```

### 6.4 The count

`src/studio/render.ts`, line 150 to 153, the `setText(canvasStatsPill, …)` call. Replace the template string with:

```ts
`${app.doc.nodes.length} ${app.doc.nodes.length === 1 ? 'component' : 'components'}, ${app.doc.edges.length} ${app.doc.edges.length === 1 ? 'wire' : 'wires'}`,
```

Then restyle the element it writes to. Find it: `grep -n "canvasStatsPill" src/studio/dom.ts` gives its element id; find that id in `index.html` for its class; find that class in `src/styles/studio/`. In that class's rule, set `font: var(--cc-font-small); color: var(--cc-ink-3); background: none; border: 0; padding: 0; border-radius: 0; text-transform: none; letter-spacing: 0;` and remove any `font-family` that names the mono font. It becomes a quiet line of text at the bottom of the view popover, not a pill. A count is not a literal value, so it does not use the mono face (plan section 5.2).

### 6.5 Before you commit Part C

For each old string in 6.1 to 6.4, run `grep -rn "<a distinctive part of the old string>" src tests e2e docs README.md`, skipping `interactions.ts.bak`. Update every other place that quotes it (a test, the guide) to the new text. On `be066f0` no test quotes these strings, so this should find only docs, if anything.

Other `hudStatusTip.textContent = …` assignments in `interactions.ts` (import results, errors) are **not** part of this work. Leave them.

### 6.6 Test for Part C

Add to `e2e/slots.spec.ts`:

```ts
test('the hint line speaks in plain sentences, per lens and per tool', async ({ page }) => {
  await page.goto('/');
  await page.locator('#stage-world').waitFor({ state: 'attached' });
  const hint = page.locator('#hud-status-tip');
  await page.keyboard.press('w');
  await expect(hint).toHaveText('Drag from one component to another to connect them.');
  await page.keyboard.press('2');
  await expect(hint).toHaveText('Select a component and press X to fail it.');
  await page.keyboard.press('3');
  await expect(hint).toHaveText('Click an issue to jump to it.');
  await page.keyboard.press('1');
  await expect(hint).toHaveText('Drag from one component to another to connect them.');
  await page.keyboard.press('v');
  await expect(hint).toHaveText('Drag a shape onto the sheet, or drag from a port to connect.');
});
```

If the page opens on Home or the first-run card and the keys do not reach the canvas, start the test the way the first test in `e2e/toolRail.spec.ts` does.

---

## 7. Work order

Three steps, one commit each, one pull request for all three. After each step run the commands in section 3, item 3, then look at the showcase at Fit and at 100%, in light and dark, in all three lenses.

#### [x] Step 1. Part A (section 4)
**Done when:** on the showcase at Fit, every component name and both frame titles read in full; no wire label is visible until you point at or select a wire, and then it is readable; lane 01's header is on one line; the preference switch turns all labels back on and is remembered after a reload; at 100% zoom the diagram looks exactly as it did before; the three new tests pass; `v3Visual` baselines are updated and checked.

**Unblocked 2026-11-11.** The first version of 4.2 failed its own test: `line-height: 1.12` clipped names by 2 px, a narrow frame's title was cut sideways, and below about 37% zoom names spilled out of their boxes. Section 4.2 now has a font cap (36 px after the second fix below), `line-height: 1.2`, no tile while zoomed out (plain cards take a tint and an edge instead), and `max-inline-size: none` on the frame title. With these, no name or frame title is cut off at Fit at 1440 × 900, 1280 × 720 or 1024 × 700 (measured in the running app). Test 2 in 4.5 now selects the wire by clicking its midpoint. Re-paste the block in 4.2 over the one already applied, replace test 2, add the size loop to test 1, and continue.

**Unblocked again 2026-11-11.** The 32 px cap made names 10.2 px at Fit on a 1440 × 900 window with the properties panel open, which fails the existing `at Fit every component and lane title renders at 11 px or more` test. That test is right and stays as it is. The cap in 4.2 is now **36 px**: measured in the running app, names are 11.5 px in that test's setup, and no name or frame title is cut off at 1440 × 900 (panel open and closed), 1280 × 720 or 1024 × 700. Change the one value `32px` to `36px` in the `.node-title` rule you pasted, re-run the Part A tests, update the `v3Visual` baselines, and continue. Do not change `e2e/map.spec.ts`'s existing test.

#### [x] Step 2. Part B (section 5)
**Done when:** every button in the table in 5.2 is unboxed in both themes; everything in the "must not have changed" list is unchanged; the new test passes.

#### [x] Step 3. Part C (section 6)
**Done when:** the hint line shows the new sentences for all five tools and all three lenses; the view popover's count reads "N components, N wires" as plain text; the new test passes; the full `pnpm test:e2e` passes.

---

## 8. Acceptance checklist

- [ ] Zoom-out test (plan section 2): at Fit on the showcase, every component's name can be read, in full, in both themes.
- [ ] At Fit there is no ellipsis inside any component, and no text is sliced by an edge.
- [ ] At 100% zoom nothing about the diagram has changed (compare with a screenshot taken before Step 1).
- [ ] Exports are unchanged: export the showcase as SVG and as a standalone HTML page; every wire label is present in both.
- [ ] Run is the only filled button on screen in the Design lens.
- [ ] Tab reaches every island button and each shows a focus ring.
- [ ] No sentence in the hint line contains a middle dot (`·`) for the five tools and three lenses.
- [ ] `pnpm build`, `pnpm test` and the full `pnpm test:e2e` pass. Counts are in the PR description next to the baseline.
- [ ] `pnpm check:size` passes.
- [ ] `git diff --stat v3` lists only: `src/styles/studio/unlayered.css`, `src/styles/studio/stage.css`, `src/styles/studio/ui.css`, the stylesheet that holds the count's class, `index.html`, `src/studio/interactions.ts`, `src/studio/pointerTool.ts`, `src/studio/dock.ts`, `src/studio/render.ts`, the file that calls the preference binder, `e2e/map.spec.ts`, `e2e/slots.spec.ts`, updated screenshot baselines, and any test or doc that quoted an old string. Anything else is out of scope: revert it.

---

## 9. Out of scope

Each of these is a separate item with its own spec to come.

- **Traffic before a run.** The dimmed diagram is hard to read in the dark theme, and the scenario picker is a native select that clips its text.
- **The Review issues card.** It floats outside the seven slots and the dock repeats it.
- **The component tray.** The doubled focus ring on search, the empty space under the demo pane, the phone layout.
- **The view popover's layout** (centred labels over selects). Only its count line changes here.
- **Menu and palette wording.** Items such as "New Diagram" and "Rename Selection" stay as they are: tests and the palette search depend on them.
- **Wire labels between 55% and 80% zoom.** They stay visible there, as today.
