import { cn } from "~/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" fill="currentColor" />
      <path
        d="M6 24h5v-6h5v-5h5V8h5"
        fill="none"
        stroke="#4be3a1"
        strokeWidth="3"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  inverse,
}: {
  className?: string;
  inverse?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={inverse ? "text-forest-3" : "text-forest"} />
      <span className="font-wide text-lg font-extrabold">Finfolio</span>
    </span>
  );
}
