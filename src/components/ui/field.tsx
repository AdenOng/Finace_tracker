import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "~/lib/cn";

const control =
  "w-full rounded-ctl border border-line-2 bg-sunken px-3 text-sm text-ink placeholder:text-ink-3 transition-[color,border-color,box-shadow] hover:border-ink-3 focus:border-brand focus:shadow-[0_0_0_4px_rgb(239_230_210/0.1)] focus:outline-none disabled:bg-wash disabled:text-ink-3 aria-invalid:border-loss";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input ref={ref} className={cn(control, "h-10", className)} {...props} />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(control, "min-h-24 py-2 leading-relaxed", className)}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%228%22 viewBox=%220 0 12 8%22><path d=%22M1 1.5l5 5 5-5%22 fill=%22none%22 stroke=%22%23b3ab9e%22 stroke-width=%221.6%22/></svg>')] h-10 appearance-none bg-[length:12px_8px] bg-[position:right_12px_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-ink-2 text-[13px] font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-loss text-[13px]">{error}</p>
      ) : hint ? (
        <p className="text-ink-3 text-[13px]">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 text-sm",
        className,
      )}
    >
      <input
        type="checkbox"
        className="accent-brand mt-0.5 size-4 shrink-0 cursor-pointer"
        {...props}
      />
      <span>
        <span className="font-medium">{label}</span>
        {description ? (
          <span className="text-ink-3 block text-[13px]">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
