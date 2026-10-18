import type {
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import { cn } from "~/lib/cn";

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("-mx-1 overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-line-2 text-ink-3 border-b px-3 py-2.5 text-left font-mono text-[11px] font-medium tracking-[0.1em] whitespace-nowrap uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-line border-b px-3 py-3.5 align-middle", className)}
      {...props}
    />
  );
}

export function Tr({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "hover:bg-wash/70 transition-colors [&:last-child>td]:border-b-0",
        className,
      )}
      {...props}
    />
  );
}
