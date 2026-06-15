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
