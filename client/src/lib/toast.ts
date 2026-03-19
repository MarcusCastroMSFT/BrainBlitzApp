export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
}

type Subscriber = (toast: ToastItem) => void;
const subscribers: Subscriber[] = [];

export function toast(
  title: string,
  options?: { description?: string; type?: ToastType }
) {
  const item: ToastItem = {
    id: crypto.randomUUID(),
    title,
    description: options?.description,
    type: options?.type ?? "success",
  };
  subscribers.forEach((sub) => sub(item));
}

export function subscribeToToasts(fn: Subscriber) {
  subscribers.push(fn);
  return () => {
    const idx = subscribers.indexOf(fn);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}
