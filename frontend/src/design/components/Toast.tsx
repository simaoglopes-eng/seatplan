// Short messages such as "Seat confirmed". One region for the whole app,
// marked aria-live so screen readers announce each new toast.
//
// Usage: wrap the app in <ToastProvider>, then in any component:
//   const toast = useToast();  toast.show("Layout saved", "success");
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ToastTone = "info" | "success" | "warning" | "danger";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

// Long enough to read a sentence twice (WCAG 2.2.1 suggests generous timing).
const TOAST_MS = 6000;

// A default that does nothing, so a component rendered without a provider
// (for example in a unit test) does not crash.
const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const TONE_LABEL: Record<ToastTone, string> = {
  info: "Note",
  success: "Done",
  warning: "Heads up",
  danger: "Problem",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-2), { id, message, tone }]); // at most 3 on screen
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`}>
            <span className="toast-tone">{TONE_LABEL[item.tone]}</span>
            <span className="toast-message">{item.message}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss message">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
