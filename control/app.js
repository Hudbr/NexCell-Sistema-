import {
  auth,
  collection,
  db,
  deleteDoc,
  doc,
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
  updateDoc,
} from "../assets/js/firebase.js";
import {
  availableStock,
  debounce,
  escapeHtml,
  formatDate,
  formatMoney,
  productVariants,
  salePrice,
  setBusy,
  slugify,
  toast,
} from "../assets/js/utils.js";

const views = {
  dashboard: ["Dashboard", "Indicadores integrados da NexCell."],
  products: ["Produtos & estoque", "Cadastre produtos, cores, preços e disponibilidade."],
  orders: ["Pedidos da Store", "Acompanhe os pedidos feitos no catálogo público."],
  sales: ["Vendas & caixa", "Consulte o extrato das vendas do PDV."],
  team: ["Equipe & acessos", "Aprove e limite o acesso de cada colaborador."],
  settings: ["Configurações", "Dados usados pela Store, pelo PDV e pelos comprovantes."],
};

const state = {
  user: null,
  profile: null,
  products: [],
  orders: [],
  sales: [],
  users: [],
  config: { loja_nome: "NexCell Store", loja_doc: "", loja_tel: "", loja_pix: "", alerta_estoque: 3, msg_rodape: "" },
  productSearch: "",
  orderStatus: "Todos",
  editingImages: [],
  unsubscribers: [],
};

const elements = {
  authScreen: document.getElementById("authScreen"),
  workspace: document.getElementById("workspace"),
  productsTable: document.getElementById("productsTable"),
  ordersTable: document.getElementById("ordersTable"),
  salesTable: document.getElementById("salesTable"),
  teamTable: document.getElementById("teamTable"),
  variantEditor: document.getElementById("variantEditor"),
};

function authMessage(message, error = false) {
  const host = document.getElementById("controlLoginMessage");
  host.textContent = message;
  host.style.color = error ? "var(--danger)" : "#475467";
  host.classList.toggle("show", Boolean(message));
}

function firebaseMessage(error) {
  if (error?.code === "auth/invalid-credential") return "E-mail ou senha incorretos.";
  if (error?.code === "auth/too-many-requests") return "Muitas tentativas. Aguarde alguns minutos.";
  if (error?.code === "auth/network-request-failed") return "Falha de conexão. Verifique a internet.";
  return error?.message || "Não foi possível concluir a operação.";
}

function deactivate() {
  elements.workspace.classList.remove("ready");
  elements.authScreen.style.display = "grid";
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function activate() {
  elements.authScreen.style.display = "none";
  elements.workspace.classList.add("ready");
  const name = state.profile?.nome || state.user.email?.split("@")[0] || "Administrador";
  document.getElementById("adminName").textContent = name;
  document.getElementById("adminAvatar").textContent = name[0].toUpperCase();
  subscribeData();
}

onAuthStateChanged(auth, async (user) => {
  deactivate();
  document.getElementById("controlLogin").hidden = false;
  document.getElementById("noAdminView").hidden = true;
  if (!user || user.isAnonymous) {
    if (user?.isAnonymous) await signOut(auth).catch(() => {});
    state.user = null;
    state.profile = null;
    return;
  }
  state.user = user;
  try {
    state.profile = await getUserProfile(user.uid);
  } catch (error) {
    authMessage("Não foi possível carregar seu perfil.", true);
    return;
  }
  if (state.profile?.cargo !== "admin" || state.profile?.status === "bloqueado") {
    document.getElementById("controlLogin").hidden = true;
    document.getElementById("noAdminView").hidden = false;
    return;
  }
  activate();
});

document.getElementById("controlLogin").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("controlLoginButton");
  setBusy(button, true, "Entrando…");
  authMessage("");
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("controlEmail").value.trim(),
      document.getElementById("controlPassword").value,
    );
  } catch (error) {
    authMessage(firebaseMessage(error), true);
  } finally {
    setBusy(button, false);
  }
});

document.getElementById("sendAdminReset").addEventListener("click", async () => {
  const email = document.getElementById("controlEmail").value.trim();
  if (!email) return authMessage("Digite o e-mail primeiro.", true);
  try {
    await sendPasswordResetEmail(auth, email);
    authMessage("Link enviado. Verifique também a caixa de spam.");
  } catch (error) {
    authMessage(firebaseMessage(error), true);
  }
});

async function logout() {
  await signOut(auth).catch(() => {});
}

["logoutButton", "mobileLogout", "noAdminLogout"].forEach((id) => {
  document.getElementById(id).addEventListener("click", logout);
});

