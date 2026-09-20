const BATCH_SIZE = 6;
const MAX_CONCURRENCY = 3;
const state = { settings: null, timer: null, active: 0, generation: 0, cache: new Map() };

const styles = document.createElement('style');
styles.textContent = `
  .jev-card{position:relative!important;transition:opacity .2s ease,filter .2s ease}
  .jev-card.jev-no.jev-dim{opacity:.32!important;filter:saturate(.25)}
  .jev-card:hover{opacity:1!important;filter:none!important}
  .jev-card::after{content:attr(data-jev-label);position:absolute;z-index:9999;top:10px;right:44px;padding:6px 8px;border:1px solid rgba(255,255,255,.13);border-radius:999px;background:rgba(11,13,12,.94);box-shadow:0 5px 20px rgba(0,0,0,.22);color:#c6ff5c;font:700 11px/1 ui-monospace,SFMono-Regular,monospace;pointer-events:none;backdrop-filter:blur(8px)}
  .jev-card.jev-no::after{color:#ff8168}
  .jev-card.jev-pending::after{color:#8d918d;animation:jev-pulse 1s infinite alternate}
  #jev-status{position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:8px 10px;border:1px solid rgba(198,255,92,.25);border-radius:999px;background:rgba(11,13,12,.94);color:#c6ff5c;font:700 11px/1 ui-monospace,SFMono-Regular,monospace;box-shadow:0 8px 28px #0007;pointer-events:none}
  @keyframes jev-pulse{to{opacity:.25}}
`;
document.documentElement.appendChild(styles);

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === 'JEV_STOP') {
    state.generation += 1;
    state.settings = null;
    resetMarks();
    document.querySelector('#jev-status')?.remove();
    document.querySelector('#jev-toast')?.remove();
    respond({ message: 'filtering stopped' });
    return;
  }

  if (message?.type !== 'JEV_RUN') return;
  state.generation += 1;
  state.settings = message.settings;
  resetMarks();
  scan();
  respond({ message: 'signull is marking this feed' });
});

chrome.storage.local.get({ enabled: false, preference: '', xPreference: '', youtubePreference: '', samePrompt: true, dim: true }, (saved) => {
  if (saved.enabled) {
    state.settings = saved;
    updateStatus('scanning');
    scan();
  }
});

new MutationObserver(() => {
  if (!state.settings || state.timer) return;
  state.timer = setTimeout(() => { state.timer = null; scan(); }, 900);
}).observe(document.documentElement, { childList: true, subtree: true });

function candidates() {
  if (location.hostname === 'www.youtube.com') {
    const modernCards = [...document.querySelectorAll('yt-lockup-view-model')];
    const legacyCards = [...document.querySelectorAll('ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-grid-video-renderer')];
    const cards = modernCards.length ? modernCards : legacyCards;
    return cards.map((element) => {
      const titleNode = element.querySelector('#video-title,a#video-title-link,a.yt-lockup-metadata-view-model__title,a[href*="/watch"]');
      const title = titleNode?.getAttribute('title')?.trim()
        || titleNode?.getAttribute('aria-label')?.trim()
        || titleNode?.textContent?.trim();
      if (!title) return null;
      const creator = element.querySelector('ytd-channel-name,#channel-name,a[href^="/@"],.yt-lockup-metadata-view-model__metadata')?.textContent?.trim() || '';
      const context = element.querySelector('#metadata-line,.yt-lockup-metadata-view-model__metadata')?.textContent?.trim() || '';
      const href = titleNode?.href || title;
      return { element, id: hash(href), platform: 'youtube', title, creator, context };
    }).filter(Boolean);
  }
  return [...document.querySelectorAll('article[data-testid="tweet"]')].map((element) => {
    const title = element.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
    if (!title) return null;
    const creator = element.querySelector('[data-testid="User-Name"]')?.textContent?.trim() || '';
    const timeLink = element.querySelector('time')?.closest('a')?.href || title;
    const media = [...element.querySelectorAll('img[alt]')].map((image) => image.alt).filter((alt) => alt && alt !== 'Image').join(', ');
    return { element, id: hash(timeLink), platform: 'x', title, creator, context: media };
  }).filter(Boolean);
}

