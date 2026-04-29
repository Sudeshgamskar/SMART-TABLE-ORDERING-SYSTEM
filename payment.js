(async function () {
    const session = SmartApp.requireSession("index.html");
    const order = SmartApp.requireOrderState("cart.html");

    if (!session || !order) {
        return;
    }

    const ITEM_TYPES = SmartDB.ITEM_TYPES || {
        PREPARE: "prepare",
        PURCHASE: "purchase"
    };

    const payAmount = document.getElementById("payAmount");
    const finishBtn = document.getElementById("finishBtn");
    const paymentGuestName = document.getElementById("paymentGuestName");
    const paymentTableNo = document.getElementById("paymentTableNo");

    let isSubmitting = false;

    function isPurchaseItem(item) {
        return item && item.itemType === ITEM_TYPES.PURCHASE;
    }

    function findMenuMatch(menu, itemRef) {
        return menu.find((menuItem) => Number(menuItem.id) === Number(itemRef.id))
            || menu.find((menuItem) => menuItem.name === itemRef.item);
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

    function createBillPayload(finalizedItems, orderId) {
        return {
            orderId,
            phone: session.phone,
            name: session.name,
            tableNo: session.tableNo,
            visitAt: session.loginAt,
            total: Number(order.total || 0),
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
            createdAt: new Date().toISOString()
        };
    }

    async function finishPayment() {
        if (isSubmitting) {
            return;
        }

        isSubmitting = true;
        finishBtn.disabled = true;

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
            const billNo = await SmartDB.addBill({
                ...createBillPayload(finalizedItems, orderId),
                createdAt
            });

            SmartApp.resetFlow();
            location.replace(`bill.html?billNo=${encodeURIComponent(billNo)}`);
        } catch (error) {
            console.error(error);
            alert("Could not save payment. Please try again.");
            isSubmitting = false;
            finishBtn.disabled = false;
        }
    }

    finishBtn.addEventListener("click", async () => {
        await finishPayment();
    });

    payAmount.textContent = SmartApp.formatCurrency(order.total);
    if (paymentGuestName) {
        paymentGuestName.textContent = session.name || "Guest";
    }
    if (paymentTableNo) {
        paymentTableNo.textContent = session.tableNo || "-";
    }
})();
