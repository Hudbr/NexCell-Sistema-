const NEXCELL_ICON = "https://phhncvufnufroyifaghe.supabase.co/functions/v1/nexcell-logo";

function ensureNexcellFavicon() {
  if (typeof document === "undefined") return;
  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.type = "image/webp";
  icon.href = NEXCELL_ICON;

  let apple = document.querySelector('link[rel="apple-touch-icon"]');
  if (!apple) {
    apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    document.head.appendChild(apple);
  }
  apple.href = NEXCELL_ICON;
}

ensureNexcellFavicon();

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function formatMoney(value) {
  return money.format(Number(value) || 0);
}

export function formatDate(value) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function debounce(callback, wait = 180) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(...args), wait);
  };
}

export function productImages(product) {
  const values = Array.isArray(product.imagens) ? product.imagens : [];
  const normalized = values.filter((item) => typeof item === "string" && item.trim());
  if (product.imagem && !normalized.includes(product.imagem)) normalized.unshift(product.imagem);
  return normalized;
}

export function productVariants(product) {
  if (Array.isArray(product.variacoes) && product.variacoes.length) {
    return product.variacoes.map((variant, index) => ({
      id: variant.id || `${slugify(variant.cor || "padrao")}-${index}`,
      cor: variant.cor || "Padrão",
      hex: variant.hex || "#94a3b8",
      estoque: Math.max(0, Number(variant.estoque) || 0),
      sku: variant.sku || "",
    }));
  }
  return [{
    id: "padrao",
    cor: "Padrão",
    hex: "#94a3b8",
    estoque: Math.max(0, Number(product.estoque) || 0),
    sku: product.codigo || "",
  }];
}

export function availableStock(product) {
  const variants = productVariants(product);
  if (Array.isArray(product.variacoes) && product.variacoes.length) {
    return variants.reduce((sum, item) => sum + item.estoque, 0);
  }
  return Math.max(0, Number(product.estoque) || 0);
}

export function salePrice(product) {
  const promotional = Number(product.preco_promocional) || 0;
  const regular = Number(product.preco) || 0;
  return promotional > 0 && promotional < regular ? promotional : regular;
}

export function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function toast(message, type = "info") {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.append(host);
  }

  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.setAttribute("role", "status");
  item.textContent = message;
  host.append(item);
  window.setTimeout(() => item.classList.add("toast-out"), 2800);
  window.setTimeout(() => item.remove(), 3200);
}

export function setBusy(button, busy, busyLabel = "Aguarde…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
  }
}
