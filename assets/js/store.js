import {
  addDoc,
  auth,
  collection,
  db,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  signInAnonymously,
} from "./firebase.js";
import {
  addCartItem,
  cartCount,
  cartKey,
  cartTotal,
  clearCart,
  getCart,
  removeCartItem,
  updateCartQuantity,
} from "./cart.js";
import {
  availableStock,
  debounce,
  escapeHtml,
  formatMoney,
  productImages,
  productVariants,
  salePrice,
  setBusy,
  toast,
} from "./utils.js";

const state = {
  products: [],
  category: "Todos",
  search: "",
  config: {
    loja_nome: "NexCell Store",
    loja_tel: "",
    whatsapp: "",
    msg_rodape: "Tecnologia que acompanha sua rotina.",
  },
};

const elements = {
  productGrid: document.getElementById("productGrid"),
  catalogStatus: document.getElementById("catalogStatus"),
  categoryStrip: document.getElementById("categoryStrip"),
  search: document.getElementById("storeSearch"),
  cartDrawer: document.getElementById("cartDrawer"),
  cartItems: document.getElementById("cartItems"),
  cartCount: document.getElementById("cartCount"),
  cartSubtitle: document.getElementById("cartSubtitle"),
  cartTotal: document.getElementById("cartTotal"),
  checkoutModal: document.getElementById("checkoutModal"),
  checkoutForm: document.getElementById("checkoutForm"),
  checkoutSummary: document.getElementById("checkoutSummary"),
  addressField: document.getElementById("addressField"),
};

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function supportPhone() {
  return normalizePhone(state.config.whatsapp || state.config.loja_tel);
}

function updateSupportLinks() {
  const phone = supportPhone();
  const href = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent("Olá! Vim pela NexCell Store e preciso de ajuda.")}`
    : "#catalogo";
  ["supportLink", "heroSupportLink", "footerSupportLink"].forEach((id) => {
    const link = document.getElementById(id);
    if (link) link.href = href;
  });
}

async function loadConfig() {
  try {
    const snapshot = await getDoc(doc(db, "configuracoes", "geral"));
    if (snapshot.exists()) state.config = { ...state.config, ...snapshot.data() };
  } catch (error) {
    console.warn("Configuração pública indisponível:", error);
  }

  const name = state.config.loja_nome || "NexCell Store";
  document.getElementById("storeNameHeader").textContent = name;
  document.getElementById("storeNameFooter").textContent = name;
  document.getElementById("storeFooterMessage").textContent =
    state.config.msg_rodape || "Tecnologia que acompanha sua rotina.";
  updateSupportLinks();
}

function visibleProducts() {
  const term = state.search.trim().toLocaleLowerCase("pt-BR");
  return state.products.filter((product) => {
    const active = product.ativo_store !== false;
    const inStock = availableStock(product) > 0;
    const categoryMatches = state.category === "Todos" || product.categoria === state.category;
    const haystack = [product.nome, product.marca, product.modelo, product.categoria]
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return active && inStock && categoryMatches && (!term || haystack.includes(term));
  });
}

function renderCategories() {
  const categories = [...new Set(
    state.products
      .filter((product) => product.ativo_store !== false)
      .map((product) => product.categoria)
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "pt-BR"));

  elements.categoryStrip.innerHTML = ["Todos", ...categories]
    .map((category) => `
      <button
        class="category-pill ${state.category === category ? "active" : ""}"
        type="button"
        data-category="${escapeHtml(category)}"
      >${escapeHtml(category)}</button>
    `)
    .join("");
}

function productCard(product) {
  const images = productImages(product);
  const stock = availableStock(product);
  const price = salePrice(product);
  const regular = Number(product.preco) || 0;
  const promo = price < regular;
  const image = images[0]
    ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(product.nome)}" loading="lazy">`
    : `<span class="media-placeholder" aria-hidden="true">NC</span>`;

  return `
    <article class="product-card" data-product-id="${product.id}">
      <a class="product-media" href="./produto/?id=${encodeURIComponent(product.id)}">
        ${image}
        ${product.destaque ? '<span class="badge product-badge">Destaque</span>' : ""}
      </a>
      <div class="product-info">
        <span class="product-brand">${escapeHtml(product.marca || product.categoria || "NexCell")}</span>
        <a href="./produto/?id=${encodeURIComponent(product.id)}">
          <h3 class="product-name">${escapeHtml(product.nome || "Produto")}</h3>
        </a>
        <span class="product-model">${escapeHtml(product.modelo || "Compatibilidade não informada")}</span>
        <span class="stock-label">${stock} em estoque</span>
        <div class="price-row">
          <span class="price-stack">
            ${promo ? `<del>${formatMoney(regular)}</del>` : ""}
            <strong>${formatMoney(price)}</strong>
          </span>
          <button class="quick-add" type="button" data-quick-add="${product.id}" aria-label="Adicionar ${escapeHtml(product.nome)}">+</button>
        </div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const products = visibleProducts();
  elements.catalogStatus.textContent = products.length === 1
    ? "1 produto disponível"
    : `${products.length} produtos disponíveis`;

  if (!products.length) {
    elements.productGrid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <strong>Nenhum produto encontrado</strong>
        <span>Tente outra busca ou escolha uma categoria diferente.</span>
      </div>
    `;
    return;
  }
  elements.productGrid.innerHTML = products.map(productCard).join("");
}

