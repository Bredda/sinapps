import { Button } from "@sinapps/ui/components/button";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { LogOutIcon, ShieldXIcon } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";
import { getSession } from "@/server/session.functions";

export const Route = createFileRoute("/forbidden")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    if (session.authorized) throw redirect({ to: "/" });
    return { user: session.user };
  },
  component: Forbidden,
});

function Forbidden() {
  const { user } = Route.useRouteContext();
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <ShieldXIcon className="size-8 text-destructive" />
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">{m.forbidden_title()}</h1>
        <p className="max-w-sm text-muted-foreground text-sm">{m.forbidden_body({ email: user.email })}</p>
      </div>
      <Button variant="outline" onClick={signOut}>
        <LogOutIcon /> {m.sign_out()}
      </Button>
    </main>
  );
}
