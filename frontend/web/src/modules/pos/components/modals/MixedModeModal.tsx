import { useEffect, useMemo, useRef, useState } from 'react';
import { useGetCardEmiDeductionsQuery, useLazyGetBankExpenseChargeQuery } from '../../api/posApi';
import { BankSearchInput, findBankOption } from '../BankSearchInput';
import type { BankOption, MixedCardPayment, MixedModePayment } from '../../types';
import { formatCurrency } from '../../utils/format';
import { localDateTimeInputValue } from '../../utils/paymentMode';

const CARD_CHARGES = ['0.5%', '1%', '1.5%', '2%'];

function emptyCard(): MixedCardPayment {
  return {
    amount: 0,
    cardNo: '',
    bank: '',
    expiryDate: localDateTimeInputValue(),
    posMachine: false,
    charge: '',
    posMachineBankId: undefined,
    posMachineBankName: '',
    cashBackOffer: undefined,
    emiMode: 'non-emi',
    emiBankId: undefined,
    emiBankName: '',
    emiDurationId: undefined,
    emiDeductionRate: undefined,
  };
}

function emptyPayment(): MixedModePayment {
  const now = localDateTimeInputValue();
  return {
    cashAmount: 0,
    chequeAmount: 0,
    chequeNo: '',
    chequeBank: '',
    chequeDate: now,
    multiCard: false,
    cards: [emptyCard(), emptyCard(), emptyCard()],
    confirmed: false,
  };
}

function normalizeCard(card?: MixedCardPayment | Record<string, unknown>): MixedCardPayment {
  const base = emptyCard();
  if (!card) return base;
  const raw = card as MixedCardPayment & {
    isEmi?: boolean;
    cashBackAmount?: number;
    emiId?: number;
    emiDeductionPercentage?: number;
  };
  const isEmi = raw.emiMode === 'emi' || raw.isEmi === true;
  return {
    ...base,
    amount: Number(raw.amount) || 0,
    cardNo: raw.cardNo ?? '',
    bank: raw.bank ?? '',
    bankId: raw.bankId,
    expiryDate: raw.expiryDate || base.expiryDate,
    posMachine: Boolean(raw.posMachine),
    charge: raw.charge ?? '',
    posMachineBankId: raw.posMachineBankId,
    posMachineBankName: raw.posMachineBankName ?? '',
    cashBackOffer: raw.cashBackOffer ?? raw.cashBackAmount,
    emiMode: isEmi ? 'emi' : 'non-emi',
    emiBankId: raw.emiBankId,
    emiBankName: raw.emiBankName ?? '',
    emiDurationId: raw.emiDurationId ?? raw.emiId,
    emiDeductionRate: raw.emiDeductionRate ?? raw.emiDeductionPercentage,
  };
}

function normalizePayment(value?: MixedModePayment): MixedModePayment {
  if (!value) return emptyPayment();
  const cards = [...value.cards].map(normalizeCard);
  while (cards.length < 3) cards.push(emptyCard());
  return { ...value, cards: cards.slice(0, 3) };
}

function chargeDisplayValue(raw: string, chargeFromBankSetup: boolean): string {
  const cleaned = String(raw ?? '').replace(/%/g, '').trim();
  if (!cleaned) return '';
  if (chargeFromBankSetup) return cleaned;
  const withPct = cleaned.endsWith('%') ? cleaned : `${cleaned}%`;
  return CARD_CHARGES.includes(withPct) ? withPct : withPct;
}

function isValidBankId(value: unknown): value is number {
  const id = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(id) && id > 0;
}

function toBankId(value: unknown): number | undefined {
  return isValidBankId(value) ? Number(value) : undefined;
}

function formatChargeNumber(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return String(n);
}