function subscribeData() {
  state.unsubscribers.push(
    onSnapshot(collection(db, "produtos"), (snapshot) => {
      state.products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderProducts();
      renderDashboard();
    }),
    onSnapshot(collection(db, "pedidos"), (snapshot) => {
      state.orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderOrders();
      renderDashboard();
    }),
    onSnapshot(collection(db, "vendas"), (snapshot) => {
      state.sales = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderSales();
      renderDashboard();
    }),
    onSnapshot(collection(db, "usuarios"), (snapshot) => {
      state.users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderTeam();
      renderDashboard();
    }),
    onSnapshot(doc(db, "configuracoes", "geral"), (snapshot) => {
      if (snapshot.exists()) state.config = { ...state.config, ...snapshot.data() };
      populateSettings();
      renderProducts();
      renderDashboard();
    }),
  );
}

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

let confirmResolver = null;

function confirmAction(message, buttonLabel = "Confirmar") {
  document.getElementById("confirmMessage").textContent = message;
  document.getElementById("confirmAccept").textContent = buttonLabel;
  openModal("confirmModal");
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function settleConfirm(value) {
  closeModal("confirmModal");
  confirmResolver?.(value);
  confirmResolver = null;
}

document.getElementById("confirmAccept").addEventListener("click", () => settleConfirm(true));
document.getElementById("confirmCancel").addEventListener("click", () => settleConfirm(false));
document.getElementById("confirmClose").addEventListener("click", () => settleConfirm(false));

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.dataset.closeModal));
});
document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target !== modal) return;
    if (modal.id === "confirmModal") settleConfirm(false);
    else closeModal(modal.id);
  });
});

function switchView(view) {
  document.querySelectorAll(".workspace-view").forEach((item) => item.classList.toggle("active", item.id === `view-${view}`));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const [title, subtitle] = views[view] || views.dashboard;
  document.getElementById("viewTitle").textContent = title;
  document.getElementById("viewSubtitle").textContent = subtitle;
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-go-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.goView)));

function todayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function orderDate(order) {
  return order.criado_em?.toDate?.() || new Date(order.criado_em || order.data || 0);
}

function saleDate(sale) {
  return sale.criado_em?.toDate?.() || new Date(sale.data_venda || sale.criado_em || 0);
}

function renderDashboard() {
  const today = todayKey();
  const salesToday = state.sales.filter((sale) => sale.status !== "cancelada" && todayKey(saleDate(sale)) === today);
  const totalToday = salesToday.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
  const pendingOrders = state.orders.filter((order) => ["novo", "confirmado", "preparando", "pronto"].includes(order.status));
  const threshold = Math.max(0, Number(state.config.alerta_estoque) || 3);
  const lowStock = state.products.filter((product) => availableStock(product) <= threshold);
  const pendingUsers = state.users.filter((user) => user.status === "pendente");

  document.getElementById("statSalesToday").textContent = formatMoney(totalToday);
  document.getElementById("statSalesCount").textContent = `${salesToday.length} ${salesToday.length === 1 ? "venda concluída" : "vendas concluídas"}`;
  document.getElementById("statOrders").textContent = pendingOrders.length;
  document.getElementById("statLowStock").textContent = lowStock.length;
  document.getElementById("statPendingUsers").textContent = pendingUsers.length;
  document.getElementById("pendingBadge").hidden = !pendingUsers.length;
  document.getElementById("pendingBadge").textContent = pendingUsers.length;

  document.getElementById("recentOrders").innerHTML = state.orders.length
    ? [...state.orders].sort((a, b) => orderDate(b) - orderDate(a)).slice(0, 5).map((order) => `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:10px;">
        <span><strong>${escapeHtml(order.codigo || order.id.slice(0, 8))}</strong><br><small>${escapeHtml(order.cliente?.nome || "Cliente")}</small></span>
        <span style="text-align:right;"><span class="badge">${escapeHtml(order.status || "novo")}</span><br><strong>${formatMoney(order.total)}</strong></span>
      </div>
    `).join("")
    : `<div class="empty-state" style="min-height:170px;"><strong>Nenhum pedido</strong><span>Os pedidos da Store aparecerão aqui.</span></div>`;

  document.getElementById("lowStockList").innerHTML = lowStock.length
    ? lowStock.sort((a, b) => availableStock(a) - availableStock(b)).slice(0, 6).map((product) => `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:10px;"><span><strong>${escapeHtml(product.nome)}</strong><br><small>${escapeHtml(product.modelo || product.codigo || "")}</small></span><span class="badge badge-danger">${availableStock(product)} un</span></div>
    `).join("")
    : `<div class="empty-state" style="min-height:170px;"><strong>Estoque em dia</strong><span>Nenhum produto atingiu o limite configurado.</span></div>`;
}

