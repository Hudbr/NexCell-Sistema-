import { getSupabase } from '../supabase.js'

const form = document.getElementById('resetView')
const emailInput = document.getElementById('resetEmail')
const button = document.getElementById('resetButton')
const message = document.getElementById('resetMessage')

function showMessage(text, error = false) {
  if (!message) return
  message.textContent = text
  message.style.color = error ? 'var(--danger)' : '#475467'
  message.classList.toggle('show', Boolean(text))
}

function setBusy(active) {
  if (!button) return
  button.disabled = active
  button.textContent = active ? 'Enviando…' : 'Enviar link'
}

async function handlePasswordResetRequest(event) {
  event.preventDefault()
  event.stopImmediatePropagation()

  const email = String(emailInput?.value || '').trim().toLowerCase()
  if (!email) {
    showMessage('Informe o e-mail cadastrado.', true)
    return
  }

  showMessage('')
  setBusy(true)

  try {
    const client = await getSupabase()
    const redirectTo = new URL('../redefinir-senha.html?recovery=1', import.meta.url).href
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) throw error

    showMessage('Se houver uma conta vinculada a este e-mail, enviaremos as instruções de recuperação. Verifique também a caixa de spam.')
  } catch (error) {
    const raw = String(error?.message || '').toLowerCase()
    if (raw.includes('rate limit') || raw.includes('too many')) {
      showMessage('Muitas tentativas. Aguarde alguns minutos e tente novamente.', true)
    } else if (raw.includes('fetch') || raw.includes('network')) {
      showMessage('Não foi possível conectar ao serviço de recuperação. Verifique sua internet e tente novamente.', true)
    } else {
      console.error('Falha ao solicitar recuperação de senha', error)
      showMessage('Não foi possível enviar a recuperação agora. Tente novamente.', true)
    }
  } finally {
    setBusy(false)
  }
}

if (form) form.addEventListener('submit', handlePasswordResetRequest, { capture: true })
