const API = location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const cartKey = "memo_cart";
let products = [];
let cart = readCart();

const pageCategory = {
  "the-silk-edit.html": "the-silk-edit",
  "everyday-memo.html": "everyday-memo",
  "occasion-wear.html": "occasion-wear"
};

function money(amount) {
  return `PKR ${Number(amount || 0).toLocaleString("en-PK")}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function apiErrorMessage(result, fallback) {
  const detail = result?.detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      const field = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body").join(" ") : "";
      return field ? `${field}: ${item.msg}` : item.msg;
    }).filter(Boolean).join(" ");
  }
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);
  return detail || result?.message || fallback;
}

function assetUrl(value) {
  const path = String(value || "");
  if (!path) return "";
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  if (location.protocol === "file:" && path.startsWith("/assets/")) return `..${path}`;
  if (location.protocol === "file:" && path.startsWith("assets/")) return `../${path}`;
  if (path.startsWith("/")) return path;
  if (path.startsWith("../assets/")) return path;
  return path.startsWith("assets/") ? `/${path}` : path;
}

function productsFromPage() {
  return [...document.querySelectorAll(".product-grid article")].map((card, index) => ({
    id: index + 1,
    title: card.querySelector("h2")?.textContent || "Memo product",
    summary: card.querySelector("p")?.textContent || "",
    description: card.dataset.details || "",
    price: Number((card.dataset.price || "").replace(/[^\d]/g, "")) || 0,
    image_url: card.querySelector("img")?.getAttribute("src") || "",
    stock: 1
  }));
}

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(cartKey)) || [];
  } catch (error) {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(cartKey, JSON.stringify(cart));
  updateCartCount();
  renderCart();
}

function cartQuantity() {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

function updateCartCount() {
  document.querySelectorAll(".cart-counter sup").forEach((counter) => {
    counter.textContent = `(${cartQuantity()})`;
  });
}

function productCard(product) {
  const disabled = product.stock <= 0 ? " disabled" : "";
  const stockText = product.stock <= 0 ? "Out of stock" : "In stock";
  return `
    <article data-product-id="${product.id}" data-price="${money(product.price)}" data-details="${escapeHtml(product.description)}">
      <div class="product-photo">
        <img src="${escapeHtml(assetUrl(product.image_url))}" alt="${escapeHtml(product.title)}">
        <div class="card-tools">
          <button class="quick-view" type="button" aria-label="Quick view"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.4 12s3.5-6 9.6-6 9.6 6 9.6 6-3.5 6-9.6 6-9.6-6-9.6-6Z"/><circle cx="12" cy="12" r="3.2"/></svg></button>
          <button class="heart" type="button" aria-label="Add to wishlist" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></button>
        </div>
      </div>
      <h2>${escapeHtml(product.title)}</h2>
      <p>${escapeHtml(product.summary)}</p>
      <small class="stock-note${disabled}">${stockText}</small>
    </article>
  `;
}

async function loadProducts() {
  const pathname = location.pathname.split("/").pop();
  const category = pageCategory[pathname];
  const fallbackProducts = productsFromPage();
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (!category && pathname !== "new-arrivals.html") params.set("featured", "true");

  try {
    const response = await fetch(`${API}/api/products?${params}`);
    if (!response.ok) throw new Error("Products failed to load");
    const apiProducts = await response.json();
    products = apiProducts.length ? apiProducts : fallbackProducts;
    renderProducts();
  } catch (error) {
    products = fallbackProducts;
    renderProducts();
  }
  bindProductActions();
}

function renderProducts() {
  const grid = document.querySelector(".products .product-grid");
  if (!grid) return;
  grid.innerHTML = products.length ? products.map(productCard).join("") : `<p class="empty-state">No products are available in this collection yet.</p>`;
}

function bindProductActions() {
  document.querySelectorAll(".heart").forEach((button) => {
    button.onclick = () => {
      const selected = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!selected));
      button.setAttribute("aria-label", selected ? "Add to wishlist" : "Remove from wishlist");
    };
  });

  document.querySelectorAll(".quick-view").forEach((button) => {
    button.onclick = () => openQuickView(button.closest("article"));
  });
}

const menuButton = document.querySelector("#menuButton");
const menuPanel = document.querySelector("#menuPanel");
const menuClose = document.querySelector("#menuClose");
const menuBackdrop = document.querySelector("#menuBackdrop");

function setNavScrolled() {
  document.body.classList.toggle("nav-scrolled", window.scrollY > 12);
}

function setMenu(open) {
  if (!menuPanel || !menuButton || !menuBackdrop) return;
  menuPanel.classList.toggle("open", open);
  menuBackdrop.classList.toggle("open", open);
  document.body.classList.toggle("menu-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuPanel.setAttribute("aria-hidden", String(!open));
}

setNavScrolled();
window.addEventListener("scroll", setNavScrolled, { passive: true });
document.addEventListener("scroll", setNavScrolled, { passive: true });
menuButton?.addEventListener("click", () => setMenu(true));
menuClose?.addEventListener("click", () => setMenu(false));
menuBackdrop?.addEventListener("click", () => setMenu(false));
menuPanel?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".tabs button.active")?.classList.remove("active");
    button.classList.add("active");
  });
});

const quickViewModal = document.querySelector("#quickViewModal");
const quickViewDialog = quickViewModal?.querySelector(".quick-view-dialog");
const quickViewImage = document.querySelector("#quickViewImage");
const quickViewTitle = document.querySelector("#quickViewTitle");
const quickViewPrice = document.querySelector("#quickViewPrice");
const quickViewSummary = document.querySelector("#quickViewSummary");
const quickViewDescription = document.querySelector("#quickViewDescription");
const addToCartButton = document.querySelector("#addToCart");
const cartMessage = document.querySelector("#cartMessage");
let lastQuickViewTrigger;

function ensureRequestForm() {
  let form = document.querySelector("#stockRequestForm");
  if (form) return form;
  addToCartButton?.insertAdjacentHTML("afterend", `
    <form class="stock-request-form" id="stockRequestForm" hidden>
      <input name="customer_name" placeholder="Full name" required minlength="2">
      <input name="phone" placeholder="Phone" required minlength="5">
      <input name="email" type="email" placeholder="Email" required>
      <textarea name="notes" placeholder="Notes"></textarea>
      <button type="submit">Send request</button>
    </form>
  `);
  form = document.querySelector("#stockRequestForm");
  form.addEventListener("submit", submitStockRequest);
  return form;
}

function setRequestForm(open) {
  const form = ensureRequestForm();
  form.hidden = !open;
  if (open) form.querySelector("input")?.focus();
}

function setQuickView(open) {
  if (!quickViewModal) return;
  quickViewModal.classList.toggle("open", open);
  quickViewModal.setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("modal-open", open);
  if (open) quickViewDialog?.querySelector(".quick-view-close")?.focus();
  else lastQuickViewTrigger?.focus();
}

function openQuickView(card) {
  const product = products.find((item) => String(item.id) === String(card?.dataset.productId));
  if (!product) return;
  lastQuickViewTrigger = card.querySelector(".quick-view");
  quickViewImage.src = assetUrl(product.image_url);
  quickViewImage.alt = product.title;
  quickViewTitle.textContent = product.title;
  quickViewPrice.textContent = money(product.price);
  quickViewSummary.textContent = product.summary;
  quickViewDescription.textContent = product.description;
  addToCartButton.dataset.productId = product.id;
  addToCartButton.disabled = false;
  addToCartButton.textContent = product.stock <= 0 ? "Out of stock" : "Add to cart";
  cartMessage.textContent = "";
  setRequestForm(false);
  setQuickView(true);
}

quickViewModal?.querySelectorAll("[data-quick-view-close]").forEach((button) => {
  button.addEventListener("click", () => setQuickView(false));
});

addToCartButton?.addEventListener("click", () => {
  const product = products.find((item) => String(item.id) === addToCartButton.dataset.productId);
  if (!product) return;
  if (product.stock <= 0) {
    cartMessage.textContent = `Tell us where to reach you when ${product.title} is back.`;
    setRequestForm(true);
    return;
  }
  const existing = cart.find((item) => item.product_id === product.id);
  const existingQty = existing?.quantity || 0;
  if (existingQty >= product.stock) {
    cartMessage.textContent = `Only ${product.stock} available for ${product.title}.`;
    return;
  }
  if (existing) existing.quantity += 1;
  else cart.push({ product_id: product.id, quantity: 1, title: product.title, price: product.price, image_url: assetUrl(product.image_url), stock: product.stock });
  saveCart();
  cartMessage.textContent = `${product.title} has been added to your bag.`;
});

async function submitStockRequest(event) {
  event.preventDefault();
  const product = products.find((item) => String(item.id) === addToCartButton.dataset.productId);
  if (!product) return;
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.product_id = product.id;
  cartMessage.textContent = "Sending your request...";
  try {
    const response = await fetch(`${API}/api/stock-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (response.status === 405) throw new Error("Stock requests are not active yet. Please restart the FastAPI server.");
    if (!response.ok) throw new Error(apiErrorMessage(result, "Request could not be sent."));
    form.reset();
    setRequestForm(false);
    cartMessage.textContent = `We will contact you when ${product.title} is back in stock.`;
  } catch (error) {
    cartMessage.textContent = error.message;
  }
}

