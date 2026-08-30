import { escapeHtml, formatDate, formatMoney, setBusy, toast } from "../assets/js/utils.js";
import { cancelSale, getDashboard, getOperationalProfile, listSales } from "./supabase.js";

const $ = (id) => document.getElementById(id);
let profile = null;
let sales = [];
let dashboard = null;
let refreshTimer = null;

const canCancelSales = () => {
  const permissions = profile?.permissions || {};
  return Boolean(
    profile?.is_root_owner
    || ["owner", "admin"].includes(profile?.role)
    || permissions["*"] === true
    || permissions["pdv.sales.cancel"] === true
    || permissions["finance.write"] === true
  );
};

function mountZeroOpening() {
  const input = $("openingFloat");
  if (!input || input.type === "hidden") return;
  const field = input.closest(".field");
  if (!field) return;
  field.outerHTML = `
    <input id="openingFloat" type="hidden" value="0">
    <div class="auth-message show"><strong>Caixa inicia zerado.</strong><br>O saldo inicial é sempre R$ 0,00 e passa a refletir somente as vendas registradas.</div>`;
}

function mountNavigation() {
  const sideNav = document.querySelector(".side-nav");
  const profileButton = sideNav?.querySelector('[data-view="profile"]');
  if (sideNav && profileButton && !sideNav.querySelector('[data-view="dashboard"]')) {
    profileButton.insertAdjacentHTML("beforebegin", `
      <button class="side-link" type="button" data-view="dashboard"><span>📈</span>Resumo do PDV</button>
      <button class="side-link" type="button" data-view="history"><span>🧾</span>Histórico de vendas</button>`);
  }

  const mobileNav = document.querySelector(".mobile-nav");
  const mobileProfile = mobileNav?.querySelector('[data-view="profile"]');
  if (mobileNav && mobileProfile && !mobileNav.querySelector('[data-view="dashboard"]')) {
    mobileProfile.insertAdjacentHTML("beforebegin", `
      <button class="mobile-link" type="button" data-view="dashboard"><span>📈</span><span>Resumo</span></button>
      <button class="mobile-link" type="button" data-view="history"><span>🧾</span><span>Vendas</span></button>`);
  }
}

