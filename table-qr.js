(function () {
    const qrBaseUrl = document.getElementById("qrBaseUrl");
    const qrBaseUrlNote = document.getElementById("qrBaseUrlNote");
    const qrGrid = document.getElementById("qrGrid");
    const refreshQrBtn = document.getElementById("refreshQrBtn");
    const printQrBtn = document.getElementById("printQrBtn");

    function getInitialBaseUrl() {
        return SmartApp.buildEntryPageUrl(window.location.href);
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function normalizeBaseUrl(value) {
        const rawValue = String(value || "").trim();
        if (!rawValue) {
            return "";
        }

        try {
            return SmartApp.buildEntryPageUrl(rawValue);
        } catch (error) {
            return "";
        }
    }

    function updateBaseUrlNote(baseUrl) {
        if (!baseUrl) {
            qrBaseUrlNote.textContent = "Enter the public website URL where guests can open your ordering page.";
            return;
        }

        const parsedUrl = new URL(baseUrl);
        if (parsedUrl.protocol === "file:") {
            qrBaseUrlNote.textContent = "This is a local file path. Phones scanning the QR will need a hosted website URL instead.";
            return;
        }

        if (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1") {
            qrBaseUrlNote.textContent = "This QR uses localhost. Replace it with your live website URL before printing for customers.";
            return;
        }

        qrBaseUrlNote.textContent = `Guests who scan will open: ${baseUrl}`;
    }

    function renderEmptyState(message) {
        qrGrid.innerHTML = `
            <div class="glass">
                <h3 class="mb-2">QR Codes Not Ready</h3>
                <p class="mb-0">${escapeHTML(message)}</p>
            </div>
        `;
    }

    function createQrCard(tableNo, visitUrl) {
        const card = document.createElement("article");
        card.className = "qr-card";
        card.innerHTML = `
            <div class="qr-card__head">
                <div>
                    <p class="qr-card__label">Dining Table</p>
                    <h2 class="qr-card__table">Table ${String(tableNo).padStart(2, "0")}</h2>
                </div>
                <span class="qr-card__badge">Scan to Order</span>
            </div>
            <div class="qr-card__code" id="qrCodeTable${tableNo}"></div>
            <p class="qr-card__instructions">Guests only enter their name and phone number. The table number is picked automatically from this QR.</p>
            <div class="qr-card__url">${escapeHTML(visitUrl)}</div>
        `;

        const qrTarget = card.querySelector(`#qrCodeTable${tableNo}`);
        new QRCode(qrTarget, {
            text: visitUrl,
            width: 176,
            height: 176
        });

        return card;
    }

    function renderQrCodes() {
        const baseUrl = normalizeBaseUrl(qrBaseUrl.value);
        updateBaseUrlNote(baseUrl);

        if (!baseUrl) {
            renderEmptyState("Enter a valid website URL like https://your-domain.com/index.html to build the 20 table QR codes.");
            return;
        }

        qrGrid.innerHTML = "";

        for (let tableNo = 1; tableNo <= SmartApp.TABLE_LIMIT; tableNo += 1) {
            const visitUrl = SmartApp.buildTableVisitUrl(tableNo, baseUrl);
            qrGrid.appendChild(createQrCard(tableNo, visitUrl));
        }
    }

    refreshQrBtn.addEventListener("click", renderQrCodes);
    printQrBtn.addEventListener("click", () => {
        window.print();
    });
    qrBaseUrl.addEventListener("change", renderQrCodes);

    qrBaseUrl.value = getInitialBaseUrl();
    renderQrCodes();
})();
