import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router';
import { LibraryPage } from '@/pages/LibraryPage';
import { PlayPage } from '@/pages/PlayPage';

function AmigaLogo() {
  // Rainbow check-mark, the classic Amiga boot logo.
  return (
    <svg viewBox="0 0 40 35" className="h-8 w-9" aria-hidden>
      <g>
        <polygon points="8,20 14,28 34,6 28,6 14,22 12,18" fill="var(--stripe-red)" />
        <polygon points="8,22 14,30 34,8 28,8 14,24 12,20" fill="var(--stripe-orange)" />
        <polygon points="8,24 14,32 34,10 28,10 14,26 12,22" fill="var(--stripe-yellow)" />
        <polygon points="8,26 14,34 34,12 28,12 14,28 12,24" fill="var(--stripe-green)" />
      </g>
    </svg>
  );
}

function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="rainbow-stripe" />
      <header className="flex items-center gap-3 border-b-2 border-white px-4 py-3 md:px-6">
        <Link to="/" className="flex items-center gap-3">
          <AmigaLogo />
          <div className="leading-tight">
            <h1 className="wb-title font-amiga text-xl text-foreground">Amiga Bricks</h1>
            <p className="font-amiga text-xs tracking-wide text-[var(--stripe-orange)]">
              EmulatorJS · PUAE core · Databricks Apps
            </p>
          </div>
        </Link>
      </header>

      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>

      <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground md:px-6">
        Amiga is a trademark of Amiga Corporation · Databricks is a trademark of Databricks, Inc. · ROMs and games are
        served from a Unity Catalog volume.
      </footer>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <LibraryPage /> },
      { path: '/play/:key', element: <PlayPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
