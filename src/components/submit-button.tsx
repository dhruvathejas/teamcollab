"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { buttonStyles } from "./ui";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: keyof typeof buttonStyles;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`${buttonStyles[variant]} ${className}`}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
