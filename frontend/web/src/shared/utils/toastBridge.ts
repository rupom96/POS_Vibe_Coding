type ToastFn = (message: string, icon?: string) => void;

let toastFn: ToastFn | null = null;

export function registerToast(fn: ToastFn): void {
  toastFn = fn;
}

export function showGlobalToast(message: string, icon = '⚠'): void {
  toastFn?.(message, icon);
}