function injectCartDrawer() {
  if (document.querySelector("#cartDrawer")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <aside class="cart-drawer" id="cartDrawer" aria-hidden="true">
      <div class="cart-panel" role="dialog" aria-modal="true" aria-labelledby="cartTitle">
        <button class="cart-close" type="button" aria-label="Close cart">×</button>
        <h2 id="cartTitle">Shopping Bag</h2>
        <div class="order-confirmation" id="orderConfirmation" aria-live="polite" hidden></div>
        <div class="cart-items"></div>
        <form class="checkout-form" id="checkoutForm">
          <h3>Checkout</h3>
          <input name="customer_name" placeholder="Full name" required minlength="2">
          <input name="phone" placeholder="Phone" required minlength="5">
          <input name="email" type="email" placeholder="Email" required>
          <input name="address" placeholder="Address" required minlength="5">
          <input name="city" placeholder="City" required minlength="2">
          <textarea name="notes" placeholder="Order notes"></textarea>
          <button type="submit">Place order</button>
          <p class="checkout-message" aria-live="polite"></p>
        </form>
      </div>
      <button class="cart-backdrop" type="button" aria-label="Close cart"></button>
    </aside>
  `);
  document.querySelector(".cart-close").addEventListener("click", closeCart);
  document.querySelector(".cart-backdrop").addEventListener("click", closeCart);
  document.querySelector("#checkoutForm").addEventListener("submit", submitCheckout);
}

function openCart() {
  injectCartDrawer();
  renderCart();
  document.querySelector("#cartDrawer").classList.add("open");
  document.querySelector("#cartDrawer").setAttribute("aria-hidden", "false");
}

function closeCart() {
  document.querySelector("#cartDrawer")?.classList.remove("open");
  document.querySelector("#cartDrawer")?.setAttribute("aria-hidden", "true");
}

function renderCart() {
  const drawer = document.querySelector("#cartDrawer");
  if (!drawer) return;
  const list = drawer.querySelector(".cart-items");
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  list.innerHTML = cart.length ? cart.map((item) => `
    <div class="cart-row" data-id="${item.product_id}">
      <img src="${escapeHtml(assetUrl(item.image_url))}" alt="${escapeHtml(item.title)}">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${money(item.price)}</span>
        <label>Qty <input type="number" min="1" max="${item.stock}" value="${item.quantity}"></label>
      </div>
      <button type="button" aria-label="Remove ${escapeHtml(item.title)}">Remove</button>
    </div>
  `).join("") + `<p class="cart-total">Total <strong>${money(total)}</strong></p>` : `<p class="empty-state">Your bag is empty.</p>`;

  list.querySelectorAll(".cart-row").forEach((row) => {
    const id = Number(row.dataset.id);
    row.querySelector("input").addEventListener("change", (event) => {
      const item = cart.find((entry) => entry.product_id === id);
      item.quantity = Math.max(1, Math.min(Number(event.target.value), item.stock));
      saveCart();
    });
    row.querySelector("button").addEventListener("click", () => {
      cart = cart.filter((entry) => entry.product_id !== id);
      saveCart();
    });
  });
}

async function submitCheckout(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const message = formElement.querySelector(".checkout-message");
  const submitButton = formElement.querySelector('button[type="submit"]');
  const confirmation = document.querySelector("#orderConfirmation");
  if (!cart.length) {
    message.textContent = "Add at least one product to checkout.";
    return;
  }
  const form = new FormData(formElement);
  const payload = Object.fromEntries(form.entries());
  payload.items = cart.map(({ product_id, quantity }) => ({ product_id, quantity }));
  confirmation.hidden = true;
  confirmation.textContent = "";
  message.textContent = "Placing your order...";
  submitButton.disabled = true;
  try {
    const response = await fetch(`${API}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(result, "Order could not be placed."));
    const orderNumber = result.order_number || `MEMO-${String(result.id).padStart(5, "0")}`;
    cart = [];
    saveCart();
    await loadProducts();
    formElement.reset();
    confirmation.innerHTML = `<strong>Order placed.</strong><span>Your order number is ${escapeHtml(orderNumber)}.</span>`;
    confirmation.hidden = false;
    message.textContent = `Order placed. Your order number is ${orderNumber}.`;
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

document.querySelectorAll(".cart-counter").forEach((button) => {
  button.addEventListener("click", openCart);
});

const heroCarousel = document.querySelector("#heroCarousel");
if (heroCarousel) {
  const heroSlides = [...heroCarousel.querySelectorAll(".hero-slide")];
  const heroDots = [...heroCarousel.querySelectorAll(".hero-dots button")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let heroIndex = 0;
  let heroTimer;

  function showHeroSlide(index) {
    heroIndex = (index + heroSlides.length) % heroSlides.length;
    heroSlides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === heroIndex));
    heroDots.forEach((dot, dotIndex) => {
      const active = dotIndex === heroIndex;
      dot.classList.toggle("active", active);
      dot.toggleAttribute("aria-current", active);
    });
  }

  function startHeroCarousel() {
    if (reduceMotion || heroSlides.length <= 1) return;
    window.clearInterval(heroTimer);
    heroTimer = window.setInterval(() => showHeroSlide(heroIndex + 1), 5000);
  }

  if (heroSlides.length > 1) {
    heroCarousel.querySelector(".hero-prev")?.addEventListener("click", () => { showHeroSlide(heroIndex - 1); startHeroCarousel(); });
    heroCarousel.querySelector(".hero-next")?.addEventListener("click", () => { showHeroSlide(heroIndex + 1); startHeroCarousel(); });
    heroDots.forEach((dot, index) => dot.addEventListener("click", () => { showHeroSlide(index); startHeroCarousel(); }));
    heroCarousel.addEventListener("mouseenter", () => window.clearInterval(heroTimer));
    heroCarousel.addEventListener("mouseleave", startHeroCarousel);
    startHeroCarousel();
  }
}

document.querySelector("#newsletterForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#formMessage").textContent = "Thank you for subscribing.";
  event.currentTarget.reset();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenu(false);
    setQuickView(false);
    closeCart();
  }
});

updateCartCount();
injectCartDrawer();
loadProducts();
