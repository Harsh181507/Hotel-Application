// toast('Saved') from anywhere; <Toaster /> shows it.
export function toast(message, tone = 'default') {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, tone } }));
}
