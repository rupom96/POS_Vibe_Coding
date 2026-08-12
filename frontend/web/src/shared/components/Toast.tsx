import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { registerToast } from '../utils/toastBridge';

interface ToastContextValue {
  showToast: (message: string, icon?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; icon: string; visible: boolean }>({
    message: '',
    icon: '✓',
    visible: false,
  });

  const timerRef = useRef<number | null>(null);
  const remainingMsRef = useRef(0);
  const startedAtRef = useRef(0);
  const pausedRef = useRef(false);
  const visibleRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    clearTimer();
    pausedRef.current = false;
    visibleRef.current = false;
    setToast((t) => ({ ...t, visible: false }));
  }, [clearTimer]);

  const scheduleHide = useCallback(
    (ms: number) => {
      clearTimer();
      remainingMsRef.current = Math.max(0, ms);
      startedAtRef.current = Date.now();
      pausedRef.current = false;
      timerRef.current = window.setTimeout(hideToast, remainingMsRef.current);
    },
    [clearTimer, hideToast],
  );

  const showToast = useCallback(
    (message: string, icon = '✓') => {
      const duration = message.includes('\n') ? 7000 : 2800;
      visibleRef.current = true;
      setToast({ message, icon, visible: true });
      scheduleHide(duration);
    },
    [scheduleHide],
  );

  const onMouseEnter = useCallback(() => {
    if (!visibleRef.current || pausedRef.current) return;
    pausedRef.current = true;
    const elapsed = Date.now() - startedAtRef.current;
    remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);
    clearTimer();
  }, [clearTimer]);

  const onMouseLeave = useCallback(() => {
    if (!visibleRef.current || !pausedRef.current) return;
    scheduleHide(remainingMsRef.current);
  }, [scheduleHide]);

  useEffect(() => {
    registerToast(showToast);
  }, [showToast]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const multiline = toast.message.includes('\n');

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className={`toast${toast.visible ? ' show' : ''}${multiline ? ' toast-multiline' : ''}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <span className="toast-icon">{toast.icon}</span>
        <span className="toast-msg">{toast.message}</span>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
