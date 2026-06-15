const menuButton = document.querySelector("#menuButton");
const menuPanel = document.querySelector("#menuPanel");
const menuClose = document.querySelector("#menuClose");
const menuBackdrop = document.querySelector("#menuBackdrop");

function setMenu(open) {
  menuPanel.classList.toggle("open", open);
  menuBackdrop.classList.toggle("open", open);
  document.body.classList.toggle("menu-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuPanel.setAttribute("aria-hidden", String(!open));
}

menuButton.addEventListener("click", () => setMenu(true));
menuClose.addEventListener("click", () => setMenu(false));
menuBackdrop.addEventListener("click", () => setMenu(false));
menuPanel.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".tabs button.active")?.classList.remove("active");
    button.classList.add("active");
  });
});

document.querySelectorAll(".heart").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", String(!selected));
    button.setAttribute("aria-label", selected ? "Add to wishlist" : "Remove from wishlist");
  });
});

const quickViewModal = document.querySelector("#quickViewModal");
const quickViewDialog = quickViewModal.querySelector(".quick-view-dialog");
const quickViewImage = document.querySelector("#quickViewImage");
const quickViewTitle = document.querySelector("#quickViewTitle");
const quickViewPrice = document.querySelector("#quickViewPrice");
const quickViewSummary = document.querySelector("#quickViewSummary");
const quickViewDescription = document.querySelector("#quickViewDescription");
const addToCartButton = document.querySelector("#addToCart");
const cartMessage = document.querySelector("#cartMessage");
const cartCount = document.querySelector(".cart-counter sup");
let cartItems = 0;
let lastQuickViewTrigger;

function setQuickView(open) {
  quickViewModal.classList.toggle("open", open);
  quickViewModal.setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("modal-open", open);

  if (open) {
    quickViewDialog.querySelector(".quick-view-close").focus();
  } else {
    lastQuickViewTrigger?.focus();
  }
}

document.querySelectorAll(".quick-view").forEach((button) => {
  button.addEventListener("click", () => {
    const product = button.closest("article");
    const image = product.querySelector(".product-photo > img");

    lastQuickViewTrigger = button;
    quickViewImage.src = image.src;
    quickViewImage.alt = image.alt;
    quickViewTitle.textContent = product.querySelector("h2").textContent;
    quickViewPrice.textContent = product.dataset.price;
    quickViewSummary.textContent = product.querySelector("p").textContent;
    quickViewDescription.textContent = product.dataset.details;
    cartMessage.textContent = "";
    addToCartButton.dataset.product = quickViewTitle.textContent;
    setQuickView(true);
  });
});

quickViewModal.querySelectorAll("[data-quick-view-close]").forEach((button) => {
  button.addEventListener("click", () => setQuickView(false));
});

addToCartButton.addEventListener("click", () => {
  cartItems += 1;
  cartCount.textContent = `(${cartItems})`;
  cartMessage.textContent = `${addToCartButton.dataset.product} has been added to your bag.`;
});

const heroCarousel = document.querySelector("#heroCarousel");
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
  if (reduceMotion) return;
  window.clearInterval(heroTimer);
  heroTimer = window.setInterval(() => showHeroSlide(heroIndex + 1), 5000);
}

heroCarousel.querySelector(".hero-prev").addEventListener("click", () => {
  showHeroSlide(heroIndex - 1);
  startHeroCarousel();
});
heroCarousel.querySelector(".hero-next").addEventListener("click", () => {
  showHeroSlide(heroIndex + 1);
  startHeroCarousel();
});
heroDots.forEach((dot, index) => dot.addEventListener("click", () => {
  showHeroSlide(index);
  startHeroCarousel();
}));
heroCarousel.addEventListener("mouseenter", () => window.clearInterval(heroTimer));
heroCarousel.addEventListener("mouseleave", startHeroCarousel);
heroCarousel.addEventListener("focusin", () => window.clearInterval(heroTimer));
heroCarousel.addEventListener("focusout", (event) => {
  if (!heroCarousel.contains(event.relatedTarget)) startHeroCarousel();
});
startHeroCarousel();

document.querySelector("#newsletterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#formMessage").textContent = "Thank you for subscribing.";
  event.currentTarget.reset();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && quickViewModal.classList.contains("open")) {
    setQuickView(false);
  }
});
