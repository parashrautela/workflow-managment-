import { useEffect, useRef, useState } from "react";
import { Liquid } from "liquid-gooey";
import { FolderPlus, Link2, Plus, UserPlus } from "lucide-react";

const transition = { duration: 500, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" };

export function GooeyNewButton({ hasProject, onCreateProject, onAddMember, onShareClientLink }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const actions = [
    { label: "New project", Icon: FolderPlus, x: -70, y: -62, onClick: onCreateProject },
    { label: "Add member", Icon: UserPlus, x: -88, y: -116, onClick: onAddMember, disabled: !hasProject },
    { label: "Client link", Icon: Link2, x: -16, y: -138, onClick: onShareClientLink, disabled: !hasProject },
  ];

  return <div ref={rootRef} className="relative z-40 flex h-12 items-center justify-center overflow-visible">
    <Liquid fill="#202020" blur={7} contrast={18} filterPadding={200} shadow="0 6px 16px rgba(10, 20, 36, .22)" className="size-12 overflow-visible">
      {actions.map(({ label, Icon, x, y, onClick, disabled }, index) => <Liquid.Item
        key={label}
        className="absolute left-0.5 top-0.5"
        x={open ? x : 0}
        y={open ? y : 0}
        scale={open ? 1 : 0}
        transition={transition}
        delay={open ? index * 35 : 0}
      >
        <button
          type="button"
          aria-label={label}
          title={label}
          tabIndex={open && !disabled ? 0 : -1}
          disabled={disabled}
          className="grid size-11 place-items-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-45"
          style={{ pointerEvents: open ? "auto" : "none" }}
          onClick={() => { setOpen(false); onClick(); }}
        ><Icon className="size-5" aria-hidden="true" /></button>
      </Liquid.Item>)}
      <Liquid.Item className="absolute inset-0">
        <button
          type="button"
          aria-label={open ? "Close new actions" : "Open new actions"}
          aria-expanded={open}
          className="grid size-12 place-items-center rounded-full border-2 border-white text-white outline-2 outline-offset-[-5px] outline-[#202020] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={() => setOpen((value) => !value)}
        ><Plus className={`size-5 transition-transform duration-300 ${open ? "rotate-45" : ""}`} aria-hidden="true" /></button>
      </Liquid.Item>
    </Liquid>
    <span className="sr-only">New actions</span>
  </div>;
}
