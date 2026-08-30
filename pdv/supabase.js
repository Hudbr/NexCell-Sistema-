const SUPABASE_URL = "https://phhncvufnufroyifaghe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OqKmeAMX4B_9rAgFpOzwig_qwN3WZxL";
const SUPABASE_MODULE = "https://esm.sh/@supabase/supabase-js@2.57.4";
const STORE_LOGO = `${SUPABASE_URL}/functions/v1/nexcell-logo`;

function applyStoreBranding() {
  document.querySelectorAll(".brand-copy,.sidebar-brand-copy").forEach((node) => node.remove());
  document.querySelectorAll(".brand-mark").forEach((mark) => {
    mark.textContent = "";
    mark.style.width = "72px";
    mark.style.height = "58px";
    mark.style.padding = "0";
    mark.style.border = "0";
    mark.style.background = "transparent";
    mark.style.borderRadius = "0";
    mark.style.boxShadow = "none";
    const img = document.createElement("img");
    img.src = STORE_LOGO;
    img.alt = "Nexcell";
    img.decoding = "async";
    img.fetchPriority = "high";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.display = "block";
    mark.appendChild(img);
  });
}

function sanitizeReceiptIdentity(root) {
  if (!root) return;
  root.querySelectorAll("span").forEach((label) => {
    if (label.textContent.trim() !== "Operador") return;
    const strong = label.parentElement?.querySelector("strong");
    const match = strong?.textContent?.match(/#\s*([A-Za-z0-9_-]+)/);
    if (!match) return;
    const safeLabel = `#${match[1]}`;
    if (strong.textContent !== safeLabel) strong.textContent = safeLabel;
  });
  root.querySelectorAll("p").forEach((paragraph) => {
    const current = paragraph.textContent || "";
    const match = current.match(/^(.*?Operador\s*#\s*[A-Za-z0-9_-]+)/);
    if (match && current !== match[1]) paragraph.textContent = match[1];
  });
}

function applySangriaPolicy() {
  if (typeof document === "undefined") return;
  const actorInput = document.getElementById("cashActorCode");
  const targetInput = document.getElementById("cashTargetCode");
  if (actorInput && !document.getElementById("cashPassword")) {
    const actorField = actorInput.closest(".field");
    const row = actorInput.closest(".field-row");
    actorInput.required = false;
    actorInput.type = "hidden";
    actorInput.value = "";
    if (actorField) actorField.style.display = "none";
    const passwordField = document.createElement("div");
    passwordField.className = "field";
    passwordField.innerHTML = `<label for="cashPassword">Senha de quem está fazendo a sangria</label><input class="input" id="cashPassword" type="password" required autocomplete="current-password" placeholder="Digite sua senha"><small>A senha confirma a identidade da conta que está logada no PDV.</small>`;
    if (row) row.appendChild(passwordField);
    else targetInput?.closest(".field")?.insertAdjacentElement("afterend", passwordField);
  }

  const fiscalInput = document.getElementById("fiscalDocument");
  if (fiscalInput) {
    fiscalInput.required = false;
    fiscalInput.type = "hidden";
    fiscalInput.value = "";
    const fiscalField = fiscalInput.closest(".field");
    if (fiscalField) fiscalField.style.display = "none";
  }

  const receiptRoot = document.getElementById("receiptContent");
  if (receiptRoot && receiptRoot.dataset.identityPrivacy !== "1") {
    receiptRoot.dataset.identityPrivacy = "1";
    sanitizeReceiptIdentity(receiptRoot);
    const observer = new MutationObserver(() => sanitizeReceiptIdentity(receiptRoot));
    observer.observe(receiptRoot, { childList: true, subtree: true, characterData: true });
  }
}

function schedulePdvPolicy() {
  if (typeof document === "undefined") return;
  const run = () => setTimeout(applySangriaPolicy, 0);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}

let pendingRegisterCloseReceipt = null;
let registerCloseObserver = null;

function escapePdvHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function formatPdvMoney(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function formatPdvDay(value) {
  const parts = String(value || "").split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value || "hoje");
}

function operatorTotalsHtml(operators) {
  const rows = Array.isArray(operators) ? operators : [];
  if (!rows.length) return '<div style="padding:8px 0;color:#667085;">Nenhuma venda registrada.</div>';
  return rows.map((item) => `
    <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #eee;">
      <span><strong>#${escapePdvHtml(item.operator_code || "—")}</strong> · ${Number(item.sales_count || 0)} venda(s)</span>
      <strong>${formatPdvMoney(item.total)}</strong>
    </div>`).join("");
}

function presentRegisterCloseReceipt(data) {
  if (typeof document === "undefined" || !data) return false;
  const modal = document.getElementById("receiptModal");
  const root = document.getElementById("receiptContent");
  const title = document.getElementById("receiptTitle");
  if (!modal || !root || !title) return false;

  document.getElementById("registerModal")?.classList.remove("open");
  document.getElementById("registerModal")?.setAttribute("aria-hidden", "true");

  const register = data.register_summary || {};
  const day = data.day_summary || {};
  title.textContent = "Fechamento do caixa";
  root.innerHTML = `
    <div style="text-align:center;">
      <strong>Caixa #${escapePdvHtml(data.code || "")}</strong>
      <p>Fechamento concluído</p>
    </div>
    <hr>
    <section>
      <strong style="display:block;margin-bottom:7px;">Vendas deste caixa</strong>
      ${operatorTotalsHtml(register.operators)}
      <div style="display:flex;justify-content:space-between;gap:12px;padding-top:10px;font-size:15px;">
        <span>Total do caixa · ${Number(register.sales_count || 0)} venda(s)</span>
        <strong>${formatPdvMoney(register.total)}</strong>
      </div>
    </section>
    <hr>
    <section>
      <strong style="display:block;margin-bottom:7px;">Geral do dia · ${escapePdvHtml(formatPdvDay(day.date))}</strong>
      ${operatorTotalsHtml(day.operators)}
      <div style="display:flex;justify-content:space-between;gap:12px;padding-top:12px;font-size:17px;border-top:2px solid #111;margin-top:5px;">
        <span><strong>TOTAL GERAL DO DIA</strong><br><small>${Number(day.sales_count || 0)} venda(s), somando toda a equipe</small></span>
        <strong>${formatPdvMoney(day.total)}</strong>
      </div>
    </section>`;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  pendingRegisterCloseReceipt = null;
  return true;
}

function armRegisterCloseReceipt(data) {
  if (typeof document === "undefined" || !data) return;
  pendingRegisterCloseReceipt = data;
  if (!registerCloseObserver && document.body) {
    registerCloseObserver = new MutationObserver((mutations) => {
      if (!pendingRegisterCloseReceipt) return;
      const registerOpened = mutations.some((mutation) => mutation.target?.id === "registerModal" && mutation.target.classList?.contains("open"));
      if (registerOpened) presentRegisterCloseReceipt(pendingRegisterCloseReceipt);
    });
    registerCloseObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }
  setTimeout(() => {
    if (pendingRegisterCloseReceipt) presentRegisterCloseReceipt(pendingRegisterCloseReceipt);
  }, 1800);
}

applyStoreBranding();
schedulePdvPolicy();

let activeUserId = null;
let cachedProfile = null;
let cachedProfileUserId = null;
let profilePromise = null;
let profilePromiseUserId = null;

const clientPromise = import(SUPABASE_MODULE).then(({ createClient }) => createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
));

export async function getSupabase() { return clientPromise; }
function fail(error) { if (error) throw error; }

function rememberUser(session) {
  const nextUserId = session?.user?.id || null;
  if (nextUserId !== activeUserId) {
    activeUserId = nextUserId;
    cachedProfile = null;
    cachedProfileUserId = null;
    profilePromise = null;
    profilePromiseUserId = null;
  }
}

export async function getSession() {
  const client = await getSupabase();
  const { data, error } = await client.auth.getSession();
  fail(error); rememberUser(data.session); return data.session;
}

export function onAuthChange(callback) {
  let subscription = null; let disposed = false;
  getSupabase().then((client) => {
    if (disposed) return;
    const result = client.auth.onAuthStateChange((event, session) => {
      rememberUser(session);
      if (event === "INITIAL_SESSION") return;
      callback(event, session);
    });
    subscription = result?.data?.subscription || null;
  }).catch((error) => console.error("Falha ao iniciar autenticação", error));
  return { unsubscribe() { disposed = true; subscription?.unsubscribe?.(); } };
}

export async function signIn(email, password) {
  const client = await getSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  fail(error); rememberUser(data.session); return data.session;
}
export async function signOut() {
  const client = await getSupabase(); const { error } = await client.auth.signOut();
  fail(error); rememberUser(null);
}
export async function requestStaffAccess({ fullName, email, password }) {
  const client = await getSupabase();
  const { data, error } = await client.functions.invoke("staff-register", { body: { fullName, email, password } });
  fail(error); if (!data?.ok) throw new Error(data?.error || "Não foi possível criar o cadastro.");
  return signIn(email, password);
}
export async function resetPassword(email) {
  const client = await getSupabase(); const { error } = await client.auth.resetPasswordForEmail(email); fail(error);
}

export async function getOperationalProfile() {
  if (cachedProfile && cachedProfileUserId === activeUserId) return cachedProfile;
  if (profilePromise && profilePromiseUserId === activeUserId) return profilePromise;
  const userIdAtStart = activeUserId;
  profilePromiseUserId = userIdAtStart;
  profilePromise = (async () => {
    const client = await getSupabase();
    const { data, error } = await client.rpc("get_my_operational_profile");
    fail(error);
    if (activeUserId === userIdAtStart) { cachedProfile = data; cachedProfileUserId = userIdAtStart; }
    return data;
  })();
  try { return await profilePromise; }
  finally { if (profilePromiseUserId === userIdAtStart) { profilePromise = null; profilePromiseUserId = null; } }
}

export async function listCatalog() {
  const client = await getSupabase(); const { data, error } = await client.rpc("list_pdv_catalog"); fail(error);
  return Array.isArray(data) ? data : [];
}
export async function createSale(payload) {
  const client = await getSupabase(); const { data, error } = await client.rpc("create_pdv_sale", { payload }); fail(error); return data;
}
export async function listSales(onlyPendingSettlement = false, limit = 300) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("list_pdv_sales", { p_only_pending_settlement: Boolean(onlyPendingSettlement), p_limit: Number(limit) || 300 });
  fail(error); return Array.isArray(data) ? data : [];
}
export async function cancelSale(saleId, reason) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("cancel_pdv_sale", { p_sale_id: saleId, p_reason: String(reason || "").trim() });
  fail(error); return data;
}
export async function getDashboard(from = null, to = null) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("get_pdv_dashboard", { p_from: from, p_to: to });
  fail(error); return data || {};
}
export async function createQuote(payload) {
  const client = await getSupabase(); const { data, error } = await client.rpc("create_pdv_quote", { payload }); fail(error); return data;
}
export async function listQuotes(includeClosed = false) {
  const client = await getSupabase(); const { data, error } = await client.rpc("list_pdv_quotes", { p_include_closed: includeClosed }); fail(error);
  return Array.isArray(data) ? data : [];
}
export async function cancelQuote(quoteId) {
  const client = await getSupabase(); const { data, error } = await client.rpc("cancel_pdv_quote", { p_quote_id: quoteId }); fail(error); return data;
}

