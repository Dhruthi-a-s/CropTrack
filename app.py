
from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import date, timedelta

app = Flask(__name__)

DB_NAME = "croptrack.db"

LOCATIONS = ["Puttur", "Sullia"]

CROPS = [
    "Arecanut",
    "Coconut",
    "Cocoa",
    "Black Pepper",
    "Mango",
    "Rice",
    "Rubber",
    "Cashew",
    "Banana"
]


# ---------------- DATABASE ----------------

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database():
    conn = get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS shop_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            location TEXT NOT NULL,
            crop TEXT NOT NULL,
            shop_name TEXT NOT NULL,
            price_per_kg REAL NOT NULL,
            quality TEXT DEFAULT 'Standard',
            report_date TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()


initialize_database()


# ---------------- HOME ----------------

@app.route("/")
def home():
    return render_template("index.html")


# ---------------- CROP AND LOCATION LISTS ----------------

@app.route("/api/crops")
def get_crops():
    return jsonify(CROPS)


@app.route("/api/locations")
def get_locations():
    return jsonify(LOCATIONS)


# ---------------- SUBMIT SHOP PRICE ----------------

@app.route("/api/submit-price", methods=["POST"])
def submit_price():

    data = request.get_json(silent=True) or {}

    location = data.get("location")
    crop = data.get("crop")
    shop_name = data.get("shop_name")
    quality = data.get("quality", "Standard")

    try:
        price = float(data.get("price_per_kg"))
    except (TypeError, ValueError):
        return jsonify({"error": "Enter a valid price."}), 400

    if location not in LOCATIONS:
        return jsonify({"error": "Invalid location."}), 400

    if crop not in CROPS:
        return jsonify({"error": "Invalid crop."}), 400

    if not shop_name or not shop_name.strip():
        return jsonify({"error": "Enter shop name."}), 400

    if price <= 0 or price > 100000:
        return jsonify({"error": "Enter a valid price per kg."}), 400

    conn = get_db()

    conn.execute("""
        INSERT INTO shop_prices
        (location, crop, shop_name, price_per_kg, quality, report_date)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        location,
        crop,
        shop_name.strip(),
        price,
        quality,
        date.today().isoformat()
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Price submitted successfully!",
        "price_per_kg": price
    })


# ---------------- GET MARKET PRICES ----------------

def build_market_summary(location, crop):
    conn = get_db()

    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    rows = conn.execute("""
        SELECT shop_name, price_per_kg, quality, report_date
        FROM shop_prices
        WHERE location = ? AND crop = ? AND report_date = ?
        ORDER BY price_per_kg DESC
    """, (location, crop, today)).fetchall()

    old = conn.execute("""
        SELECT AVG(price_per_kg) AS average
        FROM shop_prices
        WHERE location = ? AND crop = ? AND report_date = ?
    """, (location, crop, yesterday)).fetchone()

    conn.close()

    prices = [row["price_per_kg"] for row in rows]

    if prices:
        average = sum(prices) / len(prices)
        highest = max(prices)
        lowest = min(prices)
    else:
        average = None
        highest = None
        lowest = None

    yesterday_average = old["average"] if old else None

    if average is not None and yesterday_average is not None:
        change = average - yesterday_average

        if change > 0:
            trend = "Rising"
        elif change < 0:
            trend = "Falling"
        else:
            trend = "Stable"
    else:
        change = None
        trend = "Insufficient data"

    return {
        "location": location,
        "crop": crop,
        "unit": "₹/kg",
        "date": today,
        "average_price": round(average, 2) if average is not None else None,
        "highest_price": highest,
        "lowest_price": lowest,
        "shop_count": len(rows),
        "yesterday_average": (
            round(yesterday_average, 2)
            if yesterday_average is not None else None
        ),
        "price_change": (
            round(change, 2) if change is not None else None
        ),
        "trend": trend,
        "shops": [dict(row) for row in rows]
    }


@app.route("/api/prices")
def get_prices():

    location = request.args.get("location")
    crop = request.args.get("crop")

    if location not in LOCATIONS or crop not in CROPS:
        return jsonify({"error": "Select a valid location and crop."}), 400

    return jsonify(build_market_summary(location, crop))


@app.route("/api/live-price")
def get_live_price():

    location = request.args.get("location") or LOCATIONS[0]
    crop = request.args.get("crop") or CROPS[0]

    if location not in LOCATIONS or crop not in CROPS:
        return jsonify({"error": "Select a valid location and crop."}), 400

    return jsonify(build_market_summary(location, crop))


# ---------------- HISTORICAL PRICES ----------------

@app.route("/api/history")
def get_history():

    location = request.args.get("location")
    crop = request.args.get("crop")

    if location not in LOCATIONS or crop not in CROPS:
        return jsonify({"error": "Invalid crop or location."}), 400

    conn = get_db()

    rows = conn.execute("""
        SELECT report_date,
               ROUND(AVG(price_per_kg), 2) AS average_price,
               COUNT(*) AS shop_count
        FROM shop_prices
        WHERE location = ? AND crop = ?
        GROUP BY report_date
        ORDER BY report_date ASC
    """, (location, crop)).fetchall()

    conn.close()

    return jsonify([dict(row) for row in rows])


if __name__ == "__main__":
    app.run(debug=True)
