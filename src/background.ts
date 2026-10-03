import type { FetchAvatarRequest, FetchAvatarResponse } from "./messages";

// アバター画像を取得して data URL に変換する(canvas汚染を避けるため)
const cache = new Map<string, string>();

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const numbers = Array.from(bytes.subarray(i, i + chunk));
    bin += String.fromCharCode.apply(null, numbers);
  }
  return btoa(bin);
}

chrome.runtime.onMessage.addListener(
  (
    msg: FetchAvatarRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: FetchAvatarResponse) => void,
  ): boolean | undefined => {
    if (msg?.type !== "fetchAvatar") return;
    const url = msg.url;
    const cached = cache.get(url);
    if (cached !== undefined) {
      sendResponse({ ok: true, dataUrl: cached });
      return;
    }
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const type = res.headers.get("content-type") || "image/png";
        const dataUrl = `data:${type};base64,${toBase64(await res.arrayBuffer())}`;
        if (cache.size > 200) cache.clear();
        cache.set(url, dataUrl);
        sendResponse({ ok: true, dataUrl });
      })
      .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true; // 非同期応答
  },
);
