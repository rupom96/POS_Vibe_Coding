const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return rest ? `${ONES[h]} Hundred ${underThousand(rest)}` : `${ONES[h]} Hundred`;
}

/** English amount-in-words for invoice totals (integer taka + optional paisa). */
export function amountInWords(value: number): string {
  const amount = Math.abs(Number.isFinite(value) ? value : 0);
  const whole = Math.floor(amount);
  const paisa = Math.round((amount - whole) * 100);

  if (whole === 0 && paisa === 0) return 'Zero Only';

  const parts: string[] = [];
  let n = whole;

  const crore = Math.floor(n / 10_000_000);
  if (crore) {
    parts.push(`${underThousand(crore)} Crore`);
    n %= 10_000_000;
  }
  const lakh = Math.floor(n / 100_000);
  if (lakh) {
    parts.push(`${underThousand(lakh)} Lakh`);
    n %= 100_000;
  }
  const thousand = Math.floor(n / 1000);
  if (thousand) {
    parts.push(`${underThousand(thousand)} Thousand`);
    n %= 1000;
  }
  if (n) parts.push(underThousand(n));

  let text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (paisa > 0) {
    text = `${text || 'Zero'} and ${underThousand(paisa)} Paisa`;
  }
  return `${text} Only`;
}
