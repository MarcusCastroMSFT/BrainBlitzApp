import { useEffect, useState } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { subscribeToToasts, type ToastItem } from "@/lib/toast";
import { cn } from "@/lib/utils";

const ICONS = {
  success: <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsub = subscribeToToasts((item) =>
      setToasts((prev) => [...prev, item])
    );
    return unsub;
  }, []);

  const dismiss = (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={3500}>
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          open={true}
          onOpenChange={(open) => !open && dismiss(t.id)}
          className={cn(
            "group pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-white/10 p-4 shadow-2xl",
            "bg-slate-900/95 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full",
            "data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
            "transition-all duration-300"
          )}
        >
          {ICONS[t.type]}
          <div className="flex-1 min-w-0">
            <ToastPrimitive.Title className="text-sm font-semibold text-white">
              {t.title}
            </ToastPrimitive.Title>
            {t.description && (
              <ToastPrimitive.Description className="text-xs text-slate-400 mt-0.5">
                {t.description}
              </ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close
            onClick={() => dismiss(t.id)}
            className="text-slate-500 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex flex-col gap-2 p-6 max-w-[420px] w-full outline-none" />
    </ToastPrimitive.Provider>
  );
}
