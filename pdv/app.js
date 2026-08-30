import {
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  doc,
  effectivePermissions,
  getDoc,
  getUserProfile,
  onAuthStateChanged,
  onSnapshot,
  runTransaction,
  sendPasswordResetEmail,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "../assets/js/firebase.js";
import {
  availableStock,
  debounce,
  escapeHtml,
  formatDate,
  formatMoney,
  loadJson,
  productVariants,
  salePrice,
  saveJson,
  setBusy,
  toast,
} from "../assets/js/utils.js";

const BUDGETS_KEY = "nexcell_pdv_budgets_v2";
const viewMetadata = {
  sale: ["Nova venda", "Selecione os produtos e finalize o pagamento."],
  saved: ["Orçamentos salvos", "Retome atendimentos que ainda não baixaram estoque."],
  profile: ["Meu acesso", "Confira os dados e permissões desta sessão."],
};

const state = {
  user: null,
  profile: null,
  permissions: null,
  products: [],
  cart: [],
  category: "Todos",
  search: "",
  config: { loja_nome: "NexCell Store", loja_doc: "", loja_tel: "", loja_pix: "", msg_rodape: "" },
  pendingVariantProduct: null,
  unsubscribeProducts: null,
};

const elements = {
  authScreen: document.getElementById("authScreen"),
  workspace: document.getElementById("workspace"),
  pdvProducts: document.getElementById("pdvProducts"),
  pdvCategories: document.getElementById("pdvCategories"),
  saleCart: document.getElementById("saleCart"),
  saleItemCount: document.getElementById("saleItemCount"),
  saleSubtotal: document.getElementById("saleSubtotal"),
  saleTotal: document.getElementById("saleTotal"),
  mobileCartCount: document.getElementById("mobileCartCount"),
  mobileCartTotal: document.getElementById("mobileCartTotal"),
  checkoutPanel: document.getElementById("checkoutPanel"),
  paymentModal: document.getElementById("paymentModal"),
  paymentSummary: document.getElementById("paymentSummary"),
};

function setAuthView(viewId) {
  ["loginView", "requestView", "resetView", "pendingView", "deniedView"].forEach((id) => {
    document.getElementById(id).hidden = id !== viewId;
  });
}

function authMessage(id, message, error = false) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.style.color = error ? "var(--danger)" : "#475467";
  element.classList.toggle("show", Boolean(message));
}

function firebaseMessage(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
    "auth/network-request-failed": "Falha de conexão. Verifique a internet.",
  };
  return messages[code] || error?.message || "Não foi possível concluir a operação.";
}

async function loadConfig() {
  try {
    const snapshot = await getDoc(doc(db, "configuracoes", "geral"));
    if (snapshot.exists()) state.config = { ...state.config, ...snapshot.data() };
  } catch (error) {
    console.warn("Configuração indisponível:", error);
  }
}

function hasPermission(key) {
  return state.profile?.cargo === "admin" || Boolean(state.permissions?.[key]);
}

function activateWorkspace() {
  elements.authScreen.style.display = "none";
  elements.workspace.classList.add("ready");
  const name = state.profile?.nome || state.user.email?.split("@")[0] || "Operador";
  document.getElementById("userName").textContent = name;
  document.getElementById("userRole").textContent = state.profile?.cargo || "colaborador";
  document.getElementById("userAvatar").textContent = name[0].toUpperCase();
  const isAdmin = state.profile?.cargo === "admin";
  document.getElementById("controlLink").hidden = !isAdmin;
  document.getElementById("profileControlLink").hidden = !isAdmin;
  renderProfile();
  subscribeProducts();
  loadConfig();
}

function deactivateWorkspace() {
  elements.workspace.classList.remove("ready");
  elements.authScreen.style.display = "grid";
  state.unsubscribeProducts?.();
  state.unsubscribeProducts = null;
  state.products = [];
  state.cart = [];
  renderCart();
}

