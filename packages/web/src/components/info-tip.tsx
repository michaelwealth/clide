'use client';

/**
 * Inline help tooltip — hover to reveal explanatory text.
 * Used throughout the app to guide non-technical users.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex ml-1 align-middle">
      <svg
        className="w-3.5 h-3.5 text-gray-400 hover:text-brand-500 cursor-help transition-colors"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
      <span className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 w-60 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg leading-relaxed pointer-events-none">
        {text}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
      </span>
    </span>
  );
}

/**
 * A larger guide box that appears inline below a section header.
 */
export function GuideBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-brand-50 border border-brand-100 rounded-lg text-xs text-brand-800 leading-relaxed">
      <svg className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>{children}</div>
    </div>
  );
}
