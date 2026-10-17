import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@sinapps/ui/components/sidebar";
import { Link, useRouteContext } from "@tanstack/react-router";
import { MessageSquarePlusIcon, SparklesIcon } from "lucide-react";
import { m } from "@/paraglide/messages.js";
import { ConversationList } from "./conversation-list";
import { NavUser } from "./nav-user";

export function AppSidebar() {
  const { user } = useRouteContext({ from: "/_app" });
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <SparklesIcon />
                <span className="font-semibold">{m.app_name()}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/">
                <MessageSquarePlusIcon />
                <span>{m.nav_new_chat()}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <ConversationList />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
