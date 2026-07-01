from datetime import date
from functools import wraps
from pathlib import Path
from uuid import uuid4
import sqlite3

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.utils import secure_filename

from database import DB_FILE, init_db

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
ADMIN_USERNAME = "admin 123"
ADMIN_PASSWORD = "123123"

app = Flask(__name__)
app.secret_key = "quan-an-admin-secret-key"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def get_db_conn():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def today_key():
    return date.today().isoformat()


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return redirect(url_for("admin_login"))
        return view(*args, **kwargs)

    return wrapped


def api_admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return jsonify({"success": False, "message": "Bạn cần đăng nhập admin."}), 401
        return view(*args, **kwargs)

    return wrapped


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def save_uploaded_image(file_storage):
    if not file_storage or not file_storage.filename:
        return None
    if not allowed_file(file_storage.filename):
        raise ValueError("Chỉ hỗ trợ ảnh png, jpg, jpeg, gif hoặc webp.")
    original_name = secure_filename(file_storage.filename)
    extension = original_name.rsplit(".", 1)[1].lower()
    filename = f"{uuid4().hex}.{extension}"
    file_storage.save(UPLOAD_DIR / filename)
    return url_for("static", filename=f"uploads/{filename}")


def order_status(order):
    remaining = max(float(order["total_amount"]) - float(order["paid_amount"] or 0), 0)
    if remaining <= 0:
        return "paid"
    if float(order["paid_amount"] or 0) > 0:
        return "partial"
    return "unpaid"


def order_to_dict(order):
    data = dict(order)
    data["paid_amount"] = float(data.get("paid_amount") or 0)
    data["total_amount"] = float(data.get("total_amount") or 0)
    data["remaining_amount"] = max(data["total_amount"] - data["paid_amount"], 0)
    data["note"] = data.get("note") or ""
    data["status"] = order_status(data)
    return data


