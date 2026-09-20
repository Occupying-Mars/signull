const key = document.querySelector('#key');
const importButton = document.querySelector('#import');
const fileInput = document.querySelector('#file');
const xPreference = document.querySelector('#x-preference');
const youtubePreference = document.querySelector('#youtube-preference');
const samePrompt = document.querySelector('#same-prompt');
const youtubePrompt = document.querySelector('#youtube-prompt');
const dim = document.querySelector('#dim');
const run = document.querySelector('#run');
const stop = document.querySelector('#stop');
const status = document.querySelector('#status');
const live = document.querySelector('#live');
const liveLabel = document.querySelector('#live-label');

chrome.storage.local.get({ gatewayKey: '', preference: '', xPreference: '', youtubePreference: '', samePrompt: true, dim: true, enabled: false }, (saved) => {
  key.value = saved.gatewayKey;
  xPreference.value = saved.xPreference || saved.preference;
  youtubePreference.value = saved.youtubePreference || saved.preference;
  samePrompt.checked = saved.samePrompt;
  dim.checked = saved.dim;
  syncPromptMode();
  setLive(saved.enabled);
});

samePrompt.addEventListener('change', syncPromptMode);

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
  const settings = {
    gatewayKey: cleanKey(key.value),
    xPreference: xPreference.value.trim(),
    youtubePreference: youtubePreference.value.trim(),
    samePrompt: samePrompt.checked,
    dim: dim.checked,
    enabled: true,
  };
  if (settings.gatewayKey.length < 10) return show('add your vercel ai gateway key', true);
  if (settings.xPreference.length < 5) return show('describe your x taste first', true);
  if (!settings.samePrompt && settings.youtubePreference.length < 5) return show('describe your youtube taste too', true);
  run.disabled = true;
  await chrome.storage.local.set(settings);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(x\.com|twitter\.com|www\.youtube\.com)\//.test(tab.url || '')) {
    run.disabled = false;
    return show('open x or youtube first', true);
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'JEV_RUN', settings });
    setLive(true);
    show(response?.message || 'scanning visible items…');
  } catch {
    show('reload this page once, then try again', true);
  } finally {
    run.disabled = false;
  }
});

stop.addEventListener('click', async () => {
  stop.disabled = true;
  await chrome.storage.local.set({ enabled: false });
  setLive(false);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && /^https:\/\/(x\.com|twitter\.com|www\.youtube\.com)\//.test(tab.url || '')) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'JEV_STOP' });
    } catch {
      // The saved off state still prevents filtering after a page reload.
    }
  }

  show('filtering stopped and all marks cleared');
  stop.disabled = false;
});

function syncPromptMode() {
  youtubePrompt.classList.toggle('hidden', samePrompt.checked);
}

function show(message, error = false) {
  status.textContent = message;
  status.className = `status${error ? ' error' : ''}`;
}

function setLive(enabled) {
  live.classList.toggle('on', enabled);
  liveLabel.textContent = enabled ? 'filtering' : 'idle';
}

function cleanKey(value) {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/^(['"])(.*)\1$/, '$2');
}
