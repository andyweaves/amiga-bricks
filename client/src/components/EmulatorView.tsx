import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface EmulatorViewProps {
  ejsPath: string;
  gameUrl: string;
  biosUrl: string;
  gameName: string;
  model: string;
  onReady?: () => void;
  onSaveState?: () => void;
  onLoadState?: () => void;
}

type PatchableGetContext = HTMLCanvasElement['getContext'] & { __amigaPatched?: boolean };

/**
 * Force `preserveDrawingBuffer: true` on the WebGL context EmulatorJS creates.
 * Without it the drawing buffer is cleared after compositing, so screenshotting
 * the canvas yields a blank (black/white) image. Must run before the core
 * creates its GL context. Patched once, globally.
 */
function enablePreserveDrawingBuffer(): void {
  const proto = HTMLCanvasElement.prototype;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound via .call below
  const current = proto.getContext as PatchableGetContext;
  if (current.__amigaPatched) return;

  const original = current;
  const patched = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
    if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
      const base = options && typeof options === 'object' ? (options as Record<string, unknown>) : {};
      options = { ...base, preserveDrawingBuffer: true };
    }
    return (original as (id: string, opts?: unknown) => RenderingContext | null).call(this, contextId, options);
  } as PatchableGetContext;
  patched.__amigaPatched = true;
  proto.getContext = patched;
}

/**
 * Mounts the EmulatorJS (PUAE) runtime. EmulatorJS is a non-React global that
 * cannot be cleanly re-initialized in place, so after the first boot any
 * subsequent game launch forces a page reload for a clean slate (matching the
 * original app's behaviour). A ref guard keeps React StrictMode's double-invoke
 * from triggering that reload during the first mount.
 *
 * PUAE is a non-threaded WebGL2 core, so it needs no SharedArrayBuffer /
 * cross-origin isolation. The vendored core is the WebGL2 build
 * (`puae-wasm.data`); the core report sets `defaultWebGL2` so EmulatorJS
 * requests that file rather than the (absent) `-legacy` variant.
 */
export function EmulatorView({
  ejsPath,
  gameUrl,
  biosUrl,
  gameName,
  model,
  onReady,
  onSaveState,
  onLoadState,
}: EmulatorViewProps) {
  const booted = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    if (window.__amigaEmulatorLoaded) {
      window.location.reload();
      return;
    }
    window.__amigaEmulatorLoaded = true;

    // Must happen before EmulatorJS creates its WebGL context so screenshots work.
    enablePreserveDrawingBuffer();

    window.EJS_player = '#game';
    window.EJS_core = 'puae';
    window.EJS_gameUrl = gameUrl;
    window.EJS_biosUrl = biosUrl;
    window.EJS_gameName = gameName;
    window.EJS_pathtodata = ejsPath;
    window.EJS_startOnLoaded = true;
    window.EJS_color = '#ff8800';
    window.EJS_screenCapture = true;
    window.EJS_defaultOptions = {
      puae_model: model || 'A500',
      puae_cpu_speed: 'real',
      puae_video_standard: 'PAL',
      puae_floppy_speed: '800',
      puae_floppy_multidrive: 'enabled',
    };
    window.EJS_onGameStart = () => onReady?.();
    window.EJS_onSaveState = () => onSaveState?.();
    window.EJS_onLoadState = () => onLoadState?.();

    const script = document.createElement('script');
    script.src = `${ejsPath}loader.js`;
    script.async = true;
    script.onerror = () => setFailed(true);
    document.body.appendChild(script);
  }, [ejsPath, gameUrl, biosUrl, gameName, model, onReady, onSaveState, onLoadState]);

  return (
    <div className="relative w-full bg-black">
      <div id="game" />
      <div className="crt-scan" aria-hidden />
      {failed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/90 p-6 text-center text-sm text-primary">
          <AlertTriangle className="h-8 w-8" />
          <p>
            Failed to load the EmulatorJS runtime. Check that the assets under
            <code className="mx-1">/emulatorjs/</code> are being served.
          </p>
        </div>
      )}
    </div>
  );
}