def sync_order_payment(conn, order_id):
    row = conn.execute("SELECT COALESCE(SUM(amount), 0) AS paid_amount FROM payments WHERE order_id = ?", (order_id,)).fetchone()
    paid_amount = float(row["paid_amount"] or 0)
    order = conn.execute("SELECT total_amount FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        return
    paid_amount = min(max(paid_amount, 0), float(order["total_amount"]))
    is_paid = 1 if paid_amount >= float(order["total_amount"]) else 0
    conn.execute("UPDATE orders SET paid_amount = ?, is_paid = ? WHERE id = ?", (paid_amount, is_paid, order_id))


def get_setting(conn, order_date):
    row = conn.execute("SELECT order_date, is_closed FROM daily_settings WHERE order_date = ?", (order_date,)).fetchone()
    if row:
        return dict(row)
    return {"order_date": order_date, "is_closed": 0}


def get_order_items(conn, order_id):
    return [
        dict(item)
        for item in conn.execute(
            "SELECT id, product_id, product_name, price, quantity FROM order_items WHERE order_id = ?",
            (order_id,),
        ).fetchall()
    ]


def get_order_payments(conn, order_id):
    return [
        dict(payment)
        for payment in conn.execute(
            "SELECT id, amount, method, note, created_at FROM payments WHERE order_id = ? ORDER BY created_at DESC, id DESC",
            (order_id,),
        ).fetchall()
    ]


def calculate_items_total(conn, items, public_only=True):
    total_amount = 0
    saved_items = []
    for item in items:
        try:
            product_id = int(item.get("id") or item.get("product_id"))
            quantity = int(item.get("quantity", 0))
        except (TypeError, ValueError):
            continue
        if quantity <= 0:
            continue
        if public_only:
            product = conn.execute(
                "SELECT id, name, price FROM products WHERE id = ? AND is_available = 1 AND is_sold_out = 0",
                (product_id,),
            ).fetchone()
        else:
            product = conn.execute("SELECT id, name, price FROM products WHERE id = ?", (product_id,)).fetchone()
        if product:
            total_amount += float(product["price"]) * quantity
            saved_items.append((product["id"], product["name"], float(product["price"]), quantity))
    return total_amount, saved_items


init_db()


@app.route("/")
def customer_page():
    return render_template("index.html")


@app.route("/payment")
def public_payment_page():
    return render_template("payment.html")


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
            session["admin_logged_in"] = True
            return redirect(url_for("admin_page"))
        error = "Sai tài khoản hoặc mật khẩu."
    return render_template("login.html", error=error)


@app.route("/admin/logout")
def admin_logout():
    session.pop("admin_logged_in", None)
    return redirect(url_for("admin_login"))


@app.route("/admin")
@admin_required
def admin_page():
    return render_template("admin.html")


@app.route("/api/day-status", methods=["GET", "PUT"])
def day_status():
    order_date = request.args.get("date") or today_key()
    conn = get_db_conn()
    if request.method == "PUT":
        if not session.get("admin_logged_in"):
            conn.close()
            return jsonify({"success": False, "message": "Bạn cần đăng nhập admin."}), 401
        data = request.get_json() or {}
        is_closed = 1 if data.get("is_closed") else 0
        conn.execute(
            """
            INSERT INTO daily_settings (order_date, is_closed, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(order_date) DO UPDATE SET is_closed = excluded.is_closed, updated_at = CURRENT_TIMESTAMP
            """,
            (order_date, is_closed),
        )
        conn.commit()
    setting = get_setting(conn, order_date)
    conn.close()
    return jsonify({"success": True, **setting})


@app.route("/api/customers", methods=["GET"])
def get_customers():
    conn = get_db_conn()
    if session.get("admin_logged_in"):
        rows = conn.execute(
            """
            SELECT id, name, group_type, is_active, created_at
            FROM customers
            ORDER BY CASE group_type WHEN 'vjp' THEN 0 ELSE 1 END, name COLLATE NOCASE
            """
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id, name, group_type
            FROM customers
            WHERE is_active = 1
            ORDER BY CASE group_type WHEN 'vjp' THEN 0 ELSE 1 END, name COLLATE NOCASE
            """
        ).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@app.route("/api/customers", methods=["POST"])
@api_admin_required
def create_customer():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    group_type = "vjp" if data.get("group_type") == "vjp" else "regular"
    if not name:
        return jsonify({"success": False, "message": "Tên khách là bắt buộc."}), 400
    conn = get_db_conn()
    try:
        cursor = conn.execute("INSERT INTO customers (name, group_type, is_active) VALUES (?, ?, 1)", (name, group_type))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"success": False, "message": "Tên khách đã tồn tại."}), 400
    customer_id = cursor.lastrowid
    conn.close()
    return jsonify({"success": True, "id": customer_id})


@app.route("/api/customers/<int:customer_id>/toggle-active", methods=["POST"])
@api_admin_required
def toggle_customer_active(customer_id):
    conn = get_db_conn()
    customer = conn.execute("SELECT is_active FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not customer:
        conn.close()
        return jsonify({"success": False, "message": "Không tìm thấy khách."}), 404
    new_status = 0 if customer["is_active"] else 1
    conn.execute("UPDATE customers SET is_active = ? WHERE id = ?", (new_status, customer_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "is_active": new_status})
@app.route("/api/customers/<int:customer_id>", methods=["PUT"])
@api_admin_required
def update_customer(customer_id):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    group_type = "vjp" if data.get("group_type") == "vjp" else "regular"
    is_active = 1 if data.get("is_active", True) else 0
    if not name:
        conn.close()
        return jsonify({"success": False, "message": "Tên khách là bắt buộc."}), 400
    try:
        conn.execute("UPDATE customers SET name = ?, group_type = ?, is_active = ? WHERE id = ?", (name, group_type, is_active, customer_id))
        conn.execute("UPDATE orders SET customer_name = ? WHERE customer_id = ?", (name, customer_id))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"success": False, "message": "Tên khách đã tồn tại."}), 400
    conn.close()
    return jsonify({"success": True})


@app.route("/api/products", methods=["GET"])
def get_products():
    conn = get_db_conn()
    public_only = request.args.get("public") == "1"
    if not public_only and session.get("admin_logged_in"):
        products = conn.execute("SELECT * FROM products ORDER BY id DESC").fetchall()
    else:
        products = conn.execute("SELECT * FROM products WHERE is_available = 1 ORDER BY is_sold_out ASC, id DESC").fetchall()
    conn.close()
    return jsonify([dict(p) for p in products])


@app.route("/api/products", methods=["POST"])
@api_admin_required
def create_product():
    name = request.form.get("name", "").strip()
    price = request.form.get("price", type=float)
    description = request.form.get("description", "").strip()
    image_url = request.form.get("image_url", "").strip()
    is_available = 1 if request.form.get("is_available") == "1" else 0
    is_sold_out = 1 if request.form.get("is_sold_out") == "1" else 0
    if not name or price is None or price < 0:
        return jsonify({"success": False, "message": "Tên món và giá hợp lệ là bắt buộc."}), 400
    try:
        uploaded_url = save_uploaded_image(request.files.get("image"))
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO products (name, price, image_url, description, is_available, is_sold_out)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (name, price, uploaded_url or image_url, description, is_available, is_sold_out),
    )
    conn.commit()
    product_id = cursor.lastrowid
    conn.close()
    return jsonify({"success": True, "id": product_id})


@app.route("/api/products/<int:product_id>", methods=["PUT"])
@api_admin_required
def update_product(product_id):
    name = request.form.get("name", "").strip()
    price = request.form.get("price", type=float)
    description = request.form.get("description", "").strip()
    image_url = request.form.get("image_url", "").strip()
    is_available = 1 if request.form.get("is_available") == "1" else 0
    is_sold_out = 1 if request.form.get("is_sold_out") == "1" else 0
    if not name or price is None or price < 0:
        return jsonify({"success": False, "message": "Tên món và giá hợp lệ là bắt buộc."}), 400
    try:
        uploaded_url = save_uploaded_image(request.files.get("image"))
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE products
        SET name = ?, price = ?, image_url = ?,
            description = ?, is_available = ?, is_sold_out = ?
        WHERE id = ?
        """,
        (name, price, uploaded_url if uploaded_url else image_url, description, is_available, is_sold_out, product_id),
    )
    conn.commit()
    updated = cursor.rowcount
    conn.close()
    if not updated:
        return jsonify({"success": False, "message": "Không tìm thấy món."}), 404
    return jsonify({"success": True})


@app.route("/api/products/<int:product_id>/<field>", methods=["PATCH"])
@api_admin_required
def update_product_flag(product_id, field):
    if field not in {"availability", "sold-out"}:
        return jsonify({"success": False, "message": "Trường cập nhật không hợp lệ."}), 400
    data = request.get_json() or {}
    column = "is_available" if field == "availability" else "is_sold_out"
    value = 1 if (data.get("is_available") or data.get("is_sold_out")) else 0
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE products SET {column} = ? WHERE id = ?", (value, product_id))
    conn.commit()
    updated = cursor.rowcount
    conn.close()
    if not updated:
        return jsonify({"success": False, "message": "Không tìm thấy món."}), 404
    return jsonify({"success": True})


@app.route("/api/products/<int:product_id>", methods=["DELETE"])
@api_admin_required
def delete_product(product_id):
    conn = get_db_conn()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    if not deleted:
        return jsonify({"success": False, "message": "Không tìm thấy món."}), 404
    return jsonify({"success": True})


@app.route("/api/orders", methods=["POST"])
def create_order():
    data = request.get_json() or {}
    customer_id = data.get("customer_id")
    payment_method = data.get("payment_method")
    note = (data.get("note") or "").strip()
    items = data.get("items", [])
    conn = get_db_conn()
    if get_setting(conn, today_key())["is_closed"]:
        conn.close()
        return jsonify({"success": False, "message": "Hôm nay đã chốt đơn, không nhận thêm đơn mới."}), 400
    customer = conn.execute("SELECT id, name FROM customers WHERE id = ? AND is_active = 1", (customer_id,)).fetchone()
    if not customer or not payment_method or not items:
        conn.close()
        return jsonify({"success": False, "message": "Vui lòng chọn tên, hình thức thanh toán và món."}), 400
    total_amount, saved_items = calculate_items_total(conn, items, public_only=True)
    if not saved_items:
        conn.close()
        return jsonify({"success": False, "message": "Giỏ hàng không có món đang bán."}), 400
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO orders (customer_id, customer_name, total_amount, paid_amount, payment_method, note, is_paid)
        VALUES (?, ?, ?, 0, ?, ?, 0)
        """,
        (customer["id"], customer["name"], total_amount, payment_method, note),
    )
    order_id = cursor.lastrowid
    cursor.executemany(
        "INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)",
        [(order_id, product_id, name, price, quantity) for product_id, name, price, quantity in saved_items],
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Đặt hàng thành công!", "order_id": order_id})


def build_order_list(conn, orders):
    result = []
    for order in orders:
        order_data = order_to_dict(order)
        order_data["items"] = get_order_items(conn, order["id"])
        order_data["payments"] = get_order_payments(conn, order["id"])
        result.append(order_data)
    return result


@app.route("/api/customer-orders", methods=["GET"])
def get_customer_orders():
    customer_id = request.args.get("customer_id")
    customer_name = request.args.get("customer_name", "").strip()
    conn = get_db_conn()
    if customer_id:
        orders = conn.execute(
            """
            SELECT o.*, c.group_type FROM orders o
            LEFT JOIN customers c ON c.id = o.customer_id
            WHERE o.customer_id = ?
            ORDER BY o.created_at DESC
            """,
            (customer_id,),
        ).fetchall()
    elif customer_name:
        orders = conn.execute(
            """
            SELECT o.*, c.group_type FROM orders o
            LEFT JOIN customers c ON c.id = o.customer_id
            WHERE lower(o.customer_name) = lower(?)
            ORDER BY o.created_at DESC
            """,
            (customer_name,),
        ).fetchall()
    else:
        conn.close()
        return jsonify([])
    result = build_order_list(conn, orders)
    conn.close()
    return jsonify(result)


@app.route("/api/customer-summary/<int:customer_id>", methods=["GET"])
def get_customer_summary(customer_id):
    conn = get_db_conn()
    customer = conn.execute("SELECT id, name, group_type FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not customer:
        conn.close()
        return jsonify({"success": False, "message": "Không tìm thấy khách."}), 404
    row = conn.execute(
        """
        SELECT COALESCE(SUM(total_amount), 0) AS total_amount,
               COALESCE(SUM(paid_amount), 0) AS paid_amount,
               COALESCE(SUM(total_amount - paid_amount), 0) AS remaining_amount,
               COUNT(*) AS order_count
        FROM orders WHERE customer_id = ?
        """,
        (customer_id,),
    ).fetchone()
    orders = conn.execute("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC", (customer_id,)).fetchall()
    order_list = build_order_list(conn, orders)
    conn.close()
    return jsonify({"success": True, "customer": dict(customer), "summary": dict(row), "orders": order_list})


@app.route("/api/orders", methods=["GET"])
@api_admin_required
def get_all_orders():
    conn = get_db_conn()
    orders = conn.execute(
        """
        SELECT o.*, c.group_type FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        ORDER BY o.created_at DESC
        """
    ).fetchall()
    result = build_order_list(conn, orders)
    conn.close()
    return jsonify(result)


@app.route("/api/orders/<int:order_id>", methods=["PUT", "DELETE"])
@api_admin_required
def update_order(order_id):
    conn = get_db_conn()
    if request.method == "DELETE":
        conn.execute("DELETE FROM orders WHERE id = ?", (order_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    data = request.get_json() or {}
    customer_id = data.get("customer_id")
    payment_method = data.get("payment_method", "").strip()
    note = (data.get("note") or "").strip()
    items = data.get("items", [])
    customer = conn.execute("SELECT id, name FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not customer or not payment_method:
        conn.close()
        return jsonify({"success": False, "message": "Thông tin đơn chưa hợp lệ."}), 400
    total_amount, saved_items = calculate_items_total(conn, items, public_only=False)
    if not saved_items:
        conn.close()
        return jsonify({"success": False, "message": "Đơn cần ít nhất một món."}), 400
    conn.execute(
        """
        UPDATE orders SET customer_id = ?, customer_name = ?, payment_method = ?, note = ?, total_amount = ?
        WHERE id = ?
        """,
        (customer["id"], customer["name"], payment_method, note, total_amount, order_id),
    )
    conn.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
    conn.executemany(
        "INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)",
        [(order_id, product_id, name, price, quantity) for product_id, name, price, quantity in saved_items],
    )
    sync_order_payment(conn, order_id)
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/orders/<int:order_id>/payments", methods=["POST"])
@api_admin_required
def add_order_payment(order_id):
    data = request.get_json() or {}
    try:
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "Số tiền không hợp lệ."}), 400
    if amount <= 0:
        return jsonify({"success": False, "message": "Số tiền trả phải lớn hơn 0."}), 400
    conn = get_db_conn()
    order = conn.execute("SELECT id FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"success": False, "message": "Không tìm thấy đơn hàng."}), 404
    conn.execute(
        "INSERT INTO payments (order_id, amount, method, note) VALUES (?, ?, ?, ?)",
        (order_id, amount, data.get("method", ""), data.get("note", "")),
    )
    sync_order_payment(conn, order_id)
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/orders/<int:order_id>/payment", methods=["PUT"])
@api_admin_required
def set_order_payment(order_id):
    data = request.get_json() or {}
    try:
        target_paid = float(data.get("paid_amount"))
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "Số tiền đã trả không hợp lệ."}), 400
    conn = get_db_conn()
    order = conn.execute("SELECT total_amount, paid_amount FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"success": False, "message": "Không tìm thấy đơn hàng."}), 404
    target_paid = min(max(target_paid, 0), float(order["total_amount"]))
    diff = target_paid - float(order["paid_amount"] or 0)
    if abs(diff) > 0.01:
        conn.execute(
            "INSERT INTO payments (order_id, amount, method, note) VALUES (?, ?, ?, ?)",
            (order_id, diff, "Điều chỉnh", "Admin đặt lại số đã trả"),
        )
    sync_order_payment(conn, order_id)
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/order-matrix", methods=["GET"])
@api_admin_required
def get_order_matrix():
    conn = get_db_conn()
    orders = conn.execute(
        """
        SELECT o.id, o.customer_name, o.total_amount, o.paid_amount, date(o.created_at) AS order_date,
               c.group_type
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        ORDER BY order_date ASC, o.customer_name ASC, o.id ASC
        """
    ).fetchall()
    conn.close()
    dates = []
    customers = {}
    for order in orders:
        order_data = order_to_dict(order)
        order_date = order["order_date"]
        if order_date not in dates:
            dates.append(order_date)
        customer = customers.setdefault(
            order["customer_name"],
            {"customer_name": order["customer_name"], "group_type": order["group_type"] or "regular", "total_debt": 0, "dates": {}},
        )
        customer["total_debt"] += order_data["remaining_amount"]
        cell = customer["dates"].setdefault(order_date, {"total_amount": 0, "paid_amount": 0, "remaining_amount": 0, "order_ids": []})
        cell["total_amount"] += order_data["total_amount"]
        cell["paid_amount"] += order_data["paid_amount"]
        cell["remaining_amount"] += order_data["remaining_amount"]
        cell["order_ids"].append(order["id"])
    return jsonify({"dates": dates, "customers": list(customers.values())})


@app.route("/api/public-debt", methods=["GET"])
def get_public_debt():
    conn = get_db_conn()
    orders = conn.execute(
        """
        SELECT o.id, o.customer_name, o.total_amount, o.paid_amount, c.group_type
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        ORDER BY o.customer_name ASC
        """
    ).fetchall()
    conn.close()
    
    customers = {}
    for order in orders:
        order_data = order_to_dict(order)
        customer = customers.setdefault(
            order["customer_name"],
            {"customer_name": order["customer_name"], "group_type": order["group_type"] or "regular", "total_debt": 0}
        )
        customer["total_debt"] += order_data["remaining_amount"]
        
    debt_list = list(customers.values())
    # Sắp xếp VJP lên đầu, sau đó đến người còn nợ nhiều, người hết nợ (0đ) xếp cuối cùng
    debt_list.sort(key=lambda x: (
        0 if x["group_type"] == 'vjp' else 1,
        0 if x["total_debt"] > 0 else 1,
        -x["total_debt"]
    ))
    return jsonify(debt_list)


@app.route("/api/dashboard-stats", methods=["GET"])
@api_admin_required
def get_dashboard_stats():
    conn = get_db_conn()
    row = conn.execute(
        """
        SELECT COALESCE(SUM(paid_amount), 0) AS total_revenue,
               COALESCE(SUM(total_amount - paid_amount), 0) AS outstanding_debt,
               COUNT(*) AS order_count
        FROM orders
        """
    ).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.route("/api/customer-orders/<int:order_id>", methods=["PUT"])
def update_customer_order(order_id):
    data = request.get_json() or {}
    conn = get_db_conn()
    order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"success": False, "message": "Không tìm thấy đơn hàng."}), 404
    if float(order["paid_amount"] or 0) > 0:
        conn.close()
        return jsonify({"success": False, "message": "Đơn đã thanh toán, không thể sửa."}), 400
    customer_id = data.get("customer_id")
    items = data.get("items", [])
    note = (data.get("note") or "").strip()
    customer = conn.execute("SELECT id, name FROM customers WHERE id = ? AND is_active = 1", (customer_id,)).fetchone()
    if not customer or not items:
        conn.close()
        return jsonify({"success": False, "message": "Vui lòng chọn tên và ít nhất một món."}), 400
    total_amount, saved_items = calculate_items_total(conn, items, public_only=False)
    if not saved_items:
        conn.close()
        return jsonify({"success": False, "message": "Đơn cần ít nhất một món hợp lệ."}), 400
    payment_method = data.get("payment_method") or order["payment_method"]
    conn.execute(
        "UPDATE orders SET customer_id = ?, customer_name = ?, payment_method = ?, note = ?, total_amount = ? WHERE id = ?",
        (customer["id"], customer["name"], payment_method, note, total_amount, order_id),
    )
    conn.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
    conn.executemany(
        "INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)",
        [(order_id, pid, name, price, qty) for pid, name, price, qty in saved_items],
    )
    sync_order_payment(conn, order_id)
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Đã cập nhật đơn hàng."})


@app.route("/api/orders/<int:order_id>/extra", methods=["POST"])
def add_extra_item(order_id):
    data = request.get_json() or {}
    product_name = (data.get("product_name") or "").strip()
    try:
        price = float(data.get("price"))
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "Giá không hợp lệ."}), 400
    if not product_name or price <= 0:
        return jsonify({"success": False, "message": "Vui lòng chọn món và giá hợp lệ."}), 400
    conn = get_db_conn()
    order = conn.execute("SELECT id, total_amount FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"success": False, "message": "Không tìm thấy đơn hàng."}), 404
    product = conn.execute("SELECT id FROM products WHERE lower(name) = lower(?)", (product_name,)).fetchone()
    product_id = product["id"] if product else None
    
    target_name = product_name + " (thêm)"
    existing_item = conn.execute(
        "SELECT id, quantity FROM order_items WHERE order_id = ? AND product_name = ? AND price = ?",
        (order_id, target_name, price)
    ).fetchone()
    
    if existing_item:
        new_qty = existing_item["quantity"] + 1
        conn.execute("UPDATE order_items SET quantity = ? WHERE id = ?", (new_qty, existing_item["id"]))
    else:
        conn.execute(
            "INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, 1)",
            (order_id, product_id, target_name, price),
        )
    
    new_total = float(order["total_amount"]) + price
    conn.execute("UPDATE orders SET total_amount = ? WHERE id = ?", (new_total, order_id))
    sync_order_payment(conn, order_id)
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Đã thêm đồ ăn thêm."})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
