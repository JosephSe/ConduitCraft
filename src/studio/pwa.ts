import type { DiagramDocument } from '../types';
import { serializeToMermaid, serializeToBlueprintMarkdown } from '../core/parser';
import { serializeBlueprintJson } from '../exporter/blueprintJson';

/**
 * Progressive Web App (PWA) and File System Access API integration.
 * Enables offline execution, standalone installation, and native file save/overwrite.
 */

// Interface for FileSystemFileHandle from File System Access API
export interface FileSystemHandleLike {
  kind: 'file' | 'directory';
  name: string;
}

export interface FileSystemWritableFileStreamLike {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

export interface FileSystemFileHandleLike extends FileSystemHandleLike {
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStreamLike>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let activeFileHandle: FileSystemFileHandleLike | null = null;
let activeFileName: string | null = null;
let isDiskDirty = false;
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(canInstall: boolean) => void>();

/** Check if File System Access API is supported in the current environment. */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
}

/** Check if Service Worker is supported in the current environment. */
export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Get the currently open file handle, if opened or saved via File System Access. */
export function getActiveFileHandle(): FileSystemFileHandleLike | null {
  return activeFileHandle;
}

/** Get the currently open file name. */
export function getActiveFileName(): string | null {
  return activeFileName;
}

export function isFileDiskDirty(): boolean {
  return isDiskDirty;
}

export function setDiskDirty(dirty: boolean): void {
  isDiskDirty = dirty;
}

/** Set or clear the active file handle and filename. */
export function setActiveFile(handle: FileSystemFileHandleLike | null, name: string | null): void {
  activeFileHandle = handle;
  activeFileName = name;
  isDiskDirty = false;
}

/** Reset the active file context (e.g. when opening a blank canvas or template). */
export function resetActiveFile(): void {
  activeFileHandle = null;
  activeFileName = null;
  isDiskDirty = false;
}

/**
 * Format-aware serializer based on chosen filename extension.
 * Resolves:
 * - .mmd / .mermaid -> Mermaid flowchart syntax
 * - .md / .markdown -> Blueprint Markdown syntax
 * - .json / other   -> Blueprint JSON syntax
 */
export function serializeForFilename(
  doc: DiagramDocument,
  filename: string,
): { content: string; mime: string; format: 'mermaid' | 'blueprint-md' | 'json' } {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mmd') || lower.endsWith('.mermaid')) {
    return {
      content: serializeToMermaid(doc),
      mime: 'text/plain;charset=utf-8',
      format: 'mermaid',
    };
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return {
      content: serializeToBlueprintMarkdown(doc),
      mime: 'text/markdown;charset=utf-8',
      format: 'blueprint-md',
    };
  }
  return {
    content: serializeBlueprintJson(doc),
    mime: 'application/json;charset=utf-8',
    format: 'json',
  };
}

export const BLUEPRINT_FILE_TYPES = [
  {
    description: 'ConduitCraft Blueprint (*.blueprint.json, *.json)',
    accept: {
      'application/json': ['.blueprint.json', '.json'],
    },
  },
  {
    description: 'Mermaid / Blueprint Flowchart (*.mmd, *.md)',
    accept: {
      'text/plain': ['.mmd', '.mermaid', '.txt'],
      'text/markdown': ['.md', '.markdown'],
    },
  },
];

/**
 * Open a file using the native File System Access file picker.
 * Returns file contents, filename, and handle, or null if cancelled or unsupported.
 */
export async function openWithNativeFilePicker(): Promise<{
  content: string;
  name: string;
  handle: FileSystemFileHandleLike;
} | null> {
  if (!isFileSystemAccessSupported()) return null;

  try {
    const win = window as unknown as {
      showOpenFilePicker(options: {
        types: typeof BLUEPRINT_FILE_TYPES;
        multiple?: boolean;
      }): Promise<FileSystemFileHandleLike[]>;
    };

    const handles = await win.showOpenFilePicker({
      types: BLUEPRINT_FILE_TYPES,
      multiple: false,
    });

    if (!handles || handles.length === 0) return null;
    const handle = handles[0];
    const file = await handle.getFile();
    const content = await file.text();

    setActiveFile(handle, file.name);
    return { content, name: file.name, handle };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      // User cancelled picker
      return null;
    }
    throw err;
  }
}

/**
 * Save content to disk.
 * If activeFileHandle exists and forceSaveAs is false, overwrites the existing file directly.
 * Otherwise, prompts the native Save File Picker where supported.
 */
export async function saveWithNativeFileSystem(
  contentOrSerializer: string | ((chosenName: string) => string),
  defaultName: string,
  forceSaveAs = false
): Promise<{ success: boolean; filename: string; directSaved: boolean }> {
  // Direct overwrite of opened file
  if (!forceSaveAs && activeFileHandle) {
    try {
      const filename = activeFileName || activeFileHandle.name || defaultName;
      const content =
        typeof contentOrSerializer === 'function' ? contentOrSerializer(filename) : contentOrSerializer;
      const writable = await activeFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setDiskDirty(false);
      return {
        success: true,
        filename,
        directSaved: true,
      };
    } catch {
      // If writing failed (e.g. permission revoked), fallback to Save As
    }
  }

  // Save As with native file picker
  if (isFileSystemAccessSupported()) {
    try {
      const win = window as unknown as {
        showSaveFilePicker(options: {
          suggestedName: string;
          types: typeof BLUEPRINT_FILE_TYPES;
        }): Promise<FileSystemFileHandleLike>;
      };

      const handle = await win.showSaveFilePicker({
        suggestedName: defaultName,
        types: BLUEPRINT_FILE_TYPES,
      });

      const content =
        typeof contentOrSerializer === 'function' ? contentOrSerializer(handle.name) : contentOrSerializer;
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();

      setActiveFile(handle, handle.name);
      setDiskDirty(false);
      return {
        success: true,
        filename: handle.name,
        directSaved: true,
      };
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        // User cancelled Save dialog
        return { success: false, filename: defaultName, directSaved: false };
      }
      // If error occurred, fall through to fallback
    }
  }

  // Not supported or failed
  return { success: false, filename: defaultName, directSaved: false };
}

/** Register service worker for offline caching. */
export async function registerServiceWorker(swPath = './sw.js'): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;

  // In local development, unregister any service worker so Vite HMR works immediately
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    } catch {
      // Ignore unregistration errors in dev
    }
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register(swPath, { scope: './' });
    return reg;
  } catch (err) {
    console.warn('ConduitCraft Service Worker registration failed:', err);
    return null;
  }
}

/** Initialize PWA install prompt interception. */
export function initInstallPrompt(onAvailabilityChange?: (canInstall: boolean) => void): void {
  if (typeof window === 'undefined') return;

  if (onAvailabilityChange) {
    installListeners.add(onAvailabilityChange);
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    for (const listener of installListeners) {
      listener(true);
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    for (const listener of installListeners) {
      listener(false);
    }
  });
}

/** Whether the app can currently be installed via native prompt. */
export function canInstallApp(): boolean {
  return deferredInstallPrompt !== null;
}

/** Prompt the user to install ConduitCraft as a desktop/mobile app. */
export async function promptInstallApp(): Promise<boolean> {
  if (!deferredInstallPrompt) return false;

  try {
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    for (const listener of installListeners) {
      listener(false);
    }
    return choice.outcome === 'accepted';
  } catch {
    return false;
  }
}
