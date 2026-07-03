(function () {
  const root = document.querySelector("#financeiro-app");
  if (!root) return;

  const state = {
    data: null,
    view: "compras",
    search: "",
    market: "",
    category: ""
  };

  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const numberFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

  function asNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function money(value) {
    const numeric = asNumber(value);
    return numeric === null ? "" : brl.format(numeric);
  }

  function formatNumber(value) {
    const numeric = asNumber(value);
    return numeric === null ? "" : numberFmt.format(numeric);
  }

  function formatDate(value) {
    if (!value) return "";
    const parts = String(value).split("-");
    if (parts.length !== 3) return value;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

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

  function productName(item) {
    return item.produto || item.descricao_original || "sem produto";
  }

  function bestReference(item) {
    const refs = [
      ["preco_por_kg", "kg"],
      ["preco_por_litro", "L"],
      ["preco_por_unidade", "un"],
      ["preco_por_metro", "m"],
      ["preco_total", "item"]
    ];
    for (const ref of refs) {
      const value = asNumber(item[ref[0]]);
      if (value !== null) return `${money(value)} / ${ref[1]}`;
    }
    return "";
  }

  function unique(rows, key) {
    return [...new Set(rows.map((row) => row[key]).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  }

  function fillSelect(select, values, label) {
    select.innerHTML = `<option value="">${label}</option>` +
      values.map((value) => `<option>${escapeHtml(value)}</option>`).join("");
  }

  function productSummaries(items) {
    const groups = new Map();
    items.forEach((item) => {
      const name = productName(item);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    });
    return [...groups].map(([name, rows]) => {
      const prices = rows.map((row) => asNumber(row.preco_total)).filter((value) => value !== null);
      const sorted = [...rows].sort((a, b) => `${a.data || ""}-${a.item_id || ""}`.localeCompare(`${b.data || ""}-${b.item_id || ""}`));
      const last = sorted[sorted.length - 1] || {};
      return {
        produto: name,
        marca: last.marca || "",
        categoria: last.categoria || "",
        compras: rows.length,
        menor: prices.length ? Math.min(...prices) : null,
        media: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null,
        maior: prices.length ? Math.max(...prices) : null,
        ultimo: asNumber(last.preco_total),
        ultimaData: last.data || "",
        historico: sorted
      };
    }).sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR"));
  }

  function marketSummaries(notes) {
    const groups = new Map();
    notes.forEach((note) => {
      const name = note.estabelecimento || "sem estabelecimento";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(note);
    });
    return [...groups].map(([name, rows]) => {
      const totals = rows.map((row) => asNumber(row.valor_total)).filter((value) => value !== null);
      const total = totals.reduce((sum, value) => sum + value, 0);
      return {
        estabelecimento: name,
        compras: rows.length,
        total,
        medio: totals.length ? total / totals.length : null,
        ultimaData: rows.map((row) => row.data).filter(Boolean).sort().slice(-1)[0] || ""
      };
    }).sort((a, b) => b.total - a.total);
  }

  function categorySummaries(items) {
    const groups = new Map();
    items.forEach((item) => {
      const name = item.categoria || "sem categoria";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    });
    return [...groups].map(([name, rows]) => {
      const totals = rows.map((row) => asNumber(row.preco_total)).filter((value) => value !== null);
      const total = totals.reduce((sum, value) => sum + value, 0);
      return {
        categoria: name,
        itens: rows.length,
        total,
        medio: totals.length ? total / totals.length : null
      };
    }).sort((a, b) => b.total - a.total);
  }

  function filteredItems() {
    const term = state.search.toLowerCase();
    return (state.data.items || []).filter((item) => {
      const haystack = [
        item.descricao_original,
        item.produto,
        item.marca,
        item.categoria,
        item.estabelecimento
      ].join(" ").toLowerCase();
      if (term && !haystack.includes(term)) return false;
      if (state.market && item.estabelecimento !== state.market) return false;
      if (state.category && item.categoria !== state.category) return false;
      return true;
    });
  }

  function statsHtml() {
    const notes = state.data.notes || [];
    const items = state.data.items || [];
    const total = notes.map((note) => asNumber(note.valor_total)).filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
    return `
      <div class="financeiro-stats">
        <div><span>Notas</span><strong>${notes.length}</strong></div>
        <div><span>Itens</span><strong>${items.length}</strong></div>
        <div><span>Mercados</span><strong>${unique(notes, "estabelecimento").length}</strong></div>
        <div><span>Total</span><strong>${money(total)}</strong></div>
      </div>
    `;
  }

  function row(cells) {
    return `<tr>${cells.map((cell) => `<td data-label="${escapeHtml(cell.label)}">${cell.value || ""}</td>`).join("")}</tr>`;
  }

  function renderCompras() {
    const rows = filteredItems().sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    return `
      ${statsHtml()}
      <div class="financeiro-table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Produto</th><th>Categoria</th><th>Mercado</th><th>Qtd</th><th>Preço</th><th>Referência</th></tr></thead>
          <tbody>
            ${rows.map((item) => row([
              { label: "Data", value: formatDate(item.data) },
              { label: "Produto", value: `<strong>${escapeHtml(productName(item))}</strong><small>${escapeHtml(item.descricao_original || "")}</small>` },
              { label: "Categoria", value: `<span class="financeiro-chip">${escapeHtml(item.categoria || "sem categoria")}</span>` },
              { label: "Mercado", value: escapeHtml(item.estabelecimento || "") },
              { label: "Qtd", value: `${formatNumber(item.quantidade)} ${escapeHtml(item.unidade || "")}` },
              { label: "Preço", value: `<span class="financeiro-price">${money(item.preco_total)}</span>` },
              { label: "Referência", value: escapeHtml(bestReference(item)) }
            ])).join("") || `<tr><td colspan="7">Nenhum item encontrado.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderProdutos() {
    const term = state.search.toLowerCase();
    const rows = productSummaries(filteredItems()).filter((item) => !term || item.produto.toLowerCase().includes(term));
    return `
      ${statsHtml()}
      <div class="financeiro-grid">
        ${rows.map((item) => `
          <article class="financeiro-card">
            <span class="financeiro-chip">${escapeHtml(item.categoria || "sem categoria")}</span>
            <h3>${escapeHtml(item.produto)}</h3>
            <dl>
              <div><dt>Compras</dt><dd>${item.compras}</dd></div>
              <div><dt>Menor</dt><dd>${money(item.menor)}</dd></div>
              <div><dt>Médio</dt><dd>${money(item.media)}</dd></div>
              <div><dt>Último</dt><dd>${money(item.ultimo)}</dd></div>
            </dl>
            <details>
              <summary>Histórico</summary>
              <ul>
                ${item.historico.map((entry) => `<li>${formatDate(entry.data)} · ${escapeHtml(entry.estabelecimento || "")} · ${money(entry.preco_total)}</li>`).join("")}
              </ul>
            </details>
          </article>
        `).join("") || `<p>Nenhum produto encontrado.</p>`}
      </div>
    `;
  }

  function renderMercados() {
    return `
      ${statsHtml()}
      <div class="financeiro-grid">
        ${marketSummaries(state.data.notes || []).map((item) => `
          <article class="financeiro-card">
            <h3>${escapeHtml(item.estabelecimento)}</h3>
            <dl>
              <div><dt>Compras</dt><dd>${item.compras}</dd></div>
              <div><dt>Total</dt><dd>${money(item.total)}</dd></div>
              <div><dt>Ticket médio</dt><dd>${money(item.medio)}</dd></div>
              <div><dt>Última</dt><dd>${formatDate(item.ultimaData)}</dd></div>
            </dl>
          </article>
        `).join("") || `<p>Nenhum mercado encontrado.</p>`}
      </div>
    `;
  }

  function renderCategorias() {
    return `
      ${statsHtml()}
      <div class="financeiro-grid">
        ${categorySummaries(filteredItems()).map((item) => `
          <article class="financeiro-card">
            <span class="financeiro-chip">${escapeHtml(item.categoria)}</span>
            <dl>
              <div><dt>Itens</dt><dd>${item.itens}</dd></div>
              <div><dt>Total</dt><dd>${money(item.total)}</dd></div>
              <div><dt>Médio</dt><dd>${money(item.medio)}</dd></div>
            </dl>
          </article>
        `).join("") || `<p>Nenhuma categoria encontrada.</p>`}
      </div>
    `;
  }

  function render() {
    const output = root.querySelector("[data-financeiro-output]");
    if (!output || !state.data) return;
    root.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === state.view);
    });
    const renderers = {
      compras: renderCompras,
      produtos: renderProdutos,
      mercados: renderMercados,
      categorias: renderCategorias
    };
    output.innerHTML = renderers[state.view]();
  }

  function wirePrivateArea() {
    fillSelect(root.querySelector("[data-market-filter]"), unique(state.data.items || [], "estabelecimento"), "Todos os mercados");
    fillSelect(root.querySelector("[data-category-filter]"), unique(state.data.items || [], "categoria"), "Todas as categorias");
    root.querySelector("[data-search]").addEventListener("input", function (event) {
      state.search = event.target.value.trim();
      render();
    });
    root.querySelector("[data-market-filter]").addEventListener("input", function (event) {
      state.market = event.target.value;
      render();
    });
    root.querySelector("[data-category-filter]").addEventListener("input", function (event) {
      state.category = event.target.value;
      render();
    });
    root.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", function () {
        state.view = button.dataset.view;
        render();
      });
    });
    render();
  }

  async function fetchVault() {
    const urls = [
      root.dataset.vaultUrl,
      "/static/financeiro/vault.json"
    ].filter(Boolean);
    let lastError = "";
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "omit",
          mode: "cors"
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
    const status = root.querySelector("[data-login-status]");
    const password = event.currentTarget.elements.password.value.trim();
    status.textContent = "Descriptografando...";
    try {
      const vault = await fetchVault();
      try {
        state.data = await decryptVault(vault, password);
      } catch (error) {
        status.textContent = "Senha não confere com o arquivo financeiro publicado.";
        return;
      }
      event.currentTarget.reset();
      root.querySelector("[data-lock-screen]").hidden = true;
      root.querySelector("[data-private-area]").hidden = false;
      wirePrivateArea();
    } catch (error) {
      status.textContent = `Não foi possível carregar o arquivo financeiro: ${error.message}`;
    }
  });
})();
