import { useEffect, useMemo, useState } from 'react';
import { BankSearchInput, findBankOption } from '../BankSearchInput';
import type { BankOption, CardPayment } from '../../types';
import { localDateTimeInputValue } from '../../utils/paymentMode';

const CARD_CHARGES = ['0.5%', '1%', '1.5%', '2%'];

function emptyPayment(defaultBank = '', defaultBankId?: number): CardPayment {
  return {
    cardNo: '',
    bank: defaultBank,
    bankId: defaultBankId,
    expiryDate: localDateTimeInputValue(),
    posMachine: false,
    charge: '',
    confirmed: false,
  };
}

function normalizePayment(
  value: CardPayment | undefined,
  defaultBank: string,
  defaultBankId?: number,
): CardPayment {
  if (!value) return emptyPayment(defaultBank, defaultBankId);
  return {
    ...value,
    bank: value.bank || defaultBank,
    bankId: value.bankId ?? defaultBankId,
  };
}

export function CardPaymentModal({
  open,
  defaultBank,
  banks,
  initial,
  onClose,
  onConfirm,
}: {
  open: boolean;
  defaultBank?: string;
  banks: BankOption[];
  initial?: CardPayment;
  onClose: () => void;
  onConfirm: (payment: CardPayment) => void;
}) {
  const bankDefault = defaultBank ?? '';
  const defaultBankOption = useMemo(() => findBankOption(banks, bankDefault), [bankDefault, banks]);
  const bankDefaultId = defaultBankOption?.bankId;

  const [form, setForm] = useState<CardPayment>(() => normalizePayment(initial, bankDefault, bankDefaultId));

  useEffect(() => {
    if (open) setForm(normalizePayment(initial, bankDefault, bankDefaultId));
  }, [open, initial, bankDefault, bankDefaultId]);

  const selectedBank = useMemo(
    () => banks.find((b) => b.bankId === form.bankId) ?? findBankOption(banks, form.bank) ?? defaultBankOption ?? null,
    [banks, defaultBankOption, form.bank, form.bankId],
  );

  if (!open) return null;

  const bankLocked = !!bankDefault && !!defaultBankOption;

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md mm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <span className="mhi">💳</span>
          <span className="mt">Card Payment Details</span>
          <button type="button" className="mc" onClick={onClose}>✕</button>
        </div>

        <div className="mb mm-body">
          <div className="mm-section">
            <div className="mm-row">
              <span className="mm-label">Card Bank <span className="mm-req">*</span></span>
              <BankSearchInput
                value={selectedBank}
                options={banks}
                placeholder="Search card bank..."
                readOnly={bankLocked}
                onSelect={(bank) => setForm({ ...form, bank: bank.bankName, bankId: bank.bankId })}
                onClear={() => setForm({ ...form, bank: '', bankId: undefined })}
              />
            </div>
            <div className="mm-row">
              <span className="mm-label">Card No <span className="mm-req">*</span></span>
              <input
                className="fv"
                type="text"
                value={form.cardNo}
                onChange={(e) => setForm({ ...form, cardNo: e.target.value })}
              />
            </div>
            <div className="mm-row">
              <span className="mm-label">Expiry Date</span>
              <input
                className="fv"
                type="datetime-local"
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              />
            </div>
            <div className="mm-row mm-row--check">
              <input
                id="cp_posMachine"
                type="checkbox"
                checked={form.posMachine}
                onChange={(e) => setForm({ ...form, posMachine: e.target.checked })}
              />
              <label htmlFor="cp_posMachine">POS Machine</label>
            </div>
            <div className="mm-row">
              <span className="mm-label">
                Charge {form.posMachine && <span className="mm-req">*</span>}
              </span>
              <select
                className="fv"
                value={form.charge}
                disabled={!form.posMachine}
                onChange={(e) => setForm({ ...form, charge: e.target.value })}
              >
                <option value="">---Select---</option>
                {CARD_CHARGES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mf">
          <button type="button" className="bs" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="bp"
            onClick={() => onConfirm({
              ...form,
              bank: form.bank || bankDefault,
              bankId: form.bankId ?? bankDefaultId,
              confirmed: true,
            })}
          >
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}
