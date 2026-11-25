import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthCard } from "@/components/auth/AuthCard";
import { SignInForm } from "@/components/auth/AuthForm";
import { TryDemoButton } from "@/components/auth/TryDemoButton";
import { routes } from "@/contracts/routes";
import { signIn, signInDemo } from "@/server/auth/actions";
import { nextFromSearchParams, withNextParam, type PageSearchParams } from "@/server/auth/pages";
import { getSignedInUser, isLiveAuth } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in · Jashn" };

type LoginPageProps = { searchParams: Promise<PageSearchParams> };

/** Email and password sign-in (architecture 3.5, AT-8.1). A signed-in visitor goes straight home. */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  await connection();
  const params = await searchParams;
  const next = nextFromSearchParams(params);
  const demo_unavailable = params.demo === "unavailable";
  const live = isLiveAuth();
  if (live && (await getSignedInUser())) redirect(next ?? routes.home());

  return (
    <AuthCard
      title="Sign in"
      description="Plan the wedding together: functions, guests, vendors and money in one place."
      footer={
        <>
          New to Jashn?{" "}
          <Link href={withNextParam(routes.signup(), next)} className="font-medium text-maroon underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {live ? null : (
        <p className="mb-4 rounded-control bg-ivory-deep px-3 py-2 text-meta text-ink-2">
          Sign-in isn&apos;t connected yet, so this opens the sample wedding as Mira.
        </p>
      )}
      <SignInForm action={signIn} next={next} />
      <TryDemoButton action={signInDemo} unavailable={demo_unavailable} />
    </AuthCard>
  );
}
