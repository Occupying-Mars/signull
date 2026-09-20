const key = document.querySelector('#key');
const importButton = document.querySelector('#import');
const fileInput = document.querySelector('#file');
const preference = document.querySelector('#preference');
const dim = document.querySelector('#dim');
const run = document.querySelector('#run');
const status = document.querySelector('#status');

chrome.storage.local.get({ gatewayKey: '', preference: '', dim: true }, (saved) => {
  key.value = saved.gatewayKey;
  preference.value = saved.preference;
  dim.checked = saved.dim;
});

importButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const text = await fileInput.files?.[0]?.text();
  const gatewayKey = cleanKey(text?.match(/^VERCEL_KEY=(.+)$/m)?.[1]);
  if (!gatewayKey) return show('no VERCEL_KEY found in that file', true);
  key.value = gatewayKey;
  await chrome.storage.local.set({ gatewayKey });
  show('key imported and saved locally');
});

run.addEventListener('click', async () => {
  const settings = { gatewayKey: cleanKey(key.value), preference: preference.value.trim(), dim: dim.checked, enabled: true };
  if (settings.gatewayKey.length < 10) return show('add your vercel ai gateway key', true);
  if (settings.preference.length < 5) return show('describe your taste first', true);
  run.disabled = true;
  await chrome.storage.local.set(settings);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(x\.com|twitter\.com|www\.youtube\.com)\//.test(tab.url || '')) {
    run.disabled = false;
    return show('open x or youtube first', true);
  }
  try {
    const { preference: taste, dim: shouldDim, enabled } = settings;
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'JEV_RUN', settings: { preference: taste, dim: shouldDim, enabled } });
    show(response?.message || 'scanning visible items…');
    window.setTimeout(() => window.close(), 700);
  } catch {
    show('reload this page once, then try again', true);
  } finally {
    run.disabled = false;
  }
});

function show(message, error = false) {
  status.textContent = message;
  status.className = `status${error ? ' error' : ''}`;
}

function cleanKey(value) {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/^(['"])(.*)\1$/, '$2');
}
