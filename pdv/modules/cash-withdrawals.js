import { getOperationalProfile, getRegisterState, getSupabase } from '../supabase.js';
import { escapeHtml, formatDate, formatMoney, setBusy, toast } from '../../assets/js/utils.js';

const $ = (id) => document.getElementById(id);
let profile = null;
let mounted = false;
let timer = null;

function canManageWithdrawals() {
  return Boolean(
    profile?.is_root_owner
    || ['owner', 'admin'].includes(profile?.role)
    || profile?.can_finance_write
    || profile?.permissions?.['finance.write'] === true
    || profile?.permissions?.['*'] === true
  );
}

function mount() {
  const view = $('view-cash');
  const closeForm = $('cashForm');
  const grid = closeForm?.closest('.content-grid');
  if (!view || !closeForm || !grid) return false;

  const headText = view.querySelector('.view-head p');
  if (headText) headText.textContent = 'O fechamento do operador é feito uma vez. A sangria do dinheiro é separada e o ADM pode registrar quantas forem necessárias enquanto o caixa estiver aberto.';

  const legacyCard = closeForm.closest('.card');
  const legacyTitle = legacyCard?.querySelector('.card-head h3');
  if (legacyTitle) legacyTitle.textContent = 'Fechamento do operador';
  const legacyButton = $('finishOperatorCash');
  if (legacyButton) legacyButton.textContent = 'Fechar operador';

  if (!$('adminCashWithdrawalCard')) {
    legacyCard?.insertAdjacentHTML('afterend', `
      <article class="card" id="adminCashWithdrawalCard" hidden>
        <div class="card-head"><h3>Sangria do caixa · ADM</h3></div>
        <form id="adminCashWithdrawalForm" class="card-body" style="display:grid;gap:12px;">
          <div class="auth-message show"><strong>Sangria não fecha operador.</strong><br>O ADM pode retirar dinheiro várias vezes no mesmo caixa. Cada retirada fica registrada separadamente na auditoria.</div>
          <div id="adminCashWithdrawalSummary"></div>
          <div class="field"><label for="adminWithdrawalAmount">Valor da sangria</label><input class="input" id="adminWithdrawalAmount" type="number" min="0.01" step="0.01" required placeholder="0,00"></div>
          <div class="field"><label for="adminWithdrawalReason">Motivo</label><input class="input" id="adminWithdrawalReason" maxlength="120" required placeholder="Ex.: retirar excesso de dinheiro do caixa"></div>
          <div class="field"><label for="adminWithdrawalNotes">Observação</label><textarea class="input" id="adminWithdrawalNotes" rows="3" placeholder="Opcional"></textarea></div>
          <button class="btn btn-primary btn-block" id="registerAdminWithdrawal" type="submit">Registrar sangria</button>
          <div id="adminCashWithdrawalHistory"></div>
        </form>
      </article>`);
  }

  if (!mounted) {
    $('adminCashWithdrawalForm')?.addEventListener('submit', submitWithdrawal);
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-view="cash"]')) setTimeout(() => refresh(true), 80);
    });
    mounted = true;
  }
  return true;
}

