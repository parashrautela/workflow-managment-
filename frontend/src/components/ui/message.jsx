import * as React from "react";
import { cn } from "../../lib/utils";

function Message({ className, align = "start", ...props }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn("group/message flex min-w-0 gap-2.5 text-sm", align === "end" && "flex-row-reverse", className)}
      {...props}
    />
  );
}

function MessageAvatar({ className, ...props }) {
  return <div data-slot="message-avatar" className={cn("flex shrink-0 self-end", className)} {...props} />;
}

function MessageContent({ className, ...props }) {
  return <div data-slot="message-content" className={cn("flex min-w-0 max-w-full flex-col gap-1.5", className)} {...props} />;
}

function MessageHeader({ className, ...props }) {
  return <div data-slot="message-header" className={cn("flex items-center gap-2 px-1 text-[10px] text-[#89857f]", className)} {...props} />;
}

function MessageFooter({ className, ...props }) {
  return <div data-slot="message-footer" className={cn("px-1 text-[10px] text-[#89857f]", className)} {...props} />;
}

export { Message, MessageAvatar, MessageContent, MessageHeader, MessageFooter };
