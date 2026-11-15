
// LOAD CROPS FROM FLASK

async function loadCrops() {
    try {
        const response = await fetch("/api/crops");
        const crops = await response.json();

        const select = document.getElementById("crop");

        select.innerHTML = '<option value="">Choose crop</option>';

        crops.forEach(crop => {
            const option = document.createElement("option");
            option.value = crop;
            option.textContent = crop;
            select.appendChild(option);
        });

        const defaultCrop = crops.includes("Rice") ? "Rice" : crops[0];
        if (defaultCrop) {
            select.value = defaultCrop;
        }

        await Promise.all([
            loadLivePriceDashboard(),
            loadPriceHistoryChart()
        ]);

    } catch (error) {
        document.getElementById("message").textContent =
            "Unable to load crops.";
    }
}

function updateLivePriceCard(data) {
    const panel = document.getElementById("live-price-panel");
    const cropText = document.getElementById("live-price-crop");
    const valueText = document.getElementById("live-price-value");
    const locationText = document.getElementById("live-price-location");
    const changeText = document.getElementById("live-price-change");
    const statusText = document.getElementById("live-price-status");

    if (!panel || !cropText || !valueText || !locationText || !changeText || !statusText) {
        return;
    }

    const average = data.average_price !== null ? Number(data.average_price) : null;
    const change = data.price_change !== null ? Number(data.price_change) : null;

    cropText.textContent = data.crop;
    locationText.textContent = data.location;
    valueText.textContent = average !== null
        ? `₹${average.toFixed(2)} / kg`
        : "No report yet";

    if (change !== null) {
        const sign = change >= 0 ? "+" : "-";
        changeText.textContent = `Trend: ${data.trend} (${sign}₹${Math.abs(change).toFixed(2)})`;
    } else {
        changeText.textContent = `Trend: ${data.trend}`;
    }

    const hasPrice = average !== null;
    statusText.textContent = hasPrice ? "Today's reports" : "Awaiting reports";
    statusText.classList.toggle("is-live", hasPrice);
    panel.classList.toggle("is-live", hasPrice);
}

async function loadLivePriceDashboard() {
    const crop = document.getElementById("crop")?.value || "Rice";
    const location = document.getElementById("location")?.value || "Puttur";

    try {
        const response = await fetch(
            `/api/live-price?crop=${encodeURIComponent(crop)}&location=${encodeURIComponent(location)}`
        );
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to load live market price.");
        }

        updateLivePriceCard(data);
    } catch (error) {
        const statusText = document.getElementById("live-price-status");
        if (statusText) {
            statusText.textContent = "Offline";
            statusText.classList.remove("is-live");
        }
    }
}

function addSvgElement(svg, name, attributes, text) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });
    if (text !== undefined) {
        element.textContent = text;
    }
    svg.appendChild(element);
    return element;
}

