(() => {
  const SIZE = 64;
  const MAX_SHOWN = 4;
  const TITLE_RE = /^🔊\d+ · /;

  let lastKey = "";
  let generatedHref = null;  // 生成したファビコン
  let originalHref = null;   // Discord本来のファビコン
  let count = 0;
  const imgCache = new Map();

  // ---------- DOM 解析 ----------

  // 現在表示中サーバーのチャンネル一覧(サイドバー)
  function getChannelList() {
    const anyChannel = document.querySelector('[data-list-item-id^="channels___"]');
    if (!anyChannel) return null;
    return anyChannel.closest("nav") || anyChannel.closest("ul") || null;
  }

  function extractUrl(el) {
    if (!el) return null;
    if (el.tagName === "IMG" && el.src) return el.src;
    const img = el.querySelector?.("img");
    if (img?.src) return img.src;
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
    return m ? m[1] : null;
  }

  function normalizeAvatar(url) {
    try {
      const u = new URL(url, location.href);
      if (/discordapp\.(com|net)$/.test(u.hostname)) u.searchParams.set("size", "64");
      u.pathname = u.pathname.replace(/\.gif$/, ".png"); // アニメーションは静止画に
      return u.href;
    } catch {
      return url;
    }
  }

  function isSpeaking(userEl, avatarEl) {
    if (/speaking/i.test(avatarEl?.className || "")) return true;
    return !!userEl.querySelector('[class*="Speaking"], [class*="speaking"]');
  }

  // サイドバー内の全ボイスチャンネル参加者を取得
  function collectMembers(root) {
    const all = [...root.querySelectorAll('[class*="voiceUser"]')];
    // 参加者を包むコンテナ(voiceUsers等)を除外し、個々の参加者要素だけ残す
    const users = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
    const out = [];
    const seen = new Set();
    users.forEach((u) => {
      const avatarEl = u.querySelector('[class*="avatar"]');
      const url = extractUrl(avatarEl) || extractUrl(u);
      if (!url) return;
      const norm = normalizeAvatar(url);
      if (seen.has(norm)) return;
      seen.add(norm);
      out.push({ url: norm, speaking: isSpeaking(u, avatarEl) });
    });
    // 話している人を先頭に
    out.sort((a, b) => Number(b.speaking) - Number(a.speaking));
    return out;
  }

  // ---------- 描画 ----------

  function loadImage(url) {
    if (imgCache.has(url)) return imgCache.get(url);
    const p = new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "fetchAvatar", url }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) return resolve(null);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = res.dataUrl;
      });
    });
    imgCache.set(url, p);
    if (imgCache.size > 150) imgCache.delete(imgCache.keys().next().value);
    return p;
  }

  function drawCircle(ctx, img, x, y, d, speaking) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img) ctx.drawImage(img, x, y, d, d);
    else { ctx.fillStyle = "#5865F2"; ctx.fillRect(x, y, d, d); }
    ctx.restore();
    if (speaking) {
      ctx.beginPath();
      ctx.arc(x + d / 2, y + d / 2, d / 2 - 2, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#23A55A";
      ctx.stroke();
    }
  }

  async function render(members) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");

    const overflow = members.length > MAX_SHOWN;
    const shown = overflow ? members.slice(0, MAX_SHOWN - 1) : members.slice(0, MAX_SHOWN);
    const imgs = await Promise.all(shown.map((m) => loadImage(m.url)));

    const slots = overflow ? MAX_SHOWN : shown.length;
    let cells;
    if (slots === 1) cells = [[0, 0, 64]];
    else if (slots === 2) cells = [[0, 16, 32], [32, 16, 32]];
    else cells = [[0, 0, 32], [32, 0, 32], [0, 32, 32], [32, 32, 32]];

    shown.forEach((m, i) => {
      const [x, y, d] = cells[i];
      drawCircle(ctx, imgs[i], x + 1, y + 1, d - 2, m.speaking);
    });

    if (overflow) {
      const [x, y, d] = cells[MAX_SHOWN - 1];
      ctx.fillStyle = "#313338";
      ctx.beginPath();
      ctx.arc(x + d / 2, y + d / 2, d / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${members.length - (MAX_SHOWN - 1)}`, x + d / 2, y + d / 2 + 1);
    }
    return canvas.toDataURL("image/png");
  }

  // ---------- 適用 ----------

  function iconLinks() {
    return [...document.querySelectorAll('link[rel~="icon"]')];
  }

  function setFavicon(href) {
    const links = iconLinks();
    if (originalHref === null) {
      const orig = links.find((l) => l.dataset.vcTabIcons !== "1");
      originalHref = orig?.getAttribute("href") || "/favicon.ico";
    }
    links.forEach((l) => l.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = href;
    link.dataset.vcTabIcons = "1";
    document.head.appendChild(link);
  }

  function restoreFavicon() {
    if (originalHref === null) return;
    iconLinks().forEach((l) => l.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = originalHref;
    document.head.appendChild(link);
    originalHref = null;
  }

  function applyTitle() {
    const base = document.title.replace(TITLE_RE, "");
    const want = count > 0 ? `🔊${count} · ${base}` : base;
    if (document.title !== want) document.title = want;
  }

  async function tick() {
    const list = getChannelList();
    const members = list ? collectMembers(list) : [];
    count = members.length;

    const key = members.map((m) => m.url + (m.speaking ? "*" : "")).join("|");
    if (key !== lastKey) {
      lastKey = key;
      const href = members.length ? await render(members) : null;
      if (key !== lastKey) return; // 描画中に状態が変わった
      generatedHref = href;
      if (generatedHref) setFavicon(generatedHref);
      else restoreFavicon();
    } else if (generatedHref) {
      // Discordが通知などでファビコンを差し替えた場合に戻す
      const cur = document.querySelector('link[rel~="icon"]');
      if (!cur || cur.dataset.vcTabIcons !== "1") setFavicon(generatedHref);
    }
    applyTitle();
  }

  let running = false;
  async function safeTick() {
    if (running) return;
    running = true;
    try { await tick(); } catch (e) { /* noop */ }
    running = false;
  }

  setInterval(safeTick, 500);
  new MutationObserver(() => {
    if (count > 0 && !TITLE_RE.test(document.title)) applyTitle();
  }).observe(document.querySelector("title") || document.head, {
    childList: true, characterData: true, subtree: true,
  });
  safeTick();
})();
