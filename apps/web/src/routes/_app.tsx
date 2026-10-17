import { Separator } from "@sinapps/ui/components/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@sinapps/ui/components/sidebar";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { m } from "@/paraglide/messages.js";

/** Authenticated application shell: sidebar + main area. The auth guard lands here in T8. */
export const Route = createFileRoute("/_app")({ component: AppLayout });

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
