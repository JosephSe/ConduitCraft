import type { DiagramDocument, StreamTone } from '../types';
import { type WorldRect, nodeRect, contentWorldBounds, frameRectInViewport } from './viewportFrame';
import { app, applyTransform, setSelection, fitToViewport } from './state';
import { workspace, viewport } from './dom';
import { TONE_META } from '../shared/tones';

export interface TourStep {
  id: string;
  type: 'overview' | 'node';
  title: string;
  subtitle: string;
  summary: string;
  tone: StreamTone;
  nodeId?: string;
  bounds?: WorldRect;
}

/**
 * Builds an ordered list of presentation tour steps.
 * Step 0 is always the high-level Architecture Overview, followed
 * by each node in the diagram.
 */
export function buildTourSteps(doc: DiagramDocument): TourStep[] {
  const steps: TourStep[] = [
    {
      id: '__overview__',
      type: 'overview',
      title: doc.title || 'Architecture Overview',
      subtitle: 'System Architecture',
      summary:
        doc.overviewSummary ||
        'Comprehensive view of system components, boundaries, and real-time event telemetry.',
      tone: 'emerald',
      bounds: contentWorldBounds(doc) ?? undefined,
    },
  ];

  for (let i = 0; i < doc.nodes.length; i++) {
    const node = doc.nodes[i];
    steps.push({
      id: node.id,
      type: 'node',
      title: node.title,
      subtitle: node.subtitle || `Step 0${i + 1}`,
      summary:
        node.summary ||
        `Active ${node.kind} component in ${node.zoneLabel || 'system architecture'} transmitting ${node.accent || 'emerald'} telemetry.`,
      tone: (node.accent as StreamTone) || 'emerald',
      nodeId: node.id,
      bounds: nodeRect(node),
    });
  }

  return steps;
}

export class PresentationManager {
  private active = false;
  private currentStepIndex = 0;
  private steps: TourStep[] = [];
  private autoPlayTimer: any = null;
  private autoPlaySeconds = 5;

  private barEl: HTMLElement | null = null;
  private captionEl: HTMLElement | null = null;

  public get isPresenting(): boolean {
    return this.active;
  }

  public get currentIndex(): number {
    return this.currentStepIndex;
  }

  public get totalSteps(): number {
    return this.steps.length;
  }

  public get currentStep(): TourStep | null {
    return this.steps[this.currentStepIndex] ?? null;
  }

  public get isAutoPlaying(): boolean {
    return this.autoPlayTimer !== null;
  }

  /**
   * Start presentation mode for the current document.
   */
  public enter(doc: DiagramDocument, startIndex = 0): void {
    this.steps = buildTourSteps(doc);
    if (this.steps.length === 0) return;

    this.active = true;
    this.currentStepIndex = Math.max(0, Math.min(startIndex, this.steps.length - 1));

    if (typeof document !== 'undefined' && document.body) {
      if (document.body.dataset) {
        document.body.dataset.presenting = 'true';
      }

      // Switch to Data View if in Design mode
      if (app.workspaceMode !== 'data') {
        app.workspaceMode = 'data';
        if (workspace && workspace.dataset) {
          workspace.dataset.mode = 'data';
        }
        const dataRadio = document.querySelector<HTMLInputElement>(
          'input[name="workspace-mode"][value="data"]',
        );
        if (dataRadio) dataRadio.checked = true;

        const designToolbar = document.getElementById('design-toolbar');
        const dataToolbar = document.getElementById('data-toolbar');
        const designPane = document.getElementById('design-inspector-pane');
        const dataPane = document.getElementById('data-inspector-pane');
        if (designToolbar) designToolbar.hidden = true;
        if (dataToolbar) dataToolbar.hidden = false;
        if (designPane) designPane.hidden = true;
        if (dataPane) dataPane.hidden = false;
      }

      this.ensureUiElements();
      this.updateUi();
      this.applyStepCamera(this.currentStepIndex, false);
    }
  }

  /**
   * Exit presentation mode.
   */
  public exit(): void {
    if (!this.active) return;
    this.stopAutoPlay();
    this.active = false;

    if (typeof document !== 'undefined') {
      if (document.body?.dataset) {
        delete document.body.dataset.presenting;
      }
      if (this.barEl) this.barEl.hidden = true;
      if (this.captionEl) this.captionEl.hidden = true;
      if (typeof window !== 'undefined' && Boolean((viewport as any)?.getBoundingClientRect)) {
        fitToViewport();
      }
    }
  }

  public toggle(doc: DiagramDocument): void {
    if (this.active) {
      this.exit();
    } else {
      this.enter(doc);
    }
  }

  public next(): void {
    if (!this.active || this.steps.length === 0) return;
    this.currentStepIndex = (this.currentStepIndex + 1) % this.steps.length;
    this.updateUi();
    this.applyStepCamera(this.currentStepIndex, true);
  }