function scan() {
  const preference = pagePreference();
  if (!preference) return;
  const generation = state.generation;
  while (state.active < MAX_CONCURRENCY) {
    const pending = candidates().filter(({ element, id }) => {
      if (state.cache.has(id)) { mark(element, state.cache.get(id)); return false; }
      return !element.dataset.jevQueued;
    }).slice(0, BATCH_SIZE);
    if (!pending.length) {
      if (!state.active) updateStatus(`${document.querySelectorAll('[data-jev-result]').length} marked`);
      return;
    }
    pending.forEach(({ element }) => { element.dataset.jevQueued = 'true'; markPending(element); });
    state.active += 1;
    runBatch(pending, generation);
  }
}

async function runBatch(pending, generation) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'JEV_CLASSIFY',
      preference: pagePreference(),
      items: pending.map(({ element: _element, ...item }) => item),
    });
    if (response?.error) throw new Error(response.error);
    if (generation !== state.generation || !state.settings) return;
    response.results.forEach((result) => state.cache.set(result.id, result));
    pending.forEach(({ element, id }) => mark(element, state.cache.get(id)));
  } catch (error) {
    if (generation !== state.generation) return;
    pending.forEach(({ element }) => { delete element.dataset.jevQueued; clearMark(element); });
    showToast(error.message);
  } finally {
    state.active = Math.max(0, state.active - 1);
    if (state.settings) setTimeout(scan, 0);
  }
}

function pagePreference() {
  const legacy = state.settings?.preference || '';
  if (location.hostname === 'www.youtube.com') {
    return state.settings?.samePrompt
      ? state.settings?.xPreference || legacy
      : state.settings?.youtubePreference || legacy;
  }
  return state.settings?.xPreference || legacy;
}

function resetMarks() {
  state.cache.clear();
  document.querySelectorAll('[data-jev-queued],[data-jev-result]').forEach((element) => {
    element.classList.remove('jev-card', 'jev-pending', 'jev-yes', 'jev-no', 'jev-dim');
    delete element.dataset.jevQueued;
    delete element.dataset.jevResult;
    delete element.dataset.jevLabel;
  });
}

function markPending(element) {
  element.classList.add('jev-card', 'jev-pending');
  element.dataset.jevLabel = 'signull · checking';
}

function mark(element, result) {
  if (!result) return;
  element.classList.remove('jev-pending', 'jev-yes', 'jev-no', 'jev-dim');
  element.classList.add('jev-card', result.liked ? 'jev-yes' : 'jev-no');
  if (!result.liked && state.settings?.dim) element.classList.add('jev-dim');
  const certainty = result.liked ? result.confidence : 1 - result.confidence;
  element.dataset.jevLabel = `${result.liked ? 'for you' : 'skip'} · ${Math.round(certainty * 100)}%`;
  element.dataset.jevResult = result.liked ? 'yes' : 'no';
}

function clearMark(element) {
  element.classList.remove('jev-card', 'jev-pending');
  delete element.dataset.jevLabel;
  delete element.dataset.jevResult;
}

function updateStatus(message) {
  let node = document.querySelector('#jev-status');
  if (!node) { node = document.createElement('div'); node.id = 'jev-status'; document.documentElement.appendChild(node); }
  node.textContent = `signull · ${message}`;
}

function showToast(message) {
  if (document.querySelector('#jev-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'jev-toast';
  toast.textContent = `signull: ${message}`;
  Object.assign(toast.style, { position:'fixed', right:'20px', bottom:'20px', zIndex:2147483647, background:'#171917', color:'#ff9a86', border:'1px solid #3a2b28', borderRadius:'12px', padding:'11px 14px', font:'600 12px system-ui', maxWidth:'340px', boxShadow:'0 10px 35px #0008' });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

function hash(text) {
  let value = 2166136261;
  for (const character of String(text)) { value ^= character.charCodeAt(0); value = Math.imul(value, 16777619); }
  return (value >>> 0).toString(36);
}
