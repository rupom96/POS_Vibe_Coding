import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { CreateCustomerRequest } from '../../store/posSlice';
import { useGetBuyerGroupsQuery } from '../../api/posApi';
import { getApiErrorMessage } from '../../../../shared/utils/apiError';

const EMPTY_FORM: CreateCustomerRequest = {
  initial: 'Mr.',
  name: '',
  phone: '',
  address: '',
  remarks: '',
  groupId: undefined,
};

type FieldErrors = {
  name?: string;
  phone?: string;
  form?: string;
};

function validateCustomerForm(form: CreateCustomerRequest): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) {
    errors.name = 'Customer name is required.';
  }
  if (!form.phone.trim()) {
    errors.phone = 'Mobile number is required.';
  }
  return errors;
}

function focusNextOnEnter(
  e: KeyboardEvent,
  focusNext: () => void,
) {
  if (e.key !== 'Enter') return;
  // Allow IME composition to finish without jumping fields.
  if (e.nativeEvent.isComposing) return;
  e.preventDefault();
  focusNext();
}

export function CustomerSetupModal({
  open,
  onClose,
  onSave,
  saving,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateCustomerRequest) => Promise<void> | void;
  saving: boolean;
  companyId: number;
}) {
  const [form, setForm] = useState<CreateCustomerRequest>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const { data: buyerGroups = [], isLoading: buyerGroupsLoading } = useGetBuyerGroupsQuery(
    { companyId },
    { skip: !open || companyId <= 0 },
  );

  const retailGroupId = useMemo(() => {
    const retail = buyerGroups.find((g) => g.name.trim().toLowerCase() === 'retail');
    return retail?.buyerGroupId;
  }, [buyerGroups]);

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLSelectElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const remarksRef = useRef<HTMLTextAreaElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitting(false);
    // Focus Customer Name when the modal opens.
    const id = window.setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // Default Buyer Group to "Retail" when groups load / modal opens.
  useEffect(() => {
    if (!open || retailGroupId == null) return;
    setForm((prev) => {
      if (prev.groupId != null && prev.groupId > 0) return prev;
      return { ...prev, groupId: retailGroupId };
    });
  }, [open, retailGroupId]);

  if (!open) return null;

  const busy = saving || submitting;

  const handleSave = async () => {
    const nextErrors = validateCustomerForm(form);
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.phone) {
      if (nextErrors.name) nameRef.current?.focus();
      else if (nextErrors.phone) phoneRef.current?.focus();
      return;
    }
    if (busy) return;

    const resolvedGroupId =
      form.groupId && form.groupId > 0
        ? form.groupId
        : retailGroupId;

    setSubmitting(true);
    try {
      await onSave({
        ...form,
        initial: form.initial.trim() || 'Mr.',
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address?.trim() ?? '',
        remarks: form.remarks?.trim() ?? '',
        groupId: resolvedGroupId,
      });
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        form: getApiErrorMessage(err, 'Could not save customer.'),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        className="md"
        style={{ width: 420 }}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <div className="cs-modal-header">
          <div className="cs-modal-icon">👤</div>
          <span className="cs-modal-title">Customer Setup</span>
          <button type="button" className="mc" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb" style={{ padding: '16px 18px' }}>
          {errors.form && <div className="cs-form-error">{errors.form}</div>}
          <div className="cs-grid">
            <span className="cs-label">
              Initial <span className="cs-req">*</span>
            </span>
            <select
              className="mfi"
              value={form.initial}
              disabled={busy}
              onChange={(e) => setForm({ ...form, initial: e.target.value })}
            >
              {['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Engr.', 'N/A'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            <span className="cs-label">
              Customer Name <span className="cs-req">*</span>
            </span>
            <div className="cs-field">
              <input
                ref={nameRef}
                className={`mfi${errors.name ? ' mfi-invalid' : ''}`}
                value={form.name}
                disabled={busy}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  if (errors.name) setErrors((prev) => ({ ...prev, name: undefined, form: undefined }));
                }}
                onKeyDown={(e) => focusNextOnEnter(e, () => phoneRef.current?.focus())}
              />
              {errors.name && <div className="cs-field-error">{errors.name}</div>}
            </div>

            <span className="cs-label">
              Mobile No <span className="cs-req">*</span>
            </span>
            <div className="cs-field">
              <input
                ref={phoneRef}
                className={`mfi${errors.phone ? ' mfi-invalid' : ''}`}
                value={form.phone}
                disabled={busy}
                inputMode="numeric"
                maxLength={11}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                  setForm({ ...form, phone: digits });
                  if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined, form: undefined }));
                }}
                onKeyDown={(e) => focusNextOnEnter(e, () => groupRef.current?.focus())}
              />
              {errors.phone && <div className="cs-field-error">{errors.phone}</div>}
            </div>

            <span className="cs-label">Buyer Group</span>
            <select
              ref={groupRef}
              className="mfi"
              value={form.groupId && form.groupId > 0 ? form.groupId : ''}
              disabled={busy || buyerGroupsLoading || buyerGroups.length === 0}
              onChange={(e) => {
                const id = Number(e.target.value) || undefined;
                setForm({ ...form, groupId: id });
              }}
              onKeyDown={(e) => focusNextOnEnter(e, () => addressRef.current?.focus())}
            >
              {buyerGroupsLoading && <option value="">Loading groups...</option>}
              {!buyerGroupsLoading && buyerGroups.length === 0 && (
                <option value="">No buyer groups</option>
              )}
              {!buyerGroupsLoading && buyerGroups.map((g) => (
                <option key={g.buyerGroupId} value={g.buyerGroupId}>
                  {g.name}
                </option>
              ))}
            </select>

            <span className="cs-label">Address</span>
            <input
              ref={addressRef}
              className="mfi"
              value={form.address}
              disabled={busy}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              onKeyDown={(e) => focusNextOnEnter(e, () => remarksRef.current?.focus())}
            />

            <span className="cs-label">Remarks</span>
            <textarea
              ref={remarksRef}
              className="cs-textarea"
              value={form.remarks}
              disabled={busy}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              onKeyDown={(e) => {
                // Enter: move to Save (not insert newline / not auto-submit).
                if (e.key === 'Enter' && !e.shiftKey) {
                  focusNextOnEnter(e, () => saveBtnRef.current?.focus());
                }
              }}
            />
          </div>
        </div>
        <div className="mf">
          <button type="button" className="bs" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            ref={saveBtnRef}
            type="submit"
            className="bp"
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Save Customer'}
          </button>
        </div>
      </form>
    </div>
  );
}