function filteredProducts() {
  const term = state.productSearch.trim().toLocaleLowerCase("pt-BR");
  return state.products.filter((product) => !term || [product.nome, product.codigo, product.marca, product.modelo, product.categoria].join(" ").toLocaleLowerCase("pt-BR").includes(term));
}

function renderProducts() {
  if (!elements.productsTable) return;
  const products = filteredProducts().sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  document.getElementById("productCountBadge").textContent = `${products.length} ${products.length === 1 ? "produto" : "produtos"}`;
  elements.productsTable.innerHTML = products.length
    ? `<table class="data-table"><thead><tr><th>Produto</th><th>Categoria</th><th>Cores</th><th>Preço</th><th>Estoque</th><th>Store</th><th>Ações</th></tr></thead><tbody>${products.map((product) => {
      const stock = availableStock(product);
      const low = stock <= (Number(state.config.alerta_estoque) || 3);
      return `<tr><td><strong>${escapeHtml(product.nome || "Produto")}</strong><br><small>${escapeHtml([product.marca, product.modelo, product.codigo].filter(Boolean).join(" · "))}</small></td><td>${escapeHtml(product.categoria || "—")}</td><td>${productVariants(product).length}</td><td><strong>${formatMoney(salePrice(product))}</strong></td><td><span class="badge ${low ? "badge-danger" : "badge-success"}">${stock} un</span></td><td>${product.ativo_store === false ? '<span class="badge">Oculto</span>' : '<span class="badge badge-success">Visível</span>'}</td><td><div class="table-actions"><button class="btn-mini" data-edit-product="${product.id}">Editar</button><button class="btn-mini" data-delete-product="${product.id}">Excluir</button></div></td></tr>`;
    }).join("")}</tbody></table>`
    : `<div class="empty-state"><strong>Nenhum produto cadastrado</strong><span>Crie o primeiro produto para alimentar a Store e o PDV.</span></div>`;
}

document.getElementById("controlProductSearch").addEventListener("input", debounce((event) => {
  state.productSearch = event.target.value;
  renderProducts();
}));

function variantRow(variant = {}) {
  const id = variant.id || crypto.randomUUID();
  return `
    <div class="variant-row" data-variant-row data-variant-id="${escapeHtml(id)}">
      <div class="field"><label>Cor</label><input class="input" data-variant-field="cor" value="${escapeHtml(variant.cor || "")}" placeholder="Ex: Preto" required></div>
      <div class="field"><label>Hex</label><input class="input" data-variant-field="hex" type="color" value="${escapeHtml(variant.hex || "#111827")}"></div>
      <div class="field"><label>Estoque</label><input class="input" data-variant-field="estoque" type="number" min="0" value="${Number(variant.estoque) || 0}" required></div>
      <div class="field"><label>SKU/código</label><input class="input" data-variant-field="sku" value="${escapeHtml(variant.sku || "")}"></div>
      <button class="btn-mini" type="button" data-remove-variant>×</button>
    </div>
  `;
}

function openProduct(product = null) {
  document.getElementById("productForm").reset();
  document.getElementById("productId").value = product?.id || "";
  document.getElementById("productModalTitle").textContent = product ? "Editar produto" : "Novo produto";
  document.getElementById("productName").value = product?.nome || "";
  document.getElementById("productCode").value = product?.codigo || "";
  document.getElementById("productCategory").value = product?.categoria || "";
  document.getElementById("productBrand").value = product?.marca || "";
  document.getElementById("productModel").value = product?.modelo || "";
  document.getElementById("productPrice").value = product?.preco ?? "";
  document.getElementById("productPromoPrice").value = product?.preco_promocional || "";
  document.getElementById("productDescription").value = product?.descricao || "";
  state.editingImages = Array.isArray(product?.imagens)
    ? [...product.imagens]
    : (product?.imagem ? [product.imagem] : []);
  document.getElementById("productImages").value = state.editingImages
    .filter((image) => !image.startsWith("data:"))
    .join("\n");
  document.getElementById("productImageFiles").value = "";
  updateImageStatus();
  document.getElementById("productActiveStore").checked = product?.ativo_store !== false;
  document.getElementById("productFeatured").checked = Boolean(product?.destaque);
  const variants = product ? productVariants(product) : [{ cor: "Padrão", hex: "#111827", estoque: 0, sku: "" }];
  elements.variantEditor.innerHTML = variants.map(variantRow).join("");
  openModal("productModal");
}