export async function openRegister() {
  const client = await getSupabase();
  const { data, error } = await client.rpc("open_pdv_register", { p_opening_float: 0 });
  fail(error); return data;
}
export async function getRegisterState() {
  const client = await getSupabase(); const { data, error } = await client.rpc("get_pdv_register_state"); fail(error); return data;
}
export async function resolveOperator(code) {
  const client = await getSupabase(); const { data, error } = await client.rpc("resolve_pdv_operator", { p_operator_code: String(code || "").trim() }); fail(error); return data;
}

async function verifyCurrentPassword(password) {
  const cleanPassword = String(password || "");
  if (!cleanPassword) throw new Error("Informe sua senha para confirmar a sangria.");
  const client = await getSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  fail(userError);
  const currentUser = userData?.user;
  if (!currentUser?.email || !currentUser?.id) throw new Error("Sessão inválida. Entre novamente no PDV.");

  const { createClient } = await import(SUPABASE_MODULE);
  const verifier = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ email: currentUser.email, password: cleanPassword });
  if (error) {
    if (String(error.message || "").toLowerCase().includes("invalid login credentials")) throw new Error("Senha incorreta.");
    throw error;
  }
  try {
    if (data?.user?.id !== currentUser.id) throw new Error("A senha não pertence à conta que está logada.");
  } finally {
    try { await verifier.auth.signOut(); } catch (_) { /* sessão temporária, sem persistência */ }
  }
}

