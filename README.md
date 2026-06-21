# Memo By Miraal Storefront + Admin

A responsive fashion storefront with a FastAPI + SQLite admin system for products, inventory, orders, sales, and role-based admin users.

## Run locally

Install dependencies if needed:

```powershell
python -m pip install -r requirements.txt
```

Start the app:

```powershell
python -m uvicorn backend.app:app --reload --port 8000
```

Then visit:

- Storefront: `http://127.0.0.1:8000/`
- Admin panel: `http://127.0.0.1:8000/admin`

The admin URL is intentionally not linked from the public website.

## First Admin Setup

1. Open `/admin`.
2. Use the `First signup` tab to create the first Super Admin.
3. After the first Super Admin exists, public signup closes automatically.
4. Additional Super Admin, Editor, and Viewer accounts can only be created from the Admin Users section by a Super Admin.

## Roles

- Super Admin: full control, including products, inventory, orders, sales, and admin users.
- Editor: create/edit products, update inventory, view orders, and update order status.
- Viewer: view dashboard, products, inventory, orders, and sales reports only.

## Data

- SQLite database: `memo.sqlite3`
- Uploaded product images: `assets/uploads/`
- Passwords are hashed with PBKDF2-SHA256.
- Admin routes require bearer-token sessions and server-side permission checks.

## Files

- `backend/app.py` - FastAPI app, SQLite schema, authentication, roles, products, orders, inventory, and sales APIs
- `admin/` - protected admin panel UI
- `public/` - public storefront HTML
- `public/css/` - storefront styles
- `public/js/` - storefront scripts
- `assets/` - shared images and uploaded product images

All fashion imagery is stored locally in `assets/photos`.