function updateImageStatus() {
  const count = state.editingImages.length;
  document.getElementById("productImageStatus").textContent = count
    ? `${count} ${count === 1 ? "imagem atual será mantida" : "imagens atuais serão mantidas"}`
    : "Nenhuma imagem atual";
}

document.getElementById("clearProductImages").addEventListener("click", () => {
  state.editingImages = [];
  document.getElementById("productImages").value = "";
  document.getElementById("productImageFiles").value = "";
  updateImageStatus();
});

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.76;
      let dataUrl = canvas.toDataURL("image/webp", quality);
      while (dataUrl.length > 230000 && quality > 0.42) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL("image/webp", quality);
      }
      URL.revokeObjectURL(objectUrl);
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Não foi possível ler ${file.name}.`));
    };
    image.src = objectUrl;
  });
}

document.querySelectorAll("[data-open-product]").forEach((button) => button.addEventListener("click", () => openProduct()));
document.getElementById("addVariant").addEventListener("click", () => elements.variantEditor.insertAdjacentHTML("beforeend", variantRow()));
elements.variantEditor.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-variant]");
  if (!button) return;
  if (elements.variantEditor.querySelectorAll("[data-variant-row]").length === 1) return toast("O produto precisa ter ao menos uma variação.", "error");
  button.closest("[data-variant-row]").remove();
});

function readVariants() {
  const usedIds = new Set();
  return [...elements.variantEditor.querySelectorAll("[data-variant-row]")].map((row, index) => {
    const value = (field) => row.querySelector(`[data-variant-field="${field}"]`).value.trim();
    let id = row.dataset.variantId || `${slugify(value("cor"))}-${index}`;
    if (usedIds.has(id)) id = `${id}-${index}`;
    usedIds.add(id);
    return { id, cor: value("cor") || "Padrão", hex: value("hex") || "#111827", estoque: Math.max(0, Number(value("estoque")) || 0), sku: value("sku") };
  });
}

document.getElementById("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("saveProduct");
  const id = document.getElementById("productId").value;
  const variants = readVariants();
  const regular = Math.max(0, Number(document.getElementById("productPrice").value) || 0);
  const promotional = Math.max(0, Number(document.getElementById("productPromoPrice").value) || 0);
  if (promotional && promotional >= regular) return toast("O preço promocional precisa ser menor que o preço normal.", "error");
  const urlImages = document.getElementById("productImages").value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const retainedDataImages = state.editingImages.filter((image) => image.startsWith("data:"));
  const imageFiles = [...document.getElementById("productImageFiles").files]
    .filter((file) => file.type.startsWith("image/"));
  if (urlImages.length + retainedDataImages.length + imageFiles.length > 4) {
    return toast("Use no máximo 4 imagens por produto.", "error");
  }
  const payload = {
    nome: document.getElementById("productName").value.trim(),
    codigo: document.getElementById("productCode").value.trim(),
    categoria: document.getElementById("productCategory").value.trim(),
    marca: document.getElementById("productBrand").value.trim(),
    modelo: document.getElementById("productModel").value.trim(),
    preco: regular,
    preco_promocional: promotional,
    descricao: document.getElementById("productDescription").value.trim(),
    imagens: [],
    ativo_store: document.getElementById("productActiveStore").checked,
    destaque: document.getElementById("productFeatured").checked,
    variacoes: variants,
    estoque: variants.reduce((sum, variant) => sum + variant.estoque, 0),
    atualizado_em: serverTimestamp(),
  };
  setBusy(button, true, "Salvando…");
  try {
    const uploadedImages = [];
    for (const file of imageFiles) uploadedImages.push(await compressImage(file));
    payload.imagens = [...urlImages, ...retainedDataImages, ...uploadedImages];
    if (id) await setDoc(doc(db, "produtos", id), payload, { merge: true });
    else await setDoc(doc(collection(db, "produtos")), { ...payload, criado_em: serverTimestamp() });
    closeModal("productModal");
    toast("Produto salvo e sincronizado.", "success");
  } catch (error) {
    console.error(error);
    toast("Não foi possível salvar o produto.", "error");
  } finally {
    setBusy(button, false);
  }
});

elements.productsTable.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-product]");
  const remove = event.target.closest("[data-delete-product]");
  if (edit) {
    const product = state.products.find((item) => item.id === edit.dataset.editProduct);
    if (product) openProduct(product);
  }
  if (remove) {
    const product = state.products.find((item) => item.id === remove.dataset.deleteProduct);
    if (!product || !(await confirmAction(`Excluir “${product.nome}” da Store e do PDV?`, "Excluir produto"))) return;
    try {
      await deleteDoc(doc(db, "produtos", product.id));
      toast("Produto excluído.", "success");
    } catch (error) {
      toast("Não foi possível excluir o produto.", "error");
    }
  }
});

function statusBadge(status) {
  const type = status === "entregue" ? "badge-success" : status === "cancelado" ? "badge-danger" : status === "novo" ? "badge-warning" : "";
  return `<span class="badge ${type}">${escapeHtml(status || "novo")}</span>`;
}

function filteredOrders() {
  return state.orders
    .filter((order) => state.orderStatus === "Todos" || order.status === state.orderStatus)
    .sort((a, b) => orderDate(b) - orderDate(a));
}

function renderOrders() {
  if (!elements.ordersTable) return;
  const orders = filteredOrders();
  document.getElementById("orderCountBadge").textContent = `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}`;
  elements.ordersTable.innerHTML = orders.length
    ? `<table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Recebimento</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>${orders.map((order) => `<tr><td><strong>${escapeHtml(order.codigo || order.id.slice(0, 8))}</strong><br><small>${formatDate(orderDate(order))}</small></td><td><strong>${escapeHtml(order.cliente?.nome || "Cliente")}</strong><br><small>${escapeHtml(order.cliente?.telefone || "")}</small></td><td>${escapeHtml(order.entrega?.tipo || "—")}</td><td><strong>${formatMoney(order.total)}</strong></td><td>${statusBadge(order.status)}</td><td><div class="table-actions"><button class="btn-mini" data-view-order="${order.id}">Detalhes</button><select class="select" data-order-status="${order.id}" style="min-height:30px;padding:5px 8px;width:125px;"><option value="novo" ${order.status === "novo" ? "selected" : ""}>Novo</option><option value="confirmado" ${order.status === "confirmado" ? "selected" : ""}>Confirmado</option><option value="preparando" ${order.status === "preparando" ? "selected" : ""}>Preparando</option><option value="pronto" ${order.status === "pronto" ? "selected" : ""}>Pronto</option><option value="entregue" ${order.status === "entregue" ? "selected" : ""}>Entregue</option><option value="cancelado" ${order.status === "cancelado" ? "selected" : ""}>Cancelado</option></select></div></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state"><strong>Nenhum pedido neste status</strong><span>Altere o filtro ou aguarde novos pedidos da Store.</span></div>`;
}

document.getElementById("orderStatusFilter").addEventListener("change", (event) => {
  state.orderStatus = event.target.value;
  renderOrders();
});

async function updateOrderStock(order, shouldReserve) {
  const groups = new Map();
  (order.itens || []).forEach((item) => {
    if (!groups.has(item.produto_id)) groups.set(item.produto_id, []);
    groups.get(item.produto_id).push(item);
  });
  const entries = [...groups.entries()];
  await runTransaction(db, async (transaction) => {
    const snapshots = [];
    for (const [productId] of entries) snapshots.push(await transaction.get(doc(db, "produtos", productId)));
    entries.forEach(([productId, items], index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists()) throw new Error(`Produto do pedido não encontrado: ${items[0].nome}`);
      const product = snapshot.data();
      const ref = doc(db, "produtos", productId);
      if (Array.isArray(product.variacoes) && product.variacoes.length) {
        const variants = productVariants(product).map((variant) => {
          const quantity = items.filter((item) => item.variacao_id === variant.id).reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
          const stock = shouldReserve ? variant.estoque - quantity : variant.estoque + quantity;
          if (stock < 0) throw new Error(`Estoque insuficiente para ${product.nome} na cor ${variant.cor}.`);
          return { ...variant, estoque: stock };
        });
        transaction.update(ref, { variacoes: variants, estoque: variants.reduce((sum, item) => sum + item.estoque, 0), atualizado_em: serverTimestamp() });
      } else {
        const quantity = items.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
        const stock = (Number(product.estoque) || 0) + (shouldReserve ? -quantity : quantity);
        if (stock < 0) throw new Error(`Estoque insuficiente para ${product.nome}.`);
        transaction.update(ref, { estoque: stock, atualizado_em: serverTimestamp() });
      }
    });
    transaction.update(doc(db, "pedidos", order.id), {
      estoque_baixado: shouldReserve,
      atualizado_em: serverTimestamp(),
    });
  });
}