  public prev(): void {
    if (!this.active || this.steps.length === 0) return;
    this.currentStepIndex = (this.currentStepIndex - 1 + this.steps.length) % this.steps.length;
    this.updateUi();
    this.applyStepCamera(this.currentStepIndex, true);
  }

  public goTo(index: number): void {
    if (!this.active || this.steps.length === 0) return;
    this.currentStepIndex = Math.max(0, Math.min(index, this.steps.length - 1));
    this.updateUi();
    this.applyStepCamera(this.currentStepIndex, true);
  }

  public toggleAutoPlay(): boolean {
    if (this.isAutoPlaying) {
      this.stopAutoPlay();
      return false;
    } else {
      this.startAutoPlay();
      return true;
    }
  }

  public startAutoPlay(): void {
    this.stopAutoPlay();
    this.autoPlayTimer = setInterval(() => {
      this.next();
    }, this.autoPlaySeconds * 1000);
    this.updatePlayButtonState();
  }

  public stopAutoPlay(): void {
    if (this.autoPlayTimer !== null) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
      this.updatePlayButtonState();
    }
  }

  private applyStepCamera(index: number, animate = true): void {
    const step = this.steps[index];
    if (!step) return;

    if (typeof window === 'undefined' || !Boolean((viewport as any)?.getBoundingClientRect)) return;

    const rect = viewport.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (step.type === 'overview') {
      setSelection({ type: 'none' });
      const bounds = step.bounds ?? contentWorldBounds(app.doc);
      if (!bounds) {
        fitToViewport();
        return;
      }
      const frame = frameRectInViewport(rect.width, rect.height, bounds);
      if (frame) {
        if (animate) {
          this.tweenCamera(frame.panX, frame.panY, frame.scale);
        } else {
          app.panX = Math.round(frame.panX);
          app.panY = Math.round(frame.panY);
          app.scale = frame.scale;
          applyTransform();
        }
      }
    } else if (step.type === 'node' && step.nodeId) {
      setSelection({ type: 'node', id: step.nodeId });
      const bounds = step.bounds;
      if (bounds) {
        // Compute target frame with comfortable margin
        const padX = 160;
        const padY = 200;
        const availW = Math.max(32, rect.width - padX);
        const availH = Math.max(32, rect.height - padY);
        const rawScale = Math.min(availW / bounds.width, availH / bounds.height);
        const scale = Math.min(1.4, Math.max(0.7, rawScale));

        const panX = (rect.width - bounds.width * scale) / 2 - bounds.x * scale;
        // Shift slightly upward to leave room for bottom caption
        const panY = (rect.height - bounds.height * scale) / 2 - bounds.y * scale - 40;

        if (animate) {
          this.tweenCamera(panX, panY, scale);
        } else {
          app.panX = Math.round(panX);
          app.panY = Math.round(panY);
          app.scale = scale;
          applyTransform();
        }
      }
    }
  }

  private tweenCamera(targetPanX: number, targetPanY: number, targetScale: number, durationMs = 420): void {
    const startX = app.panX;
    const startY = app.panY;
    const startScale = app.scale;
    const startTime = performance.now();

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      app.panX = Math.round(targetPanX);
      app.panY = Math.round(targetPanY);
      app.scale = targetScale;
      applyTransform();
      return;
    }

    const step = (now: number) => {
      if (!this.active) return;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // easeOutCubic curve
      const ease = 1 - Math.pow(1 - progress, 3);

      app.panX = startX + (targetPanX - startX) * ease;
      app.panY = startY + (targetPanY - startY) * ease;
      app.scale = startScale + (targetScale - startScale) * ease;
      applyTransform();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        app.panX = Math.round(targetPanX);
        app.panY = Math.round(targetPanY);
        app.scale = targetScale;
        applyTransform();
      }
    };

    requestAnimationFrame(step);
  }

  private ensureUiElements(): void {
    if (typeof document === 'undefined') return;

    if (!this.barEl) {
      let el = document.getElementById('presentation-bar');
      if (!el) {
        el = document.createElement('div');
        el.id = 'presentation-bar';
        el.className = 'presentation-bar';
        el.innerHTML = `
          <button type="button" class="btn btn-icon-only" id="btn-pres-prev" aria-label="Previous step (Left Arrow)" data-tip="Previous (←)">
            <svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div class="presentation-pill-info" id="pres-pill-info">Overview</div>
          <button type="button" class="btn btn-icon-only" id="btn-pres-next" aria-label="Next step (Right Arrow / Space)" data-tip="Next (→)">
            <svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <div class="presentation-bar-divider" aria-hidden="true"></div>
          <button type="button" class="btn btn-icon-only" id="btn-pres-play" aria-label="Play / Pause tour" data-tip="Auto-play">
            <svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"/></svg>
          </button>
          <button type="button" class="btn btn-icon-only" id="btn-pres-fullscreen" aria-label="Toggle Fullscreen" data-tip="Fullscreen">
            <svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          </button>
          <button type="button" class="btn btn-pres-exit" id="btn-pres-exit" aria-label="Exit presentation (Esc or P)" data-tip="Exit (Esc)">
            <svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            <span>Exit</span>
          </button>
        `;
        document.body.appendChild(el);

        // Bind presentation bar events
        if (el.querySelector) {
          el.querySelector('#btn-pres-prev')?.addEventListener('click', () => {
            this.stopAutoPlay();
            this.prev();
          });
          el.querySelector('#btn-pres-next')?.addEventListener('click', () => {
            this.stopAutoPlay();
            this.next();
          });
          el.querySelector('#btn-pres-play')?.addEventListener('click', () => {
            this.toggleAutoPlay();
          });
          el.querySelector('#btn-pres-fullscreen')?.addEventListener('click', () => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen?.().catch(() => {});
            } else {
              document.exitFullscreen?.().catch(() => {});
            }
          });
          el.querySelector('#btn-pres-exit')?.addEventListener('click', () => {
            this.exit();
          });
        }
      }
      this.barEl = el;
    }

    if (!this.captionEl) {
      let el = document.getElementById('presentation-caption');
      if (!el) {
        el = document.createElement('aside');
        el.id = 'presentation-caption';
        el.className = 'presentation-caption';
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = `
          <div class="presentation-caption-header">
            <div class="presentation-caption-badge-row">
              <span class="presentation-caption-badge" id="pres-caption-badge">OVERVIEW</span>
              <span class="presentation-caption-step" id="pres-caption-step">0 of 0</span>
            </div>
            <h2 class="presentation-caption-title" id="pres-caption-title">Architecture Title</h2>
            <div class="presentation-caption-subtitle" id="pres-caption-subtitle">Subtitle</div>
          </div>
          <p class="presentation-caption-body" id="pres-caption-body"></p>
        `;
        document.body.appendChild(el);
      }
      this.captionEl = el;
    }
  }

  private updateUi(): void {
    if (!this.barEl || !this.captionEl) return;
    this.barEl.hidden = false;
    this.captionEl.hidden = false;

    const step = this.currentStep;
    if (!step) return;

    // Update pill text: e.g. "Overview" or "2 of 6: Node Name"
    const pill = this.barEl.querySelector ? this.barEl.querySelector('#pres-pill-info') : null;
    if (pill) {
      pill.textContent =
        step.type === 'overview'
          ? `Overview (${this.steps.length - 1} nodes)`
          : `${this.currentStepIndex} of ${this.steps.length - 1}`;
    }

    // Update caption card
    const badge = this.captionEl.querySelector ? this.captionEl.querySelector('#pres-caption-badge') : null;
    const stepCount = this.captionEl.querySelector ? this.captionEl.querySelector('#pres-caption-step') : null;
    const title = this.captionEl.querySelector ? this.captionEl.querySelector('#pres-caption-title') : null;
    const subtitle = this.captionEl.querySelector ? this.captionEl.querySelector('#pres-caption-subtitle') : null;
    const body = this.captionEl.querySelector ? this.captionEl.querySelector('#pres-caption-body') : null;

    const toneMeta = TONE_META[step.tone] || TONE_META.emerald;
    const toneVar = `var(${toneMeta.cssVar})`;

    if (badge) {
      badge.textContent = step.type === 'overview' ? 'ARCHITECTURE' : 'COMPONENT';
      (badge as HTMLElement).style?.setProperty('--badge-accent', toneVar);
    }
    if (stepCount) {
      stepCount.textContent =
        step.type === 'overview'
          ? `System Overview`
          : `Step ${this.currentStepIndex} of ${this.steps.length - 1}`;
    }
    if (title) title.textContent = step.title;
    if (subtitle) subtitle.textContent = step.subtitle;
    if (body) body.textContent = step.summary;
  }

  private updatePlayButtonState(): void {
    if (!this.barEl) return;
    const playBtn = this.barEl.querySelector ? this.barEl.querySelector('#btn-pres-play') : null;
    if (!playBtn) return;
    if (this.isAutoPlaying) {
      playBtn.innerHTML = `<svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      playBtn.setAttribute('data-tip', 'Pause auto-play');
      playBtn.setAttribute('aria-label', 'Pause auto-play');
    } else {
      playBtn.innerHTML = `<svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;
      playBtn.setAttribute('data-tip', 'Start auto-play');
      playBtn.setAttribute('aria-label', 'Start auto-play');
    }
  }
}

export const presentationManager = new PresentationManager();

export function togglePresentation(doc: DiagramDocument = app.doc): void {
  presentationManager.toggle(doc);
}
