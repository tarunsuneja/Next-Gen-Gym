import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function ModalView({
  title,
  close,
  children,
  busy = false,
  wide = false,
  className = "",
}: {
  wide?: boolean;
  className?: string;
  title: string;
  close: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const blocked = useRef(busy),
    closeRef = useRef(close);
  blocked.current = busy;
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const node = ref.current!;
    const controls = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href]",
        ),
      ).filter(
        (x) => !x.hasAttribute("disabled") && x.getClientRects().length > 0,
      );
    (
      controls().find((x) =>
        x.matches("input:not([type=hidden]),select,textarea"),
      ) || controls()[0]
    )?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !blocked.current) closeRef.current();
      if (e.key === "Tab") {
        const c = controls(),
          first = c[0],
          last = c[c.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div
        className={"modal" + (wide ? " registration-modal" : "") + (className ? " " + className : "")}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-heading no-print">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
            disabled={busy}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

