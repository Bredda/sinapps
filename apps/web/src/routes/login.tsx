import { Button } from "@sinapps/ui/components/button";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { LogInIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";
import { getSession } from "@/server/session.functions";

const searchSchema = z.object({
  // Same-origin paths only: never bounce the user to another site after sign-in.
  redirect: z
    .string()
    .regex(/^\/(?!\/)/)
    .optional()
    .catch(undefined),
  error: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const session = await getSession();
    if (session?.authorized) throw redirect({ href: search.redirect ?? "/" });
  },
  component: Login,
});

function Login() {
  const { redirect: target, error } = Route.useSearch();
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);
    await authClient.signIn.social({
      provider: "keycloak",
      callbackURL: target ?? "/",
      errorCallbackURL: "/login",
    });
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <SparklesIcon className="size-8" />
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">{m.login_title()}</h1>
        <p className="max-w-sm text-muted-foreground text-sm">{m.login_subtitle()}</p>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {m.login_error()}
        </p>
      )}
      <Button size="lg" onClick={signIn} disabled={pending}>
        <LogInIcon /> {m.login_button()}
      </Button>
    </main>
  );
}
