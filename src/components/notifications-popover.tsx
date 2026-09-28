import { Bell, Check, Info, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications, useMarkNotificationsRead } from "@/hooks/use-notifications";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export function NotificationsPopover() {
  const { data: notifications } = useNotifications();
  const { mutate: markAsRead } = useMarkNotificationsRead();
  
  // Filter out system notifications which are purely for internal tracking
  const visibleNotifications = (notifications ?? []).filter(n => n.title !== "System");
  const unreadCount = visibleNotifications.filter(n => !n.is_read).length;

  return (
    <Popover onOpenChange={(open) => {
      if (open && unreadCount > 0) {
        // Mark as read after a short delay when opened
        setTimeout(() => markAsRead(), 1500);
      }
    }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 flex size-2.5 rounded-full bg-destructive">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75"></span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              {unreadCount} new
            </Badge>
          )}
        </div>
        
        <ScrollArea className="h-[350px]">
          {visibleNotifications.length > 0 ? (
            <div className="flex flex-col divide-y divide-border">
              {visibleNotifications.map((n) => (
                <div key={n.id} className={`flex gap-3 p-4 transition-colors hover:bg-muted/50 ${!n.is_read ? 'bg-primary/5' : ''}`}>
                  <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                    n.type === 'budget_alert' ? 'bg-warning/20 text-warning' : 'bg-primary/10 text-primary'
                  }`}>
                    {n.type === 'budget_alert' ? <Wallet className="size-4" /> : <Info className="size-4" />}
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="text-sm font-medium leading-none text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {n.message}
                    </p>
                    <span className="text-[10px] font-medium text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {!n.is_read && (
                    <div className="ml-auto flex items-start">
                      <span className="flex size-2 rounded-full bg-primary mt-1"></span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center text-muted-foreground">
              <div className="flex size-12 items-center justify-center rounded-full bg-secondary/50 mb-3">
                <Check className="size-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs mt-1">No new alerts or summaries.</p>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