async function changeOrderStatus(order, status) {
  const needsStock = ["confirmado", "preparando", "pronto", "entregue"].includes(status);
  try {
    if (needsStock && !order.estoque_baixado) await updateOrderStock(order, true);
    if (status === "cancelado" && order.estoque_baixado) await updateOrderStock(order, false);
    await updateDoc(doc(db, "pedidos", order.id), { status, atualizado_em: serverTimestamp() });
    toast("Status do pedido atualizado.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Não foi possível atualizar o pedido.", "error");
    renderOrders();
  }
}

function showOrder(order) {
  document.getElementById("orderModalTitle").textContent = `Pedido ${order.codigo || order.id.slice(0, 8)}`;
  document.getElementById("orderDetail").innerHTML = `
    <div class="content-grid" style="font-size:11px;">
      <div><span class="stat-label">Cliente</span><strong style="display:block;margin-top:4px;">${escapeHtml(order.cliente?.nome || "—")}</strong><span>${escapeHtml(order.cliente?.telefone || "")}</span></div>
      <div><span class="stat-label">Status</span><div style="margin-top:5px;">${statusBadge(order.status)}</div></div>
      <div><span class="stat-label">Recebimento</span><strong style="display:block;margin-top:4px;">${escapeHtml(order.entrega?.tipo || "—")}</strong><span>${escapeHtml(order.entrega?.endereco || "")}</span></div>
      <div><span class="stat-label">Pagamento</span><strong style="display:block;margin-top:4px;">${escapeHtml(order.pagamento || "—")}</strong></div>
      <div class="span-2 order-summary">${(order.itens || []).map((item) => `<div class="order-summary-row"><span>${item.quantidade}× ${escapeHtml(item.nome)} · ${escapeHtml(item.cor)}</span><strong>${formatMoney(item.preco * item.quantidade)}</strong></div>`).join("")}<hr style="width:100%;border:0;border-top:1px solid var(--line);"><div class="order-summary-row"><strong>Total</strong><strong>${formatMoney(order.total)}</strong></div></div>
    </div>
  `;
  openModal("orderModal");
}

