import { Separator } from "@sinapps/ui/components/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@sinapps/ui/components/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { PreferencesSync } from "@/components/preferences-sync";
import { m } from "@/paraglide/messages.js";
import { fetchConversations } from "@/server/conversations.functions";
import { getSession } from "@/server/session.functions";

/** Authenticated application shell: sidebar + main area. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    if (!session.authorized || !session.preferences) throw redirect({ to: "/forbidden" });
    return { user: session.user, preferences: session.preferences };
  },
  loader: () => fetchConversations(),
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <PreferencesSync />
      <AppSidebar />
      {/* Fixed height: pages scroll inside (the chat transcript has its own scroller). */}
      <SidebarInset className="h-svh overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger aria-label={m.nav_toggle_sidebar()} />
          <Separator orientation="vertical" className="h-4" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
