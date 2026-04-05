(async function () {
    const ITEM_TYPES = SmartDB.ITEM_TYPES || {
        PREPARE: "prepare",
        PURCHASE: "purchase"
    };

    const billHeading = document.getElementById("billHeading");
    const billStatus = document.getElementById("billStatus");
    const billContent = document.getElementById("billContent");
    const printBillBtn = document.getElementById("printBillBtn");
    const doneBtn = document.getElementById("doneBtn");
    const params = new URLSearchParams(window.location.search);
    const billNo = Number(params.get("billNo"));
    const source = params.get("from");
    const isAdminView = source === "admin";

    let currentMode = "loading";
    let isSubmittingPayment = false;
    let previewBillNo = null;

    printBillBtn.addEventListener("click", () => {
        window.print();
    });

    doneBtn.addEventListener("click", () => {
        if (isAdminView) {
            window.location.href = "admin.html";
            return;
        }

        if (currentMode === "payment") {
            window.location.href = "kitchen.html";
            return;
        }

        window.location.href = "index.html";
    });

    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function formatAmount(value) {
        return SmartApp.formatCurrency(value);
    }

    function getItemTotal(item) {
        return Number(item.price || 0) * Number(item.quantity || 0);
    }

    function getTotalQuantity(items) {
        return (items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    }

    function getBillNumberLabel(bill) {
        return bill && bill.billNo
            ? SmartApp.formatBillNumber(bill.billNo)
            : "Pending";
    }

    async function getNextBillNumber() {
        const bills = await SmartDB.getAllBills();
        const latestBillNo = bills.reduce((maxBillNo, bill) => {
            return Math.max(maxBillNo, Number((bill && bill.billNo) || 0));
        }, 0);

        return latestBillNo + 1;
    }

    function getSavedRating(bill) {
        return Math.max(0, Math.min(5, Number(bill && bill.reviewRating || 0)));
    }

    function isPurchaseItem(item) {
        return item && item.itemType === ITEM_TYPES.PURCHASE;
    }

    function findMenuMatch(menuItems, itemRef) {
        return menuItems.find((menuItem) => Number(menuItem.id) === Number(itemRef.id))
            || menuItems.find((menuItem) => menuItem.name === itemRef.item);
    }

    function enrichOrderItem(orderItem, matchedItem) {
        const itemType = orderItem.itemType || (matchedItem ? matchedItem.itemType : ITEM_TYPES.PREPARE);
        const purchaseItem = itemType === ITEM_TYPES.PURCHASE;

        return {
            id: matchedItem ? matchedItem.id : orderItem.id,
            item: matchedItem ? matchedItem.name : orderItem.item,
            itemType,
            price: Number(orderItem.price || (matchedItem ? matchedItem.price : 0)),
            purchasePrice: Number(
                orderItem.purchasePrice !== undefined
                    ? orderItem.purchasePrice
                    : (matchedItem ? matchedItem.purchasePrice : 0)
            ),
            stock: purchaseItem ? Number(matchedItem ? matchedItem.stock : orderItem.stock || 0) : null,
            time: Number(orderItem.time || (matchedItem ? matchedItem.time : 0)),
            quantity: Number(orderItem.quantity || 0)
        };
    }

    function rebuildCartFromCurrentStock(menuItems, orderItems) {
        return (orderItems || []).reduce((nextCart, orderItem) => {
            const matchedItem = findMenuMatch(menuItems, orderItem);
            if (!matchedItem) {
                return nextCart;
            }

            const enrichedItem = enrichOrderItem(orderItem, matchedItem);
            if (isPurchaseItem(enrichedItem)) {
                const stock = Number(matchedItem.stock || 0);
                const quantity = Math.min(Number(enrichedItem.quantity || 0), stock);
                if (quantity <= 0) {
                    return nextCart;
                }
                enrichedItem.quantity = quantity;
                enrichedItem.stock = stock;
            }

            nextCart.push(enrichedItem);
            return nextCart;
        }, []);
    }

    function createBillPayload(session, total, finalizedItems, orderId, createdAt) {
        return {
            orderId,
            phone: session.phone,
            name: session.name,
            tableNo: session.tableNo,
            visitAt: session.loginAt,
            total: Number(total || 0),
            payMode: "UPI",
            items: finalizedItems.map((item) => ({
                id: item.id,
                item: item.item,
                itemType: item.itemType,
                price: Number(item.price || 0),
                purchasePrice: Number(item.purchasePrice || 0),
                quantity: Number(item.quantity || 0),
                time: Number(item.time || 0)
            })),
            reviewFeedback: "",
            reviewRating: 0,
            reviewedAt: null,
            createdAt
        };
    }

    function buildPreviewBill(session, order, nextBillNo) {
        return {
            billNo: Number.isInteger(nextBillNo) && nextBillNo > 0 ? nextBillNo : null,
            phone: session.phone,
            name: session.name,
            tableNo: session.tableNo,
            visitAt: session.loginAt,
            total: Number(order.total || 0),
            payMode: "UPI",
            items: (order.items || []).map((item) => ({
                id: item.id,
                item: item.item,
                itemType: item.itemType,
                price: Number(item.price || 0),
                purchasePrice: Number(item.purchasePrice || 0),
                quantity: Number(item.quantity || 0),
                time: Number(item.time || 0)
            })),
            reviewFeedback: "",
            reviewRating: 0,
            reviewedAt: null,
            createdAt: order.confirmedAt || new Date().toISOString()
        };
    }

    function buildReceiptMarkup(bill) {
        const items = Array.isArray(bill.items) ? bill.items : [];
        const totalQty = getTotalQuantity(items);
        const subTotal = items.reduce((sum, item) => sum + getItemTotal(item), 0);
        const restaurantProfile = SmartApp.RESTAURANT_PROFILE;

        return `
            <article class="receipt-paper">
                <header class="receipt-header">
                    <h1>${escapeHTML(restaurantProfile.name)}</h1>
                    <p>${escapeHTML(restaurantProfile.subtitle)}</p>
                    <p>${escapeHTML(restaurantProfile.addressLine)}</p>
                    <p>Contact No: ${escapeHTML(restaurantProfile.contactNo)}</p>
                    <p class="receipt-title">${escapeHTML(restaurantProfile.invoiceTitle)}</p>
                </header>

                <div class="receipt-divider"></div>

                <section class="receipt-meta">
                    <div>
                        <span class="receipt-meta-label">Date</span>
                        <strong class="receipt-meta-value">${escapeHTML(SmartApp.formatBillDate(bill.createdAt))}</strong>
                    </div>
                    <div>
                        <span class="receipt-meta-label">Time</span>
                        <strong class="receipt-meta-value">${escapeHTML(SmartApp.formatBillTime(bill.createdAt))}</strong>
                    </div>
                    <div>
                        <span class="receipt-meta-label">Bill No.</span>
                        <strong class="receipt-meta-value">${escapeHTML(getBillNumberLabel(bill))}</strong>
                    </div>
                    <div>
                        <span class="receipt-meta-label">Table</span>
                        <strong class="receipt-meta-value">${escapeHTML(bill.tableNo || "-")}</strong>
                    </div>
                    <div>
                        <span class="receipt-meta-label">Customer</span>
                        <strong class="receipt-meta-value">${escapeHTML(bill.name || "-")}</strong>
                    </div>
                    <div>
                        <span class="receipt-meta-label">Pay Mode</span>
                        <strong class="receipt-meta-value">${escapeHTML(bill.payMode || "UPI")}</strong>
                    </div>
                </section>

                <div class="receipt-divider"></div>

                <table class="receipt-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Rate</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item) => `
                            <tr>
                                <td>${escapeHTML(item.item || "-")}</td>
                                <td>${escapeHTML(String(Number(item.quantity || 0)))}</td>
                                <td>${escapeHTML(formatAmount(item.price))}</td>
                                <td>${escapeHTML(formatAmount(getItemTotal(item)))}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>

                <div class="receipt-divider"></div>

                <section class="receipt-summary">
                    <div class="receipt-summary-row">
                        <span>Total Qty</span>
                        <strong>${escapeHTML(String(totalQty))}</strong>
                    </div>
                    <div class="receipt-summary-row">
                        <span>Sub Total</span>
                        <strong>Rs ${escapeHTML(formatAmount(subTotal))}</strong>
                    </div>
                    <div class="receipt-summary-row grand-total">
                        <span>Grand Total</span>
                        <strong>Rs ${escapeHTML(formatAmount(bill.total))}</strong>
                    </div>
                </section>

                <div class="receipt-divider"></div>

                <section class="receipt-qr">
                    <p>${escapeHTML(restaurantProfile.qrCaption)}</p>
                    <div class="receipt-qr-box">
                        <div id="billQr"></div>
                    </div>
                </section>

                <div class="receipt-divider"></div>

                <footer class="receipt-footer">
                    <p>Phone: ${escapeHTML(bill.phone || "-")}</p>
                    <p>${escapeHTML(restaurantProfile.footerLine)}</p>
                </footer>
            </article>
        `;
    }

    function buildPaymentStepMarkup(buttonLabel = "Payment Done") {
        return `
            <section class="bill-action-card no-print">
                <div class="payment-step-actions">
                    <button id="paymentDoneBtn" class="btn btn-success" type="button">${escapeHTML(buttonLabel)}</button>
                </div>
            </section>
        `;
    }

    function buildAdminReviewMarkup(bill) {
        const rating = getSavedRating(bill);
        const feedback = String(bill.reviewFeedback || "").trim();
        const reviewDate = bill.reviewedAt
            ? SmartApp.formatDateTime(bill.reviewedAt)
            : "";

        return `
            <section class="bill-review-card no-print">
                <div class="review-header">
                    <h4 class="mb-1">Saved Review</h4>
                    <p class="mb-0">Customer rating and feedback for this bill.</p>
                </div>

                <div class="review-summary-grid">
                    <div class="review-summary-item">
                        <span class="review-summary-label">Rating</span>
                        <strong class="review-summary-value">${rating > 0 ? `${escapeHTML(String(rating))}/5` : "Not rated yet"}</strong>
                    </div>
                    <div class="review-summary-item">
                        <span class="review-summary-label">Reviewed At</span>
                        <strong class="review-summary-value">${reviewDate ? escapeHTML(reviewDate) : "-"}</strong>
                    </div>
                </div>

                <div class="review-summary-feedback">
                    <span class="review-summary-label">Feedback</span>
                    <p class="mb-0">${feedback ? escapeHTML(feedback) : "No feedback added."}</p>
                </div>
            </section>
        `;
    }

    function renderMissingBill(message) {
        billHeading.textContent = "Bill";
        billStatus.textContent = message;
        printBillBtn.disabled = true;
        doneBtn.textContent = isAdminView ? "Back to Admin" : "New Order";
        billContent.innerHTML = `
            <div class="bill-empty-state">
                <h4 class="mb-2">Bill Not Available</h4>
                <p class="mb-0">${escapeHTML(message)}</p>
            </div>
        `;
    }

    function renderBillQR(total, savedBillNo) {
        const qrTarget = document.getElementById("billQr");
        if (!qrTarget) {
            return;
        }

        qrTarget.innerHTML = "";
        new QRCode(qrTarget, {
            text: SmartApp.buildBillUpiLink(total, savedBillNo),
            width: 150,
            height: 150
        });
    }

    function bindPaymentDoneAction(handler) {
        const paymentDoneBtn = document.getElementById("paymentDoneBtn");
        if (!paymentDoneBtn) {
            return;
        }

        paymentDoneBtn.addEventListener("click", async () => {
            await handler();
        });
    }

    function redirectToReview(savedBillNo) {
        location.replace(`review.html?billNo=${encodeURIComponent(savedBillNo)}`);
    }

    function renderPaymentStep(session, order) {
        currentMode = "payment";
        const previewBill = buildPreviewBill(session, order, previewBillNo);
        billHeading.textContent = "Bill Payment";
        billStatus.textContent = previewBill.billNo
            ? `Bill ${SmartApp.formatBillNumber(previewBill.billNo)} is ready. Scan the QR and complete payment. The review is on the next page.`
            : "Scan the QR and complete payment. The review is on the next page.";
        printBillBtn.disabled = false;
        doneBtn.textContent = "Back";

        billContent.innerHTML = `
            <div class="bill-stack">
                ${buildReceiptMarkup(previewBill)}
                ${buildPaymentStepMarkup()}
            </div>
        `;

        renderBillQR(previewBill.total, previewBill.billNo);
        bindPaymentDoneAction(finalizePayment);
    }

    function renderSavedCustomerBill(bill) {
        currentMode = "saved";
        billHeading.textContent = "Bill";
        billStatus.textContent = `Bill ${SmartApp.formatBillNumber(bill.billNo)} is ready. Scan the QR and complete payment. The review is on the next page.`;
        printBillBtn.disabled = false;
        doneBtn.textContent = "New Order";

        billContent.innerHTML = `
            <div class="bill-stack">
                ${buildReceiptMarkup(bill)}
                ${buildPaymentStepMarkup("Continue to Review")}
            </div>
        `;

        renderBillQR(bill.total, bill.billNo);
        bindPaymentDoneAction(async () => {
            redirectToReview(bill.billNo);
        });
    }

    function renderAdminBill(bill) {
        currentMode = "admin";
        billHeading.textContent = "Saved Bill";
        billStatus.textContent = `Bill ${SmartApp.formatBillNumber(bill.billNo)} is ready to view or print.`;
        printBillBtn.disabled = false;
        doneBtn.textContent = "Back to Admin";

        billContent.innerHTML = `
            <div class="bill-stack">
                ${buildReceiptMarkup(bill)}
                ${buildAdminReviewMarkup(bill)}
            </div>
        `;

        renderBillQR(bill.total, bill.billNo);
    }

    async function finalizePayment() {
        if (isSubmittingPayment) {
            return;
        }

        const session = SmartApp.getSession();
        const order = SmartApp.getOrderState();

        if (!session || !order) {
            location.replace("index.html");
            return;
        }

        isSubmittingPayment = true;
        const paymentDoneBtn = document.getElementById("paymentDoneBtn");
        if (paymentDoneBtn) {
            paymentDoneBtn.disabled = true;
        }

        try {
            await SmartDB.init();
            const latestMenu = await SmartDB.getMenuItems();
            const stockIssue = order.items.find((orderItem) => {
                const matchedItem = findMenuMatch(latestMenu, orderItem);
                if (!matchedItem) {
                    return true;
                }

                const enrichedItem = enrichOrderItem(orderItem, matchedItem);
                if (!isPurchaseItem(enrichedItem)) {
                    return false;
                }

                return Number(enrichedItem.quantity || 0) > Number(matchedItem.stock || 0);
            });

            if (stockIssue) {
                SmartApp.setCart(rebuildCartFromCurrentStock(latestMenu, order.items));
                SmartApp.clearOrderState();
                alert("Stock changed before payment. Your cart was updated. Please review the order again.");
                location.replace("cart.html");
                return;
            }

            const finalizedItems = order.items
                .map((orderItem) => enrichOrderItem(orderItem, findMenuMatch(latestMenu, orderItem)))
                .filter((item) => item.id && item.quantity > 0);

            await SmartDB.reduceMenuStock(finalizedItems);

            const createdAt = new Date().toISOString();
            const orderId = await SmartDB.addOrder({
                phone: session.phone,
                name: session.name,
                tableNo: session.tableNo,
                visitAt: session.loginAt,
                total: order.total,
                items: finalizedItems.map((item) => ({ ...item })),
                createdAt
            });

            const billPayload = createBillPayload(session, order.total, finalizedItems, orderId, createdAt);
            const savedBillNo = await SmartDB.addBill({
                ...billPayload,
                ...(Number.isInteger(previewBillNo) && previewBillNo > 0
                    ? { billNo: previewBillNo }
                    : {})
            });

            SmartApp.resetFlow();
            redirectToReview(savedBillNo);
        } catch (error) {
            console.error(error);
            alert("Could not save payment. Please try again.");
            if (paymentDoneBtn) {
                paymentDoneBtn.disabled = false;
            }
            isSubmittingPayment = false;
            return;
        }

        isSubmittingPayment = false;
    }

    try {
        await SmartDB.init();

        if (Number.isInteger(billNo) && billNo > 0) {
            const bill = await SmartDB.getBillByNumber(billNo);

            if (!bill) {
                renderMissingBill(`Bill ${SmartApp.formatBillNumber(billNo)} was not found.`);
                return;
            }

            if (isAdminView) {
                renderAdminBill(bill);
                return;
            }

            renderSavedCustomerBill(bill);
            return;
        }

        if (isAdminView) {
            renderMissingBill("A valid saved bill number was not provided.");
            return;
        }

        const session = SmartApp.requireSession("index.html");
        const order = SmartApp.requireOrderState("cart.html");
        if (!session || !order) {
            return;
        }

        previewBillNo = await getNextBillNumber();
        renderPaymentStep(session, order);
    } catch (error) {
        console.error(error);
        renderMissingBill("Could not load the bill right now.");
    }
})();
