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
      <h2 className="font-wide text-3xl font-bold">{title}</h2>
      {children ? (
        <p className="text-ink-2 mt-2 text-[15px]">{children}</p>
      ) : null}
    </div>
  );
}
