import {
  debounce, escapeHtml, formatDate, formatMoney, setBusy, toast,
} from "../assets/js/utils.js";
import {
  adjustStock, cancelOnlineOrder, cancelQuote, closeOperatorCash, closeRegister,
  completeOnlineOrder, createQuote, createSale, getOperationalProfile,
  getRegisterState, getSession, getStorefrontSettings, listCatalog,
  listOnlineOrders, listQuotes, onAuthChange, openRegister, requestStaffAccess,
  resetPassword, resolveOperator, signIn, signOut,
} from "./supabase.js";

const STORE_URL = "https://nexcellstore.vercel.app/";
const CONTROL_URL = "https://nexcellstore.vercel.app/control";
const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  profile: null,
  products: [],
  cart: [],
  quotes: [],
  onlineOrders: [],
  registerState: null,
  activeQuoteId: null,
  category: "Todos",
  search: "",
  pendingProduct: null,
  refreshTimer: null,
  lastSale: null,
  config: { storeName: "Nexcell", phone: "", footer: "Obrigado pela preferência!" },
};

function mountOperationalUI() {
  const sideNav = document.querySelector(".side-nav");
  const profileButton = sideNav?.querySelector('[data-view="profile"]');
  if (sideNav && profileButton && !sideNav.querySelector('[data-view="orders"]')) {
    profileButton.insertAdjacentHTML("beforebegin", `
      <button class="side-link" type="button" data-view="orders"><span>📦</span>Pedidos online</button>
      <button class="side-link" type="button" data-view="stock"><span>📊</span>Estoque</button>
      <button class="side-link" type="button" data-view="cash"><span>💵</span>Caixa e sangria</button>`);
  }

  const mobileNav = document.querySelector(".mobile-nav");
  if (mobileNav && !mobileNav.querySelector('[data-view="orders"]')) {
    mobileNav.style.overflowX = "auto";
    mobileNav.style.justifyContent = "flex-start";
    const profile = mobileNav.querySelector('[data-view="profile"]');
    profile?.insertAdjacentHTML("beforebegin", `
      <button class="mobile-link" type="button" data-view="orders"><span>📦</span><span>Pedidos</span></button>
      <button class="mobile-link" type="button" data-view="stock"><span>📊</span><span>Estoque</span></button>
      <button class="mobile-link" type="button" data-view="cash"><span>💵</span><span>Caixa</span></button>`);
  }

  const content = document.querySelector(".workspace-content");
  if (content && !$("view-orders")) {
    content.insertAdjacentHTML("beforeend", `
      <section class="workspace-view" id="view-orders">
        <div class="view-head"><div><h2>Pedidos online</h2><p>O pedido só vira concluído e baixa o estoque quando um operador informar seu código no PDV.</p></div><button class="btn btn-secondary" id="refreshOnlineOrders" type="button">Atualizar</button></div>
        <div id="onlineOrdersList" style="display:grid;gap:12px;"></div>
      </section>
      <section class="workspace-view" id="view-stock">
        <div class="view-head"><div><h2>Estoque</h2><p>Entradas e baixas manuais ficam registradas pelo código do operador. O Control só permite entrada.</p></div><button class="btn btn-secondary" id="refreshStock" type="button">Atualizar</button></div>
        <div class="card"><div class="card-body" id="stockManageList"></div></div>
      </section>
      <section class="workspace-view" id="view-cash">
        <div class="view-head"><div><h2>Caixa e sangria</h2><p>Cada operador fecha a própria sangria. ADM pode fazer a sangria de outro operador. O caixa fecha quando não houver venda pendente.</p></div><button class="btn btn-secondary" id="refreshCash" type="button">Atualizar</button></div>
        <div id="registerStatus"></div>
        <div id="cashSellerList" style="display:grid;gap:10px;margin-top:14px;"></div>
        <div class="content-grid" style="margin-top:16px;">
          <article class="card">
            <div class="card-head"><h3>Sangria / fechamento do operador</h3></div>
            <form id="cashForm" class="card-body" style="display:grid;gap:12px;">
              <div class="field-row">
                <div class="field"><label for="cashActorCode">Seu código</label><input class="input" id="cashActorCode" inputmode="numeric" maxlength="6" placeholder="Ex.: 01" required><small id="cashActorIdentity"></small></div>
                <div class="field"><label for="cashTargetCode">Operador da sangria</label><select class="select" id="cashTargetCode" required><option value="">Selecione</option></select></div>
              </div>
              <div class="field-row">
                <div class="field"><label for="declaredCash">Dinheiro contado</label><input class="input" id="declaredCash" type="number" min="0" step="0.01" value="0" required></div>
                <div class="field"><label for="declaredPix">PIX conferido</label><input class="input" id="declaredPix" type="number" min="0" step="0.01" value="0" required></div>
              </div>
              <div class="field-row">
                <div class="field"><label for="declaredCredit">Cartão crédito</label><input class="input" id="declaredCredit" type="number" min="0" step="0.01" value="0" required></div>
                <div class="field"><label for="declaredDebit">Cartão débito</label><input class="input" id="declaredDebit" type="number" min="0" step="0.01" value="0" required></div>
              </div>
              <div class="field"><label for="fiscalDocument">Nº/chave da nota fiscal já emitida</label><input class="input" id="fiscalDocument" required placeholder="Informe a referência fiscal antes de fechar"><small>A emissão fiscal real depende do emissor/NFC-e integrado; aqui o fechamento registra a nota já emitida.</small></div>
              <div class="field"><label for="cashNotes">Observação</label><textarea class="input" id="cashNotes" rows="3" placeholder="Opcional"></textarea></div>
              <button class="btn btn-primary btn-block" id="finishOperatorCash" type="submit">Fazer sangria e fechar operador</button>
            </form>
          </article>
          <article class="card">
            <div class="card-head"><h3>Fechar caixa geral</h3></div>
            <form id="closeRegisterForm" class="card-body" style="display:grid;gap:12px;">
              <div class="auth-message show">Qualquer operador pode fechar o caixa geral, mas somente depois que todas as vendas estiverem incluídas em uma sangria.</div>
              <div class="field"><label for="registerCloseCode">Código de quem está fechando</label><input class="input" id="registerCloseCode" inputmode="numeric" maxlength="6" placeholder="Ex.: 01" required></div>
              <div class="field"><label for="registerCloseNotes">Observação</label><textarea class="input" id="registerCloseNotes" rows="3" placeholder="Opcional"></textarea></div>
              <button class="btn btn-secondary btn-block" id="finishRegister" type="submit">Fechar caixa</button>
            </form>
          </article>
        </div>
      </section>`);
  }

  const paymentBody = $("paymentForm")?.querySelector(".modal-body");
  if (paymentBody && !$("saleOperatorCode")) {
    paymentBody.insertAdjacentHTML("afterbegin", `
      <div class="field"><label for="saleOperatorCode">Código de quem está vendendo</label><input class="input" id="saleOperatorCode" inputmode="numeric" maxlength="6" placeholder="Ex.: 01" required><small id="saleOperatorIdentity">Digite o código do operador.</small></div>`);
  }

  if (!$("registerModal")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="modal" id="registerModal"><div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-header"><h2>Abrir caixa</h2></div>
        <form id="registerForm"><div class="modal-body">
          <div class="auth-message show">Qualquer conta ativa cadastrada no Control pode abrir o terminal. Depois de aberto, as vendas são identificadas pelo código de cada operador.</div>
          <div class="field"><label for="openingFloat">Fundo de caixa inicial</label><input class="input" id="openingFloat" type="number" min="0" step="0.01" value="0"></div>
        </div><div class="modal-footer"><button class="btn btn-primary" id="openRegisterButton" type="submit">Abrir caixa</button></div></form>
      </div></div>
      <div class="modal" id="onlineCompleteModal"><div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-header"><h2>Concluir pedido online</h2><button class="icon-btn" type="button" data-close-modal="onlineCompleteModal">×</button></div>
        <form id="onlineCompleteForm"><input type="hidden" id="onlineOrderId"><div class="modal-body">
          <div class="auth-message show">Ao confirmar, o pedido vira concluído e a baixa de estoque acontece agora.</div>
          <div class="field"><label for="onlineOperatorCode">Código do operador</label><input class="input" id="onlineOperatorCode" inputmode="numeric" maxlength="6" required placeholder="Ex.: 01"><small id="onlineOperatorIdentity"></small></div>
          <div class="field"><label for="onlineCompleteNote">Observação</label><textarea class="input" id="onlineCompleteNote" rows="3"></textarea></div>
        </div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-close-modal="onlineCompleteModal">Cancelar</button><button class="btn btn-primary" id="finishOnlineOrder" type="submit">Concluir e dar baixa</button></div></form>
      </div></div>
      <div class="modal" id="stockAdjustModal"><div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-header"><h2>Ajustar estoque</h2><button class="icon-btn" type="button" data-close-modal="stockAdjustModal">×</button></div>
        <form id="stockAdjustForm"><input type="hidden" id="stockVariantId"><div class="modal-body">
          <div id="stockVariantLabel" class="auth-message show"></div>
          <div class="field"><label for="stockOperatorCode">Código do operador</label><input class="input" id="stockOperatorCode" inputmode="numeric" maxlength="6" required placeholder="Ex.: 01"><small id="stockOperatorIdentity"></small></div>
          <div class="field"><label for="stockDelta">Quantidade do ajuste</label><input class="input" id="stockDelta" type="number" step="1" required placeholder="Ex.: 5 para entrada ou -2 para baixa"><small>Valor positivo adiciona. Valor negativo dá baixa e só é aceito no PDV.</small></div>
          <div class="field"><label for="stockReason">Motivo</label><input class="input" id="stockReason" required placeholder="Ex.: avaria, uso interno, conferência"></div>
          <div class="field"><label for="stockNote">Observação</label><textarea class="input" id="stockNote" rows="3"></textarea></div>
        </div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-close-modal="stockAdjustModal">Cancelar</button><button class="btn btn-primary" id="finishStockAdjust" type="submit">Registrar ajuste</button></div></form>
      </div></div>`);
  }
}

mountOperationalUI();

const ui = {
  auth: $("authScreen"), workspace: $("workspace"), products: $("pdvProducts"), categories: $("pdvCategories"),
  cart: $("saleCart"), itemCount: $("saleItemCount"), subtotal: $("saleSubtotal"), total: $("saleTotal"),
  mobileCount: $("mobileCartCount"), mobileTotal: $("mobileCartTotal"), checkout: $("checkoutPanel"), paymentSummary: $("paymentSummary"),
};

const viewMeta = {
  sale: ["Nova venda", "Selecione os produtos e finalize o pagamento."],
  saved: ["Orçamentos salvos", "Retome carrinhos salvos sem baixa de estoque."],
  orders: ["Pedidos online", "Conclua no PDV para efetivar a baixa de estoque."],
  stock: ["Estoque", "Entradas e baixas manuais registradas por operador."],
  cash: ["Caixa e sangria", "Conferência por operador e fechamento geral."],
  profile: ["Meu acesso", "Dados da sessão e código operacional."],
};

function wireExternalLinks() {
  document.querySelectorAll('a[href="../store/"]').forEach((link) => { link.href = STORE_URL; });
  document.querySelectorAll('a[href="../control/"]').forEach((link) => { link.href = CONTROL_URL; });
  $("requestPassword")?.setAttribute("minlength", "8");
}
function setAuthView(viewId) { ["loginView", "requestView", "resetView", "pendingView", "deniedView"].forEach((id) => { const el = $(id); if (el) el.hidden = id !== viewId; }); }
function authMessage(id, message, error = false) { const el = $(id); if (!el) return; el.textContent = message; el.style.color = error ? "var(--danger)" : "#475467"; el.classList.toggle("show", Boolean(message)); }
function friendlyError(error) {
  const raw = String(error?.message || "").toLowerCase();
  if (raw.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (raw.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (raw.includes("permission denied")) return "Sua conta não está liberada para esta operação.";
  if (raw.includes("operator") || raw.includes("operador") || raw.includes("caixa") || raw.includes("sangria") || raw.includes("estoque")) return error.message;
  if (raw.includes("already") || raw.includes("registered")) return "Este e-mail já possui cadastro. Tente entrar.";
  if (raw.includes("rate limit") || raw.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (raw.includes("fetch") || raw.includes("network")) return "Falha de conexão. Verifique sua internet.";
  return error?.message || "Não foi possível concluir a operação.";
}

function normalizeCatalog(rows) {
  return rows.map((row) => {
    const variants = Array.isArray(row.variants) ? row.variants.map((v) => ({
      id: v.variant_id, cor: v.option_1 || v.name || "Padrão", sku: v.sku || "", estoque: Math.max(0, Number(v.available_stock) || 0),
      stockOnHand: Math.max(0, Number(v.stock_on_hand) || 0), stockReserved: Math.max(0, Number(v.stock_reserved) || 0), preco: Number(v.price) || 0, hex: "#94a3b8",
    })) : [];
    return { id: row.product_id, nome: row.product_name || "Produto", marca: row.brand || "", categoria: row.category || "Outros", descricao: row.description || "", codigo: row.product_code || "", preco: variants.find((v) => v.preco > 0)?.preco || 0, variacoes: variants };
  });
}
function availableStock(product) { return product.variacoes.reduce((sum, variant) => sum + variant.estoque, 0); }
function productPrice(product) { const prices = product.variacoes.filter((v) => v.preco > 0).map((v) => v.preco); return prices.length ? Math.min(...prices) : product.preco || 0; }
function cartSubtotal() { return state.cart.reduce((sum, item) => sum + item.preco * item.quantidade, 0); }
function cartKey(productId, variantId) { return `${productId}::${variantId}`; }

function deactivate() {
  ui.workspace?.classList.remove("ready"); if (ui.auth) ui.auth.style.display = "grid";
  if (state.refreshTimer) clearInterval(state.refreshTimer); state.refreshTimer = null;
  state.products = []; state.cart = []; state.activeQuoteId = null; state.registerState = null; state.onlineOrders = []; renderCart();
}
async function loadConfig() { try { const cfg = await getStorefrontSettings(); if (!cfg) return; state.config.storeName = cfg.store_name || state.config.storeName; state.config.phone = cfg.whatsapp || ""; state.config.footer = cfg.footer_text || state.config.footer; } catch (error) { console.warn("Configuração indisponível", error); } }
function renderProfile() {
  const p = state.profile; if (!p || !$("profileSummary")) return;
  $("profileSummary").innerHTML = `<div style="display:grid;gap:12px;font-size:12px;"><div><span class="stat-label">Nome</span><strong style="display:block;margin-top:4px;">${escapeHtml(p.full_name || "—")}</strong></div><div><span class="stat-label">E-mail</span><strong style="display:block;margin-top:4px;">${escapeHtml(state.user?.email || p.email || "—")}</strong></div><div><span class="stat-label">Código operacional</span><strong style="display:block;margin-top:4px;font-size:22px;">#${escapeHtml(p.operator_code || "—")}</strong></div><div><span class="stat-label">Cargo</span><strong style="display:block;margin-top:4px;text-transform:capitalize;">${escapeHtml(p.role || "colaborador")}</strong></div><div class="auth-message show">O login abre o terminal. Cada venda, baixa e sangria é identificada pelo código digitado na operação.</div></div>`;
}
function setView(view) {
  document.querySelectorAll(".workspace-view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const [title, subtitle] = viewMeta[view] || ["PDV", ""]; if ($("viewTitle")) $("viewTitle").textContent = title; if ($("viewSubtitle")) $("viewSubtitle").textContent = subtitle;
  if (view === "saved") loadQuotes(); if (view === "orders") loadOnlineOrders(); if (view === "stock") renderStockManagement(); if (view === "cash") loadRegisterState(false);
}

async function activate() {
  if (ui.auth) ui.auth.style.display = "none"; ui.workspace?.classList.add("ready");
  const name = state.profile?.full_name || state.user?.email?.split("@")[0] || "Operador";
  $("userName").textContent = name; $("userRole").textContent = `#${state.profile?.operator_code || "—"} · ${state.profile?.role || "colaborador"}`; $("userAvatar").textContent = name[0]?.toUpperCase() || "N";
  ["controlLink", "profileControlLink"].forEach((id) => { const link = $(id); if (!link) return; link.hidden = !state.profile?.can_control; link.href = CONTROL_URL; });
  renderProfile(); await Promise.allSettled([loadConfig(), loadCatalog(), loadRegisterState(true), loadOnlineOrders(true)]);
  if (state.refreshTimer) clearInterval(state.refreshTimer); state.refreshTimer = setInterval(() => { if (document.hidden) return; loadCatalog(true); loadRegisterState(false); loadOnlineOrders(true); }, 20000);
}
let sessionResolution = 0;
async function resolveSession(session) {
  const token = ++sessionResolution; deactivate();
  if (!session?.user) { state.user = null; state.profile = null; setAuthView("loginView"); return; }
  state.user = session.user;
  try { const profile = await getOperationalProfile(); if (token !== sessionResolution) return; state.profile = profile; if (!profile?.staff || profile.approval_status === "pending") { setAuthView("pendingView"); return; } if (!profile.active || profile.approval_status === "rejected" || !profile.can_pdv) { setAuthView("deniedView"); return; } await activate(); }
  catch (error) { console.error(error); authMessage("loginMessage", friendlyError(error), true); setAuthView("loginView"); }
}

async function loadCatalog(silent = false) {
  try { state.products = normalizeCatalog(await listCatalog()); renderCatalog(); renderStockManagement(); }
  catch (error) { console.error(error); if (!silent && ui.products) ui.products.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><strong>Falha ao carregar o estoque</strong><span>${escapeHtml(friendlyError(error))}</span></div>`; }
}
function filteredProducts() {
  const term = state.search.trim().toLocaleLowerCase("pt-BR");
  return state.products.filter((product) => { const categoryMatches = state.category === "Todos" || product.categoria === state.category; const text = [product.nome, product.marca, product.codigo, product.categoria, ...product.variacoes.map((v) => v.sku)].join(" ").toLocaleLowerCase("pt-BR"); return categoryMatches && (!term || text.includes(term)); });
}
function renderCategories() { if (!ui.categories) return; const categories = [...new Set(state.products.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")); ui.categories.innerHTML = ["Todos", ...categories].map((category) => `<button class="filter-chip ${category === state.category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join(""); }
function renderCatalog() {
  renderCategories(); if (!ui.products) return; const products = filteredProducts();
  ui.products.innerHTML = products.length ? products.map((product) => { const stock = availableStock(product); return `<button class="pdv-product" type="button" data-product-id="${escapeHtml(product.id)}" ${stock <= 0 ? "disabled" : ""}><span><span class="pdv-product-top"><span class="badge">${escapeHtml(product.marca || product.categoria || "Produto")}</span><span class="badge ${stock <= 3 ? "badge-danger" : "badge-success"}">${stock} un</span></span><h3>${escapeHtml(product.nome)}</h3><p>${escapeHtml(product.codigo || product.categoria)}</p></span><span class="pdv-product-price"><strong>${formatMoney(productPrice(product))}</strong><span aria-hidden="true">＋</span></span></button>`; }).join("") : `<div class="empty-state" style="grid-column:1/-1;"><strong>Nenhum produto encontrado</strong><span>Altere a busca ou a categoria.</span></div>`;
}
function addToCart(product, variant) { const key = cartKey(product.id, variant.id); const existing = state.cart.find((item) => item.key === key); if (existing) { if (existing.quantidade >= variant.estoque) return toast("Limite de estoque atingido.", "error"); existing.quantidade += 1; } else state.cart.push({ key, produto_id: product.id, nome: product.nome, codigo: product.codigo, variacao_id: variant.id, cor: variant.cor, sku: variant.sku, preco: variant.preco || productPrice(product), quantidade: 1, estoque_disponivel: variant.estoque }); renderCart(); }
function chooseProduct(product, preferredVariant = null) { const variants = product.variacoes.filter((variant) => variant.estoque > 0); if (!variants.length) return toast("Produto sem estoque.", "error"); if (preferredVariant) return addToCart(product, preferredVariant); if (variants.length === 1) return addToCart(product, variants[0]); state.pendingProduct = product; $("variantTitle").textContent = product.nome; $("pdvVariantList").innerHTML = variants.map((variant) => `<button class="variant-option" type="button" data-pdv-variant="${variant.id}"><span class="color-dot" style="background:${variant.hex}"></span>${escapeHtml(variant.cor)} · ${variant.estoque} un · ${formatMoney(variant.preco)}</button>`).join(""); openModal("variantModal"); }
function renderCart() { const count = state.cart.reduce((sum, item) => sum + item.quantidade, 0); const total = cartSubtotal(); if (ui.itemCount) ui.itemCount.textContent = `${count} ${count === 1 ? "item" : "itens"}`; if (ui.subtotal) ui.subtotal.textContent = formatMoney(total); if (ui.total) ui.total.textContent = formatMoney(total); if (ui.mobileCount) ui.mobileCount.textContent = `${count} ${count === 1 ? "item" : "itens"}`; if (ui.mobileTotal) ui.mobileTotal.textContent = formatMoney(total); if ($("openPayment")) $("openPayment").disabled = !state.cart.length; if ($("saveBudget")) $("saveBudget").disabled = !state.cart.length; if (!ui.cart) return; ui.cart.innerHTML = state.cart.length ? state.cart.map((item) => `<article class="pdv-cart-item"><div><h4>${escapeHtml(item.nome)}</h4><p>${escapeHtml(item.cor)} · ${formatMoney(item.preco)} cada</p><div class="qty-control" style="margin-top:7px;"><button type="button" data-cart-key="${escapeHtml(item.key)}" data-delta="-1">−</button><span>${item.quantidade}</span><button type="button" data-cart-key="${escapeHtml(item.key)}" data-delta="1">+</button></div></div><div><div class="pdv-cart-price">${formatMoney(item.preco * item.quantidade)}</div><button class="remove-item" type="button" data-remove-cart="${escapeHtml(item.key)}">×</button></div></article>`).join("") : `<div class="empty-state"><strong>Carrinho vazio</strong><span>Toque em um produto ou leia o código.</span></div>`; }
function updateCartQuantity(key, delta) { const item = state.cart.find((entry) => entry.key === key); if (!item) return; const next = item.quantidade + delta; if (next > item.estoque_disponivel) return toast("Quantidade maior que o estoque disponível.", "error"); item.quantidade = next; state.cart = state.cart.filter((entry) => entry.quantidade > 0); renderCart(); }

function openModal(id) { const m = $(id); if (!m) return; m.classList.add("open"); m.setAttribute("aria-hidden", "false"); }
function closeModal(id) { const m = $(id); if (!m) return; m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); }
function updatePaymentFields() { const method = $("paymentMethod")?.value || "PIX"; if ($("cashFields")) $("cashFields").hidden = method !== "Dinheiro"; if ($("installmentField")) $("installmentField").hidden = method !== "Cartão de Crédito"; updatePaymentSummary(); }
function updatePaymentSummary() { if (!ui.paymentSummary) return; const subtotal = cartSubtotal(); const discount = Math.min(subtotal, Math.max(0, Number($("saleDiscount")?.value) || 0)); const total = subtotal - discount; const received = Number($("cashReceived")?.value) || 0; const method = $("paymentMethod")?.value || "PIX"; if ($("cashChange")) $("cashChange").textContent = formatMoney(Math.max(0, received - total)); ui.paymentSummary.innerHTML = `<div><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div><div><span>Desconto</span><strong>− ${formatMoney(discount)}</strong></div><div class="total"><span>Total</span><strong>${formatMoney(total)}</strong></div><div><span>Pagamento</span><strong>${escapeHtml(method)}</strong></div>`; }
async function showOperatorIdentity(inputId, outputId) { const input = $(inputId); const output = $(outputId); const code = String(input?.value || "").trim(); if (!output) return; if (!code) { output.textContent = "Digite o código do operador."; return; } try { const op = await resolveOperator(code); output.textContent = `#${op.code} · ${op.name}`; output.style.color = "var(--success)"; } catch (error) { output.textContent = friendlyError(error); output.style.color = "var(--danger)"; } }

async function loadRegisterState(promptIfClosed = false) { try { state.registerState = await getRegisterState(); renderCash(); if (!state.registerState?.open && promptIfClosed) openModal("registerModal"); } catch (error) { console.error(error); if (!state.registerState) state.registerState = { open: false, operators: [], sellers: [] }; renderCash(); } }
function pendingSeller(code) { return (state.registerState?.sellers || []).find((seller) => seller.operator_code === code && seller.pending_settlement); }
function fillDeclaredFromSeller(code) { const seller = pendingSeller(code); if (!seller) return; $("declaredCash").value = Number(seller.cash || 0).toFixed(2); $("declaredPix").value = Number(seller.pix || 0).toFixed(2); $("declaredCredit").value = Number(seller.credit || 0).toFixed(2); $("declaredDebit").value = Number(seller.debit || 0).toFixed(2); }
function renderCash() {
  const root = $("registerStatus"); if (!root) return; const r = state.registerState;
  if (!r?.open) { root.innerHTML = `<article class="card"><div class="card-body"><div class="empty-state"><strong>Caixa fechado</strong><span>Abra o caixa para vender, concluir pedido ou efetuar baixa.</span><button class="btn btn-primary" type="button" data-open-register style="margin-top:10px;">Abrir caixa</button></div></div></article>`; if ($("cashSellerList")) $("cashSellerList").innerHTML = ""; if ($("cashTargetCode")) $("cashTargetCode").innerHTML = '<option value="">Selecione</option>'; return; }
  root.innerHTML = `<article class="card"><div class="card-body" style="display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;align-items:center;"><div><span class="stat-label">Caixa aberto</span><h3 style="margin:4px 0;">#${escapeHtml(r.register.code)}</h3><small>Aberto por ${escapeHtml(r.register.opened_by_name || "—")} · ${formatDate(r.register.opened_at)}</small></div><div><span class="stat-label">Fundo inicial</span><strong style="display:block;font-size:20px;margin-top:4px;">${formatMoney(r.register.opening_float)}</strong></div></div></article>`;
  const sellers = r.sellers || []; $("cashSellerList").innerHTML = sellers.length ? sellers.map((s) => `<article class="card"><div class="card-body" style="display:grid;grid-template-columns:minmax(150px,1fr) repeat(5,minmax(90px,auto));gap:12px;align-items:center;overflow-x:auto;"><div><strong>#${escapeHtml(s.operator_code || "—")} · ${escapeHtml(s.operator_name || "Operador")}</strong><small style="display:block;margin-top:3px;">${s.sales_count} venda(s) · ${s.pending_settlement ? '<span class="badge badge-warning">Sangria pendente</span>' : '<span class="badge badge-success">Fechado</span>'}</small></div><div><span class="stat-label">Total</span><strong>${formatMoney(s.total)}</strong></div><div><span class="stat-label">Dinheiro</span><strong>${formatMoney(s.cash)}</strong></div><div><span class="stat-label">PIX</span><strong>${formatMoney(s.pix)}</strong></div><div><span class="stat-label">Crédito</span><strong>${formatMoney(s.credit)}</strong></div><div><span class="stat-label">Débito</span><strong>${formatMoney(s.debit)}</strong></div></div></article>`).join("") : `<article class="card"><div class="card-body"><div class="empty-state"><strong>Nenhuma venda neste caixa</strong><span>Quando alguém vender usando seu código, o resumo aparecerá aqui.</span></div></div></article>`;
  const pending = sellers.filter((s) => s.pending_settlement); $("cashTargetCode").innerHTML = `<option value="">Selecione</option>${pending.map((s) => `<option value="${escapeHtml(s.operator_code)}">#${escapeHtml(s.operator_code)} · ${escapeHtml(s.operator_name)}</option>`).join("")}`;
}

async function loadOnlineOrders(silent = false) { try { state.onlineOrders = await listOnlineOrders(false); renderOnlineOrders(); } catch (error) { console.error(error); if (!silent && $("onlineOrdersList")) $("onlineOrdersList").innerHTML = `<div class="empty-state"><strong>Falha ao carregar pedidos</strong><span>${escapeHtml(friendlyError(error))}</span></div>`; } }
function renderOnlineOrders() { const root = $("onlineOrdersList"); if (!root) return; root.innerHTML = state.onlineOrders.length ? state.onlineOrders.map((o) => `<article class="card"><div class="card-body" style="display:grid;gap:12px;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;"><div><span class="badge badge-warning">Pendente de baixa</span><h3 style="margin:8px 0 3px;">${escapeHtml(o.customer_name || "Cliente")}</h3><small>${escapeHtml(o.customer_phone || "")} · ${formatDate(o.created_at)}</small></div><strong style="font-size:18px;">${formatMoney(o.total)}</strong></div><div style="font-size:12px;line-height:1.6;">${(o.items || []).map((i) => `${i.quantity}× ${escapeHtml(i.product_name)}${i.variant_name ? ` · ${escapeHtml(i.variant_name)}` : ""}`).join("<br>")}</div><div style="display:flex;flex-wrap:wrap;gap:8px;"><span class="badge">${escapeHtml(o.fulfillment === "delivery" ? "Entrega" : "Retirada")}</span><span class="badge">${escapeHtml(o.payment_method || "Pagamento")}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-primary" type="button" data-complete-online="${o.id}">Concluir e dar baixa</button><button class="btn btn-secondary" type="button" data-cancel-online="${o.id}">Cancelar pedido</button></div></div></article>`).join("") : `<article class="card"><div class="card-body"><div class="empty-state"><strong>Nenhum pedido online pendente</strong><span>Novos pedidos aparecerão aqui automaticamente.</span></div></div></article>`; }
function renderStockManagement() { const root = $("stockManageList"); if (!root) return; const rows = state.products.flatMap((p) => p.variacoes.map((v) => ({ product: p, variant: v }))); root.innerHTML = rows.length ? `<div style="display:grid;gap:8px;">${rows.map(({ product, variant }) => `<div style="display:grid;grid-template-columns:minmax(180px,1fr) repeat(3,minmax(70px,auto)) auto;gap:12px;align-items:center;padding:12px;border:1px solid var(--border);border-radius:12px;overflow-x:auto;"><div><strong>${escapeHtml(product.nome)}</strong><small style="display:block;margin-top:3px;">${escapeHtml(variant.cor)} · ${escapeHtml(variant.sku || product.codigo || "")}</small></div><div><span class="stat-label">Físico</span><strong>${variant.stockOnHand}</strong></div><div><span class="stat-label">Reservado</span><strong>${variant.stockReserved}</strong></div><div><span class="stat-label">Disponível</span><strong>${variant.estoque}</strong></div><button class="btn btn-secondary" type="button" data-stock-adjust="${variant.id}" data-product-name="${escapeHtml(product.nome)}" data-variant-name="${escapeHtml(variant.cor)}">Ajustar</button></div>`).join("")}</div>` : `<div class="empty-state"><strong>Sem produtos</strong><span>Cadastre os produtos no Control.</span></div>`; }

async function loadQuotes() { try { state.quotes = await listQuotes(false); renderQuotes(); } catch (error) { console.error(error); if ($("savedBudgets")) $("savedBudgets").innerHTML = `<div class="empty-state"><strong>Falha ao carregar</strong><span>${escapeHtml(friendlyError(error))}</span></div>`; } }
function renderQuotes() { const root = $("savedBudgets"); if (!root) return; root.innerHTML = state.quotes.length ? state.quotes.map((q) => `<article style="padding:14px 0;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr auto;gap:12px;"><div><strong>${escapeHtml(q.customer_name || "Cliente Balcão")} · #${escapeHtml(q.code || "")}</strong><small style="display:block;margin-top:4px;">${formatDate(q.created_at)} · ${formatMoney(q.total)}</small></div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-primary" type="button" data-resume-quote="${q.id}">Retomar</button><button class="btn btn-secondary" type="button" data-cancel-quote="${q.id}">Cancelar</button></div></article>`).join("") : `<div class="empty-state"><strong>Nenhum orçamento salvo</strong><span>Use “Salvar” durante uma venda para guardar o carrinho.</span></div>`; }
function resumeQuote(id) { const quote = state.quotes.find((q) => q.id === id); if (!quote) return; const next = []; for (const item of quote.items || []) { const product = state.products.find((p) => p.id === item.product_id); const variant = product?.variacoes.find((v) => v.id === item.variant_id); if (!product || !variant || variant.estoque <= 0) continue; next.push({ key: cartKey(product.id, variant.id), produto_id: product.id, nome: product.nome, codigo: product.codigo, variacao_id: variant.id, cor: variant.cor, sku: variant.sku, preco: variant.preco, quantidade: Math.min(Number(item.quantity) || 1, variant.estoque), estoque_disponivel: variant.estoque }); } state.cart = next; state.activeQuoteId = quote.id; renderCart(); setView("sale"); toast(`Orçamento #${quote.code} carregado.`, "success"); }

function renderReceipt(sale) { if (!$("receiptContent")) return; $("receiptTitle").textContent = "Venda concluída"; $("receiptContent").innerHTML = `<div style="text-align:center;"><strong>${escapeHtml(state.config.storeName)}</strong><p>Venda #${escapeHtml(sale.codigo || "")}</p></div><hr><div>${sale.itens.map((i) => `<div style="display:flex;justify-content:space-between;gap:12px;margin:6px 0;"><span>${i.quantidade}× ${escapeHtml(i.nome)} · ${escapeHtml(i.cor)}</span><strong>${formatMoney(i.preco * i.quantidade)}</strong></div>`).join("")}</div><hr><div style="display:grid;gap:5px;"><div style="display:flex;justify-content:space-between;"><span>Total</span><strong>${formatMoney(sale.total)}</strong></div><div style="display:flex;justify-content:space-between;"><span>Pagamento</span><strong>${escapeHtml(sale.metodo)}</strong></div><div style="display:flex;justify-content:space-between;"><span>Operador</span><strong>#${escapeHtml(sale.operatorCode)} · ${escapeHtml(sale.operatorName)}</strong></div></div>`; }
function renderSettlementReceipt(result) { $("receiptTitle").textContent = "Sangria concluída"; $("receiptContent").innerHTML = `<div style="text-align:center;"><strong>Sangria #${escapeHtml(result.code)}</strong><p>Caixa #${escapeHtml(result.register_code)} · Operador #${escapeHtml(result.operator_code)} ${escapeHtml(result.operator_name)}</p></div><hr><div style="display:grid;gap:7px;"><div style="display:flex;justify-content:space-between;"><span>Vendas</span><strong>${result.sales_count}</strong></div><div style="display:flex;justify-content:space-between;"><span>Total</span><strong>${formatMoney(result.total)}</strong></div><div style="display:flex;justify-content:space-between;"><span>Dinheiro esperado</span><strong>${formatMoney(result.expected?.cash)}</strong></div><div style="display:flex;justify-content:space-between;"><span>PIX esperado</span><strong>${formatMoney(result.expected?.pix)}</strong></div><div style="display:flex;justify-content:space-between;"><span>Crédito esperado</span><strong>${formatMoney(result.expected?.credit)}</strong></div><div style="display:flex;justify-content:space-between;"><span>Débito esperado</span><strong>${formatMoney(result.expected?.debit)}</strong></div></div>${result.admin_override ? '<div class="auth-message show" style="margin-top:12px;">Sangria realizada por ADM em nome de outro operador.</div>' : ''}`; }

function wireEvents() {
  wireExternalLinks();
  document.addEventListener("click", async (event) => {
    const authSwitch = event.target.closest("[data-auth-view]"); if (authSwitch) return setAuthView(authSwitch.dataset.authView);
    const close = event.target.closest("[data-close-modal]"); if (close) return closeModal(close.dataset.closeModal);
    const view = event.target.closest("[data-view]"); if (view) return setView(view.dataset.view);
    const category = event.target.closest("[data-category]"); if (category) { state.category = category.dataset.category; return renderCatalog(); }
    const productButton = event.target.closest("[data-product-id]"); if (productButton) { const product = state.products.find((p) => p.id === productButton.dataset.productId); if (product) chooseProduct(product); return; }
    const variant = event.target.closest("[data-pdv-variant]"); if (variant && state.pendingProduct) { const chosen = state.pendingProduct.variacoes.find((v) => v.id === variant.dataset.pdvVariant); if (chosen) addToCart(state.pendingProduct, chosen); closeModal("variantModal"); state.pendingProduct = null; return; }
    const delta = event.target.closest("[data-delta]"); if (delta) return updateCartQuantity(delta.dataset.cartKey, Number(delta.dataset.delta));
    const remove = event.target.closest("[data-remove-cart]"); if (remove) { state.cart = state.cart.filter((i) => i.key !== remove.dataset.removeCart); return renderCart(); }
    const openReg = event.target.closest("[data-open-register]"); if (openReg) return openModal("registerModal");
    const complete = event.target.closest("[data-complete-online]"); if (complete) { if (!state.registerState?.open) return openModal("registerModal"); $("onlineOrderId").value = complete.dataset.completeOnline; $("onlineOperatorCode").value = ""; $("onlineCompleteNote").value = ""; $("onlineOperatorIdentity").textContent = "Digite o código do operador."; return openModal("onlineCompleteModal"); }
    const cancelOnline = event.target.closest("[data-cancel-online]"); if (cancelOnline) { if (!confirm("Cancelar este pedido e liberar a reserva de estoque?")) return; try { await cancelOnlineOrder(cancelOnline.dataset.cancelOnline, "Cancelado no PDV"); toast("Pedido cancelado e reserva liberada.", "success"); await Promise.all([loadOnlineOrders(), loadCatalog(true)]); } catch (error) { toast(friendlyError(error), "error"); } return; }
    const stock = event.target.closest("[data-stock-adjust]"); if (stock) { $("stockVariantId").value = stock.dataset.stockAdjust; $("stockVariantLabel").textContent = `${stock.dataset.productName} · ${stock.dataset.variantName}`; $("stockDelta").value = ""; $("stockReason").value = ""; $("stockNote").value = ""; $("stockOperatorCode").value = ""; $("stockOperatorIdentity").textContent = "Digite o código do operador."; return openModal("stockAdjustModal"); }
    const resume = event.target.closest("[data-resume-quote]"); if (resume) return resumeQuote(resume.dataset.resumeQuote);
    const cancelQ = event.target.closest("[data-cancel-quote]"); if (cancelQ) { if (!confirm("Cancelar este orçamento?")) return; try { await cancelQuote(cancelQ.dataset.cancelQuote); await loadQuotes(); toast("Orçamento cancelado.", "success"); } catch (error) { toast(friendlyError(error), "error"); } return; }
  });

  $("loginView")?.addEventListener("submit", async (event) => { event.preventDefault(); const btn = $("loginButton"); authMessage("loginMessage", ""); setBusy(btn, true, "Entrando…"); try { const session = await signIn($("loginEmail").value.trim(), $("loginPassword").value); await resolveSession(session); } catch (error) { authMessage("loginMessage", friendlyError(error), true); } finally { setBusy(btn, false); } });
  $("requestView")?.addEventListener("submit", async (event) => { event.preventDefault(); const btn = $("requestButton"); setBusy(btn, true, "Enviando…"); try { const session = await requestStaffAccess({ fullName: $("requestName").value.trim(), email: $("requestEmail").value.trim(), password: $("requestPassword").value }); await resolveSession(session); } catch (error) { authMessage("requestMessage", friendlyError(error), true); } finally { setBusy(btn, false); } });
  $("resetView")?.addEventListener("submit", async (event) => { event.preventDefault(); const btn = $("resetButton"); setBusy(btn, true, "Enviando…"); try { await resetPassword($("resetEmail").value.trim()); authMessage("resetMessage", "Link enviado. Verifique seu e-mail."); } catch (error) { authMessage("resetMessage", friendlyError(error), true); } finally { setBusy(btn, false); } });
  ["pendingLogout", "deniedLogout", "logoutButton", "mobileLogout"].forEach((id) => $(id)?.addEventListener("click", async () => { await signOut(); }));
  $("productSearch")?.addEventListener("input", debounce((event) => { state.search = event.target.value; renderCatalog(); }, 100));
  $("scannerInput")?.addEventListener("keydown", (event) => { if (event.key !== "Enter") return; event.preventDefault(); const code = event.currentTarget.value.trim().toLowerCase(); if (!code) return; const product = state.products.find((p) => p.codigo.toLowerCase() === code || p.variacoes.some((v) => v.sku.toLowerCase() === code)); if (!product) return toast("Código não encontrado.", "error"); const variant = product.variacoes.find((v) => v.sku.toLowerCase() === code); chooseProduct(product, variant || null); event.currentTarget.value = ""; });
  $("openMobileCart")?.addEventListener("click", () => ui.checkout?.classList.add("mobile-open")); $("closeMobileCart")?.addEventListener("click", () => ui.checkout?.classList.remove("mobile-open"));
  $("saveBudget")?.addEventListener("click", () => { if (state.cart.length) openModal("budgetModal"); });
  $("budgetForm")?.addEventListener("submit", async (event) => { event.preventDefault(); if (!state.cart.length) return; const btn = event.submitter; setBusy(btn, true, "Salvando…"); try { const result = await createQuote({ customer_name: $("budgetName").value.trim(), items: state.cart.map((i) => ({ variant_id: i.variacao_id, quantity: i.quantidade })) }); toast(`Orçamento #${result.code} salvo.`, "success"); closeModal("budgetModal"); $("budgetForm").reset(); } catch (error) { toast(friendlyError(error), "error"); } finally { setBusy(btn, false); } });

  $("openPayment")?.addEventListener("click", () => { if (!state.cart.length) return; if (!state.registerState?.open) return openModal("registerModal"); $("saleDiscount").value = "0"; $("cashReceived").value = ""; $("saleOperatorCode").value = ""; $("saleOperatorIdentity").textContent = "Digite o código do operador."; updatePaymentFields(); openModal("paymentModal"); });
  $("paymentMethod")?.addEventListener("change", updatePaymentFields); $("saleDiscount")?.addEventListener("input", updatePaymentSummary); $("cashReceived")?.addEventListener("input", updatePaymentSummary); $("saleOperatorCode")?.addEventListener("input", debounce(() => showOperatorIdentity("saleOperatorCode", "saleOperatorIdentity"), 250));
  $("paymentForm")?.addEventListener("submit", async (event) => { event.preventDefault(); if (!state.cart.length) return; const btn = $("finishSale"); const subtotal = cartSubtotal(); const discount = Math.min(subtotal, Math.max(0, Number($("saleDiscount").value) || 0)); const total = subtotal - discount; const method = $("paymentMethod").value; const received = Number($("cashReceived").value) || 0; const operatorCode = $("saleOperatorCode").value.trim(); if (!operatorCode) return toast("Informe o código de quem está vendendo.", "error"); if (method === "Dinheiro" && received < total) return toast("O valor recebido é menor que o total.", "error"); const payload = { operator_code: operatorCode, customer_name: "Cliente Balcão", discount, payment_method: method, payment_meta: { installments: method === "Cartão de Crédito" ? Number($("installments").value) : 1, cash_received: method === "Dinheiro" ? received : total, change: method === "Dinheiro" ? Math.max(0, received - total) : 0 }, quote_id: state.activeQuoteId || null, items: state.cart.map((item) => ({ variant_id: item.variacao_id, quantity: item.quantidade })) }; setBusy(btn, true, "Registrando…"); try { const result = await createSale(payload); state.lastSale = { codigo: result.code, itens: state.cart.map((item) => ({ ...item })), subtotal, desconto: discount, total: Number(result.total ?? total), metodo: method, troco: payload.payment_meta.change, operatorCode: result.operator_code, operatorName: result.operator_name }; renderReceipt(state.lastSale); state.cart = []; state.activeQuoteId = null; renderCart(); closeModal("paymentModal"); openModal("receiptModal"); await Promise.all([loadCatalog(true), loadRegisterState(false)]); } catch (error) { toast(friendlyError(error), "error"); } finally { setBusy(btn, false); } });

  $("registerForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const btn = $("openRegisterButton"); setBusy(btn, true, "Abrindo…"); try { const result = await openRegister($("openingFloat").value); closeModal("registerModal"); toast(result.already_open ? `Caixa #${result.code} já estava aberto.` : `Caixa #${result.code} aberto.`, "success"); await loadRegisterState(false); } catch (error) { toast(friendlyError(error), "error"); } finally { setBusy(btn, false); } });
  $("onlineOperatorCode")?.addEventListener("input", debounce(() => showOperatorIdentity("onlineOperatorCode", "onlineOperatorIdentity"), 250));
  $("onlineCompleteForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const btn = $("finishOnlineOrder"); setBusy(btn, true, "Concluindo…"); try { const result = await completeOnlineOrder($("onlineOrderId").value, $("onlineOperatorCode").value.trim(), $("onlineCompleteNote").value); closeModal("onlineCompleteModal"); toast(`Pedido concluído por #${result.operator_code} ${result.operator_name}. Estoque baixado.`, "success"); await Promise.all([loadOnlineOrders(), loadCatalog(true), loadRegisterState(false)]); } catch (error) { toast(friendlyError(error), "error"); } finally { setBusy(btn, false); } });
  $("stockOperatorCode")?.addEventListener("input", debounce(() => showOperatorIdentity("stockOperatorCode", "stockOperatorIdentity"), 250));
  $("stockAdjustForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const btn = $("finishStockAdjust"); const delta = Number($("stockDelta").value); if (!Number.isInteger(delta) || delta === 0) return toast("Informe uma quantidade inteira diferente de zero.", "error"); setBusy(btn, true, "Registrando…"); try { const result = await adjustStock($("stockOperatorCode").value.trim(), $("stockVariantId").value, delta, $("stockReason").value.trim(), $("stockNote").value); closeModal("stockAdjustModal"); toast(`${delta > 0 ? "Entrada" : "Baixa"} registrada por #${result.operator_code} ${result.operator_name}.`, "success"); await loadCatalog(true); } catch (error) { toast(friendlyError(error), "error"); } finally { setBusy(btn, false); } });
  $("cashActorCode")?.addEventListener("input", debounce(() => showOperatorIdentity("cashActorCode", "cashActorIdentity"), 250)); $("cashTargetCode")?.addEventListener("change", (event) => fillDeclaredFromSeller(event.target.value));
  $("cashForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const btn = $("finishOperatorCash"); setBusy(btn, true, "Fechando…"); try { const result = await closeOperatorCash({ actorCode: $("cashActorCode").value.trim(), targetCode: $("cashTargetCode").value, cash: $("declaredCash").value, pix: $("declaredPix").value, credit: $("declaredCredit").value, debit: $("declaredDebit").value, fiscalDocument: $("fiscalDocument").value.trim(), notes: $("cashNotes").value }); renderSettlementReceipt(result); openModal("receiptModal"); toast(`Sangria #${result.code} concluída.`, "success"); $("cashForm").reset(); await loadRegisterState(false); } catch (error) { toast(friendlyError(error), "error"); } finally { setBusy(btn, false); } });
  $("closeRegisterForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const btn = $("finishRegister"); setBusy(btn, true, "Fechando…"); try { const result = await closeRegister($("registerCloseCode").value.trim(), $("registerCloseNotes").value); toast(`Caixa #${result.code} fechado por #${result.closed_by_code}.`, "success"); $("closeRegisterForm").reset(); await loadRegisterState(false); openModal("registerModal"); } catch (error) { toast(friendlyError(error), "error"); } finally { setBusy(btn, false); } });
  $("refreshOnlineOrders")?.addEventListener("click", () => loadOnlineOrders()); $("refreshStock")?.addEventListener("click", () => loadCatalog()); $("refreshCash")?.addEventListener("click", () => loadRegisterState(false)); $("printReceipt")?.addEventListener("click", () => window.print());
}
function startClock() { const tick = () => { if ($("liveClock")) $("liveClock").textContent = new Date().toLocaleTimeString("pt-BR"); }; tick(); setInterval(tick, 1000); }

wireEvents(); startClock(); renderCart(); renderCatalog();
onAuthChange((_event, session) => resolveSession(session));
getSession().then(resolveSession).catch((error) => { console.error(error); authMessage("loginMessage", friendlyError(error), true); setAuthView("loginView"); });
