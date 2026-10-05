/**
 * EmulatorJS reads these globals off `window` before its loader runs.
 * We only type the subset this app sets. See client/public/emulatorjs/loader.js.
 */
export {};

interface EmulatorJSInstance {
  /** Captures a frame; with source 'canvas' it reads the WebGL canvas (see EmulatorView's preserveDrawingBuffer patch). */
  takeScreenshot?: (source?: unknown, format?: string, upscale?: number) => Promise<{ blob: Blob; format: string }>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  /** `parent` is the focusable player container that receives keydown/keyup. */
  elements?: { parent?: HTMLElement };
  gameManager?: {
    screenshot?: () => Promise<Uint8Array>;
    /** Press (value 1) / release (value 0) RetroPad button `index` for `player`. */
    simulateInput?: (player: number, index: number, value: number) => void;
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