function mountViews() {
  const content = document.querySelector(".workspace-content");
  if (!content || $("view-dashboard")) return;
  content.insertAdjacentHTML("beforeend", `
    <section class="workspace-view" id="view-dashboard">
      <div class="view-head"><div><h2>Resumo do PDV</h2><p>Movimento das últimas 24 horas, pendências e estoque baixo.</p></div><button class="btn btn-secondary" id="refreshDashboard" type="button">Atualizar</button></div>
      <div id="pdvDashboard"></div>
    </section>
    <section class="workspace-view" id="view-history">
      <div class="view-head"><div><h2>Histórico de vendas</h2><p>Vendas presenciais e pedidos online já concluídos, com operador e situação da sangria.</p></div><button class="btn btn-secondary" id="refreshSales" type="button">Atualizar</button></div>
      <div id="salesHistory"></div>
    </section>`);

  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal" id="cancelSaleModal">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="cancelSaleTitle">
        <div class="modal-header"><h2 id="cancelSaleTitle">Cancelar venda</h2><button class="icon-btn" type="button" data-ops-close="cancelSaleModal">×</button></div>
        <form id="cancelSaleForm">
          <input id="cancelSaleId" type="hidden">
          <div class="modal-body">
            <div class="auth-message show">ADM e Financeiro podem cancelar uma venda mesmo após a sangria. O estoque é estornado quando aplicável e o cancelamento fica registrado na auditoria.</div>
            <div class="field"><label for="cancelSaleReason">Motivo do cancelamento</label><textarea class="input" id="cancelSaleReason" rows="4" minlength="3" required placeholder="Ex.: venda lançada em duplicidade"></textarea></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" type="button" data-ops-close="cancelSaleModal">Voltar</button><button class="btn btn-primary" id="confirmCancelSale" type="submit">Confirmar cancelamento</button></div>
        </form>
      </div>
    </div>`);
}

function setOpsTitle(view) {
  const meta = {
    dashboard: ["Resumo do PDV", "Vendas, pagamentos, pendências e estoque das últimas 24 horas."],
    history: ["Histórico de vendas", "Consulte vendas e cancelamentos registrados no sistema."],
  }[view];
  if (!meta) return;
  if ($("viewTitle")) $("viewTitle").textContent = meta[0];
  if ($("viewSubtitle")) $("viewSubtitle").textContent = meta[1];
}

function stat(label, value, hint = "") {
  return `<article class="card"><div class="card-body"><span class="stat-label">${escapeHtml(label)}</span><strong style="display:block;font-size:clamp(22px,3vw,32px);margin-top:8px;">${escapeHtml(String(value))}</strong>${hint ? `<small style="display:block;margin-top:5px;">${escapeHtml(hint)}</small>` : ""}</div></article>`;
}

function renderDashboard() {
  const root = $("pdvDashboard");
  if (!root) return;
  if (!dashboard) {
    root.innerHTML = `<div class="card"><div class="card-body"><div class="empty-state"><strong>Carregando resumo…</strong></div></div></div>`;
    return;
  }
  const mix = dashboard.payment_mix || {};
  const ranking = Array.isArray(dashboard.seller_ranking) ? dashboard.seller_ranking : [];
  const low = Array.isArray(dashboard.low_stock) ? dashboard.low_stock : [];
  root.innerHTML = `
    <div class="content-grid pdv-dashboard-grid">
      ${stat("Vendido em 24h", formatMoney(dashboard.sales_total || 0), `${Number(dashboard.sales_count || 0)} venda(s)`) }
      ${stat("Aguardando sangria", formatMoney(dashboard.pending_settlement_total || 0), `${Number(dashboard.pending_settlement_count || 0)} venda(s)`) }
      ${stat("Pedidos online pendentes", Number(dashboard.online_pending_count || 0), formatMoney(dashboard.online_pending_total || 0))}
      ${stat("Estoque baixo", low.length, "variações no limite configurado")}
    </div>
    <div class="content-grid" style="margin-top:16px;">
      <article class="card"><div class="card-head"><h3>Formas de pagamento</h3></div><div class="card-body pdv-metric-list">
        <div><span>Dinheiro</span><strong>${formatMoney(mix.cash || 0)}</strong></div>
        <div><span>PIX</span><strong>${formatMoney(mix.pix || 0)}</strong></div>
        <div><span>Crédito</span><strong>${formatMoney(mix.credit || 0)}</strong></div>
        <div><span>Débito</span><strong>${formatMoney(mix.debit || 0)}</strong></div>
      </div></article>
      <article class="card"><div class="card-head"><h3>Vendas por operador</h3></div><div class="card-body pdv-metric-list">${ranking.length ? ranking.map((r) => `<div><span>${escapeHtml(r.seller || "Operador")}</span><strong>${formatMoney(r.total || 0)} · ${Number(r.sales_count || 0)} venda(s)</strong></div>`).join("") : '<div class="empty-state"><span>Nenhuma venda no período.</span></div>'}</div></article>
    </div>
    <article class="card" style="margin-top:16px;"><div class="card-head"><h3>Estoque baixo</h3></div><div class="card-body pdv-metric-list">${low.length ? low.map((item) => `<div><span>${escapeHtml(item.product_name || "Produto")} · ${escapeHtml(item.variant_name || "Padrão")}</span><strong>${Number(item.available_stock || 0)} disponível(is)</strong></div>`).join("") : '<div class="empty-state"><span>Nenhum item no limite de estoque.</span></div>'}</div></article>`;
}

function saleItems(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `<details class="pdv-sale-items"><summary>${items.length} item(ns)</summary><div>${items.map((item) => `<div><span>${Number(item.quantity || 0)}× ${escapeHtml(item.product_name || "Produto")} · ${escapeHtml(item.variant_name || "Padrão")}</span><strong>${formatMoney(item.line_total || 0)}</strong></div>`).join("")}</div></details>`;
}

function renderSales() {
  const root = $("salesHistory");
  if (!root) return;
  if (!sales.length) {
    root.innerHTML = `<div class="card"><div class="card-body"><div class="empty-state"><strong>Nenhuma venda encontrada</strong><span>As vendas concluídas aparecerão aqui.</span></div></div></div>`;
    return;
  }
  root.innerHTML = `<div class="pdv-sales-list">${sales.map((sale) => {
    const canceled = sale.status === "canceled";
    const pending = sale.settlement_status === "pending";
    const mayCancel = canCancelSales() && !canceled && Boolean(sale.code);
    return `<article class="card pdv-sale-card"><div class="card-body">
      <div class="pdv-sale-head"><div><span class="badge ${canceled ? "badge-danger" : pending ? "badge-warning" : "badge-success"}">${canceled ? "Cancelada" : pending ? "Sangria pendente" : "Acertada"}</span><h3>Venda ${sale.code ? `#${escapeHtml(sale.code)}` : "online"}</h3><small>${formatDate(sale.created_at)}</small></div><strong class="pdv-sale-total">${formatMoney(sale.total || 0)}</strong></div>
      <div class="pdv-sale-meta"><span><b>Operador:</b> ${sale.operator_code ? `#${escapeHtml(sale.operator_code)} · ` : ""}${escapeHtml(sale.seller || "—")}</span><span><b>Pagamento:</b> ${escapeHtml(sale.payment_method || "—")}</span><span><b>Cliente:</b> ${escapeHtml(sale.customer_name || "Cliente Balcão")}</span></div>
      ${saleItems(sale.items)}
      ${mayCancel ? `<button class="btn btn-secondary pdv-cancel-sale" type="button" data-cancel-sale="${escapeHtml(sale.id)}">Cancelar venda</button>` : ""}
    </div></article>`;
  }).join("")}</div>`;
}

async function loadDashboard(silent = false) {
  try {
    dashboard = await getDashboard();
    renderDashboard();
  } catch (error) {
    console.error(error);
    if (!silent && $("pdvDashboard")) $("pdvDashboard").innerHTML = `<div class="card"><div class="card-body"><div class="empty-state"><strong>Não foi possível carregar o resumo</strong><span>${escapeHtml(error.message || "Tente novamente.")}</span></div></div></div>`;
  }
}

async function loadSales(silent = false) {
  try {
    sales = await listSales(false, 300);
    renderSales();
  } catch (error) {
    console.error(error);
    if (!silent && $("salesHistory")) $("salesHistory").innerHTML = `<div class="card"><div class="card-body"><div class="empty-state"><strong>Não foi possível carregar as vendas</strong><span>${escapeHtml(error.message || "Tente novamente.")}</span></div></div></div>`;
  }
}

function openCancelSale(id) {
  if (!canCancelSales()) return toast("Sua conta não possui permissão para cancelar vendas.", "error");
  $("cancelSaleId").value = id;
  $("cancelSaleReason").value = "";
  $("cancelSaleModal")?.classList.add("open");
  $("cancelSaleModal")?.setAttribute("aria-hidden", "false");
}

function closeOpsModal(id) {
  $(id)?.classList.remove("open");
  $(id)?.setAttribute("aria-hidden", "true");
}

function wireOperations() {
  document.addEventListener("click", (event) => {
    const view = event.target.closest("[data-view]")?.dataset.view;
    if (view === "dashboard") { setOpsTitle(view); loadDashboard(); }
    if (view === "history") { setOpsTitle(view); loadSales(); }
    const cancel = event.target.closest("[data-cancel-sale]");
    if (cancel) openCancelSale(cancel.dataset.cancelSale);
    const close = event.target.closest("[data-ops-close]");
    if (close) closeOpsModal(close.dataset.opsClose);
  });
  $("refreshDashboard")?.addEventListener("click", () => loadDashboard());
  $("refreshSales")?.addEventListener("click", () => loadSales());
  $("cancelSaleForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("confirmCancelSale");
    const reason = $("cancelSaleReason").value.trim();
    if (reason.length < 3) return toast("Informe o motivo do cancelamento.", "error");
    setBusy(button, true, "Cancelando…");
    try {
      const result = await cancelSale($("cancelSaleId").value, reason);
      closeOpsModal("cancelSaleModal");
      toast(result?.test_mode ? "Cancelamento simulado. Nada foi gravado." : "Venda cancelada e estoque estornado.", "success");
      await Promise.all([loadSales(true), loadDashboard(true)]);
    } catch (error) {
      toast(error.message || "Não foi possível cancelar a venda.", "error");
    } finally {
      setBusy(button, false);
    }
  });
}

async function bootOperations() {
  mountZeroOpening();
  mountNavigation();
  mountViews();
  wireOperations();
  try { profile = await getOperationalProfile(); } catch (error) { console.warn("Perfil operacional indisponível", error); }
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.hidden) return;
    if ($("view-dashboard")?.classList.contains("active")) loadDashboard(true);
    if ($("view-history")?.classList.contains("active")) loadSales(true);
  }, 20000);
}

bootOperations();
