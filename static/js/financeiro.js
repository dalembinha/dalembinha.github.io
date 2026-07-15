(function () {
  const root = document.querySelector("#financeiro-app");
  if (!root) return;

  const frame = root.querySelector("[data-financeiro-frame]");
  const objectUrls = new Map();
  let pageMap = new Map();
  let assetMap = new Map();
  let currentPath = "index.html";

  function b64ToBytes(value) {
    const raw = atob(value);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) {
      bytes[index] = raw.charCodeAt(index);
    }
    return bytes;
  }

  async function decryptVault(vault, password) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: b64ToBytes(vault.salt),
        iterations: vault.iterations,
        hash: vault.hash || "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(vault.iv) },
      key,
      b64ToBytes(vault.data)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function normalizedPath(value, basePath) {
    if (!value || value.startsWith("#")) return null;
    if (/^(mailto:|tel:|blob:|data:|javascript:)/i.test(value)) return null;
    try {
      const resolved = new URL(value, `https://financeiro.local/${basePath}`);
      if (resolved.origin !== "https://financeiro.local") return null;
      const path = decodeURIComponent(resolved.pathname.replace(/^\/+/, ""));
      return path || "index.html";
    } catch (error) {
      return null;
    }
  }

  function blobUrl(asset) {
    if (objectUrls.has(asset.path)) return objectUrls.get(asset.path);
    const blob = new Blob([b64ToBytes(asset.data)], {
      type: asset.mime || "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    objectUrls.set(asset.path, url);
    return url;
  }

  function prepareHtml(path) {
    const page = pageMap.get(path);
    if (!page) throw new Error(`Pagina nao encontrada no vault: ${path}`);
    const doc = new DOMParser().parseFromString(page.html || "", "text/html");

    doc.querySelectorAll("[src]").forEach((element) => {
      const assetPath = normalizedPath(element.getAttribute("src"), path);
      const asset = assetPath ? assetMap.get(assetPath) : null;
      if (asset) element.setAttribute("src", blobUrl(asset));
    });

    doc.querySelectorAll("link[href]").forEach((element) => {
      const assetPath = normalizedPath(element.getAttribute("href"), path);
      const asset = assetPath ? assetMap.get(assetPath) : null;
      if (asset) element.setAttribute("href", blobUrl(asset));
    });

    doc.querySelectorAll("a[href]").forEach((anchor) => {
      const pagePath = normalizedPath(anchor.getAttribute("href"), path);
      if (!pagePath || !pageMap.has(pagePath)) return;
      anchor.dataset.financeiroPath = pagePath;
      anchor.setAttribute("href", "#");
    });

    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  function renderPage(path) {
    const wanted = pageMap.has(path) ? path : "index.html";
    currentPath = wanted;
    frame.srcdoc = prepareHtml(wanted);
    frame.scrollIntoView({ block: "nearest" });
  }

  frame.addEventListener("load", function () {
    const doc = frame.contentDocument;
    if (!doc) return;
    frame.title = doc.title ? `${doc.title} protegido` : "financeiroDB protegido";
    doc.addEventListener("click", function (event) {
      const anchor = event.target.closest("a[href]");
      if (!anchor) return;
      const wanted = anchor.dataset.financeiroPath || normalizedPath(anchor.getAttribute("href"), currentPath);
      if (!wanted || !pageMap.has(wanted)) return;
      event.preventDefault();
      renderPage(wanted);
    }, true);
  });

  async function fetchVault() {
    const urls = [root.dataset.vaultUrl, "/static/financeiro/vault.json"].filter(Boolean);
    let lastError = "";
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "omit" });
        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          continue;
        }
        return response.json();
      } catch (error) {
        lastError = `${error.name}: ${error.message}`;
      }
    }
    throw new Error(lastError || "falha de rede");
  }

  root.querySelector("[data-login-form]").addEventListener("submit", async function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = root.querySelector("[data-login-status]");
    const password = form.elements.password.value.trim();
    status.textContent = "Descriptografando...";
    try {
      const vault = await fetchVault();
      let payload;
      try {
        payload = await decryptVault(vault, password);
      } catch (error) {
        status.textContent = "Senha não confere com o Financeiro publicado.";
        return;
      }

      pageMap = new Map((payload.pages || []).map((page) => [page.path, page]));
      assetMap = new Map((payload.assets || []).map((asset) => [asset.path, asset]));
      if (!pageMap.has(payload.entry_path || "index.html")) {
        throw new Error("pagina inicial ausente do vault");
      }

      form.reset();
      root.querySelector("[data-lock-screen]").hidden = true;
      root.querySelector("[data-private-area]").hidden = false;
      const productCount = [...pageMap.keys()].filter((path) => path.startsWith("produtos/")).length;
      root.querySelector("[data-financeiro-summary]").textContent =
        `${pageMap.size} páginas · ${productCount} produtos`;
      renderPage(payload.entry_path || "index.html");
    } catch (error) {
      status.textContent = `Não foi possível carregar o Financeiro: ${error.message}`;
    }
  });

  window.addEventListener("beforeunload", function () {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
  });
})();