function MixedCardBlock({
  title,
  card,
  posId,
  banks,
  companyId,
  cashBackOfferEnabled,
  chargeFromBankSetup,
  onChange,
}: {
  title?: string;
  card: MixedCardPayment;
  posId: string;
  banks: BankOption[];
  companyId: number;
  cashBackOfferEnabled: boolean;
  chargeFromBankSetup: boolean;
  onChange: (patch: Partial<MixedCardPayment>) => void;
}) {
  const selectedBank = useMemo(
    () => banks.find((b) => b.bankId === card.bankId) ?? findBankOption(banks, card.bank) ?? null,
    [banks, card.bank, card.bankId],
  );
  const selectedPosBank = useMemo(
    () =>
      banks.find((b) => b.bankId === card.posMachineBankId)
      ?? findBankOption(banks, card.posMachineBankName ?? '')
      ?? null,
    [banks, card.posMachineBankId, card.posMachineBankName],
  );
  const selectedEmiBank = useMemo(
    () =>
      banks.find((b) => b.bankId === card.emiBankId)
      ?? findBankOption(banks, card.emiBankName ?? '')
      ?? null,
    [banks, card.emiBankId, card.emiBankName],
  );

  const posMachineBankId = toBankId(card.posMachineBankId);
  const cardBankId = toBankId(card.bankId);
  const emiBankId = toBankId(card.emiBankId);
  const chargeLocked = posMachineBankId != null;

  const [fetchBankExpense] = useLazyGetBankExpenseChargeQuery();
  const {
    data: emiDeductionsRaw,
    isError: emiLoadError,
  } = useGetCardEmiDeductionsQuery(
    { bankId: emiBankId ?? 0 },
    { skip: card.emiMode !== 'emi' || emiBankId == null },
  );

  const emiDeductions = Array.isArray(emiDeductionsRaw) ? emiDeductionsRaw : [];

  const expenseKeyRef = useRef<string>('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const preserveLoadedRef = useRef(
    Boolean(String(card.charge ?? '').trim() || card.cashBackOffer != null),
  );

  useEffect(() => {
    if (!companyId) return;

    const posIdValid = posMachineBankId;
    const cardIdValid = cardBankId;

    // POS Machine Bank selected → charge from POSMachineChargeP (+ cash back).
    // Cleared → restore charge from card bank (if feature) and clear cash back.
    let lookupBankId: number | undefined;
    let mode: 'pos' | 'card' | 'clear-pos' | 'idle' = 'idle';

    if (posIdValid != null) {
      lookupBankId = posIdValid;
      mode = 'pos';
    } else if (chargeFromBankSetup && cardIdValid != null) {
      lookupBankId = cardIdValid;
      mode = 'card';
    } else {
      mode = posIdValid == null ? 'clear-pos' : 'idle';
    }

    const key = `${mode}|${lookupBankId ?? ''}|${cashBackOfferEnabled ? 1 : 0}|${chargeFromBankSetup ? 1 : 0}`;
    if (expenseKeyRef.current === key) return;

    // First paint when editing an existing invoice: keep persisted values.
    if (preserveLoadedRef.current && expenseKeyRef.current === '') {
      expenseKeyRef.current = key;
      preserveLoadedRef.current = false;
      return;
    }

    expenseKeyRef.current = key;
    preserveLoadedRef.current = false;

    if (mode === 'clear-pos' || mode === 'idle') {
      // POS bank cleared when we were not in bank-setup charge mode: drop cashback only.
      if (mode === 'clear-pos') {
        onChangeRef.current({ cashBackOffer: undefined });
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const row = await fetchBankExpense({ bankId: lookupBankId!, companyId }).unwrap();
        if (cancelled) return;

        if (mode === 'pos') {
          if (!row) {
            const patch: Partial<MixedCardPayment> = { charge: '' };
            if (cashBackOfferEnabled) patch.cashBackOffer = undefined;
            onChangeRef.current(patch);
            return;
          }
          const charge = formatChargeNumber(row.posMachineChargeP);
          const patch: Partial<MixedCardPayment> = { charge };
          if (cashBackOfferEnabled) {
            patch.cashBackOffer = Number.isFinite(Number(row.cashBackAmount))
              ? Number(row.cashBackAmount)
              : undefined;
          }
          onChangeRef.current(patch);
          return;
        }

        // Card bank path (feature on, no POS bank): editable default charge.
        if (!row) {
          onChangeRef.current({ charge: '', cashBackOffer: undefined });
          return;
        }
        const charge = formatChargeNumber(row.creditCardChargeP);
        onChangeRef.current({
          charge,
          cashBackOffer: undefined,
        });
      } catch {
        if (cancelled) return;
        if (mode === 'pos') {
          const patch: Partial<MixedCardPayment> = { charge: '' };
          if (cashBackOfferEnabled) patch.cashBackOffer = undefined;
          onChangeRef.current(patch);
        } else {
          onChangeRef.current({ charge: '', cashBackOffer: undefined });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    posMachineBankId,
    cardBankId,
    companyId,
    cashBackOfferEnabled,
    chargeFromBankSetup,
    fetchBankExpense,
  ]);

  // When EMI bank changes/clears, duration options come from the query; clear stale selection if IDs no longer match.
  useEffect(() => {
    if (card.emiMode !== 'emi' || emiBankId == null) return;
    if (!card.emiDurationId) return;
    if (emiLoadError) {
      onChangeRef.current({ emiDurationId: undefined, emiDeductionRate: undefined });
      return;
    }
    if (emiDeductions.length === 0) return;
    const match = emiDeductions.find((d) => d.cardEmiDeductionId === card.emiDurationId);
    if (!match) {
      onChangeRef.current({ emiDurationId: undefined, emiDeductionRate: undefined });
    } else if (card.emiDeductionRate !== match.deductionRate) {
      onChangeRef.current({ emiDeductionRate: match.deductionRate });
    }
  }, [card.emiMode, emiBankId, card.emiDurationId, card.emiDeductionRate, emiDeductions, emiLoadError]);

  // When POS bank locks charge, always show numeric value + % (even if dropdown feature is off).
  const showNumericCharge = chargeFromBankSetup || chargeLocked;
  const chargeValue = chargeDisplayValue(card.charge, showNumericCharge);

  return (
    <div className="mm-card-block">
      {title && <div className="mm-card-title">{title}</div>}
      <div className="mm-row">
        <span className="mm-label">Card Amount <span className="mm-req">*</span></span>
        <input
          className="fv mono"
          type="number"
          placeholder="Press Enter after entry"
          value={card.amount || ''}
          onChange={(e) => onChange({ amount: Number(e.target.value) || 0 })}
        />
        <span className="mm-suffix">TK</span>
      </div>
      <div className="mm-row">
        <span className="mm-label">Card No <span className="mm-req">*</span></span>
        <input className="fv" type="text" value={card.cardNo} onChange={(e) => onChange({ cardNo: e.target.value })} />
      </div>
      <div className="mm-row">
        <span className="mm-label">Card Bank <span className="mm-req">*</span></span>
        <BankSearchInput
          value={selectedBank}
          options={banks}
          placeholder="Search card bank..."
          onSelect={(bank) => {
            const bankId = toBankId(bank?.bankId);
            onChange({ bank: bank?.bankName ?? '', bankId });
          }}
          onClear={() => onChange({ bank: '', bankId: undefined })}
        />
      </div>
      <div className="mm-row">
        <span className="mm-label">Expiry Date</span>
        <input
          className="fv"
          type="datetime-local"
          value={card.expiryDate}
          onChange={(e) => onChange({ expiryDate: e.target.value })}
        />
      </div>
      <div className="mm-row mm-row--check">
        <input
          id={posId}
          type="checkbox"
          checked={card.posMachine}
          onChange={(e) => onChange({ posMachine: e.target.checked })}
        />
        <label htmlFor={posId}>POS Machine</label>
      </div>
      <div className="mm-row">
        <span className="mm-label">POS Machine Bank</span>
        <BankSearchInput
          value={selectedPosBank}
          options={banks}
          placeholder="Search POS machine bank..."
          onSelect={(bank) => {
            const bankId = toBankId(bank?.bankId);
            onChange({
              posMachineBankId: bankId,
              posMachineBankName: bank?.bankName ?? '',
            });
          }}
          onClear={() =>
            onChange({
              posMachineBankId: undefined,
              posMachineBankName: '',
              cashBackOffer: undefined,
            })
          }
        />
      </div>
      <div className="mm-row">
        <span className="mm-label">Charge <span className="mm-req">*</span></span>
        {showNumericCharge ? (
          <>
            <input
              className={`fv mono${chargeLocked ? ' mm-readonly' : ''}`}
              type="number"
              step="any"
              value={chargeValue}
              readOnly={chargeLocked}
              onChange={(e) => {
                if (chargeLocked) return;
                onChange({ charge: e.target.value });
              }}
            />
            <span className="mm-suffix">%</span>
          </>
        ) : (
          <select
            className="fv"
            value={chargeValue}
            onChange={(e) => onChange({ charge: e.target.value })}
          >
            <option value="">---Select---</option>
            {CARD_CHARGES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>
      {cashBackOfferEnabled && (
        <div className="mm-row">
          <span className="mm-label">Cash Back Offer</span>
          <input
            className="fv mono"
            type="number"
            step="any"
            value={card.cashBackOffer ?? ''}
            onChange={(e) =>
              onChange({
                cashBackOffer: e.target.value === '' ? undefined : Number(e.target.value) || 0,
              })
            }
          />
        </div>
      )}
      <div className="mm-row mm-row--radio">
        <span className="mm-label">EMI Mode</span>
        <div className="mm-radio-group">
          <label>
            <input
              type="radio"
              name={`${posId}_emi`}
              checked={card.emiMode === 'emi'}
              onChange={() => onChange({ emiMode: 'emi' })}
            />
            EMI
          </label>
          <label>
            <input
              type="radio"
              name={`${posId}_emi`}
              checked={card.emiMode !== 'emi'}
              onChange={() =>
                onChange({
                  emiMode: 'non-emi',
                  emiBankId: undefined,
                  emiBankName: '',
                  emiDurationId: undefined,
                  emiDeductionRate: undefined,
                })
              }
            />
            Non-EMI
          </label>
        </div>
      </div>
      {card.emiMode === 'emi' && (
        <>
          <div className="mm-row">
            <span className="mm-label">EMI Bank <span className="mm-req">*</span></span>
            <BankSearchInput
              value={selectedEmiBank}
              options={banks}
              placeholder="Search EMI bank..."
              onSelect={(bank) => {
                const bankId = toBankId(bank?.bankId);
                onChange({
                  emiBankId: bankId,
                  emiBankName: bank?.bankName ?? '',
                  emiDurationId: undefined,
                  emiDeductionRate: undefined,
                });
              }}
              onClear={() =>
                onChange({
                  emiBankId: undefined,
                  emiBankName: '',
                  emiDurationId: undefined,
                  emiDeductionRate: undefined,
                })
              }
            />
          </div>
          <div className="mm-row">
            <span className="mm-label">EMI Duration (Months) <span className="mm-req">*</span></span>
            <select
              className="fv"
              value={card.emiDurationId ?? ''}
              disabled={emiBankId == null}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : undefined;
                const row = emiDeductions.find((d) => d.cardEmiDeductionId === id);
                onChange({
                  emiDurationId: id && Number.isFinite(id) ? id : undefined,
                  emiDeductionRate: row?.deductionRate,
                });
              }}
            >
              <option value="">---Select---</option>
              {emiDeductions.map((d) => (
                <option key={d.cardEmiDeductionId} value={d.cardEmiDeductionId}>
                  {d.noOfInstallment}
                </option>
              ))}
            </select>
          </div>
          <div className="mm-row">
            <span className="mm-label">Deduction Rate</span>
            <input
              className="fv mono mm-readonly"
              type="number"
              readOnly
              value={card.emiDeductionRate ?? ''}
            />
            <span className="mm-suffix">%</span>
          </div>
        </>
      )}
    </div>
  );
}

export function MixedModeModal({
  open,
  grandTotal,
  initial,
  banks,
  companyId,
  cashBackOfferEnabled = false,
  chargeFromBankSetup = false,
  crossCheckEnabled = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  grandTotal: number;
  initial?: MixedModePayment;
  banks: BankOption[];
  companyId: number;
  cashBackOfferEnabled?: boolean;
  chargeFromBankSetup?: boolean;
  crossCheckEnabled?: boolean;
  onClose: () => void;
  onConfirm: (payment: MixedModePayment) => void;
}) {
  const [form, setForm] = useState<MixedModePayment>(() => normalizePayment(initial));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(normalizePayment(initial));
      setError(null);
    }
  }, [open, initial]);

  const totalPaid = useMemo(() => {
    const cardTotal = form.cards.reduce((sum, c) => sum + (c.amount || 0), 0);
    return form.cashAmount + form.chequeAmount + cardTotal;
  }, [form]);

  const selectedChequeBank = useMemo(
    () => banks.find((b) => b.bankId === form.chequeBankId) ?? findBankOption(banks, form.chequeBank) ?? null,
    [banks, form.chequeBank, form.chequeBankId],
  );

  const updateCard = (index: number, patch: Partial<MixedCardPayment>) => {
    setForm((prev) => {
      const cards = [...prev.cards];
      cards[index] = { ...cards[index], ...patch };
      return { ...prev, cards };
    });
    setError(null);
  };

  const handleConfirm = () => {
    if (crossCheckEnabled) {
      const diff = Math.round((totalPaid - grandTotal) * 100) / 100;
      if (diff < 0) {
        setError('Paid Amount is less than Grand Total');
        return;
      }
      if (diff > 0) {
        setError('Paid Amount is more than Grand Total');
        return;
      }
    }

    const activeCards = form.multiCard
      ? form.cards.filter((c) => (c.amount || 0) > 0 || c.cardNo || c.bankId)
      : form.cards[0]?.amount || form.cards[0]?.cardNo || form.cards[0]?.bankId
        ? [form.cards[0]]
        : [];

    for (let i = 0; i < activeCards.length; i++) {
      const card = activeCards[i];
      const label = form.multiCard ? `Card ${i + 1}` : 'Card';
      if (card.emiMode === 'emi') {
        if (!card.emiBankId) {
          setError(`${label}: EMI Bank is required`);
          return;
        }
        if (!card.emiDurationId) {
          setError(`${label}: EMI Duration (Months) is required`);
          return;
        }
        if (card.emiDeductionRate == null || Number.isNaN(Number(card.emiDeductionRate))) {
          setError(`${label}: Deduction Rate must be set from EMI Duration`);
          return;
        }
      }
    }

    const cards = form.cards.map((c) => {
      if (c.emiMode === 'emi') return c;
      return {
        ...c,
        emiBankId: undefined,
        emiBankName: '',
        emiDurationId: undefined,
        emiDeductionRate: undefined,
      };
    });

    setError(null);
    onConfirm({ ...form, cards, confirmed: true });
  };

  if (!open) return null;

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md mm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <span className="mhi">💳</span>
          <span className="mt">Mixed Payment Mode</span>
          <button type="button" className="mc" onClick={onClose}>✕</button>
        </div>

        <div className="mb mm-body">
          <div className="mm-section">
            <div className="mm-section-title">Cash</div>
            <div className="mm-row">
              <span className="mm-label">Cash Amount <span className="mm-req">*</span></span>
              <input
                className="fv mono"
                type="number"
                placeholder="Press Enter after entry"
                value={form.cashAmount || ''}
                onChange={(e) => {
                  setForm({ ...form, cashAmount: Number(e.target.value) || 0 });
                  setError(null);
                }}
              />
              <span className="mm-suffix">TK</span>
            </div>
          </div>

          <div className="mm-divider" />

          <div className="mm-section">
            <div className="mm-section-title">Cheque</div>
            <div className="mm-row">
              <span className="mm-label">Cheque Amount <span className="mm-req">*</span></span>
              <input
                className="fv mono"
                type="number"
                placeholder="Press Enter after entry"
                value={form.chequeAmount || ''}
                onChange={(e) => {
                  setForm({ ...form, chequeAmount: Number(e.target.value) || 0 });
                  setError(null);
                }}
              />
              <span className="mm-suffix">TK</span>
            </div>
            <div className="mm-row">
              <span className="mm-label">Cheque No <span className="mm-req">*</span></span>
              <input className="fv" type="text" value={form.chequeNo} onChange={(e) => setForm({ ...form, chequeNo: e.target.value })} />
            </div>
            <div className="mm-row">
              <span className="mm-label">Cheque Bank <span className="mm-req">*</span></span>
              <BankSearchInput
                value={selectedChequeBank}
                options={banks}
                placeholder="Search cheque bank..."
                onSelect={(bank) => setForm({ ...form, chequeBank: bank.bankName, chequeBankId: bank.bankId })}
                onClear={() => setForm({ ...form, chequeBank: '', chequeBankId: undefined })}
              />
            </div>
            <div className="mm-row">
              <span className="mm-label">Cheque Date</span>
              <input
                className="fv"
                type="datetime-local"
                value={form.chequeDate}
                onChange={(e) => setForm({ ...form, chequeDate: e.target.value })}
              />
            </div>
          </div>

          <div className="mm-divider" />

          <div className="mm-section">
            <div className="mm-row mm-row--check mm-multi-toggle">
              <input
                id="mm_multiCard"
                type="checkbox"
                checked={form.multiCard}
                onChange={(e) => setForm({ ...form, multiCard: e.target.checked })}
              />
              <label htmlFor="mm_multiCard">Multiple Card</label>
            </div>

            <MixedCardBlock
              card={form.cards[0]}
              posId="mm_pos1"
              banks={banks}
              companyId={companyId}
              cashBackOfferEnabled={cashBackOfferEnabled}
              chargeFromBankSetup={chargeFromBankSetup}
              onChange={(p) => updateCard(0, p)}
            />

            {form.multiCard && (
              <div className="mm-extra-cards">
                <MixedCardBlock
                  title="Card 2"
                  card={form.cards[1]}
                  posId="mm_pos2"
                  banks={banks}
                  companyId={companyId}
                  cashBackOfferEnabled={cashBackOfferEnabled}
                  chargeFromBankSetup={chargeFromBankSetup}
                  onChange={(p) => updateCard(1, p)}
                />
                <MixedCardBlock
                  title="Card 3"
                  card={form.cards[2]}
                  posId="mm_pos3"
                  banks={banks}
                  companyId={companyId}
                  cashBackOfferEnabled={cashBackOfferEnabled}
                  chargeFromBankSetup={chargeFromBankSetup}
                  onChange={(p) => updateCard(2, p)}
                />
              </div>
            )}
          </div>

          <div className="mm-totals">
            <div className="mm-total-box">
              <div className="mm-total-label">Grand Total</div>
              <div className="mm-total-val">{formatCurrency(grandTotal)}</div>
            </div>
            <div className="mm-total-box">
              <div className="mm-total-label">Total Paid</div>
              <div className="mm-total-val mm-total-val--paid">{formatCurrency(totalPaid)}</div>
            </div>
          </div>

          {error && <div className="mm-crosscheck-error">{error}</div>}
        </div>

        <div className="mf">
          <button type="button" className="bs" onClick={onClose}>Cancel</button>
          <button type="button" className="bp" onClick={handleConfirm}>
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}
