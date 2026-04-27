import React from 'react';
import { useLocation } from 'react-router-dom';
import AdminWorkspaceLoadingShell from '../admin/AdminWorkspaceLoadingShell';
import AccountWorkspaceLoadingShell from './AccountWorkspaceLoadingShell';
import {
  getRouteShellMeta,
  isAccountWorkspaceShellPath,
  isPublicDocumentShellPath,
  isPublicStorefrontShellPath,
} from '../../config/navigationShells';

const RouteLoadingFallback = () => {
  const location = useLocation();
  const pathname = location.pathname;
  const isPublicStorefrontPath = isPublicStorefrontShellPath(pathname);
  const isPublicDocumentPath = isPublicDocumentShellPath(pathname);
  const isAccountWorkspacePath = isAccountWorkspaceShellPath(pathname);
  const isVehicleProfilePath =
    pathname.startsWith('/account/vehicles/') ||
    pathname.startsWith('/account/marketplace/vehicles/');

  if (isVehicleProfilePath) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#F5F3FF_0%,#ECE9FF_100%)] px-5 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-[1200px]">
          <AccountWorkspaceLoadingShell cardCount={1} showStatsRow={false} showHeader={true} />
        </div>
      </div>
    );
  }

  if (isPublicStorefrontPath || isPublicDocumentPath || isAccountWorkspacePath) {
    return (
      <div className={`min-h-screen text-slate-950 ${isPublicDocumentPath ? 'bg-[#f8fafc]' : 'bg-[linear-gradient(180deg,#F5F3FF_0%,#ECE9FF_100%)]'}`}>
        <div className="min-h-[76px]" />
        <section className="min-h-[calc(100vh-76px)] px-5 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto flex max-w-[620px] flex-col items-center">
            {isPublicDocumentPath ? (
              <>
                <section className="w-full rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="h-3 w-36 animate-pulse rounded-full bg-slate-200" />
                      <div className="mt-3 h-10 w-56 animate-pulse rounded-2xl bg-slate-100" />
                      <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-full bg-slate-100" />
                    </div>
                    <div className="h-11 w-32 animate-pulse rounded-2xl bg-slate-100" />
                  </div>
                </section>
                <div className="mt-6 w-full space-y-4">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_16px_38px_rgba(15,23,42,0.05)]"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="h-5 w-28 animate-pulse rounded-full bg-slate-100" />
                          <div className="mt-4 h-8 w-56 max-w-full animate-pulse rounded-2xl bg-slate-100" />
                          <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-full bg-slate-100" />
                        </div>
                        <div className="h-12 w-12 animate-pulse rounded-2xl bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="h-12 w-64 animate-pulse rounded-2xl bg-white/70 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:h-16 sm:w-80" />
                <div className="mt-6 inline-flex items-center justify-center gap-3 rounded-full bg-white/80 px-5 py-3 shadow-sm ring-1 ring-violet-100">
                  <div className="h-4 w-20 animate-pulse rounded-full bg-slate-200" />
                  <div className="h-4 w-16 animate-pulse rounded-full bg-violet-100" />
                </div>
              </div>
            )}

            {isAccountWorkspacePath ? (
              <div className="mt-12 grid w-full gap-5">
                <div className="rounded-[30px] border border-white/70 bg-white/72 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur sm:p-6">
                  <div className="h-14 w-full animate-pulse rounded-[22px] bg-[linear-gradient(90deg,#ede9fe_0%,#ffffff_45%,#eef2ff_100%)]" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[0, 1].map((item) => (
                    <div
                      key={item}
                      className="min-h-[190px] rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
                    >
                      <div className="h-5 w-24 animate-pulse rounded-full bg-violet-100" />
                      <div className="mt-5 h-10 w-40 animate-pulse rounded-2xl bg-slate-100" />
                      <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-slate-100" />
                      <div className="mt-3 h-4 w-3/4 animate-pulse rounded-full bg-slate-100" />
                    </div>
                  ))}
                </div>
              </div>
            ) : pathname === '/' || pathname === '/website' ? (
              <div className="mt-14 grid w-full gap-5">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="flex min-h-[156px] w-full items-center justify-between rounded-[24px] bg-white p-9 shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-10"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="h-12 w-36 animate-pulse rounded-2xl bg-slate-100 sm:h-14 sm:w-40" />
                      <div className="mt-4 h-4 w-48 animate-pulse rounded-full bg-slate-100" />
                      <div className="mt-5 flex flex-wrap gap-2">
                        <div className="h-8 w-28 animate-pulse rounded-full bg-slate-100" />
                        <div className="h-8 w-32 animate-pulse rounded-full bg-slate-100" />
                      </div>
                    </div>
                    <div className="ml-4 h-12 w-12 shrink-0 animate-pulse rounded-full bg-violet-100" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-14 grid w-full gap-5">
                {[0, 1].map((item) => (
                  <div
                    key={item}
                    className="flex min-h-[156px] w-full items-center justify-between rounded-[24px] bg-white p-9 shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-10"
                  >
                    <div className="h-12 w-36 animate-pulse rounded-2xl bg-slate-100 sm:h-14 sm:w-40" />
                    <div className="h-12 w-12 animate-pulse rounded-full bg-violet-100" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  const meta = getRouteShellMeta(pathname);

  return (
    <AdminWorkspaceLoadingShell
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      cardRows={1}
    />
  );
};

export default RouteLoadingFallback;
