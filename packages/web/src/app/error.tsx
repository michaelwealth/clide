'use client';

import Link from 'next/link';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen relative overflow-hidden bg-gray-950 text-white grid place-items-center px-6 py-16">
      <div className="absolute -top-20 -left-16 w-72 h-72 rounded-full bg-red-500/35 blur-3xl animate-pulse" />
      <div className="absolute top-1/2 -right-20 w-80 h-80 rounded-full bg-brand-500/25 blur-3xl" />
      <div className="absolute -bottom-16 left-1/3 w-72 h-72 rounded-full bg-amber-400/20 blur-3xl" />

      <section className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/15 bg-white/8 backdrop-blur-xl p-8 text-center shadow-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-white/60">Unexpected Error</p>
        <h1 className="font-display text-4xl md:text-5xl font-bold mt-3">Something Went Wrong</h1>
        <p className="text-sm md:text-base text-white/75 mt-3">
          The page failed to load. You can retry now or go back to a stable screen.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button onClick={reset} className="btn-primary">Try Again</button>
          <Link href="/" className="btn-secondary">Go Home</Link>
        </div>
      </section>
    </main>
  );
}
