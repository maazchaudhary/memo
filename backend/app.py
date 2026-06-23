from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
PUBLIC_DIR = BASE_DIR / "public"
ADMIN_DIR = BASE_DIR / "admin"
ASSETS_DIR = BASE_DIR / "assets"
DB_PATH = Path(os.getenv("MEMO_DB_PATH", BASE_DIR / "memo.sqlite3"))
UPLOAD_DIR = ASSETS_DIR / "uploads"
SESSION_SECONDS = 60 * 60 * 12
PBKDF2_ITERATIONS = 210_000
PUBLIC_FILES = {
    "index.html",
    "new-arrivals.html",
    "the-silk-edit.html",
    "everyday-memo.html",
    "occasion-wear.html",
}

app = FastAPI(title="Memo by Miraal Admin API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROLE_PERMISSIONS = {
    "super_admin": {"dashboard:view", "products:view", "products:create", "products:update", "products:delete", "inventory:update", "orders:view", "orders:update", "sales:view", "admins:manage"},
    "editor": {"dashboard:view", "products:view", "products:create", "products:update", "inventory:update", "orders:view", "orders:update"},
    "viewer": {"dashboard:view", "products:view", "orders:view", "sales:view"},
}

SEED_PRODUCTS = [
    ("Dove Purple", "Silk shirt with embroidered details", "A graceful silk ensemble finished with delicate embroidery and an easy, flowing silhouette.", 18500, "the-silk-edit", 14, "assets/photos/img_7289.jpg", 1),
    ("Celine", "Pastel embroidered long shirt", "A fresh pastel shirt with intricate embroidery, designed for effortless day-to-evening dressing.", 16900, "everyday-memo", 19, "assets/photos/img_9828.jpg", 1),
    ("Rose Garden", "Embroidered occasion ensemble", "A refined occasion ensemble featuring floral embroidery and a softly structured drape.", 21500, "occasion-wear", 8, "assets/photos/img_4089.jpg", 1),
    ("Willow", "Botanical sage silk dress", "A botanical sage silk dress with tonal detailing and a relaxed, elegant finish.", 19800, "the-silk-edit", 11, "assets/photos/img_4140.jpg", 1),
    ("Bloom", "Easy elegance silk dress", "A soft floral silk dress with delicate movement and refined everyday polish.", 20500, "the-silk-edit", 7, "assets/photos/img_1524.jpg", 0),
    ("Sunlit Memo", "Embroidered silk kaftan", "A pale yellow kaftan with luminous embroidery and an airy, occasion-ready cut.", 23900, "the-silk-edit", 5, "assets/photos/img_1355.jpg", 0),
    ("Amaya", "Quiet colour embroidered set", "A quiet pastel outfit made for warm days, garden lunches, and relaxed celebrations.", 17500, "everyday-memo", 16, "assets/photos/img_9820.jpg", 0),
    ("Kaira", "Fresh embroidered dress", "A polished daywear dress with fresh embroidery and a gently structured shape.", 18900, "everyday-memo", 9, "assets/photos/img_8818.jpg", 0),
    ("Dusk", "Soft festive dress", "A dusk-pink look balancing softness, festive detail, and everyday ease.", 21900, "everyday-memo", 4, "assets/photos/img_0445.jpg", 0),
    ("Lira Greens", "Embroidered evening notes", "An evening green ensemble with polished embroidery and a graceful drape.", 22500, "occasion-wear", 6, "assets/photos/img_7990.jpg", 0),
    ("Lira Pink", "Occasion embroidered dress", "A pink embroidered look with a celebratory silhouette and intricate detailing.", 24500, "occasion-wear", 3, "assets/photos/img_5142.jpg", 0),
    ("Raya", "Formal embroidered ensemble", "A formal Raya ensemble made with detailed embroidery and a graceful festive profile.", 27500, "occasion-wear", 2, "assets/photos/img_4715.jpg", 0),
]


class AdminCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["super_admin", "editor", "viewer"] = "viewer"


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class ProductPayload(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    summary: str = Field(min_length=2, max_length=180)
    description: str = Field(min_length=2, max_length=1200)
    price: int = Field(ge=0)
    category: str = Field(min_length=2, max_length=80)
    stock: int = Field(ge=0)
    image_url: str | None = Field(default=None, max_length=500)
    featured: bool = False
    active: bool = True


class StockPayload(BaseModel):
    stock: int = Field(ge=0)


class OrderItemPayload(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=99)


class CheckoutPayload(BaseModel):
    customer_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=5, max_length=40)
    email: EmailStr
    address: str = Field(min_length=5, max_length=250)
    city: str = Field(min_length=2, max_length=80)
    notes: str | None = Field(default="", max_length=500)
    payment_method: str = Field(default="Cash on delivery", max_length=80)
    items: list[OrderItemPayload] = Field(min_length=1)


class StockRequestPayload(BaseModel):
    product_id: int
    customer_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=5, max_length=40)
    email: EmailStr
    notes: str | None = Field(default="", max_length=500)


class OrderStatusPayload(BaseModel):
    status: Literal["Pending", "Processing", "Dispatched", "Delivered", "Cancelled"]


class StockRequestStatusPayload(BaseModel):
    status: Literal["Pending", "Contacted", "Closed"]


class RolePayload(BaseModel):
    role: Literal["super_admin", "editor", "viewer"]


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_dict(row: sqlite3.Row | None):
    return dict(row) if row else None


def rows_dict(rows):
    return [dict(row) for row in rows]


def public_asset_url(value: str | None):
    if not value:
        return value
    if value.startswith("../assets/"):
        return value.removeprefix("..")
    if value.startswith(("http://", "https://", "data:", "blob:", "/")):
        return value
    return f"/{value}" if value.startswith("assets/") else value


def storage_image_url(value: str | None):
    return public_asset_url((value or "").strip()) or "/assets/photos/img_9828.jpg"


def serialize_product(row: sqlite3.Row | None):
    product = row_dict(row)
    if product and "image_url" in product:
        product["image_url"] = public_asset_url(product["image_url"])
    return product


def serialize_products(rows):
    return [serialize_product(row) for row in rows]


def slugify(value: str) -> str:
    clean = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    return "-".join(part for part in clean.split("-") if part) or secrets.token_hex(4)


def order_number(order_id: int):
    return f"MEMO-{order_id:05d}"


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$", 3)
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(iterations))
        return hmac.compare_digest(base64.b64encode(check).decode(), digest)
    except Exception:
        return False


def require_permission(permission: str):
    def dependency(authorization: Annotated[str | None, Header()] = None):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Admin login required.")
        token = authorization.removeprefix("Bearer ").strip()
        with db() as conn:
            session = conn.execute(
                """
                SELECT admins.* FROM admin_sessions
                JOIN admins ON admins.id = admin_sessions.admin_id
                WHERE admin_sessions.token = ? AND admin_sessions.expires_at > ?
                """,
                (token, int(time.time())),
            ).fetchone()
        admin = row_dict(session)
        if not admin:
            raise HTTPException(status_code=401, detail="Session expired.")
        if permission not in ROLE_PERMISSIONS.get(admin["role"], set()):
            raise HTTPException(status_code=403, detail="You do not have permission for this action.")
        return admin

    return dependency


def product_row(conn: sqlite3.Connection, product_id: int):
    product = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


