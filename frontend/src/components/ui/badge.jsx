import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#0075de] text-white shadow hover:bg-[#005bab]",
        secondary: "border-transparent bg-[#f2f1ef] text-[#55514d] hover:bg-[#e8e7e5]",
        destructive: "border-transparent bg-[#fbeae8] text-[#d13438]",
        outline: "text-[#161615] border-[#eae8e5]",
        admin: "border-transparent bg-[#f2edf8] text-[#7662a3]",
        designer: "border-transparent bg-[#edf5fc] text-[#0075de]",
        supervisor: "border-transparent bg-[#e6f6f5] text-[#2a9d99]",
        trade: "border-transparent bg-[#fdf3ec] text-[#dd5b00]",
        success: "border-transparent bg-[#e7f3ec] text-[#1aae39]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
