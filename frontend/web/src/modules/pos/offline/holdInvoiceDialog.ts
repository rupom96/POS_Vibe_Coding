import Swal from 'sweetalert2';

export type HoldInvoiceChoice = 'clear' | 'hold-only' | 'cancel';

export async function confirmHoldInvoice(): Promise<HoldInvoiceChoice> {
  const result = await Swal.fire({
    title: 'Hold invoice offline?',
    html:
      'This invoice will be saved locally on your device.<br><br>' +
      'Do you want to <strong>clear the current form</strong> after holding?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Clear',
    cancelButtonText: 'No',
    reverseButtons: true,
    focusCancel: true,
    customClass: {
      popup: 'pos-swal-popup',
      confirmButton: 'pos-swal-confirm',
      cancelButton: 'pos-swal-cancel',
    },
  });

  if (result.isConfirmed) return 'clear';
  if (result.dismiss === Swal.DismissReason.cancel) return 'hold-only';
  return 'cancel';
}