export async function closeOperatorCash({ targetCode, cash, pix, credit, debit, notes }) {
  const password = typeof document !== "undefined" ? document.getElementById("cashPassword")?.value : "";
  await verifyCurrentPassword(password);
  const profile = await getOperationalProfile();
  const verifiedActorCode = String(profile?.operator_code || "").trim();
  if (!verifiedActorCode) throw new Error("Sua conta não possui código operacional válido.");
  const client = await getSupabase();
  const { data, error } = await client.rpc("close_operator_cash", {
    p_actor_code: verifiedActorCode,
    p_target_code: String(targetCode || verifiedActorCode).trim(),
    p_declared_cash: Number(cash) || 0,
    p_declared_pix: Number(pix) || 0,
    p_declared_card_credit: Number(credit) || 0,
    p_declared_card_debit: Number(debit) || 0,
    p_fiscal_document_number: null,
    p_notes: String(notes || "").trim() || null,
  });
  fail(error); return data;
}
export async function closeRegister(actorCode, notes = "") {
  const client = await getSupabase();
  const { data, error } = await client.rpc("close_pdv_register", { p_actor_code: String(actorCode || "").trim(), p_notes: String(notes || "").trim() || null });
  fail(error);
  armRegisterCloseReceipt(data);
  return data;
}

