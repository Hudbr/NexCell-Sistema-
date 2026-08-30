import { db, doc, getDoc } from "./firebase.js";
import { addCartItem, cartCount, getCart } from "./cart.js";
import {
  escapeHtml,
  formatMoney,
  productImages,
  productVariants,
  salePrice,
  toast,
} from "./utils.js";

const detailHost = document.getElementById("productDetail");
const productId = new URLSearchParams(location.search).get("id");
let selectedVariant = null;
let galleryIndex = 0;
let currentProduct = null;

function updateCartCount() {
  document.getElementById("productCartCount").textContent = cartCount(getCart());
}

function renderGallery(images, productName) {
  const media = images.length
    ? `<img id="galleryImage" src="${escapeHtml(images[0])}" alt="${escapeHtml(productName)}">`
    : `<span class="media-placeholder" aria-hidden="true">NC</span>`;
  const controls = images.length > 1
    ? `
      <button class="gallery-nav gallery-prev" type="button" data-gallery="prev" aria-label="Imagem anterior">←</button>
      <button class="gallery-nav gallery-next" type="button" data-gallery="next" aria-label="Próxima imagem">→</button>
      <div class="gallery-dots">
        ${images.map((_, index) => `<button class="gallery-dot ${index === 0 ? "active" : ""}" type="button" data-gallery-index="${index}" aria-label="Ver imagem ${index + 1}"></button>`).join("")}
      </div>
    `
    : "";
  return `<div class="gallery" id="productGallery">${media}${controls}</div>`;
}

function renderProduct(product) {
  const images = productImages(product);
  const variants = productVariants(product);
  selectedVariant = variants.find((variant) => variant.estoque > 0) || variants[0];
  const regular = Number(product.preco) || 0;
  const price = salePrice(product);
  const promo = price < regular;

  document.title = `${product.nome || "Produto"} • NexCell Store`;
  document.getElementById("breadcrumbName").textContent = product.nome || "Produto";
  detailHost.innerHTML = `
    <article class="product-detail">
      ${renderGallery(images, product.nome || "Produto")}
      <div class="detail-copy">
        <span class="badge">${escapeHtml(product.categoria || "Acessório")}</span>
        <h1>${escapeHtml(product.nome || "Produto")}</h1>
        <p class="detail-model">${escapeHtml([product.marca, product.modelo].filter(Boolean).join(" · ") || "NexCell")}</p>
        <div class="detail-price">
          ${promo ? `<del style="display:block;color:#98a2b3;font-size:12px;">${formatMoney(regular)}</del>` : ""}
          ${formatMoney(price)}
        </div>
        <p class="detail-description">${escapeHtml(product.descricao || "Acessório selecionado pela NexCell para completar sua rotina com praticidade e proteção.")}</p>
        <span class="variant-title">Escolha a cor</span>
        <div class="variant-list" id="variantList">
          ${variants.map((variant) => `
            <button
              class="variant-option ${selectedVariant?.id === variant.id ? "active" : ""}"
              type="button"
              data-variant-id="${escapeHtml(variant.id)}"
              ${variant.estoque <= 0 ? "disabled" : ""}
            >
              <span class="color-dot" style="background:${escapeHtml(variant.hex)}"></span>
              ${escapeHtml(variant.cor)} · ${variant.estoque} un
            </button>
          `).join("")}
        </div>
        <div class="detail-actions">
          <button class="btn btn-primary" id="addDetailToCart" type="button" ${!selectedVariant || selectedVariant.estoque <= 0 ? "disabled" : ""}>
            Adicionar ao carrinho
          </button>
          <a class="btn btn-secondary" href="../store/">Continuar comprando</a>
        </div>
      </div>
    </article>
  `;

  bindProductEvents(images, variants);
}

function setGallery(index, images) {
  if (!images.length) return;
  galleryIndex = (index + images.length) % images.length;
  const image = document.getElementById("galleryImage");
  if (image) image.src = images[galleryIndex];
  document.querySelectorAll("[data-gallery-index]").forEach((dot) => {
    dot.classList.toggle("active", Number(dot.dataset.galleryIndex) === galleryIndex);
  });
}

function bindProductEvents(images, variants) {
  document.getElementById("variantList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-variant-id]");
    if (!button) return;
    selectedVariant = variants.find((variant) => variant.id === button.dataset.variantId);
    document.querySelectorAll("[data-variant-id]").forEach((item) => item.classList.toggle("active", item === button));
  });

  document.getElementById("addDetailToCart").addEventListener("click", () => {
    if (!selectedVariant || selectedVariant.estoque <= 0) return;
    addCartItem({
      produto_id: currentProduct.id,
      nome: currentProduct.nome || "Produto",
      imagem: images[0] || "",
      preco: salePrice(currentProduct),
      variacao_id: selectedVariant.id,
      cor: selectedVariant.cor,
      sku: selectedVariant.sku || currentProduct.codigo || "",
      estoque_disponivel: selectedVariant.estoque,
      quantidade: 1,
    });
    updateCartCount();
    toast("Produto adicionado. Abrindo seu carrinho…", "success");
    window.setTimeout(() => { window.location.href = "../store/?carrinho=1"; }, 450);
  });

  document.querySelectorAll("[data-gallery]").forEach((button) => {
    button.addEventListener("click", () => setGallery(galleryIndex + (button.dataset.gallery === "next" ? 1 : -1), images));
  });
  document.querySelectorAll("[data-gallery-index]").forEach((button) => {
    button.addEventListener("click", () => setGallery(Number(button.dataset.galleryIndex), images));
  });

  const gallery = document.getElementById("productGallery");
  let startX = 0;
  gallery.addEventListener("pointerdown", (event) => { startX = event.clientX; });
  gallery.addEventListener("pointerup", (event) => {
    const delta = event.clientX - startX;
    if (Math.abs(delta) > 45) setGallery(galleryIndex + (delta < 0 ? 1 : -1), images);
  });
}

async function loadProduct() {
  if (!productId) {
    detailHost.innerHTML = `<div class="empty-state"><strong>Produto não informado</strong><span>Volte à loja e escolha um item do catálogo.</span><a class="btn btn-primary" href="../store/">Voltar à loja</a></div>`;
    return;
  }
  try {
    const snapshot = await getDoc(doc(db, "produtos", productId));
    if (!snapshot.exists()) throw new Error("not-found");
    currentProduct = { id: snapshot.id, ...snapshot.data() };
    renderProduct(currentProduct);
  } catch (error) {
    console.error(error);
    detailHost.innerHTML = `<div class="empty-state"><strong>Produto não encontrado</strong><span>Ele pode ter sido removido ou estar temporariamente indisponível.</span><a class="btn btn-primary" href="../store/">Ver outros produtos</a></div>`;
  }
}

document.getElementById("productCartButton").addEventListener("click", () => {
  window.location.href = "../store/?carrinho=1";
});
window.addEventListener("nexcell:cart", updateCartCount);
updateCartCount();
loadProduct();