elements.ordersTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view-order]");
  if (!button) return;
  const order = state.orders.find((item) => item.id === button.dataset.viewOrder);
  if (order) showOrder(order);
});
elements.ordersTable.addEventListener("change", (event) => {
  const select = event.target.closest("[data-order-status]");
  if (!select) return;
  const order = state.orders.find((item) => item.id === select.dataset.orderStatus);
  if (order) changeOrderStatus(order, select.value);
});

function filteredSales() {
  const start = document.getElementById("salesStart").value;
  const end = document.getElementById("salesEnd").value;
  return state.sales.filter((sale) => {
    const key = todayKey(saleDate(sale));
    return (!start || key >= start) && (!end || key <= end);
  }).sort((a, b) => saleDate(b) - saleDate(a));
}

function renderSales() {
  if (!elements.salesTable) return;
  const sales = filteredSales();
  const valid = sales.filter((sale) => sale.status !== "cancelada");
  const total = valid.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
  const pix = valid.filter((sale) => sale.metodo === "PIX").reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
  document.getElementById("salesPeriodTotal").textContent = formatMoney(total);
  document.getElementById("salesPeriodCount").textContent = `${valid.length} ${valid.length === 1 ? "venda" : "vendas"}`;
  document.getElementById("salesAverage").textContent = formatMoney(valid.length ? total / valid.length : 0);
  document.getElementById("salesPix").textContent = formatMoney(pix);
  document.getElementById("salesCanceled").textContent = sales.length - valid.length;
  elements.salesTable.innerHTML = sales.length
    ? `<table class="data-table"><thead><tr><th>Venda</th><th>Data</th><th>Operador</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>${sales.map((sale) => `<tr><td><strong>${escapeHtml(sale.codigo || sale.id.slice(0, 8).toUpperCase())}</strong></td><td>${formatDate(saleDate(sale))}</td><td>${escapeHtml(sale.operador_nome || "—")}</td><td>${escapeHtml(sale.metodo || "—")}</td><td><strong>${formatMoney(sale.total)}</strong></td><td>${sale.status === "cancelada" ? '<span class="badge badge-danger">Cancelada</span>' : '<span class="badge badge-success">Concluída</span>'}</td><td>${sale.status === "cancelada" ? "—" : `<button class="btn-mini" data-cancel-sale="${sale.id}">Cancelar</button>`}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state"><strong>Nenhuma venda no período</strong><span>Altere as datas ou registre uma venda no PDV.</span></div>`;
}

