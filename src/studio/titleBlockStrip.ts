/** The title block on the sheet itself, in the Present lens (C6, 8.7). Exports draw the same fields in `exporter/titleBlock.ts`. */
import { app } from './state';
import { titleBlockFor } from '../exporter/titleBlock';
import { pageInfo } from './stagePicture';

export function paintTitleBlockStrip(): void {
  const strip = document.getElementById('title-block');
  if (!strip) return;
  const show = app.lens === 'present';
  strip.hidden = !show;
  if (!show) return;
  const block = titleBlockFor(app.doc, pageInfo());
  strip.replaceChildren(
    ...[block.title, block.systemTag, block.statusLabel, block.page, block.date]
      .filter((v): v is string => Boolean(v))
      .map((text) => {
        const cell = document.createElement('span');
        cell.textContent = text;
        return cell;
      }),
  );
}
