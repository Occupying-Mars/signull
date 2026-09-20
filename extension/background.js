const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
const MODEL = 'typesafe-ai/jev';

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'JEV_CLASSIFY') return;
  classify(message).then(respond).catch((error) => respond({ error: error.message }));
  return true;
});

async function classify({ preference, items }) {
  const stored = await chrome.storage.local.get('gatewayKey');
  const gatewayKey = cleanKey(stored.gatewayKey);
  if (!gatewayKey) throw new Error('add your vercel ai gateway key in the extension');
  const safeItems = items.slice(0, 12).map((item, index) => ({
    id: String(item.id || `item-${index}`).slice(0, 80),
    platform: String(item.platform || '').slice(0, 20),
    title: String(item.title || '').slice(0, 500),
    creator: String(item.creator || '').slice(0, 160),
    context: String(item.context || '').slice(0, 1200),
  }));
  const questions = Object.fromEntries(safeItems.map((item, index) => [
    `item_${index}`,
    {
      type: 'boolean',
      instructions: `Would this viewer genuinely want to see item id "${item.id}" based on their stated preference? Judge relevance, tone, and format. Do not assume interests they did not state.`,
      criteria: {
        true: 'The item is a clear positive match and the viewer would likely choose to see it.',
        false: 'The item conflicts with, is irrelevant to, or only weakly matches the viewer preference.',
      },
    },
  ]));
  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${gatewayKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, state: { viewerPreference: preference, items: safeItems }, questions }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `gateway returned ${response.status}`);
  return {
    model: data.model || MODEL,
    results: safeItems.map((item, index) => {
      const raw = Number(data.answers?.[`item_${index}`]?.probability);
      const confidence = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.5;
      return { id: item.id, liked: confidence >= 0.5, confidence };
    }),
  };
}

function cleanKey(value) {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/^(['"])(.*)\1$/, '$2');
}
