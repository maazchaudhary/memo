const tokenKey = "memo_admin_token";
const apiBase = location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
let token = localStorage.getItem(tokenKey);
let currentAdmin = null;
let products = [];
let orders = [];
let stockRequests = [];
let dashboardSalesPeriod = "weekly";
const isAuthPage = Boolean(document.querySelector("#authView"));
const isPanelPage = Boolean(document.querySelector("#adminApp"));
const authPage = location.protocol === "file:" ? "admin.html" : "/admin";
const panelPage = location.protocol === "file:" ? "panel.html" : "/admin/panel";

const permissions = {
  super_admin: ["dashboard:view", "products:view", "products:create", "products:update", "products:delete", "inventory:update", "orders:view", "orders:update", "sales:view", "admins:manage"],
  editor: ["dashboard:view", "products:view", "products:create", "products:update", "inventory:update", "orders:view", "orders:update"],
  viewer: ["dashboard:view", "products:view", "orders:view", "sales:view"]
};

function can(permission) {
  return Boolean(currentAdmin && permissions[currentAdmin.role]?.includes(permission));
}

function money(amount) {
  return `PKR ${Number(amount || 0).toLocaleString("en-PK")}`;
}

function dateText(timestamp) {
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function showNotice(message, ok = false) {
  const notice = document.querySelector("#notice");
  if (!notice) return;
  notice.textContent = message || "";
  notice.style.color = ok ? "#4f6b52" : "#8b4148";
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error("Cannot reach the FastAPI server. Start it with: python -m uvicorn backend.app:app --reload --port 8000");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed.");
  return data;
}

function goToAuth() {
  if (!isAuthPage) window.location.href = authPage;
}

function goToPanel() {
  if (!isPanelPage) window.location.href = panelPage;
}

async function bootstrap() {
  if (!token) {
    if (isPanelPage) goToAuth();
    return;
  }
  try {
    currentAdmin = await request("/api/admin/me");
    if (isAuthPage) return goToPanel();
    document.querySelector("#adminBadge").textContent = `${currentAdmin.name} · ${currentAdmin.role.replace("_", " ")}`;
    applyRoleUI();
    await refreshAll();
  } catch (error) {
    localStorage.removeItem(tokenKey);
    token = null;
    currentAdmin = null;
    if (isPanelPage) goToAuth();
  }
}

function applyRoleUI() {
  document.querySelector('[data-section="users"]').hidden = !can("admins:manage");
  document.querySelector('[data-section="sales"]').hidden = !can("sales:view");
  document.querySelector('[data-section="requests"]').hidden = !can("orders:view");
  document.querySelector("#productForm").classList.toggle("hidden", !can("products:create") && !can("products:update"));
  document.querySelector("#userForm").classList.toggle("hidden", !can("admins:manage"));
}

async function refreshAll() {
  const tasks = [];
  if (can("products:view")) tasks.push(loadProducts());
  if (can("orders:view")) tasks.push(loadOrders());
  if (can("orders:view")) tasks.push(loadStockRequests());
  if (can("sales:view")) tasks.push(loadSales());
  if (can("admins:manage")) tasks.push(loadUsers());
  await Promise.all(tasks);
  renderDashboard();
}

async function loadProducts() {
  products = await request("/api/admin/products");
  renderProducts();
  renderInventory();
}

function renderProducts() {
  const tbody = document.querySelector("#productsTable");
  tbody.innerHTML = products.map((product) => `
    <tr>
      <td><strong>${product.title}</strong><small>${product.summary}</small></td>
      <td>${label(product.category)}<small>${product.active ? "Visible" : "Hidden"}</small></td>
      <td>${money(product.price)}</td>
      <td>${product.stock}</td>
      <td><div class="actions">
        <button data-edit="${product.id}" ${can("products:update") ? "" : "disabled"}>Edit</button>
        <button class="danger" data-delete="${product.id}" ${can("products:delete") ? "" : "disabled"}>Delete</button>
      </div></td>
    </tr>
  `).join("");
  tbody.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => editProduct(Number(button.dataset.edit))));
  tbody.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteProduct(Number(button.dataset.delete))));
}

