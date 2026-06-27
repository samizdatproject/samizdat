import './styles.css';
import { parseSignBundle } from '@samizdat/tx/sign-bundle';
import { takeStashedSignBundle } from './sign-storage';
import { signBundleWithWif } from './sign-wif';

const bundleInput = document.getElementById('bundle-input') as HTMLTextAreaElement;
const stashed = takeStashedSignBundle();
if (stashed) {
  bundleInput.value = stashed;
}

document.getElementById('sign-btn')?.addEventListener('click', async () => {
  const errEl = document.getElementById('error-box') as HTMLElement;
  const resultEl = document.getElementById('result-box') as HTMLElement;
  const signedEl = document.getElementById('signed-hex') as HTMLElement;
  const wifEl = document.getElementById('wif-input') as HTMLInputElement;
  errEl.style.display = 'none';
  resultEl.style.display = 'none';

  try {
    const bundleText = bundleInput.value;
    const wif = wifEl.value.trim();
    if (!wif) throw new Error('Enter your WIF private key.');
    const bundle = parseSignBundle(bundleText);
    const signedHex = await signBundleWithWif(bundle, wif);
    signedEl.textContent = signedHex;
    resultEl.style.display = 'block';
    wifEl.value = '';
  } catch (err) {
    errEl.textContent = String(err instanceof Error ? err.message : err);
    errEl.style.display = 'block';
  }
});

document.getElementById('copy-btn')?.addEventListener('click', () => {
  const hex = document.getElementById('signed-hex')?.textContent ?? '';
  navigator.clipboard.writeText(hex).then(() => {
    const btn = document.getElementById('copy-btn')!;
    btn.textContent = 'COPIED';
    setTimeout(() => { btn.textContent = 'COPY'; }, 1500);
  });
});
