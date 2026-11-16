/**
 * Node Search & Focus Controller (Cmd/Ctrl+F)
 *
 * Fast inline search bar in the canvas HUD that filters components
 * by title, subtitle, eyebrow, id, and summary, dims non-matches,
 * and allows stepping through matches (Enter / Shift+Enter) with camera framing.
 */
import type { DiagramDocument, DiagramNode } from '../types';
import { isMac } from './commands';
import type { LevelNodeEntry } from '../core/levels';

export interface NodeSearchOptions {
  searchInput: HTMLInputElement;
  searchCount: HTMLElement;
  clearButton: HTMLButtonElement;
  /** The box the input sits in. When given, it stays closed until Cmd/Ctrl+F opens it and closes again on Escape or when the field is left empty. */
  popover?: HTMLElement;
  getDoc: () => DiagramDocument;
  /** `path` is the level the node lives in when it is not the open one (F-03). */
  onFocusNode: (node: DiagramNode, shouldZoomFrame?: boolean, path?: string[]) => void;
  /** Components in every other level, so a search also finds what is nested (F-03). */
  getOtherLevels?: () => LevelNodeEntry[];
  onClearSearch?: () => void;
}

export interface NodeSearchController {
  search: (query: string) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  clear: () => void;
  getMatchedNodes: () => DiagramNode[];
  getCurrentIndex: () => number;
}

/**
 * Pure filter function matching nodes against multiple tokens.
 */