@app.on_event("startup")
def init_db():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS admins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              email TEXT NOT NULL UNIQUE COLLATE NOCASE,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL CHECK(role IN ('super_admin','editor','viewer')),
              created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS admin_sessions (
              token TEXT PRIMARY KEY,
              admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
              expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              slug TEXT NOT NULL UNIQUE,
              title TEXT NOT NULL,
              summary TEXT NOT NULL,
              description TEXT NOT NULL,
              price INTEGER NOT NULL CHECK(price >= 0),
              category TEXT NOT NULL,
              stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
              image_url TEXT NOT NULL,
              featured INTEGER NOT NULL DEFAULT 0,
              active INTEGER NOT NULL DEFAULT 1,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              customer_name TEXT NOT NULL,
              phone TEXT NOT NULL,
              email TEXT NOT NULL,
              address TEXT NOT NULL,
              city TEXT NOT NULL,
              notes TEXT,
              total INTEGER NOT NULL,
              payment_method TEXT NOT NULL,
              payment_status TEXT NOT NULL DEFAULT 'Unpaid',
              status TEXT NOT NULL DEFAULT 'Pending',
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS order_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
              product_id INTEGER NOT NULL REFERENCES products(id),
              title TEXT NOT NULL,
              price INTEGER NOT NULL,
              quantity INTEGER NOT NULL,
              line_total INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS stock_requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              product_id INTEGER NOT NULL REFERENCES products(id),
              product_title TEXT NOT NULL,
              customer_name TEXT NOT NULL,
              phone TEXT NOT NULL,
              email TEXT NOT NULL,
              notes TEXT,
              status TEXT NOT NULL DEFAULT 'Pending',
              created_at INTEGER NOT NULL
            );
            """
        )
        if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            now = int(time.time())
            for item in SEED_PRODUCTS:
                slug = slugify(item[0])
                conn.execute(
                    """
                    INSERT INTO products (slug,title,summary,description,price,category,stock,image_url,featured,active,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,1,?,?)
                    """,
                    (slug, *item, now, now),
                )


@app.get("/api/products")
def products(category: str | None = None, featured: bool | None = None):
    query = "SELECT * FROM products WHERE active = 1"
    params: list[object] = []
    if category:
        query += " AND category = ?"
        params.append(category)
    if featured is not None:
        query += " AND featured = ?"
        params.append(1 if featured else 0)
    query += " ORDER BY created_at DESC, id DESC"
    with db() as conn:
        return serialize_products(conn.execute(query, params).fetchall())


@app.post("/api/orders")
def checkout(payload: CheckoutPayload):
    now = int(time.time())
    with db() as conn:
        products_by_id = {}
        total = 0
        for item in payload.items:
            product = product_row(conn, item.product_id)
            if not product["active"]:
                raise HTTPException(status_code=400, detail=f"{product['title']} is not available.")
            if product["stock"] < item.quantity:
                raise HTTPException(status_code=400, detail=f"Only {product['stock']} left for {product['title']}.")
            products_by_id[item.product_id] = product
            total += product["price"] * item.quantity

        cursor = conn.execute(
            """
            INSERT INTO orders (customer_name,phone,email,address,city,notes,total,payment_method,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            (payload.customer_name.strip(), payload.phone.strip(), payload.email.lower(), payload.address.strip(), payload.city.strip(), (payload.notes or "").strip(), total, payload.payment_method, "Pending", now, now),
        )
        order_id = cursor.lastrowid
        for item in payload.items:
            product = products_by_id[item.product_id]
            line_total = product["price"] * item.quantity
            conn.execute(
                "INSERT INTO order_items (order_id,product_id,title,price,quantity,line_total) VALUES (?,?,?,?,?,?)",
                (order_id, product["id"], product["title"], product["price"], item.quantity, line_total),
            )
            conn.execute("UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?", (item.quantity, now, product["id"]))
        return {"id": order_id, "order_number": order_number(order_id), "total": total, "status": "Pending"}


@app.post("/api/stock-requests")
def stock_request(payload: StockRequestPayload):
    now = int(time.time())
    with db() as conn:
        product = product_row(conn, payload.product_id)
        if not product["active"]:
            raise HTTPException(status_code=400, detail=f"{product['title']} is not available.")
        cursor = conn.execute(
            """
            INSERT INTO stock_requests (product_id,product_title,customer_name,phone,email,notes,status,created_at)
            VALUES (?,?,?,?,?,?,?,?)
            """,
            (product["id"], product["title"], payload.customer_name.strip(), payload.phone.strip(), payload.email.lower(), (payload.notes or "").strip(), "Pending", now),
        )
        return {"id": cursor.lastrowid, "message": "Request received."}


