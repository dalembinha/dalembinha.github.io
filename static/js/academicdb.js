(function () {
  const root = document.querySelector("#academicdb-app");
  if (!root) return;

  const objectUrls = new Map();

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

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

  function normalizeAssetPath(value) {
    if (!value || value.startsWith("#")) return null;
    if (/^(https?:|mailto:|tel:|blob:|data:)/i.test(value)) return null;
    const noHash = value.split("#", 1)[0].split("?", 1)[0];
    if (!noHash) return null;
    let clean = noHash;
    while (clean.startsWith("./")) clean = clean.slice(2);
    clean = clean.replace(/^\.\.\//, "");
    try {
      return decodeURIComponent(clean);
    } catch (error) {
      return clean;
    }
  }

  function blobUrl(asset) {
    if (objectUrls.has(asset.path)) return objectUrls.get(asset.path);
    const blob = new Blob([b64ToBytes(asset.data)], { type: asset.mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    objectUrls.set(asset.path, url);
    return url;
  }

  function freeObjectUrls() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
  }

  function missingAssetNotice(payload) {
    const omitted = payload.omitted || {};
    if (!omitted.count) return "";
    const mib = omitted.bytes ? ` (${(omitted.bytes / 1024 / 1024).toFixed(1)} MiB)` : "";
    return `
      <aside class="academicdb-embedded-notice">
        <strong>PDFs não incluídos neste vault.</strong>
        <span>${omitted.count} arquivo(s) omitido(s)${mib}. O catálogo, YAMLs e gráficos ficam protegidos; para publicar PDFs criptografados também, gere com <code>ACADEMICDB_INCLUDE_PDFS=1</code>.</span>
      </aside>
    `;
  }

  function prepareHtml(payload) {
    freeObjectUrls();
    const assets = new Map((payload.assets || []).map((asset) => [asset.path, asset]));
    const doc = new DOMParser().parseFromString(payload.index_html || "", "text/html");

    doc.querySelectorAll("[src]").forEach((element) => {
      const original = element.getAttribute("src");
      const path = normalizeAssetPath(original);
      const asset = path ? assets.get(path) : null;
      if (asset) element.setAttribute("src", blobUrl(asset));
    });

    doc.querySelectorAll("a[href]").forEach((anchor) => {
      const original = anchor.getAttribute("href") || "";
      const path = normalizeAssetPath(original);
      if (!path) return;
      const asset = assets.get(path);
      if (asset) {
        anchor.setAttribute("href", blobUrl(asset));
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noreferrer");
        return;
      }
      if (path.startsWith("data/") || path.startsWith("external/")) {
        anchor.setAttribute("href", "#");
        anchor.setAttribute("data-academicdb-missing-asset", "true");
        anchor.setAttribute("title", "Arquivo omitido do vault protegido para manter o site leve");
      }
    });

    const style = doc.createElement("style");
    style.textContent = `
      .academicdb-embedded-notice {
        margin: 0 0 18px;
        padding: 12px 14px;
        border: 1px solid #f0c36f;
        border-radius: 8px;
        background: #fff7df;
        color: #503400;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .academicdb-embedded-notice strong { display: block; margin-bottom: 4px; }
      a[data-academicdb-missing-asset] {
        color: #735229 !important;
        background: #f7e5bd !important;
        cursor: not-allowed;
      }
    `;
    doc.head.appendChild(style);

    const main = doc.querySelector("main") || doc.body;
    if (main && payload.omitted && payload.omitted.count) {
      main.insertAdjacentHTML("afterbegin", missingAssetNotice(payload));
    }

    doc.querySelectorAll("a[data-academicdb-missing-asset]").forEach((anchor) => {
      anchor.addEventListener("click", (event) => event.preventDefault());
    });

    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  function summaryText(payload) {
    const roots = payload.included_roots || {};
    const bits = [];
    if (roots.sources) bits.push(`${roots.sources} YAMLs`);
    if (roots.charts) bits.push(`${roots.charts} gráficos`);
    if (roots.data || roots.external) bits.push(`${(roots.data || 0) + (roots.external || 0)} PDFs`);
    if (payload.omitted && payload.omitted.count) bits.push(`${payload.omitted.count} PDFs omitidos`);
    return bits.join(" · ") || `${payload.asset_count || 0} arquivos`;
  }

  async function fetchVault() {
    const urls = [
      root.dataset.vaultUrl,
      "/static/academicdb/vault.json"
    ].filter(Boolean);
    let lastError = "";
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "omit"
        });
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
        status.textContent = "Senha não confere com o AcademicDB publicado.";
        return;
      }
      form.reset();
      root.querySelector("[data-lock-screen]").hidden = true;
      root.querySelector("[data-private-area]").hidden = false;
      root.querySelector("[data-academicdb-summary]").textContent = summaryText(payload);
      root.querySelector("[data-academicdb-frame]").srcdoc = prepareHtml(payload);
    } catch (error) {
      status.textContent = `Não foi possível carregar o AcademicDB: ${escapeHtml(error.message)}`;
    }
  });
})();
