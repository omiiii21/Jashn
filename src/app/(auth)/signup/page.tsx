import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthCard } from "@/components/auth/AuthCard";
import { SignUpForm } from "@/components/auth/AuthForm";
import { TryDemoButton } from "@/components/auth/TryDemoButton";
import { routes } from "@/contracts/routes";
import { signUp, signInDemo } from "@/server/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/credentials";
import { nextFromSearchParams, withNextParam, type PageSearchParams } from "@/server/auth/pages";
import { getSignedInUser, isLiveAuth } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create an account · Jashn" };

type SignUpPageProps = { searchParams: Promise<PageSearchParams> };

/**
 * New owners sign up here (architecture 3.5). "Confirm email" is off, so the session starts
 * at once and the next stop is /setup (or the join link they came from).
 */
export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  await connection();
  const params = await searchParams;
  const next = nextFromSearchParams(params);
  const demo_unavailable = params.demo === "unavailable";
  const live = isLiveAuth();
  if (live && (await getSignedInUser())) redirect(next ?? routes.home());

  return (
    <AuthCard
      title="Create your account"
      description="Start planning your wedding. You'll set it up next, by voice or by typing."
      footer={
        <>
          Already have an account?{" "}
          <Link href={withNextParam(routes.login(), next)} className="font-medium text-maroon underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {live ? null : (
        <p className="mb-4 rounded-control bg-ivory-deep px-3 py-2 text-meta text-ink-2">
          Sign-up isn&apos;t connected yet, so this opens setup as the sample owner.
        </p>
      )}
      <SignUpForm action={signUp} next={next} min_password_length={MIN_PASSWORD_LENGTH} />
      <TryDemoButton action={signInDemo} unavailable={demo_unavailable} />
    </AuthCard>
  );
}
