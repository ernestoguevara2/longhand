"use client";

import dynamic from "next/dynamic";

/** Settings and history live in this browser, so the workspace renders on the client only. */
const Workspace = dynamic(() => import("./workspace").then((m) => m.Workspace), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[76rem] px-6 py-3">
      <span className="font-serif text-xl italic">Longhand</span>
    </div>
  ),
});

export function WorkspaceLoader() {
  return <Workspace />;
}
