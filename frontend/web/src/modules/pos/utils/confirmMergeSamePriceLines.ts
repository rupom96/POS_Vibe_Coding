import Swal from 'sweetalert2';

export type MergeSamePriceChoice = {
  merge: boolean;
  remember: boolean;
};

/**
 * Ask whether to merge invoice lines that share the same product and unit price.
 * Checkbox "Remember my decision" is read for both Yes and No.
 */
export async function confirmMergeSamePriceLines(opts: {
  productName: string;
  rowNos: number[];
}): Promise<MergeSamePriceChoice> {
  const rows = opts.rowNos.join(', ');
  const name = opts.productName.trim() || 'this product';
  let remember = false;

  const result = await Swal.fire({
    title: 'Merge matching rows?',
    html:
      `Product <strong>${escapeHtml(name)}</strong> is already entered with the same price ` +
      `in row no ${escapeHtml(rows)}.<br><br>Do you want to merge them?` +
      `<br><br><label class="pos-swal-remember">` +
      `<input type="checkbox" id="pos-merge-remember" /> Remember my decision</label>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes',
    cancelButtonText: 'No',
    reverseButtons: true,
    focusConfirm: true,
    customClass: {
      popup: 'pos-swal-popup',
      confirmButton: 'pos-swal-confirm',
      cancelButton: 'pos-swal-cancel',
    },
    willClose: () => {
      const input = document.getElementById('pos-merge-remember') as HTMLInputElement | null;
      remember = input?.checked === true;
    },
  });

  return {
    merge: result.isConfirmed,
    remember,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
