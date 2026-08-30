import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";

const SUPABASE_URL = "https://phhncvufnufroyifaghe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OqKmeAMX4B_9rAgFpOzwig_qwN3WZxL";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

function fail(error) { if (error) throw error; }

export async function getSession() {
  const { data, error } = await supabase.auth.getSession(); fail(error); return data.session;
}
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password }); fail(error); return data.session;
}
export async function signOut() {
  const { error } = await supabase.auth.signOut(); fail(error);
}
export async function requestStaffAccess({ fullName, email, password }) {
  const { data, error } = await supabase.functions.invoke("staff-register", { body: { fullName, email, password } });
  fail(error); if (!data?.ok) throw new Error(data?.error || "Não foi possível criar o cadastro.");
  return signIn(email, password);
}
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email); fail(error);
}
export async function getOperationalProfile() {
  const { data, error } = await supabase.rpc("get_my_operational_profile"); fail(error); return data;
}
export async function listCatalog() {
  const { data, error } = await supabase.rpc("list_pdv_catalog"); fail(error); return Array.isArray(data) ? data : [];
}
export async function createSale(payload) {
  const { data, error } = await supabase.rpc("create_pdv_sale", { payload }); fail(error); return data;
}
export async function createQuote(payload) {
  const { data, error } = await supabase.rpc("create_pdv_quote", { payload }); fail(error); return data;
}
export async function listQuotes(includeClosed = false) {
  const { data, error } = await supabase.rpc("list_pdv_quotes", { p_include_closed: includeClosed }); fail(error); return Array.isArray(data) ? data : [];
}
export async function cancelQuote(quoteId) {
  const { data, error } = await supabase.rpc("cancel_pdv_quote", { p_quote_id: quoteId }); fail(error); return data;
}
export async function getStorefrontSettings() {
  const { data, error } = await supabase.from("storefront_settings").select("store_name, whatsapp, footer_text").eq("id", 1).maybeSingle();
  fail(error); return data;
}