export async function listOnlineOrders(includeResolved = false) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("list_pdv_online_orders", { p_include_resolved: includeResolved });
  fail(error); return Array.isArray(data) ? data : [];
}
export async function completeOnlineOrder(orderId, operatorCode, note = "") {
  const client = await getSupabase();
  const { data, error } = await client.rpc("complete_online_order", { p_order_id: orderId, p_note: String(note || "").trim() || null, p_operator_code: String(operatorCode || "").trim() });
  fail(error); return data;
}
export async function cancelOnlineOrder(orderId, reason = "") {
  const client = await getSupabase();
  const { data, error } = await client.rpc("cancel_online_order", { p_order_id: orderId, p_reason: String(reason || "").trim() || null });
  fail(error); return data;
}
export async function adjustStock(operatorCode, variantId, delta, reason = "Ajuste no PDV", note = "") {
  const client = await getSupabase();
  const { data, error } = await client.rpc("pdv_adjust_stock", {
    p_actor_code: String(operatorCode || "").trim(), p_variant_id: variantId,
    p_delta: Number(delta), p_reason: String(reason || "Ajuste no PDV"), p_note: String(note || "").trim() || null,
  });
  fail(error); return data;
}

export async function getStorefrontSettings() {
  const client = await getSupabase();
  const { data, error } = await client.from("storefront_settings").select("store_name, whatsapp, footer_text").eq("id", 1).maybeSingle();
  fail(error); return data;
}