@app.post("/api/admin/signup")
def first_admin_signup(payload: AdminCreate):
    with db() as conn:
        if conn.execute("SELECT COUNT(*) FROM admins").fetchone()[0] > 0:
            raise HTTPException(status_code=403, detail="Signup is closed. Super Admins must create new users.")
        now = int(time.time())
        conn.execute(
            "INSERT INTO admins (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)",
            (payload.name.strip(), payload.email.lower(), password_hash(payload.password), "super_admin", now),
        )
    return {"message": "Super Admin created. You can log in now."}


@app.post("/api/admin/login")
def login(payload: LoginPayload):
    with db() as conn:
        admin = conn.execute("SELECT * FROM admins WHERE email = ?", (payload.email.lower(),)).fetchone()
        if not admin or not verify_password(payload.password, admin["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = secrets.token_urlsafe(32)
        expires = int(time.time()) + SESSION_SECONDS
        conn.execute("DELETE FROM admin_sessions WHERE expires_at <= ?", (int(time.time()),))
        conn.execute("INSERT INTO admin_sessions (token,admin_id,expires_at) VALUES (?,?,?)", (token, admin["id"], expires))
        return {"token": token, "admin": {"id": admin["id"], "name": admin["name"], "email": admin["email"], "role": admin["role"]}, "expires_at": expires}


@app.get("/api/admin/me")
def me(admin=Depends(require_permission("dashboard:view"))):
    return {"id": admin["id"], "name": admin["name"], "email": admin["email"], "role": admin["role"]}


@app.post("/api/admin/logout")
def logout(authorization: Annotated[str | None, Header()] = None):
    if authorization and authorization.startswith("Bearer "):
        with db() as conn:
            conn.execute("DELETE FROM admin_sessions WHERE token = ?", (authorization.removeprefix("Bearer ").strip(),))
    return {"message": "Logged out."}


@app.get("/api/admin/products")
def admin_products(admin=Depends(require_permission("products:view"))):
    with db() as conn:
        return serialize_products(conn.execute("SELECT * FROM products ORDER BY updated_at DESC, id DESC").fetchall())


@app.post("/api/admin/products")
def create_product(payload: ProductPayload, admin=Depends(require_permission("products:create"))):
    now = int(time.time())
    image_url = storage_image_url(payload.image_url)
    with db() as conn:
        base = slugify(payload.title)
        slug = base
        index = 2
        while conn.execute("SELECT id FROM products WHERE slug = ?", (slug,)).fetchone():
            slug = f"{base}-{index}"
            index += 1
        cursor = conn.execute(
            """
            INSERT INTO products (slug,title,summary,description,price,category,stock,image_url,featured,active,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (slug, payload.title.strip(), payload.summary.strip(), payload.description.strip(), payload.price, payload.category, payload.stock, image_url, int(payload.featured), int(payload.active), now, now),
        )
        return serialize_product(product_row(conn, cursor.lastrowid))


@app.put("/api/admin/products/{product_id}")
def update_product(product_id: int, payload: ProductPayload, admin=Depends(require_permission("products:update"))):
    now = int(time.time())
    with db() as conn:
        product_row(conn, product_id)
        conn.execute(
            """
            UPDATE products SET title=?,summary=?,description=?,price=?,category=?,stock=?,image_url=?,featured=?,active=?,updated_at=?
            WHERE id=?
            """,
            (payload.title.strip(), payload.summary.strip(), payload.description.strip(), payload.price, payload.category, payload.stock, storage_image_url(payload.image_url), int(payload.featured), int(payload.active), now, product_id),
        )
        return serialize_product(product_row(conn, product_id))


@app.patch("/api/admin/products/{product_id}/stock")
def update_stock(product_id: int, payload: StockPayload, admin=Depends(require_permission("inventory:update"))):
    with db() as conn:
        product_row(conn, product_id)
        conn.execute("UPDATE products SET stock=?, updated_at=? WHERE id=?", (payload.stock, int(time.time()), product_id))
        return serialize_product(product_row(conn, product_id))


@app.post("/api/admin/products/{product_id}/image")
async def upload_product_image(product_id: int, image: UploadFile = File(...), admin=Depends(require_permission("products:update"))):
    if image.content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, WebP, or GIF image.")
    suffix = Path(image.filename or "").suffix.lower() or ".jpg"
    filename = f"product-{product_id}-{secrets.token_hex(8)}{suffix}"
    target = UPLOAD_DIR / filename
    target.write_bytes(await image.read())
    image_url = f"/assets/uploads/{filename}"
    with db() as conn:
        product_row(conn, product_id)
        conn.execute("UPDATE products SET image_url=?, updated_at=? WHERE id=?", (image_url, int(time.time()), product_id))
    return {"image_url": image_url}


@app.delete("/api/admin/products/{product_id}")
def delete_product(product_id: int, admin=Depends(require_permission("products:delete"))):
    with db() as conn:
        product_row(conn, product_id)
        conn.execute("UPDATE products SET active=0, updated_at=? WHERE id=?", (int(time.time()), product_id))
    return {"message": "Product removed from public catalog."}


@app.get("/api/admin/orders")
def admin_orders(admin=Depends(require_permission("orders:view"))):
    with db() as conn:
        orders = rows_dict(conn.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall())
        for order in orders:
            order["items"] = rows_dict(conn.execute("SELECT * FROM order_items WHERE order_id = ?", (order["id"],)).fetchall())
        return orders


@app.patch("/api/admin/orders/{order_id}/status")
def update_order_status(order_id: int, payload: OrderStatusPayload, admin=Depends(require_permission("orders:update"))):
    with db() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found.")
        conn.execute("UPDATE orders SET status=?, updated_at=? WHERE id=?", (payload.status, int(time.time()), order_id))
        return {"message": "Order status updated.", "status": payload.status}


@app.get("/api/admin/stock-requests")
def admin_stock_requests(admin=Depends(require_permission("orders:view"))):
    with db() as conn:
        return rows_dict(conn.execute("SELECT * FROM stock_requests ORDER BY created_at DESC").fetchall())


@app.patch("/api/admin/stock-requests/{request_id}/status")
def update_stock_request_status(request_id: int, payload: StockRequestStatusPayload, admin=Depends(require_permission("orders:update"))):
    with db() as conn:
        request = conn.execute("SELECT * FROM stock_requests WHERE id = ?", (request_id,)).fetchone()
        if not request:
            raise HTTPException(status_code=404, detail="Request not found.")
        conn.execute("UPDATE stock_requests SET status=? WHERE id=?", (payload.status, request_id))
        return {"message": "Request status updated.", "status": payload.status}


@app.get("/api/admin/sales")
def sales(admin=Depends(require_permission("sales:view"))):
    with db() as conn:
        orders = rows_dict(conn.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall())
        delivered = [order for order in orders if order["status"] == "Delivered"]
        best = rows_dict(conn.execute(
            """
            SELECT title, SUM(quantity) AS quantity, SUM(line_total) AS revenue
            FROM order_items GROUP BY product_id, title ORDER BY quantity DESC LIMIT 8
            """
        ).fetchall())
        low_stock = rows_dict(conn.execute("SELECT * FROM products WHERE active=1 AND stock <= 5 ORDER BY stock ASC").fetchall())
        revenue = rows_dict(conn.execute(
            """
            SELECT date(created_at, 'unixepoch') AS day, SUM(total) AS total
            FROM orders WHERE status != 'Cancelled' GROUP BY day ORDER BY day DESC LIMIT 30
            """
        ).fetchall())
        return {
            "total_sales": sum(order["total"] for order in orders if order["status"] != "Cancelled"),
            "total_orders": len(orders),
            "pending_orders": sum(1 for order in orders if order["status"] == "Pending"),
            "completed_orders": len(delivered),
            "cancelled_orders": sum(1 for order in orders if order["status"] == "Cancelled"),
            "revenue_by_day": revenue,
            "best_selling": best,
            "low_stock": low_stock,
            "recent_orders": orders[:8],
        }


@app.get("/api/admin/users")
def list_admins(admin=Depends(require_permission("admins:manage"))):
    with db() as conn:
        return rows_dict(conn.execute("SELECT id,name,email,role,created_at FROM admins ORDER BY created_at DESC").fetchall())


@app.post("/api/admin/users")
def create_admin(payload: AdminCreate, admin=Depends(require_permission("admins:manage"))):
    with db() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO admins (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)",
                (payload.name.strip(), payload.email.lower(), password_hash(payload.password), payload.role, int(time.time())),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="An admin with this email already exists.")
        return row_dict(conn.execute("SELECT id,name,email,role,created_at FROM admins WHERE id=?", (cursor.lastrowid,)).fetchone())


@app.patch("/api/admin/users/{admin_id}/role")
def update_admin_role(admin_id: int, payload: RolePayload, admin=Depends(require_permission("admins:manage"))):
    with db() as conn:
        if admin_id == admin["id"] and payload.role != "super_admin":
            raise HTTPException(status_code=400, detail="You cannot demote your own Super Admin account.")
        conn.execute("UPDATE admins SET role=? WHERE id=?", (payload.role, admin_id))
        return {"message": "Role updated."}


@app.delete("/api/admin/users/{admin_id}")
def remove_admin(admin_id: int, admin=Depends(require_permission("admins:manage"))):
    if admin_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot remove your own account.")
    with db() as conn:
        conn.execute("DELETE FROM admins WHERE id=?", (admin_id,))
    return {"message": "User removed."}


@app.get("/admin")
def admin_page():
    return FileResponse(ADMIN_DIR / "admin.html")


@app.get("/admin/")
def admin_page_slash():
    return FileResponse(ADMIN_DIR / "admin.html")


@app.get("/admin/panel")
def admin_panel_page():
    return FileResponse(ADMIN_DIR / "panel.html")


@app.get("/admin/panel.html")
def admin_panel_file():
    return FileResponse(ADMIN_DIR / "panel.html")


@app.get("/styles.css")
def legacy_styles():
    return FileResponse(PUBLIC_DIR / "css" / "styles.css")


@app.get("/catalog-pages.css")
def legacy_catalog_styles():
    return FileResponse(PUBLIC_DIR / "css" / "catalog-pages.css")


@app.get("/script.js")
def legacy_script():
    return FileResponse(PUBLIC_DIR / "js" / "script.js")


@app.get("/admin.css")
def legacy_admin_styles():
    return FileResponse(ADMIN_DIR / "admin.css")


@app.get("/admin.js")
def legacy_admin_script():
    return FileResponse(ADMIN_DIR / "admin.js")


@app.get("/admin/admin.css")
def admin_nested_styles():
    return FileResponse(ADMIN_DIR / "admin.css")


@app.get("/admin/admin.js")
def admin_nested_script():
    return FileResponse(ADMIN_DIR / "admin.js")


app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
app.mount("/css", StaticFiles(directory=PUBLIC_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=PUBLIC_DIR / "js"), name="js")
app.mount("/admin-static", StaticFiles(directory=ADMIN_DIR), name="admin-static")


@app.get("/")
def home_page():
    return FileResponse(PUBLIC_DIR / "index.html")


@app.get("/{filename}")
def public_file(filename: str):
    if filename not in PUBLIC_FILES:
        raise HTTPException(status_code=404, detail="Not found.")
    return FileResponse(PUBLIC_DIR / filename)