function renderProfile() {
  if (!state.profile) return;
  const permissionNames = {
    dashboard: "Dashboard",
    vender: "Vender no PDV",
    estoque_ver: "Consultar estoque",
    estoque_editar: "Editar estoque",
    financeiro: "Financeiro",
    cancelar_venda: "Cancelar vendas",
  };
  const active = Object.entries(state.permissions || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => `<span class="badge badge-success">${permissionNames[key] || key}</span>`)
    .join(" ");
  document.getElementById("profileSummary").innerHTML = `
    <div style="display:grid;gap:12px;font-size:11px;">
      <div><span class="stat-label">Nome</span><strong style="display:block;margin-top:4px;">${escapeHtml(state.profile.nome || "—")}</strong></div>
      <div><span class="stat-label">E-mail</span><strong style="display:block;margin-top:4px;">${escapeHtml(state.user?.email || "—")}</strong></div>
      <div><span class="stat-label">Cargo</span><strong style="display:block;margin-top:4px;text-transform:capitalize;">${escapeHtml(state.profile.cargo || "colaborador")}</strong></div>
      <div><span class="stat-label">Permissões</span><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;">${active || '<span class="badge badge-warning">Nenhuma função liberada</span>'}</div></div>
    </div>
  `;
}

onAuthStateChanged(auth, async (user) => {
  deactivateWorkspace();
  if (!user || user.isAnonymous) {
    if (user?.isAnonymous) await signOut(auth).catch(() => {});
    state.user = null;
    state.profile = null;
    setAuthView("loginView");
    return;
  }

  state.user = user;
  try {
    state.profile = await getUserProfile(user.uid);
  } catch (error) {
    authMessage("loginMessage", "Não foi possível carregar seu perfil de acesso.", true);
    setAuthView("loginView");
    return;
  }

  if (!state.profile || state.profile.status === "pendente") {
    setAuthView("pendingView");
    return;
  }
  if (state.profile.status === "bloqueado") {
    setAuthView("deniedView");
    return;
  }

  state.permissions = effectivePermissions(state.profile);
  if (!state.permissions.vender && state.profile.cargo !== "admin") {
    setAuthView("deniedView");
    return;
  }
  activateWorkspace();
});

document.getElementById("loginView").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("loginButton");
  authMessage("loginMessage", "");
  setBusy(button, true, "Entrando…");
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPassword").value,
    );
  } catch (error) {
    authMessage("loginMessage", firebaseMessage(error), true);
  } finally {
    setBusy(button, false);
  }
});

document.getElementById("requestView").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("requestButton");
  const name = document.getElementById("requestName").value.trim();
  const email = document.getElementById("requestEmail").value.trim();
  const password = document.getElementById("requestPassword").value;
  setBusy(button, true, "Criando conta…");
  authMessage("requestMessage", "");
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    await setDoc(doc(db, "usuarios", credential.user.uid), {
      nome: name,
      email,
      cargo: "colaborador",
      status: "pendente",
      permissoes: {
        dashboard: false,
        vender: false,
        estoque_ver: false,
        estoque_editar: false,
        financeiro: false,
        cancelar_venda: false,
      },
      criado_em: serverTimestamp(),
    });
    setAuthView("pendingView");
  } catch (error) {
    authMessage("requestMessage", firebaseMessage(error), true);
  } finally {
    setBusy(button, false);
  }
});

document.getElementById("resetView").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("resetButton");
  setBusy(button, true, "Enviando…");
  try {
    await sendPasswordResetEmail(auth, document.getElementById("resetEmail").value.trim());
    authMessage("resetMessage", "Link enviado. Verifique também a caixa de spam.");
  } catch (error) {
    authMessage("resetMessage", firebaseMessage(error), true);
  } finally {
    setBusy(button, false);
  }
});

document.querySelectorAll("[data-auth-view]").forEach((button) => {
  button.addEventListener("click", () => setAuthView(button.dataset.authView));
});

async function logout() {
  await signOut(auth).catch(() => {});
}

["logoutButton", "mobileLogout", "pendingLogout", "deniedLogout"].forEach((id) => {
  document.getElementById(id).addEventListener("click", logout);
});