export function filterNodesByQuery(nodes: DiagramNode[], query: string): DiagramNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);

  return nodes.filter((node) => {
    const haystack = [
      node.title,
      node.subtitle,
      node.eyebrow,
      node.id,
      node.chip,
      node.summary,
      node.kind,
      node.zoneLabel,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}

/**
 * Applies search highlights and dims non-matches on the stage DOM elements.
 */
export function applySearchHighlightsToStage(
  matchedNodeIds: Set<string>,
  activeNodeId?: string,
): void {
  if (typeof document === 'undefined') return;
  const nodeEls = document.querySelectorAll<HTMLElement>('.arch-node');
  const wireEls = document.querySelectorAll<SVGElement>('.conduit-group');

  if (matchedNodeIds.size === 0) {
    // Clear all
    for (const el of nodeEls) {
      el.classList.remove('is-search-match', 'is-active-match', 'is-dimmed');
    }
    for (const wire of wireEls) {
      wire.classList.remove('is-dimmed');
    }
    return;
  }

  for (const el of nodeEls) {
    const id = el.dataset.node || el.dataset.nodeId || el.id.replace(/^node-/, '');
    const isMatch = matchedNodeIds.has(id);
    const isActive = activeNodeId === id;

    el.classList.toggle('is-search-match', isMatch);
    el.classList.toggle('is-active-match', isActive);
    el.classList.toggle('is-dimmed', !isMatch);
  }

  // Dim wires not connected to at least one matching node
  for (const wire of wireEls) {
    const fromId = wire.getAttribute('data-from');
    const toId = wire.getAttribute('data-to');
    const touchesMatch = (fromId && matchedNodeIds.has(fromId)) || (toId && matchedNodeIds.has(toId));
    wire.classList.toggle('is-dimmed', !touchesMatch);
  }
}

/**
 * Clears all search highlights and dimmed classes from stage elements.
 */
export function clearSearchHighlightsFromStage(): void {
  if (typeof document === 'undefined') return;
  const nodeEls = document.querySelectorAll<HTMLElement>('.arch-node');
  const wireEls = document.querySelectorAll<SVGElement>('.conduit-group');
  for (const el of nodeEls) {
    el.classList.remove('is-search-match', 'is-active-match', 'is-dimmed');
  }
  for (const wire of wireEls) {
    wire.classList.remove('is-dimmed');
  }
}

/**
 * Initializes the HUD search controller and binds event listeners.
 */
export function initNodeSearch(options: NodeSearchOptions): NodeSearchController {
  const { searchInput, searchCount, clearButton, popover, getDoc, onFocusNode, onClearSearch, getOtherLevels } = options;
  const closePopover = () => {
    if (popover) popover.hidden = true;
  };

  let currentMatches: DiagramNode[] = [];
  let currentIndex = -1;
  /** Matches that live in another level, by node, with where to find them. */
  let otherLevel = new Map<DiagramNode, LevelNodeEntry>();

  const focus = (index: number, frame: boolean) => {
    const node = currentMatches[index];
    const where = otherLevel.get(node);
    onFocusNode(node, frame, where?.path);
    if (where) {
      // The open level changed, so what counts as "another level" did too. Rebuild, keeping this match current.
      computeMatches(searchInput.value);
      const again = currentMatches.findIndex((n) => n.id === node.id);
      currentIndex = again >= 0 ? again : 0;
      updateUiState();
    }
  };

  function updateUiState() {
    const total = currentMatches.length;
    const query = searchInput.value.trim();

    if (!query) {
      searchCount.hidden = true;
      searchCount.textContent = '';
      clearButton.hidden = true;
      clearSearchHighlightsFromStage();
      currentIndex = -1;
      return;
    }

    clearButton.hidden = false;
    searchCount.hidden = false;

    if (total === 0) {
      searchCount.textContent = '0 / 0';
      currentIndex = -1;
      applySearchHighlightsToStage(new Set());
    } else {
      if (currentIndex < 0 || currentIndex >= total) {
        currentIndex = 0;
      }
      const where = otherLevel.get(currentMatches[currentIndex]);
      searchCount.textContent = `${currentIndex + 1} of ${total}${where ? ` · in ${where.trail.join(' ▸ ')}` : ''}`;
      const matchedIds = new Set(currentMatches.filter((n) => !otherLevel.has(n)).map((n) => n.id));
      const activeNode = currentMatches[currentIndex];
      applySearchHighlightsToStage(matchedIds, activeNode?.id);
    }
  }

  function executeSearch(query: string) {
    if (searchInput.value !== query) {
      searchInput.value = query;
    }
    computeMatches(query);
    currentIndex = currentMatches.length > 0 ? 0 : -1;
    updateUiState();

    // Typing never changes level; only stepping through matches does.
    if (currentIndex >= 0 && !otherLevel.has(currentMatches[currentIndex])) focus(currentIndex, false);
  }

  function computeMatches(query: string) {
    const doc = getDoc();
    currentMatches = filterNodesByQuery(doc.nodes, query);
    otherLevel = new Map();
    if (getOtherLevels && query.trim()) {
      const entries = getOtherLevels();
      for (const node of filterNodesByQuery(entries.map((e) => e.node), query)) {
        const entry = entries.find((e) => e.node === node);
        if (entry) otherLevel.set(node, entry);
      }
      currentMatches = [...currentMatches, ...otherLevel.keys()];
    }
  }

  function nextMatch() {
    if (currentMatches.length === 0) return;
    currentIndex = (currentIndex + 1) % currentMatches.length;
    updateUiState();
    focus(currentIndex, true);
  }

  function prevMatch() {
    if (currentMatches.length === 0) return;
    currentIndex = (currentIndex - 1 + currentMatches.length) % currentMatches.length;
    updateUiState();
    focus(currentIndex, true);
  }

  function clear() {
    searchInput.value = '';
    currentMatches = [];
    otherLevel = new Map();
    currentIndex = -1;
    updateUiState();
    if (onClearSearch) onClearSearch();
  }

  // Input event: search as user types
  searchInput.addEventListener('input', () => {
    executeSearch(searchInput.value);
  });

  // Key navigation: Enter / Shift+Enter and Escape
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentMatches.length === 0) return;
      if (e.shiftKey) {
        prevMatch();
      } else {
        if (currentMatches.length === 1) {
          focus(0, true);
        } else if (otherLevel.has(currentMatches[currentIndex])) {
          // A match in another level is not visited yet: Enter opens it rather than stepping past it.
          focus(currentIndex, true);
        } else {
          nextMatch();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clear();
      searchInput.blur();
      closePopover();
    }
  });

  // Leaving the field with nothing typed puts the popover away; a query keeps it open.
  searchInput.addEventListener('blur', () => {
    if (searchInput.value.trim()) return;
    setTimeout(() => {
      if (!popover?.contains(document.activeElement)) closePopover();
    }, 0);
  });

  // Clear button click
  clearButton.addEventListener('click', () => {
    clear();
    searchInput.focus();
  });

  // Global Cmd/Ctrl+F shortcut listener
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      const isCmd = isMac() ? e.metaKey : e.ctrlKey;
      // Cmd/Ctrl+Shift+F is Find and replace (F-29).
      if (isCmd && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        // If focused inside a multi-line code editor or dialog textarea, don't hijack unless desired
        if (active && (active.id === 'code-sync-textarea' || active.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        if (popover) popover.hidden = false;
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  return {
    search: executeSearch,
    nextMatch,
    prevMatch,
    clear,
    getMatchedNodes: () => currentMatches,
    getCurrentIndex: () => currentIndex,
  };
}