function renderPriceHistory(rows, crop, location) {
    const chart = document.getElementById("price-chart");
    const status = document.getElementById("chart-status");
    const rangeLabel = document.getElementById("chart-range");
    if (!chart || !status || !rangeLabel) {
        return;
    }

    chart.replaceChildren();

    if (rows.length === 0) {
        const empty = document.createElement("p");
        empty.className = "chart-empty";
        empty.textContent = "No price history yet. Submit local shop prices to start the graph.";
        chart.appendChild(empty);
        status.textContent = "No reports";
        rangeLabel.textContent = "Waiting for reported prices";
        return;
    }

    const width = 720;
    const height = 300;
    const padding = { top: 20, right: 22, bottom: 42, left: 64 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const prices = rows.map(row => Number(row.average_price));
    const minimum = Math.min(...prices);
    const maximum = Math.max(...prices);
    const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.1, 1);
    const lowerBound = minimum - spread * 0.12;
    const upperBound = maximum + spread * 0.12;
    const xFor = index => padding.left + (
        rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth
    );
    const yFor = price => padding.top + (
        (upperBound - price) / (upperBound - lowerBound)
    ) * plotHeight;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute(
        "aria-label",
        `Daily average ${crop} prices in ${location} for ${rows.length} reporting days`
    );

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${crop} price history in ${location}`;
    svg.appendChild(title);

    const tickCount = 4;
    for (let index = 0; index < tickCount; index += 1) {
        const ratio = index / (tickCount - 1);
        const y = padding.top + ratio * plotHeight;
        const value = upperBound - ratio * (upperBound - lowerBound);

        addSvgElement(svg, "line", {
            x1: padding.left,
            y1: y,
            x2: width - padding.right,
            y2: y,
            class: "chart-gridline"
        });
        addSvgElement(svg, "text", {
            x: padding.left - 10,
            y: y + 4,
            "text-anchor": "end",
            class: "chart-axis-label"
        }, `₹${value.toFixed(0)}`);
    }

    const pointCoordinates = rows.map((row, index) => ({
        x: xFor(index),
        y: yFor(Number(row.average_price))
    }));
    const linePath = pointCoordinates
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

    if (pointCoordinates.length > 1) {
        const firstPoint = pointCoordinates[0];
        const lastPoint = pointCoordinates[pointCoordinates.length - 1];
        const areaPath = `${linePath} L ${lastPoint.x} ${padding.top + plotHeight} L ${firstPoint.x} ${padding.top + plotHeight} Z`;
        addSvgElement(svg, "path", { d: areaPath, class: "chart-area" });
    }

    addSvgElement(svg, "path", { d: linePath, class: "chart-line" });

    rows.forEach((row, index) => {
        const point = pointCoordinates[index];
        const date = new Date(`${row.report_date}T00:00:00`);
        const formattedDate = Number.isNaN(date.getTime())
            ? row.report_date
            : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        const circle = addSvgElement(svg, "circle", {
            cx: point.x,
            cy: point.y,
            r: 4.5,
            class: "chart-point"
        });
        const pointTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
        pointTitle.textContent = `${formattedDate}: ₹${Number(row.average_price).toFixed(2)} per kg · ${row.shop_count} shop report(s)`;
        circle.appendChild(pointTitle);
    });

    const labelIndexes = new Set([
        0,
        Math.round((rows.length - 1) / 2),
        rows.length - 1
    ]);
    labelIndexes.forEach(index => {
        const date = new Date(`${rows[index].report_date}T00:00:00`);
        const label = Number.isNaN(date.getTime())
            ? rows[index].report_date
            : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        addSvgElement(svg, "text", {
            x: pointCoordinates[index].x,
            y: height - 12,
            "text-anchor": index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle",
            class: "chart-axis-label"
        }, label);
    });

    chart.appendChild(svg);
    status.textContent = `${rows.length} day${rows.length === 1 ? "" : "s"}`;
    rangeLabel.textContent = rows.length === 1
        ? "Add more reporting days to see variation"
        : "Last 30 reporting days";
}

async function loadPriceHistoryChart() {
    const crop = document.getElementById("crop")?.value || "Rice";
    const location = document.getElementById("location")?.value || "Puttur";
    const title = document.getElementById("chart-title");
    const status = document.getElementById("chart-status");
    const chart = document.getElementById("price-chart");

    if (!chart || !status) {
        return;
    }

    if (title) {
        title.textContent = `${crop} · ${location}`;
    }
    status.textContent = "Loading…";

    try {
        const response = await fetch(
            `/api/history?crop=${encodeURIComponent(crop)}&location=${encodeURIComponent(location)}`
        );
        const history = await response.json();

        if (!response.ok) {
            throw new Error(history.error || "Unable to load price history.");
        }

        const points = history
            .filter(row => row.report_date && Number.isFinite(Number(row.average_price)))
            .slice(-30);
        renderPriceHistory(points, crop, location);
    } catch (error) {
        chart.replaceChildren();
        const message = document.createElement("p");
        message.className = "chart-empty";
        message.textContent = error.message;
        chart.appendChild(message);
        status.textContent = "Unavailable";
        document.getElementById("chart-range").textContent = "Could not load history";
    }
}

// SEARCH MARKET PRICES

async function searchPrices() {

    const crop = document.getElementById("crop").value;
    const location = document.getElementById("location").value;

    const results = document.getElementById("price-results");
    const message = document.getElementById("message");

    if (!crop || !location) {
        message.textContent = "Please select crop and location.";
        return;
    }

    message.textContent = "Fetching market prices...";
    results.innerHTML = "";

    try {

        const response = await fetch(
            `/api/prices?crop=${encodeURIComponent(crop)}&location=${encodeURIComponent(location)}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to fetch prices.");
        }

        updateLivePriceCard(data);
        await loadPriceHistoryChart();

        if (data.shop_count === 0) {
            results.innerHTML = `
                <div class="empty-card">
                    <span>🌾</span>
                    <h3>No shop prices available yet</h3>
                    <p>Price quotations for ${crop} in ${location}
                    have not been submitted today.</p>
                    <p>Check again after shops submit their prices.</p>
                </div>
            `;

            message.textContent = "No verified quotations available.";
            return;
        }

        results.innerHTML = `
            <div class="price-card">
                <h3>${data.crop}</h3>
                <p>📍 ${data.location}</p>
                <h2>₹${data.average_price.toFixed(2)}</h2>
                <p>Average price per kg</p>
                <p>Highest: ₹${data.highest_price.toFixed(2)}</p>
                <p>Lowest: ₹${data.lowest_price.toFixed(2)}</p>
                <p>Shops reporting: ${data.shop_count}</p>
                <p>Yesterday: ${
                    data.yesterday_average !== null
                    ? "₹" + data.yesterday_average.toFixed(2)
                    : "No previous data"
                }</p>
                <p>Trend: ${data.trend}</p>
            </div>

            <div class="price-card">
                <h3>Shop-wise prices</h3>
                ${data.shops.map(shop => `
                    <p><strong>${shop.shop_name}</strong></p>
                    <p>₹${shop.price_per_kg.toFixed(2)} / kg</p>
                    <p>Quality: ${shop.quality}</p>
                    <hr>
                `).join("")}
            </div>
        `;

        message.textContent = "Market prices loaded successfully.";

    } catch (error) {

        message.textContent = error.message;
        results.innerHTML = `
            <div class="empty-card">
                <h3>Unable to load market prices</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}


// LOAD CROPS WHEN PAGE OPENS

document.addEventListener("DOMContentLoaded", () => {
    const locationSelect = document.getElementById("location");
    if (locationSelect && !locationSelect.value) {
        locationSelect.value = "Puttur";
    }

    const refreshSelectedPrices = () => {
        loadLivePriceDashboard();
        loadPriceHistoryChart();
    };
    document.getElementById("crop").addEventListener("change", refreshSelectedPrices);
    locationSelect.addEventListener("change", refreshSelectedPrices);
    document.querySelectorAll(".crop-action").forEach(action => {
        action.addEventListener("click", async event => {
            event.preventDefault();
            document.getElementById("crop").value = action.dataset.crop;
            await searchPrices();
            document.getElementById("market").scrollIntoView({ behavior: "smooth" });
        });
    });

    loadCrops();
    setInterval(loadLivePriceDashboard, 20000);
});

async function submitShopPrice() {

    const shop_name = document.getElementById("shopName").value.trim();
    const location = document.getElementById("submitLocation").value;
    const crop = document.getElementById("submitCrop").value;
    const price_per_kg = Number(document.getElementById("shopPrice").value);
    const quality = document.getElementById("shopQuality").value;

    const message = document.getElementById("submitMessage");

    if (!shop_name || !price_per_kg || price_per_kg <= 0) {
        message.textContent = "Please enter shop name and a valid price.";
        return;
    }

    message.textContent = "Submitting price...";

    try {

        const response = await fetch("/api/submit-price", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                shop_name,
                location,
                crop,
                price_per_kg,
                quality
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Submission failed.");
        }

        message.textContent = data.message;

        document.getElementById("shopName").value = "";
        document.getElementById("shopPrice").value = "";

        const selectedCrop = document.getElementById("crop").value;
        const selectedLocation = document.getElementById("location").value;
        if (crop === selectedCrop && location === selectedLocation) {
            await searchPrices();
        } else {
            await loadLivePriceDashboard();
        }

    } catch (error) {
        message.textContent = error.message;
    }
}
