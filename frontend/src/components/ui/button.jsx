import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] touch-manipulation min-h-[44px]",
  {
    variants: {
      variant: {
        default: "bg-[#0075de] text-white shadow-xs hover:bg-[#005bab] active:bg-[#004e92]",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        subtle: "border border-[#eae8e5] bg-white text-[#31302e] hover:bg-[#faf9f8] hover:border-[#dedbd6]",
        pill: "rounded-full bg-[#0075de] text-white shadow-xs hover:bg-[#005bab] active:bg-[#004e92]",
      },
      size: {
        default: "h-12 px-6 py-2 min-h-[48px]",
        sm: "h-9 rounded-full px-4 text-xs min-h-[36px]",
        lg: "h-14 rounded-full px-8 text-base min-h-[52px]",
        icon: "h-11 w-11 min-h-[44px] min-w-[44px] rounded-full",
        pill: "h-9 rounded-full px-4 text-xs min-h-[36px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
