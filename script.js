(function () {
    const SESSION_KEY = "smart_table_session";
    const CART_KEY = "smart_table_cart";
    const ORDER_KEY = "smart_table_order";
    const ADMIN_KEY = "smart_table_admin_unlocked";
    const DEMO_TIME_MS = 1000;
    const RESTAURANT_PROFILE = Object.freeze({
        name: "Smart Table Ordering System",
        subtitle: "Premium Digital Dining Experience",
        addressLine: "Restaurant Billing Desk",
        contactNo: "7418529630",
        invoiceTitle: "Quick Bill",
        upiId: "paytm.s1zslgl@pty",
        upiName: "Restaurant",
        qrCaption: "Scan & pay through any UPI app",
        footerLine: "Thank you. Visit Again."
    });

    function readJSON(key, fallback) {
        try {
            const raw = sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            console.error(error);
            return fallback;
        }
    }

    function writeJSON(key, value) {
        sessionStorage.setItem(key, JSON.stringify(value));
    }

    function removeKey(key) {
        sessionStorage.removeItem(key);
    }

    function getSession() {
        return readJSON(SESSION_KEY, null);
    }

    function setSession(session) {
        writeJSON(SESSION_KEY, session);
    }

    function clearSession() {
        removeKey(SESSION_KEY);
    }

    function getCart() {
        const cart = readJSON(CART_KEY, []);
        return Array.isArray(cart) ? cart : [];
    }

    function setCart(cart) {
        writeJSON(CART_KEY, Array.isArray(cart) ? cart : []);
    }

    function clearCart() {
        removeKey(CART_KEY);
    }

    function getOrderState() {
        return readJSON(ORDER_KEY, null);
    }

    function setOrderState(order) {
        writeJSON(ORDER_KEY, order);
    }

    function clearOrderState() {
        removeKey(ORDER_KEY);
    }

    function unlockAdmin() {
        sessionStorage.setItem(ADMIN_KEY, "1");
    }

    function lockAdmin() {
        sessionStorage.removeItem(ADMIN_KEY);
    }

    function isAdminUnlocked() {
        return sessionStorage.getItem(ADMIN_KEY) === "1";
    }

    function calculateCartTotals(cart) {
        let total = 0;
        let totalTime = 0;

        (cart || []).forEach((food) => {
            const price = Number(food.price || 0);
            const quantity = Number(food.quantity || 0);
            const time = Number(food.time || 0);

            total += price * quantity;

            const itemTime = time + Math.max(quantity - 1, 0) * 2;
            if (itemTime > totalTime) {
                totalTime = itemTime;
            }
        });

        return { total, totalTime };
    }

    function formatClock(date) {
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${ampm}`;
    }

    function formatCurrency(value) {
        return Number(value || 0).toFixed(2);
    }

    function formatBillNumber(value) {
        const normalizedValue = Math.max(0, Math.floor(Number(value || 0)));
        return String(normalizedValue).padStart(3, "0");
    }

    function formatBillDate(iso) {
        return new Date(iso).toLocaleDateString("en-GB");
    }

    function formatBillTime(iso) {
        return formatClock(new Date(iso));
    }

    function buildBillUpiLink(amount, billNo) {
        const params = [
            `pa=${encodeURIComponent(RESTAURANT_PROFILE.upiId)}`,
            `pn=${encodeURIComponent(RESTAURANT_PROFILE.upiName)}`,
            `am=${encodeURIComponent(formatCurrency(amount))}`,
            "cu=INR"
        ];

        if (billNo !== undefined && billNo !== null && billNo !== "") {
            params.push(`tn=${encodeURIComponent(`Bill ${formatBillNumber(billNo)}`)}`);
        }

        return `upi://pay?${params.join("&")}`;
    }

    function calculateReadyClock(totalTime) {
        const minutesToAdd = Number(totalTime || 0);
        if (minutesToAdd <= 0) {
            return "--";
        }

        const readyDate = new Date();
        readyDate.setMinutes(readyDate.getMinutes() + minutesToAdd);
        return formatClock(readyDate);
    }

    function createOrderState(items) {
        const snapshot = Array.isArray(items)
            ? items.map((item) => ({ ...item }))
            : [];
        const { total, totalTime } = calculateCartTotals(snapshot);

        return {
            items: snapshot,
            total,
            totalTime,
            readyClock: calculateReadyClock(totalTime),
            readyAtMs: Date.now() + totalTime * DEMO_TIME_MS,
            confirmedAt: new Date().toISOString()
        };
    }

    function getRemainingDemoMs(orderState) {
        const readyAtMs = Number(orderState && orderState.readyAtMs);
        if (!readyAtMs) {
            return 0;
        }

        return Math.max(readyAtMs - Date.now(), 0);
    }

    function resetFlow() {
        clearSession();
        clearCart();
        clearOrderState();
    }

    function requireSession(redirectTo) {
        const session = getSession();
        if (!session) {
            location.replace(redirectTo || "index.html");
            return null;
        }
        return session;
    }

    function requireOrderState(redirectTo) {
        const order = getOrderState();
        if (!order || !Array.isArray(order.items) || order.items.length === 0) {
            location.replace(redirectTo || "menu.html");
            return null;
        }
        return order;
    }

    function buildVisitKey(phone, tableNo, visitAt) {
        return [phone, tableNo, visitAt].join("|");
    }

    function formatDateTime(iso) {
        return new Date(iso).toLocaleString();
    }

    function isSameDay(dateA, dateB) {
        return dateA.getFullYear() === dateB.getFullYear()
            && dateA.getMonth() === dateB.getMonth()
            && dateA.getDate() === dateB.getDate();
    }

    function isSameMonth(dateA, dateB) {
        return dateA.getFullYear() === dateB.getFullYear()
            && dateA.getMonth() === dateB.getMonth();
    }

    window.SmartApp = {
        RESTAURANT_PROFILE,
        DEMO_TIME_MS,
        buildVisitKey,
        buildBillUpiLink,
        calculateCartTotals,
        calculateReadyClock,
        clearCart,
        clearOrderState,
        clearSession,
        createOrderState,
        formatDateTime,
        formatBillDate,
        formatBillNumber,
        formatBillTime,
        formatCurrency,
        getCart,
        getOrderState,
        getRemainingDemoMs,
        getSession,
        isAdminUnlocked,
        isSameDay,
        isSameMonth,
        lockAdmin,
        requireOrderState,
        requireSession,
        resetFlow,
        setCart,
        setOrderState,
        setSession,
        unlockAdmin
    };
})();
