(async function () {
    const session = SmartApp.requireSession("index.html");
    if (!session) {
        return;
    }

    const ITEM_TYPES = SmartDB.ITEM_TYPES || {
        PREPARE: "prepare",
        PURCHASE: "purchase"
    };

    let cart = SmartApp.getCart();

    const customerName = document.getElementById("customerName");
    const customerPhone = document.getElementById("customerPhone");
    const customerTable = document.getElementById("customerTable");
    const cartList = document.getElementById("cartList");
    const totalAmount = document.getElementById("totalAmount");
    const readyClock = document.getElementById("readyClock");
    const confirmOrderBtn = document.getElementById("confirmOrderBtn");
    const backToMenuBtn = document.getElementById("backToMenuBtn");
    const startOverBtn = document.getElementById("startOverBtn");

    function isPurchaseItem(item) {
        return item && item.itemType === ITEM_TYPES.PURCHASE;
    }

    function findMenuMatch(menu, itemRef) {
        return menu.find((menuItem) => Number(menuItem.id) === Number(itemRef.id))
            || menu.find((menuItem) => menuItem.name === itemRef.item);
    }

    function persistCart() {
        SmartApp.setCart(cart);
    }

    function updateTotals() {
        const totals = SmartApp.calculateCartTotals(cart);
        totalAmount.textContent = totals.total;
        readyClock.textContent = SmartApp.calculateReadyClock(totals.totalTime);
        confirmOrderBtn.disabled = cart.length === 0;
    }

    function updateCartUI() {
        cartList.innerHTML = "";

        if (cart.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-cart-card";
            empty.innerHTML = `
                <p class="empty-state mb-3">Your cart is empty.</p>
                <button type="button" class="btn btn-outline-light btn-sm" id="emptyCartMenuBtn">Browse Menu</button>
            `;
            cartList.appendChild(empty);
            document.getElementById("emptyCartMenuBtn").addEventListener("click", () => {
                location.href = "menu.html";
            });
            updateTotals();
            return;
        }

        cart.forEach((food, index) => {
            const row = document.createElement("div");
            row.className = "cart-item";

            const details = document.createElement("div");
            details.className = "cart-item__details";

            const name = document.createElement("strong");
            name.textContent = food.item;

            const meta = document.createElement("span");
            meta.className = "cart-item__meta";
            meta.textContent = `${food.quantity} x Rs ${food.price} = Rs ${food.price * food.quantity}`;

            details.appendChild(name);
            details.appendChild(meta);

            const actions = document.createElement("div");
            actions.className = "d-flex gap-2 flex-wrap";

            const addBtn = document.createElement("button");
            addBtn.className = "btn btn-sm btn-success";
            addBtn.textContent = "+";
            addBtn.addEventListener("click", () => {
                if (isPurchaseItem(food) && food.quantity >= Number(food.stock || 0)) {
                    alert("No more stock available for this item.");
                    return;
                }

                cart[index].quantity += 1;
                persistCart();
                updateCartUI();
            });

            const minusBtn = document.createElement("button");
            minusBtn.className = "btn btn-sm btn-danger";
            minusBtn.textContent = "-";
            minusBtn.addEventListener("click", () => {
                if (cart[index].quantity > 1) {
                    cart[index].quantity -= 1;
                } else {
                    cart.splice(index, 1);
                }
                persistCart();
                updateCartUI();
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn btn-sm btn-dark";
            deleteBtn.textContent = "Remove";
            deleteBtn.addEventListener("click", () => {
                cart.splice(index, 1);
                persistCart();
                updateCartUI();
            });

            actions.appendChild(addBtn);
            actions.appendChild(minusBtn);
            actions.appendChild(deleteBtn);
            row.appendChild(details);
            row.appendChild(actions);
            cartList.appendChild(row);
        });

        updateTotals();
    }

    function syncCartWithMenu(menu) {
        let changed = false;

        const syncedCart = cart.reduce((nextCart, cartItem) => {
            const matchedItem = findMenuMatch(menu, cartItem);
            if (!matchedItem) {
                changed = true;
                return nextCart;
            }

            const purchaseItem = isPurchaseItem(matchedItem);
            const availableStock = Number(matchedItem.stock || 0);

            if (purchaseItem && availableStock <= 0) {
                changed = true;
                return nextCart;
            }

            const nextQuantity = purchaseItem
                ? Math.min(Number(cartItem.quantity || 0), availableStock)
                : Number(cartItem.quantity || 0);

            if (nextQuantity <= 0) {
                changed = true;
                return nextCart;
            }

            const syncedItem = {
                ...cartItem,
                id: matchedItem.id,
                item: matchedItem.name,
                itemType: matchedItem.itemType,
                price: Number(matchedItem.price),
                purchasePrice: Number(matchedItem.purchasePrice || 0),
                stock: purchaseItem ? availableStock : null,
                time: Number(matchedItem.time),
                quantity: nextQuantity
            };

            if (
                syncedItem.id !== cartItem.id
                || syncedItem.item !== cartItem.item
                || syncedItem.itemType !== cartItem.itemType
                || syncedItem.price !== cartItem.price
                || syncedItem.purchasePrice !== cartItem.purchasePrice
                || syncedItem.stock !== cartItem.stock
                || syncedItem.time !== cartItem.time
                || syncedItem.quantity !== cartItem.quantity
            ) {
                changed = true;
            }

            nextCart.push(syncedItem);
            return nextCart;
        }, []);

        if (changed) {
            cart = syncedCart;
            persistCart();
        }

        return changed;
    }

    async function loadLatestCart() {
        const menu = await SmartDB.getMenuItems();
        const cartWasUpdated = syncCartWithMenu(menu);
        updateCartUI();

        if (cartWasUpdated) {
            alert("Your cart was updated because some item details changed.");
        }
    }

    async function confirmOrder() {
        if (cart.length === 0) {
            alert("Cart is empty.");
            return;
        }

        try {
            await SmartDB.init();
            const menu = await SmartDB.getMenuItems();
            const cartWasUpdated = syncCartWithMenu(menu);
            updateCartUI();

            if (cartWasUpdated) {
                if (cart.length === 0) {
                    alert("Your cart is empty because selected items are unavailable.");
                    return;
                }

                alert("Some cart items were adjusted based on the latest menu. Please confirm again.");
                return;
            }

            SmartApp.setOrderState(SmartApp.createOrderState(cart));
            location.href = "kitchen.html";
        } catch (error) {
            console.error(error);
            alert("Could not verify the latest menu. Please try again.");
        }
    }

    function startOver() {
        SmartApp.resetFlow();
        location.href = "index.html";
    }

    customerName.textContent = session.name;
    customerPhone.textContent = session.phone;
    customerTable.textContent = session.tableNo;

    backToMenuBtn.addEventListener("click", () => {
        location.href = "menu.html";
    });
    startOverBtn.addEventListener("click", startOver);
    confirmOrderBtn.addEventListener("click", async () => {
        await confirmOrder();
    });

    updateCartUI();

    try {
        await SmartDB.init();
        await loadLatestCart();
    } catch (error) {
        console.error(error);
        alert("Could not load the latest cart details. Showing your saved cart.");
        updateCartUI();
    }
})();