function setDefaultSalesDates() {
  const now = new Date();
  document.getElementById("salesStart").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  document.getElementById("salesEnd").value = todayKey(now);
}
setDefaultSalesDates();
["salesStart", "salesEnd"].forEach((id) => document.getElementById(id).addEventListener("change", renderSales));

async function cancelSale(sale) {
  if (!(await confirmAction(`Cancelar a venda ${sale.codigo || sale.id.slice(0, 8)} e devolver os itens ao estoque?`, "Cancelar venda"))) return;
  const groups = new Map();
  (sale.itens || []).forEach((item) => {
    if (!groups.has(item.produto_id)) groups.set(item.produto_id, []);
    groups.get(item.produto_id).push(item);
  });
  const entries = [...groups.entries()];
  try {
    await runTransaction(db, async (transaction) => {
      const snapshots = [];
      for (const [productId] of entries) snapshots.push(await transaction.get(doc(db, "produtos", productId)));
      entries.forEach(([productId, items], index) => {
        const snapshot = snapshots[index];
        if (!snapshot.exists()) return;
        const product = snapshot.data();
        const ref = doc(db, "produtos", productId);
        if (Array.isArray(product.variacoes) && product.variacoes.length) {
          const variants = productVariants(product).map((variant) => ({
            ...variant,
            estoque: variant.estoque + items.filter((item) => item.variacao_id === variant.id).reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0),
          }));
          transaction.update(ref, { variacoes: variants, estoque: variants.reduce((sum, item) => sum + item.estoque, 0), atualizado_em: serverTimestamp() });
        } else {
          const returned = items.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
          transaction.update(ref, { estoque: (Number(product.estoque) || 0) + returned, atualizado_em: serverTimestamp() });
        }
      });
      transaction.update(doc(db, "vendas", sale.id), { status: "cancelada", cancelada_em: serverTimestamp(), cancelada_por: state.user.uid });
    });
    toast("Venda cancelada e estoque devolvido.", "success");
  } catch (error) {
    console.error(error);
    toast("Não foi possível cancelar a venda.", "error");
  }
}

elements.salesTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cancel-sale]");
  if (!button) return;
  const sale = state.sales.find((item) => item.id === button.dataset.cancelSale);
  if (sale) cancelSale(sale);
});

document.getElementById("exportSales").addEventListener("click", () => {
  const sales = filteredSales();
  if (!sales.length) return toast("Não há vendas para exportar.", "error");
  const lines = [
    ["Código", "Data", "Operador", "Pagamento", "Subtotal", "Desconto", "Total", "Status"],
    ...sales.map((sale) => [sale.codigo || sale.id, formatDate(saleDate(sale)), sale.operador_nome || "", sale.metodo || "", sale.subtotal || 0, sale.desconto || 0, sale.total || 0, sale.status || "concluida"]),
  ];
  const csv = lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nexcell-vendas-${todayKey()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

function renderTeam() {
  if (!elements.teamTable) return;
  const users = [...state.users].sort((a, b) => {
    if (a.status === "pendente" && b.status !== "pendente") return -1;
    if (b.status === "pendente" && a.status !== "pendente") return 1;
    return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
  });
  document.getElementById("teamCountBadge").textContent = `${users.length} ${users.length === 1 ? "usuário" : "usuários"}`;
  elements.teamTable.innerHTML = users.length
    ? `<table class="data-table"><thead><tr><th>Colaborador</th><th>Cargo</th><th>Status</th><th>Permissões</th><th>Ações</th></tr></thead><tbody>${users.map((user) => {
      const permissions = user.cargo === "admin" ? 6 : Object.values(user.permissoes || {}).filter(Boolean).length;
      const statusType = user.status === "pendente" ? "badge-warning" : user.status === "bloqueado" ? "badge-danger" : "badge-success";
      return `<tr><td><strong>${escapeHtml(user.nome || "Sem nome")}</strong><br><small>${escapeHtml(user.email || "")}</small></td><td>${escapeHtml(user.cargo || "colaborador")}</td><td><span class="badge ${statusType}">${escapeHtml(user.status || "ativo")}</span></td><td>${permissions} funções</td><td><button class="btn-mini" data-edit-user="${user.id}">${user.status === "pendente" ? "Revisar solicitação" : "Editar acesso"}</button></td></tr>`;
    }).join("")}</tbody></table>`
    : `<div class="empty-state"><strong>Nenhum usuário</strong><span>As solicitações feitas pelo PDV aparecerão aqui.</span></div>`;
}

function openTeamUser(user) {
  document.getElementById("teamUserId").value = user.id;
  document.getElementById("teamUserSummary").innerHTML = `<div style="padding:12px;border-radius:12px;background:#f8fafc;"><strong>${escapeHtml(user.nome || "Sem nome")}</strong><br><span style="font-size:10px;color:var(--muted);">${escapeHtml(user.email || "")}</span></div>`;
  document.getElementById("teamStatus").value = user.status || "ativo";
  document.getElementById("teamRole").value = user.cargo === "admin" ? "admin" : "colaborador";
  const permissions = user.permissoes || {};
  document.getElementById("permDashboard").checked = Boolean(permissions.dashboard);
  document.getElementById("permSell").checked = Boolean(permissions.vender);
  document.getElementById("permStockView").checked = Boolean(permissions.estoque_ver);
  document.getElementById("permStockEdit").checked = Boolean(permissions.estoque_editar);
  document.getElementById("permFinance").checked = Boolean(permissions.financeiro);
  document.getElementById("permCancelSale").checked = Boolean(permissions.cancelar_venda);
  openModal("teamModal");
}

elements.teamTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-user]");
  if (!button) return;
  const user = state.users.find((item) => item.id === button.dataset.editUser);
  if (user) openTeamUser(user);
});