function renderCatalog() {
  renderCategories();
  renderProducts();
}

function addProduct(product) {
  const availableVariants = productVariants(product).filter((variant) => variant.estoque > 0);
  if (!availableVariants.length) {
    toast("Este produto está sem estoque.", "error");
    return;
  }
  if (availableVariants.length > 1) {
    window.location.href = `./produto/?id=${encodeURIComponent(product.id)}`;
    return;
  }
  const variant = availableVariants[0];
  addCartItem({
    produto_id: product.id,
    nome: product.nome || "Produto",
    imagem: productImages(product)[0] || "",
    preco: salePrice(product),
    variacao_id: variant.id,
    cor: variant.cor,
    sku: variant.sku || product.codigo || "",
    estoque_disponivel: variant.estoque,
    quantidade: 1,
  });
  renderCart();
  toast("Produto adicionado ao carrinho.", "success");
}

function cartItemTemplate(item) {
  const key = cartKey(item.produto_id, item.variacao_id);
  const thumb = item.imagem
    ? `<img src="${escapeHtml(item.imagem)}" alt="">`
    : "NC";
  return `
    <article class="cart-item">
      <div class="cart-thumb">${thumb}</div>
      <div>
        <h3>${escapeHtml(item.nome)}</h3>
        <p>Cor: ${escapeHtml(item.cor || "Padrão")}</p>
        <strong>${formatMoney(item.preco * item.quantidade)}</strong>
        <div class="qty-control">
          <button type="button" data-qty-key="${escapeHtml(key)}" data-delta="-1" aria-label="Diminuir">−</button>
          <span>${item.quantidade}</span>
          <button type="button" data-qty-key="${escapeHtml(key)}" data-delta="1" aria-label="Aumentar">+</button>
        </div>
      </div>
      <button class="remove-item" type="button" data-remove-key="${escapeHtml(key)}" aria-label="Remover">×</button>
    </article>
  `;
}

function renderCart() {
  const cart = getCart();
  const count = cartCount(cart);
  elements.cartCount.textContent = count;
  elements.cartSubtitle.textContent = `${count} ${count === 1 ? "item selecionado" : "itens selecionados"}`;
  elements.cartTotal.textContent = formatMoney(cartTotal(cart));
  document.getElementById("startCheckout").disabled = !cart.length;

  elements.cartItems.innerHTML = cart.length
    ? cart.map(cartItemTemplate).join("")
    : `<div class="empty-state"><strong>Seu carrinho está vazio</strong><span>Escolha um produto para começar o pedido.</span></div>`;
}

