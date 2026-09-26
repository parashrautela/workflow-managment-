import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

const Dialog = ({ open, onOpenChange, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div 
        className="fixed inset-0" 
        onClick={() => onOpenChange?.(false)} 
      />
      <div className="relative z-50 w-full sm:max-w-lg bg-white rounded-t-[32px] sm:rounded-[28px] p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
        <div className="sm:hidden w-10 h-1.5 bg-[#d5d2cc] rounded-full mx-auto -mt-2 mb-4" />
        <button
          onClick={() => onOpenChange?.(false)}
          className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
};

const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 text-left mb-5", className)} {...props} />
);

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-xl sm:text-2xl font-semibold tracking-tight text-[#161615]", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs sm:text-sm text-[#797570] leading-relaxed", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export { Dialog, DialogHeader, DialogTitle, DialogDescription };
