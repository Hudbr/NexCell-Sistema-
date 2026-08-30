import {
  debounce, escapeHtml, formatDate, formatMoney, setBusy, toast,
} from "../assets/js/utils.js";
import {
  cancelQuote, createQuote, createSale, getOperationalProfile, getSession,
  getStorefrontSettings, listCatalog, listQuotes, onAuthChange,
  requestStaffAccess, resetPassword, signIn, signOut,
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
  activeQuoteId: null,
  category: "Todos",
  search: "",
  pendingProduct: null,
  refreshTimer: null,
  config: { storeName: "NexCell", phone: "", footer: "Obrigado pela preferência!" },
};

const ui = {
  auth: $("authScreen"),
  workspace: $("workspace"),
  products: $("pdvProducts"),
  categories: $("pdvCategories"),
  cart: $("saleCart"),
  itemCount: $("saleItemCount"),
  subtotal: $("saleSubtotal"),
  total: $("saleTotal"),
  mobileCount: $("mobileCartCount"),
  mobileTotal: $("mobileCartTotal"),
  checkout: $("checkoutPanel"),
  paymentSummary: $("paymentSummary"),
};

function wireExternalLinks() {
  document.querySelectorAll('a[href="../store/"]').forEach((link) => { link.href = STORE_URL; });
  document.querySelectorAll('a[href="../control/"]').forEach((link) => { link.href = CONTROL_URL; });
  $("requestPassword")?.setAttribute("minlength", "8");
}

function setAuthView(viewId) {
  ["loginView", "requestView", "resetView", "pendingView", "deniedView"].forEach((id) => {
    $(id).hidden = id !== viewId;
  });
}

function authMessage(id, message, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = error ? "var(--danger)" : "#475467";
  el.classList.toggle("show", Boolean(message));
}

