"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// ---------- Button ----------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "icon" | "icon-sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-fg text-bg hover:opacity-90 shadow-card",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3 border border-border",
  outline: "bg-surface text-fg border border-border hover:bg-surface-2 shadow-card",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-neg text-white hover:opacity-90",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-xl",
  "icon-sm": "h-7 w-7 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 cursor-pointer select-none items-center justify-center font-medium whitespace-nowrap transition-[background,opacity,color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

// ---------- Card ----------

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex min-h-8 items-center justify-between gap-3", className)}>
      <h2 className="font-mono text-[13px] font-medium tracking-tight text-fg">{children}</h2>
      {right}
    </div>
  );
}

// ---------- Inputs ----------

const fieldBase =
  "w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg placeholder:text-faint transition-[border,box-shadow] outline-none focus:border-ring focus:ring-3 focus:ring-ring/20 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />;
});

export function Field({ label, hint, children, className, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="font-mono text-[11px] font-medium tracking-wide text-muted uppercase">
          {label}
        </label>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ---------- Segmented control ----------

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex items-center gap-0.5 rounded-xl border border-border bg-surface-2 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] font-mono whitespace-nowrap transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs",
              active ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Badges ----------

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "pos" | "neg" | "accent" | "outline"; className?: string }) {
  const tones = {
    neutral: "bg-surface-3 text-muted",
    pos: "bg-pos-soft text-pos",
    neg: "bg-neg-soft text-neg",
    accent: "bg-accent-fill/40 text-fg",
    outline: "border border-border text-muted",
  };
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-mono text-[10.5px] font-medium tracking-wide whitespace-nowrap uppercase", tones[tone], className)}>{children}</span>;
}

export function SideBadge({ side }: { side: "long" | "short" }) {
  return <Badge tone={side === "long" ? "outline" : "neg"}>{side}</Badge>;
}

export function StatusBadge({ status }: { status: "open" | "closed" }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[11px]", status === "open" ? "text-fg" : "text-muted")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "open" ? "bg-accent" : "bg-faint")} />
      {status === "open" ? "Open" : "Closed"}
    </span>
  );
}

export function Chip({ children, onRemove, className }: { children: ReactNode; onRemove?: () => void; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-lg border border-border bg-surface-2 pr-1 pl-2 text-xs text-fg", !onRemove && "pr-2", className)}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="grid h-4 w-4 cursor-pointer place-items-center rounded text-muted hover:bg-surface-3 hover:text-fg" aria-label="Remove">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

// ---------- Misc ----------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-3/70", className)} />;
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-md border border-border bg-surface-2 px-1 font-mono text-[10px] text-muted">{children}</kbd>;
}

// ---------- Dialog (centered on desktop, bottom sheet on mobile) ----------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center overflow-y-auto bg-black/30 backdrop-blur-[2px] sm:items-center sm:p-6 dark:bg-black/55">
          <RadixDialog.Content
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-surface shadow-pop outline-none",
              "max-sm:animate-slide-up max-sm:rounded-t-3xl sm:max-w-lg sm:animate-pop-in sm:rounded-3xl",
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-1 sm:px-6 sm:pt-6">
              <div className="min-w-0">
                <RadixDialog.Title className="text-base font-semibold tracking-tight text-fg">{title}</RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="mt-0.5 text-sm text-muted">{description}</RadixDialog.Description>
                ) : (
                  <RadixDialog.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RadixDialog.Description>
                )}
              </div>
              <RadixDialog.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mt-0.5 -mr-1.5">
                  <X className="h-4 w-4" />
                </Button>
              </RadixDialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5 sm:px-6">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/60 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>}
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="sm:max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{body}</p>
    </Dialog>
  );
}
