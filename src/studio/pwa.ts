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

/** Set or clear the active file handle and filename. */
export function setActiveFile(handle: FileSystemFileHandleLike | null, name: string | null): void {
  activeFileHandle = handle;
  activeFileName = name;
}

/** Reset the active file context (e.g. when opening a blank canvas or template). */
export function resetActiveFile(): void {
  activeFileHandle = null;
  activeFileName = null;
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
  content: string,
  defaultName: string,
  forceSaveAs = false
): Promise<{ success: boolean; filename: string; directSaved: boolean }> {
  // Direct overwrite of opened file
  if (!forceSaveAs && activeFileHandle) {
    try {
      const writable = await activeFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return {
        success: true,
        filename: activeFileName || activeFileHandle.name || defaultName,
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

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();

      setActiveFile(handle, handle.name);
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
