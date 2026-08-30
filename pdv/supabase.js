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

applyStoreBranding();

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

export async function openRegister(openingFloat = 0) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("open_pdv_register", { p_opening_float: Number(openingFloat) || 0 });
  fail(error); return data;
}
export async function getRegisterState() {
  const client = await getSupabase(); const { data, error } = await client.rpc("get_pdv_register_state"); fail(error); return data;
}
export async function resolveOperator(code) {
  const client = await getSupabase(); const { data, error } = await client.rpc("resolve_pdv_operator", { p_operator_code: String(code || "").trim() }); fail(error); return data;
}
export async function closeOperatorCash({ actorCode, targetCode, cash, pix, credit, debit, fiscalDocument, notes }) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("close_operator_cash", {
    p_actor_code: String(actorCode || "").trim(),
    p_target_code: String(targetCode || actorCode || "").trim(),
    p_declared_cash: Number(cash) || 0,
    p_declared_pix: Number(pix) || 0,
    p_declared_card_credit: Number(credit) || 0,
    p_declared_card_debit: Number(debit) || 0,
    p_fiscal_document_number: String(fiscalDocument || "").trim(),
    p_notes: String(notes || "").trim() || null,
  });
  fail(error); return data;
}
export async function closeRegister(actorCode, notes = "") {
  const client = await getSupabase();
  const { data, error } = await client.rpc("close_pdv_register", { p_actor_code: String(actorCode || "").trim(), p_notes: String(notes || "").trim() || null });
  fail(error); return data;
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