function friendlyError(error) {
  const raw = String(error?.message || "").toLowerCase();
  if (raw.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (raw.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (raw.includes("permission denied")) return "Seu perfil não possui permissão para esta ação.";
  if (raw.includes("already") || raw.includes("registered")) return "Este e-mail já possui cadastro. Tente entrar.";
  if (raw.includes("rate limit") || raw.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (raw.includes("fetch") || raw.includes("network")) return "Falha de conexão. Verifique sua internet.";
  return error?.message || "Não foi possível concluir a operação.";
}

function hasPermission(code) {
  const p = state.profile;
  if (!p) return false;
  if (p.is_root_owner || p.role === "owner") return true;
  const permissions = p.permissions || {};
  if (Array.isArray(permissions)) return permissions.includes("*") || permissions.includes(code);
  return permissions["*"] === true || permissions["*"] === "true" ||
    permissions[code] === true || permissions[code] === "true";
}

function normalizeCatalog(rows) {
  return rows.map((row) => {
    const variants = Array.isArray(row.variants) ? row.variants.map((v) => ({
      id: v.variant_id,
      cor: v.name || [v.option_1, v.option_2].filter(Boolean).join(" · ") || "Padrão",
      sku: v.sku || "",
      estoque: Math.max(0, Number(v.available_stock) || 0),
      preco: Number(v.price) || 0,
      hex: "#94a3b8",
    })) : [];
    const firstPrice = variants.find((v) => v.preco > 0)?.preco || 0;
    return {
      id: row.product_id,
      nome: row.product_name || "Produto",
      marca: row.brand || "",
      categoria: row.category || "Outros",
      descricao: row.description || "",
      codigo: row.product_code || "",
      preco: firstPrice,
      variacoes: variants,
    };
  });
}

function availableStock(product) {
  return product.variacoes.reduce((sum, variant) => sum + variant.estoque, 0);
}

function productPrice(product) {
  const prices = product.variacoes.filter((v) => v.preco > 0).map((v) => v.preco);
  return prices.length ? Math.min(...prices) : product.preco || 0;
}

function deactivate() {
  ui.workspace.classList.remove("ready");
  ui.auth.style.display = "grid";
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = null;
  state.products = [];
  state.cart = [];
  state.activeQuoteId = null;
  renderCart();
}

async function loadConfig() {
  try {
    const cfg = await getStorefrontSettings();
    if (!cfg) return;
    state.config.storeName = cfg.store_name || state.config.storeName;
    state.config.phone = cfg.whatsapp || "";
    state.config.footer = cfg.footer_text || state.config.footer;
  } catch (error) {
    console.warn("Configuração indisponível", error);
  }
}

function renderProfile() {
  const p = state.profile;
  if (!p) return;
  const labels = {
    "pdv.sell": "Vender no PDV",
    "pdv.sales.read": "Ver vendas",
    "pdv.online_orders.resolve": "Pedidos online",
    "pdv.sales.cancel": "Cancelar vendas",
    "pdv.settlement.manage": "Sangria e acerto",
    "control.access": "Acessar Control",
  };
  const badges = Object.entries(labels)
    .filter(([code]) => hasPermission(code))
    .map(([, label]) => `<span class="badge badge-success">${escapeHtml(label)}</span>`)
    .join(" ");
  $("profileSummary").innerHTML = `
    <div style="display:grid;gap:12px;font-size:11px;">
      <div><span class="stat-label">Nome</span><strong style="display:block;margin-top:4px;">${escapeHtml(p.full_name || "—")}</strong></div>
      <div><span class="stat-label">E-mail</span><strong style="display:block;margin-top:4px;">${escapeHtml(state.user?.email || p.email || "—")}</strong></div>
      <div><span class="stat-label">Cargo</span><strong style="display:block;margin-top:4px;text-transform:capitalize;">${escapeHtml(p.role || "colaborador")}</strong></div>
      <div><span class="stat-label">Permissões</span><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;">${badges || '<span class="badge badge-warning">Acesso operacional</span>'}</div></div>
    </div>`;
}

async function activate() {
  ui.auth.style.display = "none";
  ui.workspace.classList.add("ready");
  const name = state.profile?.full_name || state.user?.email?.split("@")[0] || "Operador";
  $("userName").textContent = name;
  $("userRole").textContent = state.profile?.role || "colaborador";
  $("userAvatar").textContent = name[0]?.toUpperCase() || "N";
  ["controlLink", "profileControlLink"].forEach((id) => {
    const link = $(id);
    link.hidden = !state.profile?.can_control;
    link.href = CONTROL_URL;
  });
  renderProfile();
  await Promise.allSettled([loadConfig(), loadCatalog()]);
  state.refreshTimer = setInterval(() => {
    if (!document.hidden) loadCatalog(true);
  }, 30000);
}

let sessionResolution = 0;
async function resolveSession(session) {
  const token = ++sessionResolution;
  deactivate();
  if (!session?.user) {
    state.user = null;
    state.profile = null;
    setAuthView("loginView");
    return;
  }
  state.user = session.user;
  try {
    const profile = await getOperationalProfile();
    if (token !== sessionResolution) return;
    state.profile = profile;
    if (!profile?.staff || profile.approval_status === "pending") {
      setAuthView("pendingView");
      return;
    }
    if (!profile.active || profile.approval_status === "rejected" || !profile.can_pdv) {
      setAuthView("deniedView");
      return;
    }
    await activate();
  } catch (error) {
    console.error(error);
    authMessage("loginMessage", "Não foi possível carregar seu perfil de acesso.", true);
    setAuthView("loginView");
  }
}

async function loadCatalog(silent = false) {
  try {
    state.products = normalizeCatalog(await listCatalog());
    renderCatalog();
  } catch (error) {
    console.error(error);
    if (!silent) {
      ui.products.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><strong>Falha ao carregar o estoque</strong><span>${escapeHtml(friendlyError(error))}</span></div>`;
    }
  }
}

function filteredProducts() {
  const term = state.search.trim().toLocaleLowerCase("pt-BR");
  return state.products.filter((product) => {
    const categoryMatches = state.category === "Todos" || product.categoria === state.category;
    const text = [product.nome, product.marca, product.codigo, product.categoria]
      .join(" ").toLocaleLowerCase("pt-BR");
    return categoryMatches && (!term || text.includes(term));
  });
}

function renderCategories() {
  const categories = [...new Set(state.products.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  ui.categories.innerHTML = ["Todos", ...categories].map((category) => `
    <button class="filter-chip ${category === state.category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
}

function renderCatalog() {
  renderCategories();
  const products = filteredProducts();
  ui.products.innerHTML = products.length ? products.map((product) => {
    const stock = availableStock(product);
    return `<button class="pdv-product" type="button" data-product-id="${product.id}" ${stock <= 0 ? "disabled" : ""}>
      <span><span class="pdv-product-top"><span class="badge">${escapeHtml(product.marca || product.categoria || "Produto")}</span><span class="badge ${stock <= 3 ? "badge-danger" : "badge-success"}">${stock} un</span></span>
      <h3>${escapeHtml(product.nome)}</h3><p>${escapeHtml(product.codigo || product.categoria)}</p></span>
      <span class="pdv-product-price"><strong>${formatMoney(productPrice(product))}</strong><span aria-hidden="true">＋</span></span>
    </button>`;
  }).join("") : `<div class="empty-state" style="grid-column:1/-1;"><strong>Nenhum produto encontrado</strong><span>Altere a busca ou a categoria.</span></div>`;
}

function cartKey(productId, variantId) { return `${productId}::${variantId}`; }

function addToCart(product, variant) {
  const key = cartKey(product.id, variant.id);
  const existing = state.cart.find((item) => item.key === key);
  if (existing) {
    if (existing.quantidade >= variant.estoque) return toast("Limite de estoque atingido.", "error");
    existing.quantidade += 1;
  } else {
    state.cart.push({
      key, produto_id: product.id, nome: product.nome, codigo: product.codigo,
      variacao_id: variant.id, cor: variant.cor, sku: variant.sku,
      preco: variant.preco || productPrice(product), quantidade: 1, estoque_disponivel: variant.estoque,
    });
  }
  renderCart();
}

function chooseProduct(product, preferredVariant = null) {
  const variants = product.variacoes.filter((variant) => variant.estoque > 0);
  if (!variants.length) return toast("Produto sem estoque.", "error");
  if (preferredVariant) return addToCart(product, preferredVariant);
  if (variants.length === 1) return addToCart(product, variants[0]);
  state.pendingProduct = product;
  $("variantTitle").textContent = product.nome;
  $("pdvVariantList").innerHTML = variants.map((variant) => `
    <button class="variant-option" type="button" data-pdv-variant="${variant.id}">
      <span class="color-dot" style="background:${variant.hex}"></span>${escapeHtml(variant.cor)} · ${variant.estoque} un · ${formatMoney(variant.preco)}
    </button>`).join("");
  openModal("variantModal");
}

function cartSubtotal() { return state.cart.reduce((sum, item) => sum + item.preco * item.quantidade, 0); }

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantidade, 0);
  const total = cartSubtotal();
  ui.itemCount.textContent = `${count} ${count === 1 ? "item" : "itens"}`;
  ui.subtotal.textContent = formatMoney(total);
  ui.total.textContent = formatMoney(total);
  ui.mobileCount.textContent = `${count} ${count === 1 ? "item" : "itens"}`;
  ui.mobileTotal.textContent = formatMoney(total);
  $("openPayment").disabled = !state.cart.length;
  $("saveBudget").disabled = !state.cart.length;
  ui.cart.innerHTML = state.cart.length ? state.cart.map((item) => `
    <article class="pdv-cart-item"><div><h4>${escapeHtml(item.nome)}</h4><p>${escapeHtml(item.cor)} · ${formatMoney(item.preco)} cada</p>
    <div class="qty-control" style="margin-top:7px;"><button type="button" data-cart-key="${escapeHtml(item.key)}" data-delta="-1">−</button><span>${item.quantidade}</span><button type="button" data-cart-key="${escapeHtml(item.key)}" data-delta="1">+</button></div></div>
    <div><div class="pdv-cart-price">${formatMoney(item.preco * item.quantidade)}</div><button class="remove-item" type="button" data-remove-cart="${escapeHtml(item.key)}">×</button></div></article>`).join("") : `<div class="empty-state"><strong>Carrinho vazio</strong><span>Toque em um produto ou leia o código de barras.</span></div>`;
}

function updateCartQuantity(key, delta) {
  const item = state.cart.find((entry) => entry.key === key);
  if (!item) return;
  const next = item.quantidade + delta;
  if (next > item.estoque_disponivel) return toast("Quantidade maior que o estoque disponível.", "error");
  item.quantidade = next;
  state.cart = state.cart.filter((entry) => entry.quantidade > 0);
  renderCart();
}

function openModal(id) { const m = $(id); m.classList.add("open"); m.setAttribute("aria-hidden", "false"); }
function closeModal(id) { const m = $(id); m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); }

function paymentTotal() {
  return Math.max(0, cartSubtotal() - Math.max(0, Number($("saleDiscount").value) || 0));
}

function updatePaymentSummary() {
  const subtotal = cartSubtotal();
  const discount = Math.min(subtotal, Math.max(0, Number($("saleDiscount").value) || 0));
  const total = subtotal - discount;
  ui.paymentSummary.innerHTML = `<div class="order-summary-row"><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div>
    <div class="order-summary-row"><span>Desconto</span><strong>− ${formatMoney(discount)}</strong></div><hr style="width:100%;border:0;border-top:1px solid var(--line);">
    <div class="order-summary-row"><strong>Total a receber</strong><strong>${formatMoney(total)}</strong></div>`;
  const received = Number($("cashReceived").value) || 0;
  $("cashChange").textContent = formatMoney(Math.max(0, received - total));
}

function updatePaymentFields() {
  const method = $("paymentMethod").value;
  $("cashFields").hidden = method !== "Dinheiro";
  $("installmentField").hidden = method !== "Cartão de Crédito";
  updatePaymentSummary();
}

function renderReceipt(sale) {
  $("receiptContent").innerHTML = `<h2>${escapeHtml(state.config.storeName)}</h2>${state.config.phone ? `<p>${escapeHtml(state.config.phone)}</p>` : ""}
    <hr class="receipt-rule"><div class="receipt-line"><span>Venda</span><strong>${escapeHtml(sale.codigo)}</strong></div>
    <div class="receipt-line"><span>Data</span><span>${formatDate(new Date())}</span></div><div class="receipt-line"><span>Operador</span><span>${escapeHtml(state.profile?.full_name || state.user?.email)}</span></div>
    <hr class="receipt-rule"><div class="receipt-items">${sale.itens.map((item) => `<div><strong>${item.quantidade}× ${escapeHtml(item.nome)}</strong><div class="receipt-line"><span>${escapeHtml(item.cor)} · ${formatMoney(item.preco)}</span><span>${formatMoney(item.preco * item.quantidade)}</span></div></div>`).join("")}</div>
    <hr class="receipt-rule"><div class="receipt-line"><span>Subtotal</span><span>${formatMoney(sale.subtotal)}</span></div><div class="receipt-line"><span>Desconto</span><span>− ${formatMoney(sale.desconto)}</span></div>
    <div class="receipt-line"><strong>TOTAL</strong><strong>${formatMoney(sale.total)}</strong></div><div class="receipt-line"><span>Pagamento</span><span>${escapeHtml(sale.metodo)}</span></div>
    ${sale.troco > 0 ? `<div class="receipt-line"><span>Troco</span><span>${formatMoney(sale.troco)}</span></div>` : ""}<hr class="receipt-rule"><p>${escapeHtml(state.config.footer)}</p>`;
}

async function renderQuotes() {
  const host = $("savedBudgets");
  host.innerHTML = `<div class="empty-state"><strong>Carregando orçamentos…</strong></div>`;
  try {
    state.quotes = await listQuotes(false);
    host.innerHTML = state.quotes.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nº</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Ações</th></tr></thead><tbody>${state.quotes.map((q) => `<tr><td><strong>${escapeHtml(q.code)}</strong></td><td>${escapeHtml(q.customer_name)}</td><td>${q.items?.length || 0}</td><td>${formatMoney(q.total)}</td><td><div class="table-actions"><button class="btn-mini" data-resume-quote="${q.id}">Retomar</button><button class="btn-mini" data-cancel-quote="${q.id}">Cancelar</button></div></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><strong>Nenhum orçamento aberto</strong><span>Monte um carrinho e toque em Salvar.</span></div>`;
  } catch (error) {
    host.innerHTML = `<div class="empty-state"><strong>Falha ao carregar orçamentos</strong><span>${escapeHtml(friendlyError(error))}</span></div>`;
  }
}

function resumeQuote(quote) {
  const cart = [];
  for (const item of quote.items || []) {
    const product = state.products.find((p) => p.id === item.product_id);
    const variant = product?.variacoes.find((v) => v.id === item.variant_id);
    if (!product || !variant || variant.estoque < Number(item.quantity || 1)) continue;
    cart.push({ key: cartKey(product.id, variant.id), produto_id: product.id, nome: product.nome, codigo: product.codigo, variacao_id: variant.id, cor: variant.cor, sku: variant.sku, preco: variant.preco, quantidade: Number(item.quantity || 1), estoque_disponivel: variant.estoque });
  }
  if (!cart.length) return toast("Os itens deste orçamento não estão mais disponíveis.", "error");
  state.cart = cart;
  state.activeQuoteId = quote.id;
  renderCart();
  switchView("sale");
  toast(`Orçamento ${quote.code} retomado.`, "success");
}

function switchView(view) {
  const meta = { sale: ["Nova venda", "Selecione os produtos e finalize o pagamento."], saved: ["Orçamentos salvos", "Retome atendimentos sem baixar estoque."], profile: ["Meu acesso", "Confira os dados e permissões desta sessão."] };
  document.querySelectorAll(".workspace-view").forEach((el) => el.classList.toggle("active", el.id === `view-${view}`));
  document.querySelectorAll("[data-view]").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  $("viewTitle").textContent = meta[view]?.[0] || meta.sale[0];
  $("viewSubtitle").textContent = meta[view]?.[1] || meta.sale[1];
  if (view === "saved") renderQuotes();
  ui.checkout.classList.remove("mobile-open");
}

function bindEvents() {
  $("loginView").addEventListener("submit", async (event) => {
    event.preventDefault(); const btn = $("loginButton"); authMessage("loginMessage", ""); setBusy(btn, true, "Entrando…");
    try { await signIn($("loginEmail").value.trim(), $("loginPassword").value); }
    catch (error) { authMessage("loginMessage", friendlyError(error), true); }
    finally { setBusy(btn, false); }
  });

  $("requestView").addEventListener("submit", async (event) => {
    event.preventDefault(); const btn = $("requestButton"); setBusy(btn, true, "Criando conta…"); authMessage("requestMessage", "");
    try {
      await requestStaffAccess({ fullName: $("requestName").value.trim(), email: $("requestEmail").value.trim(), password: $("requestPassword").value });
      setAuthView("pendingView");
    } catch (error) { authMessage("requestMessage", friendlyError(error), true); }
    finally { setBusy(btn, false); }
  });

  $("resetView").addEventListener("submit", async (event) => {
    event.preventDefault(); const btn = $("resetButton"); setBusy(btn, true, "Enviando…");
    try { await resetPassword($("resetEmail").value.trim()); authMessage("resetMessage", "Link enviado. Verifique seu e-mail."); }
    catch (error) { authMessage("resetMessage", friendlyError(error), true); }
    finally { setBusy(btn, false); }
  });

  document.querySelectorAll("[data-auth-view]").forEach((btn) => btn.addEventListener("click", () => setAuthView(btn.dataset.authView)));
  ["logoutButton", "mobileLogout", "pendingLogout", "deniedLogout"].forEach((id) => $(id).addEventListener("click", () => signOut().catch(() => {})));

  ui.products.addEventListener("click", (event) => { const btn = event.target.closest("[data-product-id]"); const product = state.products.find((p) => p.id === btn?.dataset.productId); if (product) chooseProduct(product); });
  ui.categories.addEventListener("click", (event) => { const btn = event.target.closest("[data-category]"); if (!btn) return; state.category = btn.dataset.category; renderCatalog(); });
  $("productSearch").addEventListener("input", debounce((event) => { state.search = event.target.value; renderCatalog(); }));
  $("scannerInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return; event.preventDefault(); const code = event.target.value.trim().toLowerCase(); if (!code) return;
    let product = state.products.find((p) => p.codigo.toLowerCase() === code); let variant = null;
    if (!product) { for (const p of state.products) { variant = p.variacoes.find((v) => v.sku.toLowerCase() === code); if (variant) { product = p; break; } } }
    if (!product) toast("Código não encontrado.", "error"); else chooseProduct(product, variant); event.target.value = "";
  });
  ui.cart.addEventListener("click", (event) => { const qty = event.target.closest("[data-cart-key]"); const remove = event.target.closest("[data-remove-cart]"); if (qty) updateCartQuantity(qty.dataset.cartKey, Number(qty.dataset.delta)); if (remove) { state.cart = state.cart.filter((item) => item.key !== remove.dataset.removeCart); renderCart(); } });
  $("pdvVariantList").addEventListener("click", (event) => { const btn = event.target.closest("[data-pdv-variant]"); if (!btn || !state.pendingProduct) return; const variant = state.pendingProduct.variacoes.find((v) => v.id === btn.dataset.pdvVariant); if (variant) addToCart(state.pendingProduct, variant); closeModal("variantModal"); });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", () => closeModal(btn.dataset.closeModal)));
  document.querySelectorAll(".modal").forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(modal.id); }));

  $("openPayment").addEventListener("click", () => { if (!state.cart.length) return; $("saleDiscount").value = "0"; $("cashReceived").value = ""; updatePaymentFields(); openModal("paymentModal"); });
  $("paymentMethod").addEventListener("change", updatePaymentFields); $("saleDiscount").addEventListener("input", updatePaymentSummary); $("cashReceived").addEventListener("input", updatePaymentSummary);

  $("paymentForm").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!state.cart.length) return; const btn = $("finishSale"); const subtotal = cartSubtotal(); const discount = Math.min(subtotal, Math.max(0, Number($("saleDiscount").value) || 0)); const total = subtotal - discount; const method = $("paymentMethod").value; const received = Number($("cashReceived").value) || 0;
    if (method === "Dinheiro" && received < total) return toast("O valor recebido é menor que o total.", "error");
    const payload = { customer_name: "Cliente Balcão", discount, payment_method: method, payment_meta: { installments: method === "Cartão de Crédito" ? Number($("installments").value) : 1, cash_received: method === "Dinheiro" ? received : total, change: method === "Dinheiro" ? Math.max(0, received - total) : 0 }, quote_id: state.activeQuoteId || null, items: state.cart.map((item) => ({ variant_id: item.variacao_id, quantity: item.quantidade })) };
    setBusy(btn, true, "Registrando…");
    try {
      const result = await createSale(payload); const sale = { codigo: result.code, itens: state.cart.map((item) => ({ ...item })), subtotal, desconto: discount, total: Number(result.total ?? total), metodo: method, troco: payload.payment_meta.change };
      renderReceipt(sale); state.cart = []; state.activeQuoteId = null; renderCart(); closeModal("paymentModal"); openModal("receiptModal"); ui.checkout.classList.remove("mobile-open"); toast("Venda registrada e estoque atualizado.", "success"); await loadCatalog(true);
    } catch (error) { console.error(error); toast(friendlyError(error), "error"); }
    finally { setBusy(btn, false); }
  });

  $("printReceipt").addEventListener("click", () => window.print());
  $("saveBudget").addEventListener("click", () => { if (!state.cart.length) return; $("budgetName").value = "Cliente Balcão"; openModal("budgetModal"); $("budgetName").select(); });
  $("budgetForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const btn = event.submitter; setBusy(btn, true, "Salvando…");
    try { const result = await createQuote({ customer_name: $("budgetName").value.trim() || "Cliente Balcão", items: state.cart.map((item) => ({ variant_id: item.variacao_id, quantity: item.quantidade })) }); closeModal("budgetModal"); toast(`Orçamento ${result.code} salvo.`, "success"); }
    catch (error) { toast(friendlyError(error), "error"); }
    finally { setBusy(btn, false); }
  });
  $("savedBudgets").addEventListener("click", async (event) => { const resume = event.target.closest("[data-resume-quote]"); const cancel = event.target.closest("[data-cancel-quote]"); if (resume) { const quote = state.quotes.find((q) => q.id === resume.dataset.resumeQuote); if (quote) resumeQuote(quote); } if (cancel) { try { await cancelQuote(cancel.dataset.cancelQuote); toast("Orçamento cancelado.", "success"); renderQuotes(); } catch (error) { toast(friendlyError(error), "error"); } } });

  document.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  $("openMobileCart").addEventListener("click", () => ui.checkout.classList.add("mobile-open")); $("closeMobileCart").addEventListener("click", () => ui.checkout.classList.remove("mobile-open"));
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") document.querySelectorAll(".modal.open").forEach((modal) => closeModal(modal.id)); });
}

function updateClock() { $("liveClock").textContent = new Date().toLocaleTimeString("pt-BR"); }

async function init() {
  wireExternalLinks();
  bindEvents();
  renderCart();
  updateClock();
  setInterval(updateClock, 1000);
  onAuthChange((_event, session) => resolveSession(session));
  try { await resolveSession(await getSession()); }
  catch (error) { console.error(error); authMessage("loginMessage", friendlyError(error), true); setAuthView("loginView"); }
}

init();
