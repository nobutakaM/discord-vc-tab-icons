// アバター画像を取得して data URL に変換する(canvas汚染を避けるため)
const cache = new Map();

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "fetchAvatar") return;
  const url = msg.url;
  if (cache.has(url)) {
    sendResponse({ ok: true, dataUrl: cache.get(url) });
    return;
  }
  fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(res.status);
      const type = res.headers.get("content-type") || "image/png";
      const dataUrl = `data:${type};base64,${toBase64(await res.arrayBuffer())}`;
      if (cache.size > 200) cache.clear();
      cache.set(url, dataUrl);
      sendResponse({ ok: true, dataUrl });
    })
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // 非同期応答
});