function openCart() {
  renderCart();
  elements.cartDrawer.classList.add("open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  elements.cartDrawer.classList.remove("open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function renderCheckoutSummary() {
  const cart = getCart();
  elements.checkoutSummary.innerHTML = [
    ...cart.map((item) => `
      <div class="order-summary-row">
        <span>${item.quantidade}× ${escapeHtml(item.nome)} · ${escapeHtml(item.cor)}</span>
        <strong>${formatMoney(item.preco * item.quantidade)}</strong>
      </div>
    `),
    `<hr style="width:100%;border:0;border-top:1px solid var(--line);">`,
    `<div class="order-summary-row"><strong>Total</strong><strong>${formatMoney(cartTotal(cart))}</strong></div>`,
  ].join("");
}

function openCheckout() {
  if (!getCart().length) return;
  closeCart();
  renderCheckoutSummary();
  elements.checkoutModal.classList.add("open");
  elements.checkoutModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeCheckout() {
  elements.checkoutModal.classList.remove("open");
  elements.checkoutModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function orderMessage(order) {
  const lines = order.itens.map(
    (item) => `• ${item.quantidade}x ${item.nome} (${item.cor}) — ${formatMoney(item.preco * item.quantidade)}`,
  );
  return [
    `Olá! Quero confirmar o pedido ${order.codigo}.`,
    "",
    ...lines,
    "",
    `Total: ${formatMoney(order.total)}`,
    `Cliente: ${order.cliente.nome}`,
    `Recebimento: ${order.entrega.tipo}`,
    order.entrega.endereco ? `Endereço: ${order.entrega.endereco}` : "",
    `Pagamento: ${order.pagamento}`,
  ].filter(Boolean).join("\n");
}

async function submitOrder(event) {
  event.preventDefault();
  const cart = getCart();
  if (!cart.length) return toast("Seu carrinho está vazio.", "error");

  const submitButton = document.getElementById("submitOrder");
  const deliveryType = document.getElementById("deliveryType").value;
  const order = {
    codigo: `NC-${Date.now().toString().slice(-7)}`,
    cliente: {
      nome: document.getElementById("customerName").value.trim(),
      telefone: normalizePhone(document.getElementById("customerPhone").value),
    },
    entrega: {
      tipo: deliveryType,
      endereco: deliveryType === "Entrega"
        ? document.getElementById("customerAddress").value.trim()
        : "",
    },
    pagamento: document.getElementById("paymentMethod").value,
    itens: cart.map((item) => ({
      produto_id: item.produto_id,
      nome: item.nome,
      variacao_id: item.variacao_id,
      cor: item.cor || "Padrão",
      preco: Number(item.preco) || 0,
      quantidade: Number(item.quantidade) || 0,
      sku: item.sku || "",
    })),
    total: cartTotal(cart),
    status: "novo",
    origem: "store",
    criado_em: serverTimestamp(),
  };

  if (!order.cliente.nome || !order.cliente.telefone) {
    return toast("Informe seu nome e WhatsApp.", "error");
  }
  if (deliveryType === "Entrega" && !order.entrega.endereco) {
    return toast("Informe o endereço de entrega.", "error");
  }

  setBusy(submitButton, true, "Preparando pedido…");
  try {
    if (!auth.currentUser) await signInAnonymously(auth);
    await addDoc(collection(db, "pedidos"), {
      ...order,
      cliente_uid: auth.currentUser?.uid || "",
    });
  } catch (error) {
    console.warn("Pedido não gravado no painel; seguindo pelo atendimento:", error);
  }

  const phone = supportPhone();
  const message = orderMessage(order);
  clearCart();
  renderCart();
  closeCheckout();
  elements.checkoutForm.reset();
  setBusy(submitButton, false);

  if (phone) {
    window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  } else {
    await navigator.clipboard?.writeText(message).catch(() => {});
    toast(`Pedido ${order.codigo} criado. O resumo foi copiado.`, "success");
  }
}

elements.search.addEventListener("input", debounce((event) => {
  state.search = event.target.value;
  renderProducts();
}));

elements.categoryStrip.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  renderCatalog();
});

elements.productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quick-add]");
  if (!button) return;
  event.preventDefault();
  const product = state.products.find((item) => item.id === button.dataset.quickAdd);
  if (product) addProduct(product);
});

elements.cartItems.addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-qty-key]");
  const removeButton = event.target.closest("[data-remove-key]");
  if (quantityButton) {
    const cart = getCart();
    const item = cart.find((entry) => cartKey(entry.produto_id, entry.variacao_id) === quantityButton.dataset.qtyKey);
    if (item) updateCartQuantity(quantityButton.dataset.qtyKey, item.quantidade + Number(quantityButton.dataset.delta));
    renderCart();
  }
  if (removeButton) {
    removeCartItem(removeButton.dataset.removeKey);
    renderCart();
  }
});

document.getElementById("openCart").addEventListener("click", openCart);
document.getElementById("closeCart").addEventListener("click", closeCart);
document.getElementById("keepShopping").addEventListener("click", closeCart);
document.getElementById("startCheckout").addEventListener("click", openCheckout);
document.getElementById("closeCheckout").addEventListener("click", closeCheckout);
document.getElementById("cancelCheckout").addEventListener("click", closeCheckout);
elements.checkoutForm.addEventListener("submit", submitOrder);
elements.cartDrawer.addEventListener("click", (event) => {
  if (event.target === elements.cartDrawer) closeCart();
});
elements.checkoutModal.addEventListener("click", (event) => {
  if (event.target === elements.checkoutModal) closeCheckout();
});
document.getElementById("deliveryType").addEventListener("change", (event) => {
  const delivery = event.target.value === "Entrega";
  elements.addressField.hidden = !delivery;
  document.getElementById("customerAddress").required = delivery;
});
window.addEventListener("nexcell:cart", renderCart);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCart();
    closeCheckout();
  }
});

onSnapshot(collection(db, "produtos"), (snapshot) => {
  state.products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  renderCatalog();
}, (error) => {
  console.error(error);
  elements.productGrid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1;">
      <strong>Não foi possível carregar o catálogo</strong>
      <span>Atualize a página em alguns instantes ou fale com a loja.</span>
    </div>
  `;
  elements.catalogStatus.textContent = "Catálogo temporariamente indisponível";
});

loadConfig();
renderCart();
if (new URLSearchParams(location.search).get("carrinho") === "1") openCart();