document.getElementById("teamForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = document.getElementById("teamUserId").value;
  if (!id) return;
  const role = document.getElementById("teamRole").value;
  if (id === state.user.uid && role !== "admin") return toast("Você não pode remover o próprio acesso administrativo.", "error");
  const button = document.getElementById("saveTeamUser");
  setBusy(button, true, "Salvando…");
  try {
    await setDoc(doc(db, "usuarios", id), {
      status: document.getElementById("teamStatus").value,
      cargo: role,
      permissoes: {
        dashboard: document.getElementById("permDashboard").checked,
        vender: document.getElementById("permSell").checked,
        estoque_ver: document.getElementById("permStockView").checked,
        estoque_editar: document.getElementById("permStockEdit").checked,
        financeiro: document.getElementById("permFinance").checked,
        cancelar_venda: document.getElementById("permCancelSale").checked,
      },
      aprovado_por: state.user.uid,
      atualizado_em: serverTimestamp(),
    }, { merge: true });
    closeModal("teamModal");
    toast("Acesso atualizado.", "success");
  } catch (error) {
    console.error(error);
    toast("Não foi possível atualizar o acesso.", "error");
  } finally {
    setBusy(button, false);
  }
});

function populateSettings() {
  document.getElementById("settingStoreName").value = state.config.loja_nome || "NexCell Store";
  document.getElementById("settingDocument").value = state.config.loja_doc || "";
  document.getElementById("settingPhone").value = state.config.whatsapp || state.config.loja_tel || "";
  document.getElementById("settingPix").value = state.config.loja_pix || "";
  document.getElementById("settingLowStock").value = Number(state.config.alerta_estoque) || 3;
  document.getElementById("settingFooter").value = state.config.msg_rodape || "";
}

document.getElementById("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("saveSettings");
  const phone = document.getElementById("settingPhone").value.trim();
  setBusy(button, true, "Salvando…");
  try {
    await setDoc(doc(db, "configuracoes", "geral"), {
      loja_nome: document.getElementById("settingStoreName").value.trim() || "NexCell Store",
      loja_doc: document.getElementById("settingDocument").value.trim(),
      loja_tel: phone,
      whatsapp: phone,
      loja_pix: document.getElementById("settingPix").value.trim(),
      alerta_estoque: Math.max(0, Number(document.getElementById("settingLowStock").value) || 3),
      msg_rodape: document.getElementById("settingFooter").value.trim(),
      atualizado_em: serverTimestamp(),
    }, { merge: true });
    toast("Configurações salvas.", "success");
  } catch (error) {
    console.error(error);
    toast("Não foi possível salvar as configurações.", "error");
  } finally {
    setBusy(button, false);
  }
});

function updateClock() {
  document.getElementById("liveClock").textContent = new Date().toLocaleTimeString("pt-BR");
}
window.setInterval(updateClock, 1000);
updateClock();
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelectorAll(".modal.open").forEach((modal) => closeModal(modal.id));
});
