/**
 * EmulatorJS reads these globals off `window` before its loader runs.
 * We only type the subset this app sets. See client/public/emulatorjs/loader.js.
 */
export {};

interface EmulatorJSInstance {
  screenshot?: () => Promise<Uint8Array> | Uint8Array;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  gameManager?: {
    screenshot?: () => Uint8Array;
    Module?: unknown;
  };
}

declare global {
  interface Window {
    EJS_player?: string;
    EJS_core?: string;
    EJS_gameUrl?: string;
    EJS_biosUrl?: string;
    EJS_gameName?: string;
    EJS_pathtodata?: string;
    EJS_paths?: Record<string, string>;
    EJS_startOnLoaded?: boolean;
    EJS_color?: string;
    EJS_screenCapture?: boolean | Record<string, unknown>;
    EJS_defaultOptions?: Record<string, string>;
    EJS_onGameStart?: () => void;
    EJS_onSaveState?: () => void;
    EJS_onLoadState?: () => void;
    EJS_ready?: () => void;
    EJS_emulator?: EmulatorJSInstance;
    /** App-local flag: an emulator was already booted this page-load. */
    __amigaEmulatorLoaded?: boolean;
  }
}
