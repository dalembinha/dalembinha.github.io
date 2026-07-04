(function () {
  const root = document.querySelector("#financeiro-app");
  if (!root) return;

  const categoryMeta = {
    mercado: { label: "Mercado", tone: "mercado" },
    farmacia: { label: "Farmácia", tone: "farmacia" },
    material: { label: "Material", tone: "material" },
    outros: { label: "Outros", tone: "outros" }
  };

  const categoryViews = new Set(["mercado", "farmacia", "material", "outros"]);
  const state = {
    data: null,
    view: "mercado",
    previousView: "mercado",
    productSlug: "",
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

  function slugify(value) {
    return String(value || "item")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function categoryKey(value) {
    const key = slugify(value || "outros");
    return categoryMeta[key] ? key : "outros";
  }

  function categoryLabel(value) {
    return categoryMeta[categoryKey(value)].label;
  }

  function categoryChip(value) {
    const key = categoryKey(value);
    return `<span class="financeiro-chip financeiro-chip-${key}">${escapeHtml(categoryLabel(key))}</span>`;
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

  function fillSelect(select, values, label, formatter) {
    select.innerHTML = `<option value="">${label}</option>` +
      values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(formatter ? formatter(value) : value)}</option>`).join("");
  }

  function viewCategory() {
    return categoryViews.has(state.view) ? state.view : "";
  }

  function viewItems() {
    const category = viewCategory();
    return (state.data.items || []).filter((item) => !category || item.categoria_nota === category);
  }

  function viewNotes() {
    const category = viewCategory();
    return (state.data.notes || []).filter((note) => !category || note.categoria_nota === category);
  }

  function filteredItems(baseRows) {
    const term = state.search.toLowerCase();
    return baseRows.filter((item) => {
      const haystack = [
        item.descricao_original,
        item.produto,
        item.marca,
        item.categoria,
        item.categoria_nota,
        item.estabelecimento
      ].join(" ").toLowerCase();
      if (term && !haystack.includes(term)) return false;
      if (state.market && item.estabelecimento !== state.market) return false;
      if (state.category && item.categoria !== state.category) return false;
      return true;
    });
  }

  function productSummaries(items) {
    const groups = new Map();
    items.forEach((item) => {
      const name = productName(item);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    });
    const seen = new Map();
    return [...groups].map(([name, rows]) => {
      const prices = rows.map((row) => asNumber(row.preco_total)).filter((value) => value !== null);
      const sorted = [...rows].sort((a, b) => `${a.data || ""}-${a.item_id || ""}`.localeCompare(`${b.data || ""}-${b.item_id || ""}`));
      const last = sorted[sorted.length - 1] || {};
      const baseSlug = slugify(name);
      const count = seen.get(baseSlug) || 0;
      seen.set(baseSlug, count + 1);
      return {
        slug: count ? `${baseSlug}-${count + 1}` : baseSlug,
        produto: name,
        marca: last.marca || "",
        categoria: last.categoria || last.categoria_nota || "outros",
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
        primeiraData: rows.map((row) => row.data).filter(Boolean).sort()[0] || "",
        ultimaData: rows.map((row) => row.data).filter(Boolean).sort().slice(-1)[0] || ""
      };
    }).sort((a, b) => b.total - a.total);
  }

  function statsHtml(notes, items) {
    const total = notes.map((note) => asNumber(note.valor_total)).filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
    return `
      <div class="financeiro-stats">
        <div><span>Notas</span><strong>${notes.length}</strong></div>
        <div><span>Itens</span><strong>${items.length}</strong></div>
        <div><span>Estabelecimentos</span><strong>${unique(notes, "estabelecimento").length}</strong></div>
        <div><span>Total</span><strong>${money(total)}</strong></div>
      </div>
    `;
  }

  function row(cells, category) {
    return `<tr class="financeiro-row-${categoryKey(category)}">${cells.map((cell) => `<td data-label="${escapeHtml(cell.label)}">${cell.value || ""}</td>`).join("")}</tr>`;
  }

  function productButton(item) {
    const name = productName(item);
    const summary = productSummaries(state.data.items || []).find((entry) => entry.produto === name);
    const slug = summary ? summary.slug : slugify(name);
    return `<button type="button" class="financeiro-product-button" data-product-slug="${escapeHtml(slug)}">${escapeHtml(name)}</button>`;
  }

  function renderItems(title, emptyLabel) {
    const baseItems = viewItems();
    const rows = filteredItems(baseItems).sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    return `
      <h2 class="financeiro-view-title">${escapeHtml(title)}</h2>
      ${statsHtml(viewNotes(), baseItems)}
      <div class="financeiro-table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Produto</th><th>Categoria</th><th>Estabelecimento</th><th>Qtd</th><th>Preço</th><th>Referência</th></tr></thead>
          <tbody>
            ${rows.map((item) => row([
              { label: "Data", value: formatDate(item.data) },
              { label: "Produto", value: `${productButton(item)}<small>${escapeHtml(item.descricao_original || "")}</small>` },
              { label: "Categoria", value: categoryChip(item.categoria || item.categoria_nota) },
              { label: "Estabelecimento", value: escapeHtml(item.estabelecimento || "") },
              { label: "Qtd", value: `${formatNumber(item.quantidade)} ${escapeHtml(item.unidade || "")}` },
              { label: "Preço", value: `<span class="financeiro-price">${money(item.preco_total)}</span>` },
              { label: "Referência", value: escapeHtml(bestReference(item)) }
            ], item.categoria || item.categoria_nota)).join("") || `<tr><td colspan="7">${escapeHtml(emptyLabel)}</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderProdutos() {
    const baseItems = filteredItems(state.data.items || []);
    const rows = productSummaries(baseItems);
    return `
      <h2 class="financeiro-view-title">Produtos</h2>
      ${statsHtml(state.data.notes || [], state.data.items || [])}
      <div class="financeiro-grid">
        ${rows.map((item) => `
          <article class="financeiro-card financeiro-card-${categoryKey(item.categoria)}">
            ${categoryChip(item.categoria)}
            <h3><button type="button" class="financeiro-product-button" data-product-slug="${escapeHtml(item.slug)}">${escapeHtml(item.produto)}</button></h3>
            <dl>
              <div><dt>Compras</dt><dd>${item.compras}</dd></div>
              <div><dt>Menor</dt><dd>${money(item.menor)}</dd></div>
              <div><dt>Médio</dt><dd>${money(item.media)}</dd></div>
              <div><dt>Último</dt><dd>${money(item.ultimo)}</dd></div>
            </dl>
          </article>
        `).join("") || `<p>Nenhum produto encontrado.</p>`}
      </div>
    `;
  }

  function renderEstabelecimentos() {
    return `
      <h2 class="financeiro-view-title">Estabelecimentos</h2>
      ${statsHtml(state.data.notes || [], state.data.items || [])}
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
        `).join("") || `<p>Nenhum estabelecimento encontrado.</p>`}
      </div>
    `;
  }

  function renderPriceChart(rows) {
    const points = rows
      .map((item) => ({ item, value: asNumber(item.preco_total), date: item.data || "" }))
      .filter((point) => point.value !== null);
    if (!points.length) return `<div class="financeiro-empty">Sem preços suficientes para o gráfico.</div>`;

    const width = 760;
    const height = 260;
    const left = 62;
    const right = 22;
    const top = 22;
    const bottom = 48;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const values = points.map((point) => point.value);
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    if (minValue === maxValue) {
      minValue = Math.max(0, minValue - 1);
      maxValue += 1;
    }
    const xFor = (index) => points.length === 1 ? left + plotWidth / 2 : left + (index * plotWidth) / (points.length - 1);
    const yFor = (value) => top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;
    const coords = points.map((point, index) => ({ ...point, x: xFor(index), y: yFor(point.value) }));
    const path = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = `${left},${height - bottom} ${path} ${left + plotWidth},${height - bottom}`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = top + ratio * plotHeight;
      const value = maxValue - ratio * (maxValue - minValue);
      return `
        <line class="financeiro-chart-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${left + plotWidth}" y2="${y.toFixed(1)}"></line>
        <text class="financeiro-chart-label" x="${left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(money(value))}</text>
      `;
    }).join("");
    const first = coords[0];
    const last = coords[coords.length - 1];
    const labels = coords.length === 1 ? [first] : [first, last];
    return `
      <svg class="financeiro-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução do preço">
        ${grid}
        <line class="financeiro-chart-axis" x1="${left}" y1="${height - bottom}" x2="${left + plotWidth}" y2="${height - bottom}"></line>
        <line class="financeiro-chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"></line>
        ${coords.length > 1 ? `<polygon class="financeiro-chart-area" points="${area}"></polygon>` : ""}
        <polyline class="financeiro-chart-line" points="${path}"></polyline>
        ${coords.map((point) => `
          <circle class="financeiro-chart-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5">
            <title>${escapeHtml(`${formatDate(point.date)} · ${point.item.estabelecimento || ""} · ${money(point.value)}`)}</title>
          </circle>
        `).join("")}
        ${labels.map((point, index) => `
          <text class="financeiro-chart-label" x="${point.x.toFixed(1)}" y="${height - 16}" text-anchor="${index === 0 ? "start" : "end"}">${escapeHtml(formatDate(point.date))}</text>
        `).join("")}
      </svg>
    `;
  }

  function renderProductDetail() {
    const summary = productSummaries(state.data.items || []).find((item) => item.slug === state.productSlug);
    if (!summary) return `<p>Produto não encontrado.</p>`;
    return `
      <button type="button" class="financeiro-back" data-view-back>Voltar</button>
      <h2 class="financeiro-view-title">${escapeHtml(summary.produto)}</h2>
      <p>${categoryChip(summary.categoria)}</p>
      <div class="financeiro-stats">
        <div><span>Menor</span><strong>${money(summary.menor)}</strong></div>
        <div><span>Maior</span><strong>${money(summary.maior)}</strong></div>
        <div><span>Médio</span><strong>${money(summary.media)}</strong></div>
        <div><span>Último</span><strong>${money(summary.ultimo)}</strong></div>
      </div>
      <section class="financeiro-chart-card">
        <h3>Evolução do preço</h3>
        <p>Preço pago em cada compra registrada.</p>
        ${renderPriceChart(summary.historico)}
      </section>
      <h3 class="financeiro-section-title">Compras deste produto</h3>
      <div class="financeiro-table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Estabelecimento</th><th>Descrição</th><th>Qtd</th><th>Preço</th><th>Referência</th><th>Nota</th></tr></thead>
          <tbody>
            ${summary.historico.map((item) => row([
              { label: "Data", value: formatDate(item.data) },
              { label: "Estabelecimento", value: escapeHtml(item.estabelecimento || "") },
              { label: "Descrição", value: escapeHtml(item.descricao_original || "") },
              { label: "Qtd", value: `${formatNumber(item.quantidade)} ${escapeHtml(item.unidade || "")}` },
              { label: "Preço", value: `<span class="financeiro-price">${money(item.preco_total)}</span>` },
              { label: "Referência", value: escapeHtml(bestReference(item)) },
              { label: "Nota", value: escapeHtml(item.nota_id || "") }
            ], item.categoria || item.categoria_nota)).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function render() {
    const output = root.querySelector("[data-financeiro-output]");
    if (!output || !state.data) return;
    root.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === state.view || (state.view === "produto" && button.dataset.view === "produtos");
      button.classList.toggle("is-active", active);
    });
    const renderers = {
      mercado: () => renderItems("Mercado", "Nenhum item de mercado encontrado."),
      farmacia: () => renderItems("Farmácia", "Nenhum item de farmácia encontrado."),
      material: () => renderItems("Material", "Nenhum item de material encontrado."),
      outros: () => renderItems("Outros", "Nenhum item encontrado."),
      produtos: renderProdutos,
      estabelecimentos: renderEstabelecimentos,
      produto: renderProductDetail
    };
    output.innerHTML = (renderers[state.view] || renderers.mercado)();
  }

  function wirePrivateArea() {
    fillSelect(root.querySelector("[data-market-filter]"), unique(state.data.items || [], "estabelecimento"), "Todos os estabelecimentos");
    fillSelect(root.querySelector("[data-category-filter]"), unique(state.data.items || [], "categoria"), "Todas as categorias", categoryLabel);
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
        state.previousView = state.view;
        state.productSlug = "";
        render();
      });
    });
    root.querySelector("[data-financeiro-output]").addEventListener("click", function (event) {
      const product = event.target.closest("[data-product-slug]");
      if (product) {
        state.previousView = state.view === "produto" ? state.previousView : state.view;
        state.view = "produto";
        state.productSlug = product.dataset.productSlug;
        render();
        return;
      }
      if (event.target.closest("[data-view-back]")) {
        state.view = state.previousView || "produtos";
        state.productSlug = "";
        render();
      }
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
    const form = event.currentTarget;
    const status = root.querySelector("[data-login-status]");
    const password = form.elements.password.value.trim();
    status.textContent = "Descriptografando...";
    try {
      const vault = await fetchVault();
      try {
        state.data = await decryptVault(vault, password);
      } catch (error) {
        status.textContent = "Senha não confere com o arquivo financeiro publicado.";
        return;
      }
      form.reset();
      root.querySelector("[data-lock-screen]").hidden = true;
      root.querySelector("[data-private-area]").hidden = false;
      wirePrivateArea();
    } catch (error) {
      status.textContent = `Não foi possível carregar o arquivo financeiro: ${error.message}`;
    }
  });
})();

