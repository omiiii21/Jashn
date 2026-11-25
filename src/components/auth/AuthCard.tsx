import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  /** A line under the form, such as the link to the other auth page. */
  footer?: ReactNode;
};

/** The centred sheet the login and sign-up pages share. Server-safe. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <main className="flex flex-1 items-center justify-center bg-ivory px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <p className="text-center font-serif text-rail-name text-maroon">
          Jashn{" "}
          <span lang="hi" className="tracking-normal">
            जश्न
          </span>
        </p>
        <Card className="rounded-sheet bg-paper">
          <CardHeader>
            <CardTitle className="font-serif text-title text-ink">{title}</CardTitle>
            <CardDescription className="text-body text-ink-2">{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer ? <p className="text-center text-body text-ink-2">{footer}</p> : null}
      </div>
    </main>
  );
}
