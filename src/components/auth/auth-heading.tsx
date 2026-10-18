import type { ReactNode } from "react";

export function AuthHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8">
      <h2 className="font-display text-[28px] leading-tight font-semibold">
        {title}
      </h2>
      {children ? (
        <p className="text-ink-2 mt-3 text-[14px] leading-relaxed">
          {children}
        </p>
      ) : null}
    </div>
  );
}
