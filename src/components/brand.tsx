import { cn } from "~/lib/cn";

/** A tiny four-ink composition: the poster in miniature. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="7" className="fill-paper" />
      <path d="M5 27V15a12 12 0 0 1 12 12z" className="fill-art-green" />
      <circle cx="22" cy="10" r="5" className="fill-art-red" />
      <rect x="20" y="17" width="7" height="10" className="fill-art-cobalt" />
      <rect x="5" y="6" width="9" height="3" className="fill-art-mustard" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="font-poster text-[24px] leading-none font-bold tracking-tight">
        Finfolio
      </span>
    </span>
  );
}