function renderState(state) {
  const card = $('adminCashWithdrawalCard');
  if (!card) return;
  const allowed = canManageWithdrawals();
  card.hidden = !allowed;
  if (!allowed) return;

  const summary = $('adminCashWithdrawalSummary');
  const history = $('adminCashWithdrawalHistory');
  if (!state?.open) {
    if (summary) summary.innerHTML = '<div class="auth-message show">Abra o caixa para registrar uma sangria.</div>';
    if (history) history.innerHTML = '';
    const button = $('registerAdminWithdrawal');
    if (button) button.disabled = true;
    return;
  }

  const cash = state.cash || {};
  const withdrawals = Array.isArray(cash.withdrawals) ? cash.withdrawals : [];
  const button = $('registerAdminWithdrawal');
  if (button) button.disabled = false;

  if (summary) summary.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
      <div style="padding:10px;border:1px solid var(--border);border-radius:10px;"><span class="stat-label">Dinheiro disponível</span><strong style="display:block;margin-top:4px;">${formatMoney(cash.available_cash || 0)}</strong></div>
      <div style="padding:10px;border:1px solid var(--border);border-radius:10px;"><span class="stat-label">Vendas em dinheiro</span><strong style="display:block;margin-top:4px;">${formatMoney(cash.sales_cash || 0)}</strong></div>
      <div style="padding:10px;border:1px solid var(--border);border-radius:10px;"><span class="stat-label">Já retirado</span><strong style="display:block;margin-top:4px;">${formatMoney(cash.withdrawals_total || 0)}</strong></div>
    </div>`;

  if (history) history.innerHTML = withdrawals.length
    ? `<div style="border-top:1px solid var(--border);padding-top:12px;"><strong style="display:block;margin-bottom:8px;">Sangrias deste caixa</strong><div style="display:grid;gap:8px;">${withdrawals.slice(0, 12).map((row) => `
        <div style="display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px;border:1px solid var(--border);border-radius:10px;">
          <div><strong>${escapeHtml(row.reason || 'Sangria')}</strong><small style="display:block;margin-top:3px;">#${escapeHtml(row.performed_by_code || '—')} · ${escapeHtml(row.performed_by_name || 'ADM')} · ${formatDate(row.created_at)}</small>${row.notes ? `<small style="display:block;margin-top:3px;">${escapeHtml(row.notes)}</small>` : ''}</div>
          <strong>${formatMoney(row.amount || 0)}</strong>
        </div>`).join('')}</div></div>`
    : '<small style="display:block;color:var(--muted);">Nenhuma sangria de dinheiro registrada neste caixa.</small>';
}

async function refresh(silent = false) {
  try {
    if (!mount()) return;
    if (!profile) profile = await getOperationalProfile();
    if (!canManageWithdrawals()) return renderState({ open: false });
    const state = await getRegisterState();
    renderState(state);
  } catch (error) {
    console.error('Falha ao carregar sangrias do caixa', error);
    if (!silent) toast(error.message || 'Não foi possível carregar as sangrias.', 'error');
  }
}

async function submitWithdrawal(event) {
  event.preventDefault();
  if (!profile) profile = await getOperationalProfile();
  if (!canManageWithdrawals()) return toast('Somente ADM ou Financeiro pode realizar sangrias do caixa.', 'error');

  const amount = Number($('adminWithdrawalAmount')?.value || 0);
  const reason = String($('adminWithdrawalReason')?.value || '').trim();
  const notes = String($('adminWithdrawalNotes')?.value || '').trim();
  if (!(amount > 0)) return toast('Informe um valor de sangria maior que zero.', 'error');
  if (!reason) return toast('Informe o motivo da sangria.', 'error');

  const button = $('registerAdminWithdrawal');
  setBusy(button, true, 'Registrando…');
  try {
    const client = await getSupabase();
    const { data, error } = await client.rpc('create_pdv_cash_withdrawal', {
      p_actor_code: String(profile.operator_code || '').trim(),
      p_amount: amount,
      p_reason: reason,
      p_notes: notes || null,
    });
    if (error) throw error;
    $('adminCashWithdrawalForm')?.reset();
    toast(data?.test_mode ? 'Sangria simulada. Nada foi gravado.' : `Sangria de ${formatMoney(amount)} registrada.`, 'success');
    await refresh(true);
  } catch (error) {
    toast(error.message || 'Não foi possível registrar a sangria.', 'error');
  } finally {
    setBusy(button, false);
  }
}

async function boot() {
  for (let attempt = 0; attempt < 30 && !mount(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  try { profile = await getOperationalProfile(); } catch (error) { console.warn('Perfil indisponível para sangria ADM', error); }
  await refresh(true);
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (!document.hidden && $('view-cash')?.classList.contains('active')) refresh(true);
  }, 15000);
  window.addEventListener('nexcell:pdv-sale-complete', () => setTimeout(() => refresh(true), 250));
  window.addEventListener('nexcell:pdv-test-mode-change', () => setTimeout(() => refresh(true), 100));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
