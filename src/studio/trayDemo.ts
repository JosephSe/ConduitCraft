/**
 * The tray's demo pane (7.3): the highlighted component at full size on a panel tinted with its colour, running a
 * three-second loop of what it does in a run, with its name and one line about it. Seven behaviours cover the
 * components that act on traffic; swimlane, frame, note and text show a still picture. Under reduced motion every loop
 * is a still picture of its end state. The demo is user-triggered and explains behaviour, so it meets D10.
 */

/** One capsule: the keyframes it runs, when it starts, and where it rests when nothing moves. */
interface Cap {
  a: string;
  delay?: number;
  vars?: string;
  /** End state: left, offset from the middle, opacity, colour. */
  end: [left: string, top?: string, opacity?: number, colour?: string];
}

const ROSE = 'var(--cc-rose)';

const BEHAVIOURS: Record<string, { over?: boolean; caps: Cap[] }> = {
  // Leave on a beat.
  starts: { caps: [{ a: 'lead', end: ['80%'] }, { a: 'lead', delay: 1.5, end: ['96%'] }] },
  // Go in one side and out the other.
  passes: { caps: [{ a: 'through', end: ['90%'] }, { a: 'through', delay: 1.5, end: ['68%'] }] },
  // One in, fanned to three.
  spreads: {
    caps: [
      { a: 'in', end: ['0%', '0px', 0] },
      { a: 'fan', vars: '--dy:-1.5rem', end: ['92%', '-1.5rem'] },
      { a: 'fan', vars: '--dy:0px', end: ['92%', '0px'] },
      { a: 'fan', vars: '--dy:1.5rem', end: ['92%', '1.5rem'] },
    ],
  },
  // Four pass; the fifth turns rose and falls back.
  limits: {
    caps: [
      { a: 'through', end: ['94%'] },
      { a: 'through', delay: 0.4, end: ['82%'] },
      { a: 'through', delay: 0.8, end: ['70%'] },
      { a: 'through', delay: 1.2, end: ['58%'] },
      { a: 'turn', delay: 1.6, vars: `--c:${ROSE}`, end: ['10%', '1.5rem', 1, ROSE] },
    ],
  },
  // One turns round at the cache; the next goes through.
  answers: { caps: [{ a: 'turn', vars: '--c:var(--t)', end: ['10%', '1.5rem'] }, { a: 'through', delay: 1.5, end: ['88%'] }] },
  // Arrive fast, leave slowly.
  holds: { over: true, caps: [{ a: 'hold-0', end: ['40%'] }, { a: 'hold-1', delay: 0.15, end: ['46%'] }, { a: 'hold-2', delay: 0.3, end: ['52%'] }] },
  // Arrive and stay.
  keeps: {
    over: true,
    caps: [
      { a: 'keep', vars: '--x:44%', end: ['44%'] },
      { a: 'keep', delay: 0.5, vars: '--x:50%', end: ['50%'] },
      { a: 'keep', delay: 1, vars: '--x:56%', end: ['56%'] },
    ],
  },
};

const BEHAVIOUR_OF: Record<string, string> = {
  actor: 'starts',
  client: 'starts',
  scheduler: 'starts',
  service: 'passes',
  core: 'passes',
  gate: 'passes',
  balancer: 'spreads',
  stream: 'spreads',
  bus: 'spreads',
  limiter: 'limits',
  cache: 'answers',
  queue: 'holds',
  store: 'keeps',
  'object-store': 'keeps',
};

/** One or two plain sentences for each. Names come from the catalogue; these say what it does. */
export const DESCRIPTIONS: Record<string, string> = {
  actor: 'A person or an outside system that starts traffic.',
  client: 'An app or device that sends requests, like a phone or a browser.',
  scheduler: 'Starts work on a timer, like a nightly job.',
  balancer: 'Spreads requests across several copies of a service.',
  gate: 'Checks every request before it gets in: sign-in, keys, rules.',
  limiter: 'Lets only so many requests through and turns the rest away.',
  service: 'Runs your code. It takes a request, then answers or passes it on.',
  core: 'The main system that everything else leans on.',
  cache: 'Keeps recent answers close. A hit never reaches the data behind it.',
  queue: 'Holds work until a reader is free. If the reader stops, it buffers.',
  stream: 'A log of events that many readers can follow at their own pace.',
  bus: 'Sends one event to everything that cares about it.',
  store: 'Keeps data. Requests arrive, and the data stays.',
  'object-store': 'Keeps files and blobs, like images and backups.',
  zone: 'A column that marks a stage of the system, like Edge or Data.',
  frame: 'A box that holds components, to group them.',
  notes: 'A note card for rules and decisions.',
  text: 'A free label on the sheet.',
};

/** The loop a stencil runs, or undefined for structure items, which show a still picture. */
export const behaviourOf = (id: string): string | undefined => BEHAVIOUR_OF[id];

export const BEHAVIOUR_NAMES = Object.keys(BEHAVIOURS);

const stillOnly = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function capsule(cap: Cap): string {
  const [left, top = '0px', opacity = 1, colour] = cap.end;
  const style = [
    `--a:k-${cap.a}`,
    cap.delay ? `--d:${cap.delay}s` : '',
    cap.vars ?? '',
    `--el:${left}`,
    `--et:${top}`,
    `--eo:${opacity}`,
    colour ? `--ec:${colour}` : '',
  ]
    .filter(Boolean)
    .join(';');
  return `<i class="cap" style="${style}"></i>`;
}

export interface DemoSubject {
  id: string;
  title: string;
  /** The component's cut-out markup, and its tone (a CSS colour). */
  cutout: string;
  tone: string;
}

/** Draw the demo for one component into the pane. */
export function showDemo(pane: HTMLElement, subject: DemoSubject | null): void {
  pane.hidden = !subject;
  if (!subject) return;
  const behaviour = BEHAVIOURS[BEHAVIOUR_OF[subject.id] ?? ''];
  pane.classList.toggle('is-still', stillOnly());
  pane.style.setProperty('--t', subject.tone);
  const stage = pane.querySelector<HTMLElement>('.tray-stage')!;
  stage.classList.toggle('is-over', !!behaviour?.over);
  stage.innerHTML = `${behaviour ? '<i class="demo-lead"></i>' : ''}${behaviour ? behaviour.caps.map(capsule).join('') : ''}<span class="demo-cut">${subject.cutout}</span>`;
  pane.querySelector('.tray-demo-name')!.textContent = subject.title;
  pane.querySelector('.tray-demo-text')!.textContent = DESCRIPTIONS[subject.id] ?? '';
}

/** The empty pane: a stage, a name and a line. */
export function createDemoPane(): HTMLElement {
  const pane = document.createElement('aside');
  pane.className = 'tray-demo';
  pane.hidden = true;
  pane.innerHTML = '<div class="tray-stage" aria-hidden="true"></div><h3 class="tray-demo-name"></h3><p class="tray-demo-text"></p>';
  return pane;
}
