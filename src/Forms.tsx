import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AlertCircle } from "lucide-react";
export function ValidatedForm({
  children,
  onSubmit,
  validate,
  serverError,
  busy,
  onEdit,
}: {
  children: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  validate?: (form: HTMLFormElement) => Record<string, string>;
  serverError: string;
  busy: boolean;
  onEdit: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null),
    [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const form = ref.current!;
    for (const control of Array.from(form.elements))
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        if (errors[control.name]) {
          control.setAttribute("aria-invalid", "true");
          control.setAttribute(
            "aria-describedby",
            `field-error-${control.name}`,
          );
        } else {
          control.removeAttribute("aria-invalid");
          if (
            control.getAttribute("aria-describedby")?.startsWith("field-error-")
          )
            control.removeAttribute("aria-describedby");
        }
      }
  }, [errors]);
  const focus = (name: string) => {
    const field = ref.current!.elements.namedItem(name);
    if (field instanceof HTMLElement) {
      const details = field.closest("details");
      if (details) details.open = true;
      field.focus();
      field.scrollIntoView({ block: "nearest" });
    }
  };
  return (
    <form
      ref={ref}
      noValidate
      aria-busy={busy}
      onInput={(e) => {
        onEdit();
        const field = e.target as HTMLInputElement;
        if (errors[field.name])
          setErrors((current) => {
            const next = { ...current };
            delete next[field.name];
            return next;
          });
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        const found: Record<string, string> = {};
        for (const control of Array.from(e.currentTarget.elements))
          if (
            (control instanceof HTMLInputElement ||
              control instanceof HTMLSelectElement ||
              control instanceof HTMLTextAreaElement) &&
            !control.disabled &&
            (!control.validity.valid ||
              (control.required && !control.value.trim()))
          ) {
            const label =
              control.labels?.[0]?.childNodes[0]?.textContent?.trim() ||
              control.name;
            found[control.name] =
              control.validity.valueMissing ||
              (control.required && !control.value.trim())
                ? `${label} is required.`
                : control.validationMessage;
          }
        Object.assign(found, validate?.(e.currentTarget) || {});
        setErrors(found);
        if (Object.keys(found).length) {
          focus(Object.keys(found)[0]);
          return;
        }
        onSubmit(e);
      }}
    >
      {Object.keys(errors).length > 0 && (
        <div className="form-error-summary" role="alert">
          <strong>
            <AlertCircle size={17} />
            Please check{" "}
            {Object.keys(errors).length === 1 ? "this field" : "these fields"}
          </strong>
          <ul>
            {Object.entries(errors).map(([name, message]) => (
              <li key={name} id={`field-error-${name}`}>
                <button type="button" onClick={() => focus(name)}>
                  {message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {serverError && (
        <div className="form-error-summary" role="alert">
          {serverError}
        </div>
      )}
      {children}
    </form>
  );
}
