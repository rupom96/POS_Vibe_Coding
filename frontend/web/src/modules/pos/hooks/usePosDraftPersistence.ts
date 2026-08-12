import { useEffect, useRef } from 'react';
import type { AppDispatch } from '../../../app/store';
import type { PosFormState } from '../store/posSlice';
import { clearDraft } from '../offline/posOfflineStorage';

/**
 * POS create mode must start blank on reload (TC-05).
 * Intentional Hold invoices remain in IndexedDB heldInvoices — this only clears the auto draft.
 */
export function usePosDraftPersistence(
  _form: PosFormState,
  _dispatch: AppDispatch,
  _onRestored?: () => void,
) {
  const clearedRef = useRef(false);

  useEffect(() => {
    if (clearedRef.current) return;
    clearedRef.current = true;
    void clearDraft();
  }, []);
}

export async function clearPosDraft(): Promise<void> {
  await clearDraft();
}
