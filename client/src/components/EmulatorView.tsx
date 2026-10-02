import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface EmulatorViewProps {
  ejsPath: string;
  gameUrl: string;
  biosUrl: string;
  gameName: string;
  model: string;
  gameType: string;
  onReady?: () => void;
  onSaveState?: () => void;
  onLoadState?: () => void;
}

/**
 * Mounts the EmulatorJS (PUAE) runtime. EmulatorJS is a non-React global that
 * cannot be cleanly re-initialized in place, so after the first boot any
 * subsequent game launch forces a page reload for a clean slate (matching the
 * original app's behaviour). A ref guard keeps React StrictMode's double-invoke
 * from triggering that reload during the first mount.
 */
export function EmulatorView({
  ejsPath,
  gameUrl,
  biosUrl,
  gameName,
  model,
  gameType,
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

    const whdMode = gameType === 'lha' ? 'files' : 'disabled';

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
      puae_use_whdload: whdMode,
    };
    window.EJS_onGameStart = () => onReady?.();
    window.EJS_onSaveState = () => onSaveState?.();
    window.EJS_onLoadState = () => onLoadState?.();

    const script = document.createElement('script');
    script.src = `${ejsPath}loader.js`;
    script.async = true;
    script.onerror = () => setFailed(true);
    document.body.appendChild(script);
  }, [ejsPath, gameUrl, biosUrl, gameName, model, gameType, onReady, onSaveState, onLoadState]);

  return (
    <div className="relative aspect-video w-full bg-black">
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