function renderInventory() {
  const tbody = document.querySelector("#inventoryTable");
  tbody.innerHTML = products.map((product) => {
    const status = product.stock === 0 ? ["Out of stock", "status-out"] : product.stock <= 5 ? ["Low stock", "status-low"] : ["In stock", "status-ok"];
    return `
      <tr>
        <td><strong>${product.title}</strong><small>${label(product.category)}</small></td>
        <td>${product.stock}</td>
        <td class="${status[1]}">${status[0]}</td>
        <td><div class="actions"><input class="stock-input" type="number" min="0" value="${product.stock}" data-stock-input="${product.id}"><button data-stock="${product.id}" ${can("inventory:update") ? "" : "disabled"}>Save</button></div></td>
      </tr>
    `;
  }).join("");
  tbody.querySelectorAll("[data-stock]").forEach((button) => button.addEventListener("click", () => updateStock(Number(button.dataset.stock))));
}

function label(value) {
  return String(value || "").split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function editProduct(id) {
  const product = products.find((item) => item.id === id);
  const form = document.querySelector("#productForm");
  const fields = form.elements;
  fields.id.value = product.id;
  fields.title.value = product.title;
  fields.price.value = product.price;
  fields.category.value = product.category;
  fields.stock.value = product.stock;
  fields.summary.value = product.summary;
  fields.description.value = product.description;
  fields.image_url.value = product.image_url;
  fields.featured.checked = Boolean(product.featured);
  fields.active.checked = Boolean(product.active);
  document.querySelector("#productFormTitle").textContent = "Edit Product";
}

async function saveProduct(event) {
  event.preventDefault();
  if (!can("products:create") && !can("products:update")) return;
  const form = event.currentTarget;
  const fields = form.elements;
  const payload = {
    title: fields.title.value.trim(),
    price: Number(fields.price.value),
    category: fields.category.value,
    stock: Number(fields.stock.value),
    summary: fields.summary.value.trim(),
    description: fields.description.value.trim(),
    image_url: fields.image_url.value.trim(),
    featured: fields.featured.checked,
    active: fields.active.checked
  };
  const id = fields.id.value;
  const saved = await request(id ? `/api/admin/products/${id}` : "/api/admin/products", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
  if (fields.image.files.length) {
    const upload = new FormData();
    upload.append("image", fields.image.files[0]);
    await request(`/api/admin/products/${saved.id}/image`, { method: "POST", body: upload });
  }
  resetProductForm();
  await loadProducts();
  await loadSales().catch(() => {});
  renderDashboard();
  showNotice("Product saved.", true);
}

function resetProductForm() {
  const form = document.querySelector("#productForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.active.checked = true;
  document.querySelector("#productFormTitle").textContent = "Add Product";
}

async function deleteProduct(id) {
  if (!confirm("Remove this product from the public website?")) return;
  await request(`/api/admin/products/${id}`, { method: "DELETE" });
  await loadProducts();
  showNotice("Product removed from public catalog.", true);
}

async function updateStock(id) {
  const input = document.querySelector(`[data-stock-input="${id}"]`);
  await request(`/api/admin/products/${id}/stock`, { method: "PATCH", body: JSON.stringify({ stock: Number(input.value) }) });
  await loadProducts();
  showNotice("Stock updated.", true);
}

async function loadOrders() {
  orders = await request("/api/admin/orders");
  renderOrders();
}

function renderOrders() {
  const tbody = document.querySelector("#ordersTable");
  tbody.innerHTML = orders.map((order) => `
    <tr>
      <td>#${order.id}</td>
      <td><strong>${order.customer_name}</strong><small>${order.phone}<br>${order.email}<br>${order.address}, ${order.city}${order.notes ? `<br>Notes: ${order.notes}` : ""}</small></td>
      <td>${order.items.map((item) => `${item.title} × ${item.quantity}`).join("<br>")}</td>
      <td>${money(order.total)}</td>
      <td>${order.payment_method}<small>${order.payment_status}</small></td>
      <td><select class="status-select" data-order-status="${order.id}" ${can("orders:update") ? "" : "disabled"}>
        ${["Pending", "Processing", "Dispatched", "Delivered", "Cancelled"].map((status) => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}
      </select></td>
      <td>${dateText(order.created_at)}</td>
    </tr>
  `).join("");
  tbody.querySelectorAll("[data-order-status]").forEach((select) => select.addEventListener("change", () => updateOrderStatus(Number(select.dataset.orderStatus), select.value)));
}

async function updateOrderStatus(id, status) {
  await request(`/api/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  await loadOrders();
  await loadSales().catch(() => {});
  renderDashboard();
  showNotice(`Order #${id} marked ${status}.`, true);
}

async function loadStockRequests() {
  try {
    stockRequests = await request("/api/admin/stock-requests");
  } catch (error) {
    stockRequests = [];
  }
  renderStockRequests();
}

function renderStockRequests() {
  const tbody = document.querySelector("#requestsTable");
  tbody.innerHTML = stockRequests.length ? stockRequests.map((item) => `
    <tr>
      <td>#${item.id}</td>
      <td><strong>${item.product_title}</strong><small>Product #${item.product_id}</small></td>
      <td><strong>${item.customer_name}</strong><small>${item.phone}<br>${item.email}</small></td>
      <td>${item.notes || ""}</td>
      <td><select class="status-select" data-request-status="${item.id}" ${can("orders:update") ? "" : "disabled"}>
        ${["Pending", "Contacted", "Closed"].map((status) => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}
      </select></td>
      <td>${dateText(item.created_at)}</td>
    </tr>
  `).join("") : `<tr><td colspan="6">No item requests yet.</td></tr>`;
  tbody.querySelectorAll("[data-request-status]").forEach((select) => select.addEventListener("change", () => updateStockRequestStatus(Number(select.dataset.requestStatus), select.value)));
}

async function updateStockRequestStatus(id, status) {
  await request(`/api/admin/stock-requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  await loadStockRequests();
  renderDashboard();
  showNotice(`Request #${id} marked ${status}.`, true);
}

async function loadSales() {
  const sales = await request("/api/admin/sales");
  renderSales(sales);
}

function renderSales(sales) {
  document.querySelector("#salesStats").innerHTML = [
    ["Total sales", money(sales.total_sales)],
    ["Orders", sales.total_orders],
    ["Pending", sales.pending_orders],
    ["Delivered", sales.completed_orders],
    ["Cancelled", sales.cancelled_orders],
    ["Low stock", sales.low_stock.length]
  ].map(statCard).join("");
  document.querySelector("#revenueList").innerHTML = sales.revenue_by_day.length ? sales.revenue_by_day.map((row) => `<p><span>${row.day}</span><strong>${money(row.total)}</strong></p>`).join("") : "<p>No revenue yet.</p>";
  document.querySelector("#bestList").innerHTML = sales.best_selling.length ? sales.best_selling.map((row) => `<p><span>${row.title}</span><strong>${row.quantity} sold</strong></p>`).join("") : "<p>No sales yet.</p>";
}

function renderDashboard() {
  const totalSales = orders.filter((order) => order.status !== "Cancelled").reduce((sum, order) => sum + order.total, 0);
  const pendingOrders = orders.filter((order) => order.status === "Pending").length;
  document.querySelector("#dashboardStats").innerHTML = [
    ["Products", products.length],
    ["Orders", orders.length],
    ["Requests", stockRequests.filter((item) => item.status !== "Closed").length],
    ["Revenue", money(totalSales)],
    ["Pending orders", pendingOrders]
  ].map(statCard).join("");
  document.querySelector("#recentOrders").innerHTML = orders.slice(0, 8).map((order) => `
    <tr><td>#${order.id}</td><td>${order.customer_name}</td><td>${money(order.total)}</td><td>${order.status}</td><td>${dateText(order.created_at)}</td></tr>
  `).join("");
  renderDashboardProductChart();
}

function statCard([labelText, value]) {
  return `<article class="stat"><span>${labelText}</span><strong>${value}</strong></article>`;
}

function renderDashboardProductChart() {
  const chart = document.querySelector("#dashboardProductChart");
  if (!chart) return;
  const days = dashboardSalesPeriod === "monthly" ? 30 : 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const totals = new Map();
  const palette = ["#2f6f73", "#b85c38", "#6f5aa8", "#d69c2f", "#3f7f4f", "#9f4f6f", "#4b6fa8", "#8a6a3d"];

  orders.forEach((order) => {
    if (order.status === "Cancelled" || Number(order.created_at) * 1000 < cutoff) return;
    (order.items || []).forEach((item) => {
      const title = item.title || `Product #${item.product_id}`;
      const quantity = Number(item.quantity || 0);
      const revenue = Number(item.line_total || item.price * quantity || 0);
      const current = totals.get(title) || { quantity: 0, revenue: 0 };
      totals.set(title, { quantity: current.quantity + quantity, revenue: current.revenue + revenue });
    });
  });

  const rows = [...totals.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 8);
  const max = Math.max(...rows.map(([, data]) => data.quantity), 0);
  const units = rows.reduce((sum, [, data]) => sum + data.quantity, 0);
  const revenue = rows.reduce((sum, [, data]) => sum + data.revenue, 0);
  chart.innerHTML = rows.length ? `
    <div class="chart-summary">
      <span><strong>${units}</strong> units sold</span>
      <span><strong>${money(revenue)}</strong> revenue</span>
      <span><strong>${rows.length}</strong> products</span>
    </div>
    <div class="sales-bars">
      ${rows.map(([title, data], index) => {
        const percent = Math.max(8, Math.round((data.quantity / max) * 100));
        const color = palette[index % palette.length];
        return `
          <div class="chart-row" style="--bar-color:${color}; --bar-width:${percent}%">
            <div class="chart-label">
              <span class="chart-rank">${index + 1}</span>
              <span class="chart-name" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
            </div>
            <div class="chart-track" aria-label="${escapeHtml(title)} sold ${data.quantity} units">
              <span class="chart-bar"></span>
            </div>
            <div class="chart-value">
              <strong>${data.quantity}</strong>
              <span>${money(data.revenue)}</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  ` : `<p class="chart-empty">No product sales in the selected period.</p>`;
}

async function loadUsers() {
  const users = await request("/api/admin/users");
  const tbody = document.querySelector("#usersTable");
  tbody.innerHTML = users.map((user) => `
    <tr>
      <td><strong>${user.name}</strong><small>${user.email}</small></td>
      <td><select class="status-select" data-role="${user.id}">
        ${["super_admin", "editor", "viewer"].map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${role.replace("_", " ")}</option>`).join("")}
      </select></td>
      <td><div class="actions"><button data-remove-user="${user.id}" class="danger">Remove</button></div></td>
    </tr>
  `).join("");
  tbody.querySelectorAll("[data-role]").forEach((select) => select.addEventListener("change", () => changeRole(Number(select.dataset.role), select.value)));
  tbody.querySelectorAll("[data-remove-user]").forEach((button) => button.addEventListener("click", () => removeUser(Number(button.dataset.removeUser))));
}

async function createUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await request("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({ name: form.elements.name.value, email: form.elements.email.value, password: form.elements.password.value, role: form.elements.role.value })
  });
  form.reset();
  await loadUsers();
  showNotice("Admin user created.", true);
}

async function changeRole(id, role) {
  await request(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
  await loadUsers();
  showNotice("Role updated.", true);
}

async function removeUser(id) {
  if (!confirm("Remove this admin user?")) return;
  await request(`/api/admin/users/${id}`, { method: "DELETE" });
  await loadUsers();
  showNotice("Admin user removed.", true);
}

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
    document.querySelector("#loginForm").classList.toggle("hidden", button.dataset.authTab !== "login");
    document.querySelector("#signupForm").classList.toggle("hidden", button.dataset.authTab !== "signup");
    document.querySelector("#authMessage").textContent = "";
  });
});

