import * as React from "react";
import { cn } from "../../lib/utils";

const Avatar = React.forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full items-center justify-center font-bold text-xs bg-[#d9d0c4] text-[#42372b] select-none",
      className
    )}
    {...props}
  >
    {children}
  </div>
));
Avatar.displayName = "Avatar";

export { Avatar };
