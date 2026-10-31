"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

const BUTTON_VARIANTS = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700",
  secondary: "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
}) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Asks for a second click, so a destructive action can't happen by accident. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => setIsConfirming(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    <>
      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => {
          setIsConfirming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="secondary" onClick={() => setIsConfirming(false)}>
        Keep
      </Button>
    </>
  );
}

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
      {label}
      {children}
    </label>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-zinc-100 text-zinc-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
};
export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" className="py-8 text-center text-sm text-zinc-500">
      {label}
    </p>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-10 text-center">
      <p className="font-medium text-zinc-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-zinc-500">{hint}</p>}
    </div>
  );
}

export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  );
}
