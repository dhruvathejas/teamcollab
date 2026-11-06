import type { ReactNode } from "react";
import { Card } from "../ui";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm py-6">
      <h1 className="text-center text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-center text-sm text-muted">{subtitle}</p>}
      <Card className="mt-6 p-6">{children}</Card>
    </div>
  );
}
