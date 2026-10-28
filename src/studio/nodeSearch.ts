/**
 * Node Search & Focus Controller (Cmd/Ctrl+F)
 *
 * Fast inline search bar in the canvas HUD that filters components
 * by title, subtitle, eyebrow, id, and summary, dims non-matches,
 * and allows stepping through matches (Enter / Shift+Enter) with camera framing.
 */
import type { DiagramDocument, DiagramNode } from '../types';
import { isMac } from './commands';

export interface NodeSearchOptions {
  searchInput: HTMLInputElement;
  searchCount: HTMLElement;
  clearButton: HTMLButtonElement;
  getDoc: () => DiagramDocument;
  onFocusNode: (node: DiagramNode, shouldZoomFrame?: boolean) => void;
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
  const { searchInput, searchCount, clearButton, getDoc, onFocusNode, onClearSearch } = options;

  let currentMatches: DiagramNode[] = [];
  let currentIndex = -1;

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
      searchCount.textContent = `${currentIndex + 1} of ${total}`;
      const matchedIds = new Set(currentMatches.map((n) => n.id));
      const activeNode = currentMatches[currentIndex];
      applySearchHighlightsToStage(matchedIds, activeNode?.id);
    }
  }

  function executeSearch(query: string) {
    if (searchInput.value !== query) {
      searchInput.value = query;
    }
    const doc = getDoc();
    currentMatches = filterNodesByQuery(doc.nodes, query);
    currentIndex = currentMatches.length > 0 ? 0 : -1;
    updateUiState();

    if (currentMatches.length > 0 && currentIndex >= 0) {
      onFocusNode(currentMatches[currentIndex], false);
    }
  }

  function nextMatch() {
    if (currentMatches.length === 0) return;
    currentIndex = (currentIndex + 1) % currentMatches.length;
    updateUiState();
    onFocusNode(currentMatches[currentIndex], true);
  }

  function prevMatch() {
    if (currentMatches.length === 0) return;
    currentIndex = (currentIndex - 1 + currentMatches.length) % currentMatches.length;
    updateUiState();
    onFocusNode(currentMatches[currentIndex], true);
  }

  function clear() {
    searchInput.value = '';
    currentMatches = [];
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
          onFocusNode(currentMatches[0], true);
        } else {
          nextMatch();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clear();
      searchInput.blur();
    }
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
      if (isCmd && (e.key === 'f' || e.key === 'F')) {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        // If focused inside a multi-line code editor or dialog textarea, don't hijack unless desired
        if (active && (active.id === 'code-sync-textarea' || active.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
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
