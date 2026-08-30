import { loadJson, saveJson } from "./utils.js";

const CART_KEY = "nexcell_store_cart_v2";

export function getCart() {
  const value = loadJson(CART_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function saveCart(items) {
  saveJson(CART_KEY, items);
  window.dispatchEvent(new CustomEvent("nexcell:cart", { detail: items }));
  return items;
}

export function cartKey(productId, variantId) {
  return `${productId}::${variantId || "padrao"}`;
}

export function addCartItem(item) {
  const cart = getCart();
  const key = cartKey(item.produto_id, item.variacao_id);
  const index = cart.findIndex((entry) => cartKey(entry.produto_id, entry.variacao_id) === key);
  const max = Math.max(0, Number(item.estoque_disponivel) || 0);

  if (index >= 0) {
    cart[index].quantidade = Math.min(max, cart[index].quantidade + (item.quantidade || 1));
  } else {
    cart.push({ ...item, quantidade: Math.min(max, item.quantidade || 1) });
  }
  return saveCart(cart.filter((entry) => entry.quantidade > 0));
}

export function updateCartQuantity(key, quantity) {
  const cart = getCart();
  const item = cart.find((entry) => cartKey(entry.produto_id, entry.variacao_id) === key);
  if (!item) return cart;
  const max = Math.max(0, Number(item.estoque_disponivel) || 0);
  item.quantidade = Math.min(max, Math.max(0, Number(quantity) || 0));
  return saveCart(cart.filter((entry) => entry.quantidade > 0));
}

export function removeCartItem(key) {
  return saveCart(getCart().filter((entry) => cartKey(entry.produto_id, entry.variacao_id) !== key));
}

export function clearCart() {
  return saveCart([]);
}

export function cartCount(items = getCart()) {
  return items.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
}

export function cartTotal(items = getCart()) {
  return items.reduce(
    (sum, item) => sum + (Number(item.preco) || 0) * (Number(item.quantidade) || 0),
    0,
  );
}