const loginForm = document.querySelector("#loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("#authMessage");
    const form = event.currentTarget;
    message.textContent = "Logging in...";
    try {
      const result = await request("/api/admin/login", { method: "POST", body: JSON.stringify({ email: form.elements.email.value, password: form.elements.password.value }) });
      token = result.token;
      localStorage.setItem(tokenKey, token);
      goToPanel();
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

const signupForm = document.querySelector("#signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector("#authMessage");
    try {
      const result = await request("/api/admin/signup", { method: "POST", body: JSON.stringify({ name: form.elements.name.value, email: form.elements.email.value, password: form.elements.password.value }) });
      message.textContent = result.message;
      form.reset();
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

const logoutButton = document.querySelector("#logoutButton");
if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    await request("/api/admin/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem(tokenKey);
    token = null;
    currentAdmin = null;
    goToAuth();
  });
}

document.querySelectorAll(".sidebar [data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".sidebar [data-section]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".section").forEach((section) => section.classList.toggle("active", section.id === `${button.dataset.section}Section`));
    document.querySelector("#sectionTitle").textContent = button.textContent;
    showNotice("");
  });
});

document.querySelectorAll("[data-sales-period]").forEach((button) => {
  button.addEventListener("click", () => {
    dashboardSalesPeriod = button.dataset.salesPeriod;
    document.querySelectorAll("[data-sales-period]").forEach((item) => item.classList.toggle("active", item === button));
    renderDashboardProductChart();
  });
});

document.querySelector("#productForm")?.addEventListener("submit", saveProduct);
document.querySelector("#resetProductForm")?.addEventListener("click", resetProductForm);
document.querySelector("#userForm")?.addEventListener("submit", createUser);

bootstrap();
window.MemoAdminReady = true;
