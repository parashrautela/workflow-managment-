import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const bubbleVariants = cva(
  "group/bubble relative flex w-fit max-w-[82%] min-w-0 flex-col",
  {
    variants: {
      variant: {
        default: "*:data-[slot=bubble-content]:bg-[#0075de] *:data-[slot=bubble-content]:text-white",
        secondary: "*:data-[slot=bubble-content]:bg-[#f0efec] *:data-[slot=bubble-content]:text-[#282725]",
        outline: "*:data-[slot=bubble-content]:border-[#e6e3df] *:data-[slot=bubble-content]:bg-white",
        ghost: "max-w-full *:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Bubble({ className, variant = "default", align = "start", ...props }) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      data-align={align}
      className={cn(bubbleVariants({ variant }), align === "end" && "ml-auto", className)}
      {...props}
    />
  );
}

function BubbleContent({ className, ...props }) {
  return (
    <div
      data-slot="bubble-content"
      className={cn("w-fit max-w-full min-w-0 break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", className)}
      {...props}
    />
  );
}

export { Bubble, BubbleContent };
