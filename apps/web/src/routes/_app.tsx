import { Separator } from "@sinapps/ui/components/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@sinapps/ui/components/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { m } from "@/paraglide/messages.js";
import { getSession } from "@/server/session.functions";

/** Authenticated application shell: sidebar + main area. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    if (!session.authorized) throw redirect({ to: "/forbidden" });
    return { user: session.user };
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger aria-label={m.nav_toggle_sidebar()} />
          <Separator orientation="vertical" className="h-4" />
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