function subscribeProducts() {
  state.unsubscribeProducts?.();
  state.unsubscribeProducts = onSnapshot(collection(db, "produtos"), (snapshot) => {
    state.products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderCatalog();
  }, (error) => {
    console.error(error);
    elements.pdvProducts.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><strong>Falha ao carregar o estoque</strong><span>Verifique sua conexão ou as permissões deste perfil.</span></div>`;
  });
}

function filteredProducts() {
  const term = state.search.trim().toLocaleLowerCase("pt-BR");
  return state.products.filter((product) => {
    const categoryMatches = state.category === "Todos" || product.categoria === state.category;
    const text = [product.nome, product.marca, product.modelo, product.codigo, product.categoria]
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return categoryMatches && (!term || text.includes(term));
  });
}

function renderCategories() {
  const categories = [...new Set(state.products.map((product) => product.categoria).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  elements.pdvCategories.innerHTML = ["Todos", ...categories].map((category) => `
    <button class="filter-chip ${category === state.category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
  `).join("");
}

function renderCatalog() {
  renderCategories();
  const products = filteredProducts();
  elements.pdvProducts.innerHTML = products.length
    ? products.map((product) => {
      const stock = availableStock(product);
      return `
        <button class="pdv-product" type="button" data-product-id="${product.id}" ${stock <= 0 ? "disabled" : ""}>
          <span>
            <span class="pdv-product-top"><span class="badge">${escapeHtml(product.marca || product.categoria || "Produto")}</span><span class="badge ${stock <= 3 ? "badge-danger" : "badge-success"}">${stock} un</span></span>
            <h3>${escapeHtml(product.nome || "Produto")}</h3>
            <p>${escapeHtml(product.modelo || product.codigo || "Sem modelo")}</p>
          </span>
          <span class="pdv-product-price"><strong>${formatMoney(salePrice(product))}</strong><span aria-hidden="true">＋</span></span>
        </button>
      `;
    }).join("")
    : `<div class="empty-state" style="grid-column:1/-1;"><strong>Nenhum produto encontrado</strong><span>Altere a busca ou a categoria.</span></div>`;
}

function cartEntryKey(productId, variantId) {
  return `${productId}::${variantId}`;
}

function addToCart(product, variant) {
  const key = cartEntryKey(product.id, variant.id);
  const existing = state.cart.find((item) => item.key === key);
  if (existing) {
    if (existing.quantidade >= variant.estoque) return toast("Limite de estoque atingido.", "error");
    existing.quantidade += 1;
  } else {
    state.cart.push({
      key,
      produto_id: product.id,
      nome: product.nome || "Produto",
      codigo: product.codigo || "",
      variacao_id: variant.id,
      cor: variant.cor,
      sku: variant.sku || product.codigo || "",
      preco: salePrice(product),
      quantidade: 1,
      estoque_disponivel: variant.estoque,
    });
  }
  renderCart();
}

function chooseProduct(product, preferredVariant = null) {
  const variants = productVariants(product).filter((variant) => variant.estoque > 0);
  if (!variants.length) return toast("Produto sem estoque.", "error");
  if (preferredVariant) return addToCart(product, preferredVariant);
  if (variants.length === 1) return addToCart(product, variants[0]);

  state.pendingVariantProduct = product;
  document.getElementById("variantTitle").textContent = product.nome || "Escolha a variação";
  document.getElementById("pdvVariantList").innerHTML = variants.map((variant) => `
    <button class="variant-option" type="button" data-pdv-variant="${escapeHtml(variant.id)}">
      <span class="color-dot" style="background:${escapeHtml(variant.hex)}"></span>
      ${escapeHtml(variant.cor)} · ${variant.estoque} un
    </button>
  `).join("");
  openModal("variantModal");
}

function cartSubtotal() {
  return state.cart.reduce((sum, item) => sum + item.preco * item.quantidade, 0);
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantidade, 0);
  const total = cartSubtotal();
  elements.saleItemCount.textContent = `${count} ${count === 1 ? "item" : "itens"}`;
  elements.saleSubtotal.textContent = formatMoney(total);
  elements.saleTotal.textContent = formatMoney(total);
  elements.mobileCartCount.textContent = `${count} ${count === 1 ? "item" : "itens"}`;
  elements.mobileCartTotal.textContent = formatMoney(total);
  document.getElementById("openPayment").disabled = !state.cart.length;
  document.getElementById("saveBudget").disabled = !state.cart.length;

  elements.saleCart.innerHTML = state.cart.length
    ? state.cart.map((item) => `
      <article class="pdv-cart-item">
        <div><h4>${escapeHtml(item.nome)}</h4><p>${escapeHtml(item.cor)} · ${formatMoney(item.preco)} cada</p><div class="qty-control" style="margin-top:7px;"><button type="button" data-cart-key="${escapeHtml(item.key)}" data-delta="-1">−</button><span>${item.quantidade}</span><button type="button" data-cart-key="${escapeHtml(item.key)}" data-delta="1">+</button></div></div>
        <div><div class="pdv-cart-price">${formatMoney(item.preco * item.quantidade)}</div><button class="remove-item" type="button" data-remove-cart="${escapeHtml(item.key)}">×</button></div>
      </article>
    `).join("")
    : `<div class="empty-state"><strong>Carrinho vazio</strong><span>Toque em um produto ou leia o código de barras.</span></div>`;
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

elements.pdvProducts.addEventListener("click", (event) => {
  const button = event.target.closest("[data-product-id]");
  if (!button) return;
  const product = state.products.find((item) => item.id === button.dataset.productId);
  if (product) chooseProduct(product);
});

elements.pdvCategories.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  renderCatalog();
});

document.getElementById("productSearch").addEventListener("input", debounce((event) => {
  state.search = event.target.value;
  renderCatalog();
}));

document.getElementById("scannerInput").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const code = event.target.value.trim().toLocaleLowerCase("pt-BR");
  if (!code) return;
  let foundProduct = null;
  let foundVariant = null;
  for (const product of state.products) {
    if (String(product.codigo || "").toLocaleLowerCase("pt-BR") === code) {
      foundProduct = product;
      break;
    }
    const variant = productVariants(product).find((item) => String(item.sku || "").toLocaleLowerCase("pt-BR") === code);
    if (variant) {
      foundProduct = product;
      foundVariant = variant;
      break;
    }
  }
  if (!foundProduct) toast("Código não encontrado.", "error");
  else chooseProduct(foundProduct, foundVariant);
  event.target.value = "";
});

elements.saleCart.addEventListener("click", (event) => {
  const quantity = event.target.closest("[data-cart-key]");
  const remove = event.target.closest("[data-remove-cart]");
  if (quantity) updateCartQuantity(quantity.dataset.cartKey, Number(quantity.dataset.delta));
  if (remove) {
    state.cart = state.cart.filter((item) => item.key !== remove.dataset.removeCart);
    renderCart();
  }
});

document.getElementById("pdvVariantList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-pdv-variant]");
  if (!button || !state.pendingVariantProduct) return;
  const variant = productVariants(state.pendingVariantProduct).find((item) => item.id === button.dataset.pdvVariant);
  if (variant) addToCart(state.pendingVariantProduct, variant);
  closeModal("variantModal");
});

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.dataset.closeModal));
});

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal.id);
  });
});

function paymentTotal() {
  const discount = Math.max(0, Number(document.getElementById("saleDiscount").value) || 0);
  return Math.max(0, cartSubtotal() - discount);
}

function updatePaymentSummary() {
  const subtotal = cartSubtotal();
  const discount = Math.min(subtotal, Math.max(0, Number(document.getElementById("saleDiscount").value) || 0));
  const total = subtotal - discount;
  elements.paymentSummary.innerHTML = `
    <div class="order-summary-row"><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div>
    <div class="order-summary-row"><span>Desconto</span><strong>− ${formatMoney(discount)}</strong></div>
    <hr style="width:100%;border:0;border-top:1px solid var(--line);">
    <div class="order-summary-row"><strong>Total a receber</strong><strong>${formatMoney(total)}</strong></div>
  `;
  const received = Number(document.getElementById("cashReceived").value) || 0;
  document.getElementById("cashChange").textContent = formatMoney(Math.max(0, received - total));
}

function updatePaymentFields() {
  const method = document.getElementById("paymentMethod").value;
  document.getElementById("cashFields").hidden = method !== "Dinheiro";
  document.getElementById("installmentField").hidden = method !== "Cartão de Crédito";
  updatePaymentSummary();
}

document.getElementById("openPayment").addEventListener("click", () => {
  if (!state.cart.length) return;
  document.getElementById("saleDiscount").value = "0";
  document.getElementById("cashReceived").value = "";
  updatePaymentFields();
  openModal("paymentModal");
});
document.getElementById("paymentMethod").addEventListener("change", updatePaymentFields);
document.getElementById("saleDiscount").addEventListener("input", updatePaymentSummary);
document.getElementById("cashReceived").addEventListener("input", updatePaymentSummary);

function groupCartByProduct() {
  const groups = new Map();
  state.cart.forEach((item) => {
    if (!groups.has(item.produto_id)) groups.set(item.produto_id, []);
    groups.get(item.produto_id).push(item);
  });
  return groups;
}

async function registerSale(payment) {
  const saleRef = doc(collection(db, "vendas"));
  const groups = groupCartByProduct();
  const groupEntries = [...groups.entries()];

  await runTransaction(db, async (transaction) => {
    const snapshots = [];
    for (const [productId] of groupEntries) {
      snapshots.push(await transaction.get(doc(db, "produtos", productId)));
    }

    groupEntries.forEach(([productId, cartItems], index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists()) throw new Error(`O produto ${cartItems[0].nome} não existe mais.`);
      const product = snapshot.data();
      const productRef = doc(db, "produtos", productId);

      if (Array.isArray(product.variacoes) && product.variacoes.length) {
        const updatedVariants = productVariants(product).map((variant) => {
          const sold = cartItems
            .filter((item) => item.variacao_id === variant.id)
            .reduce((sum, item) => sum + item.quantidade, 0);
          if (sold > variant.estoque) throw new Error(`Estoque insuficiente para ${product.nome} na cor ${variant.cor}.`);
          return { ...variant, estoque: variant.estoque - sold };
        });
        transaction.update(productRef, {
          variacoes: updatedVariants,
          estoque: updatedVariants.reduce((sum, item) => sum + item.estoque, 0),
          atualizado_em: serverTimestamp(),
        });
      } else {
        const sold = cartItems.reduce((sum, item) => sum + item.quantidade, 0);
        const stock = Math.max(0, Number(product.estoque) || 0);
        if (sold > stock) throw new Error(`Estoque insuficiente para ${product.nome}.`);
        transaction.update(productRef, { estoque: stock - sold, atualizado_em: serverTimestamp() });
      }
    });

    transaction.set(saleRef, {
      codigo: payment.codigo,
      itens: state.cart.map((item) => ({
        produto_id: item.produto_id,
        nome: item.nome,
        variacao_id: item.variacao_id,
        cor: item.cor,
        sku: item.sku || "",
        quantidade: item.quantidade,
        preco: item.preco,
        subtotal: item.preco * item.quantidade,
      })),
      subtotal: payment.subtotal,
      desconto: payment.desconto,
      total: payment.total,
      metodo: payment.metodo,
      parcelas: payment.parcelas,
      valor_recebido: payment.valor_recebido,
      troco: payment.troco,
      operador_uid: state.user.uid,
      operador_nome: state.profile.nome || state.user.email,
      status: "concluida",
      origem: "pdv",
      data_venda: new Date().toISOString(),
      criado_em: serverTimestamp(),
    });
  });
  return saleRef.id;
}

function renderReceipt(sale) {
  document.getElementById("receiptContent").innerHTML = `
    <h2>${escapeHtml(state.config.loja_nome || "NexCell Store")}</h2>
    ${state.config.loja_doc ? `<p>${escapeHtml(state.config.loja_doc)}</p>` : ""}
    ${state.config.loja_tel ? `<p>${escapeHtml(state.config.loja_tel)}</p>` : ""}
    <hr class="receipt-rule">
    <div class="receipt-line"><span>Venda</span><strong>${escapeHtml(sale.codigo)}</strong></div>
    <div class="receipt-line"><span>Data</span><span>${formatDate(new Date())}</span></div>
    <div class="receipt-line"><span>Operador</span><span>${escapeHtml(state.profile.nome || state.user.email)}</span></div>
    <hr class="receipt-rule">
    <div class="receipt-items">
      ${sale.itens.map((item) => `<div><strong>${item.quantidade}× ${escapeHtml(item.nome)}</strong><div class="receipt-line"><span>${escapeHtml(item.cor)} · ${formatMoney(item.preco)}</span><span>${formatMoney(item.preco * item.quantidade)}</span></div></div>`).join("")}
    </div>
    <hr class="receipt-rule">
    <div class="receipt-line"><span>Subtotal</span><span>${formatMoney(sale.subtotal)}</span></div>
    <div class="receipt-line"><span>Desconto</span><span>− ${formatMoney(sale.desconto)}</span></div>
    <div class="receipt-line"><strong>TOTAL</strong><strong>${formatMoney(sale.total)}</strong></div>
    <div class="receipt-line"><span>Pagamento</span><span>${escapeHtml(sale.metodo)}</span></div>
    ${sale.troco > 0 ? `<div class="receipt-line"><span>Troco</span><span>${formatMoney(sale.troco)}</span></div>` : ""}
    ${state.config.loja_pix ? `<hr class="receipt-rule"><p>PIX: ${escapeHtml(state.config.loja_pix)}</p>` : ""}
    <hr class="receipt-rule">
    <p>${escapeHtml(state.config.msg_rodape || "Obrigado pela preferência!")}</p>
  `;
}

document.getElementById("paymentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.cart.length) return;
  const button = document.getElementById("finishSale");
  const subtotal = cartSubtotal();
  const discount = Math.min(subtotal, Math.max(0, Number(document.getElementById("saleDiscount").value) || 0));
  const total = subtotal - discount;
  const method = document.getElementById("paymentMethod").value;
  const received = Number(document.getElementById("cashReceived").value) || 0;
  if (method === "Dinheiro" && received < total) return toast("O valor recebido é menor que o total.", "error");

  const sale = {
    codigo: `V-${Date.now().toString().slice(-8)}`,
    itens: state.cart.map((item) => ({ ...item })),
    subtotal,
    desconto: discount,
    total,
    metodo: method,
    parcelas: method === "Cartão de Crédito" ? Number(document.getElementById("installments").value) : 1,
    valor_recebido: method === "Dinheiro" ? received : total,
    troco: method === "Dinheiro" ? Math.max(0, received - total) : 0,
  };

  setBusy(button, true, "Registrando…");
  try {
    await registerSale(sale);
    renderReceipt(sale);
    state.cart = [];
    renderCart();
    closeModal("paymentModal");
    openModal("receiptModal");
    elements.checkoutPanel.classList.remove("mobile-open");
    toast("Venda registrada e estoque atualizado.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Não foi possível registrar a venda.", "error");
  } finally {
    setBusy(button, false);
  }
});

document.getElementById("printReceipt").addEventListener("click", () => window.print());

function budgets() {
  const value = loadJson(BUDGETS_KEY, []);
  return Array.isArray(value) ? value : [];
}

function renderBudgets() {
  const values = budgets();
  const host = document.getElementById("savedBudgets");
  host.innerHTML = values.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nome</th><th>Itens</th><th>Total</th><th>Salvo em</th><th>Ações</th></tr></thead><tbody>${values.map((budget) => `<tr><td><strong>${escapeHtml(budget.nome)}</strong></td><td>${budget.cart.reduce((sum, item) => sum + item.quantidade, 0)}</td><td>${formatMoney(budget.cart.reduce((sum, item) => sum + item.preco * item.quantidade, 0))}</td><td>${formatDate(budget.criado_em)}</td><td><div class="table-actions"><button class="btn-mini" data-resume-budget="${budget.id}">Retomar</button><button class="btn-mini" data-delete-budget="${budget.id}">Excluir</button></div></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty-state"><strong>Nenhum orçamento salvo</strong><span>Monte um carrinho e toque em Salvar.</span></div>`;
}

document.getElementById("saveBudget").addEventListener("click", () => {
  if (!state.cart.length) return;
  document.getElementById("budgetName").value = `Orçamento ${budgets().length + 1}`;
  openModal("budgetModal");
  document.getElementById("budgetName").select();
});

document.getElementById("budgetForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("budgetName").value.trim();
  if (!name) return;
  const values = budgets();
  values.unshift({ id: crypto.randomUUID(), nome: name, cart: state.cart.map((item) => ({ ...item })), criado_em: new Date().toISOString() });
  saveJson(BUDGETS_KEY, values.slice(0, 40));
  closeModal("budgetModal");
  toast("Orçamento salvo sem baixar o estoque.", "success");
});

document.getElementById("savedBudgets").addEventListener("click", (event) => {
  const resume = event.target.closest("[data-resume-budget]");
  const remove = event.target.closest("[data-delete-budget]");
  let values = budgets();
  if (resume) {
    const budget = values.find((item) => item.id === resume.dataset.resumeBudget);
    if (budget) {
      state.cart = budget.cart.map((item) => ({ ...item }));
      renderCart();
      switchView("sale");
      toast("Orçamento retomado. Confirme o estoque antes de receber.", "success");
    }
  }
  if (remove) {
    values = values.filter((item) => item.id !== remove.dataset.deleteBudget);
    saveJson(BUDGETS_KEY, values);
    renderBudgets();
  }
});

function switchView(view) {
  document.querySelectorAll(".workspace-view").forEach((element) => element.classList.toggle("active", element.id === `view-${view}`));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const [title, subtitle] = viewMetadata[view] || viewMetadata.sale;
  document.getElementById("viewTitle").textContent = title;
  document.getElementById("viewSubtitle").textContent = subtitle;
  if (view === "saved") renderBudgets();
  elements.checkoutPanel.classList.remove("mobile-open");
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});
document.getElementById("openMobileCart").addEventListener("click", () => elements.checkoutPanel.classList.add("mobile-open"));
document.getElementById("closeMobileCart").addEventListener("click", () => elements.checkoutPanel.classList.remove("mobile-open"));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelectorAll(".modal.open").forEach((modal) => closeModal(modal.id));
});

function updateClock() {
  document.getElementById("liveClock").textContent = new Date().toLocaleTimeString("pt-BR");
}
window.setInterval(updateClock, 1000);
updateClock();
renderCart();
