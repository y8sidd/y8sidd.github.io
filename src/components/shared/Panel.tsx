import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { useExperience } from "../../stores/experienceStore";
export function Panel({
  title,
  subtitle,
  children,
  className = "",
  modal = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  modal?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useExperience((s) => s.close);
  const reduced = useReducedMotion();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const panel = ref.current;
    const first =
      panel?.querySelector<HTMLElement>("[autofocus],input,textarea") ??
      panel?.querySelector<HTMLElement>('button,[tabindex="0"]');
    first?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
      if (e.key === "Tab" && modal && panel) {
        const elements = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,textarea,select,a[href],[tabindex="0"]',
          ),
        ).filter((el) => el.getClientRects().length);
        const first = elements[0];
        const last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keys, true);
    return () => {
      document.removeEventListener("keydown", keys, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [close, modal]);
  return (
    <motion.aside
      ref={ref}
      role="dialog"
      aria-modal={modal || undefined}
      aria-label={title}
      className={`floating-panel glass ${className}`}
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : 8 }}
      transition={{ duration: 0.22 }}
    >
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <IconButton label={`Close ${title}`} onClick={close}>
          <X size={16} />
        </IconButton>
      </header>
      {children}
    </motion.aside>
  );
}
