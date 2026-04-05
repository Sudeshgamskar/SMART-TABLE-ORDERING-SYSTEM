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
    const menuContainer = document.getElementById("menuContainer");
    const cartShortcutBtn = document.getElementById("cartShortcutBtn");
    const cartCount = document.getElementById("cartCount");
    let cartAnimationTimer = null;

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

    function changeQty(input, change) {
        let value = parseInt(input.value, 10) || 1;
        value += change;
        if (value < 1) {
            value = 1;
        }
        input.value = value;
    }

    function updateCartBadge() {
        const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        cartCount.textContent = totalItems > 99 ? "99+" : totalItems;
        cartShortcutBtn.classList.toggle("has-items", totalItems > 0);
        cartShortcutBtn.setAttribute(
            "aria-label",
            totalItems > 0 ? `Open cart with ${totalItems} item${totalItems === 1 ? "" : "s"}` : "Open cart"
        );
    }

    function animateCartIcon() {
        cartShortcutBtn.classList.remove("cart-fab-animate");
        void cartShortcutBtn.offsetWidth;
        cartShortcutBtn.classList.add("cart-fab-animate");

        window.clearTimeout(cartAnimationTimer);
        cartAnimationTimer = window.setTimeout(() => {
            cartShortcutBtn.classList.remove("cart-fab-animate");
        }, 650);
    }

    function addToCart(item, quantity) {
        const parsedQuantity = Number(quantity);
        if (!parsedQuantity || parsedQuantity < 1) {
            alert("Invalid quantity.");
            return;
        }

        const purchaseItem = isPurchaseItem(item);
        const availableStock = Number(item.stock || 0);
        if (purchaseItem && availableStock <= 0) {
            alert(`${item.name} is out of stock.`);
            return;
        }

        const existing = cart.find((food) => Number(food.id) === Number(item.id) || food.item === item.name);
        const existingQuantity = existing ? existing.quantity : 0;

        if (purchaseItem && existingQuantity + parsedQuantity > availableStock) {
            alert(`Only ${availableStock} stock available for ${item.name}.`);
            return;
        }

        if (existing) {
            existing.quantity += parsedQuantity;
            existing.stock = purchaseItem ? availableStock : null;
            existing.itemType = item.itemType;
            existing.purchasePrice = Number(item.purchasePrice || 0);
        } else {
            cart.push({
                id: item.id,
                item: item.name,
                itemType: item.itemType,
                price: Number(item.price),
                purchasePrice: Number(item.purchasePrice || 0),
                stock: purchaseItem ? availableStock : null,
                time: Number(item.time),
                quantity: parsedQuantity
            });
        }

        persistCart();
        updateCartBadge();
        animateCartIcon();
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

    async function renderCustomerMenu() {
        const menu = await SmartDB.getMenuItems();
        menuContainer.innerHTML = "";
        const cartWasUpdated = syncCartWithMenu(menu);
        updateCartBadge();

        if (menu.length === 0) {
            const col = document.createElement("div");
            col.className = "col-12";
            col.innerHTML = '<div class="glass"><p class="empty-state">No menu items available right now.</p></div>';
            menuContainer.appendChild(col);
            return;
        }

        const categories = [...new Set(menu.map((item) => item.category))];

        categories.forEach((category) => {
            const col = document.createElement("div");
            col.className = "col-lg-4 col-md-6";

            const card = document.createElement("section");
            card.className = "glass menu-card h-100";

            const title = document.createElement("h4");
            title.textContent = category;
            card.appendChild(title);

            menu
                .filter((item) => item.category === category)
                .forEach((item) => {
                    const block = document.createElement("div");
                    block.className = "menu-item";
                    const purchaseItem = isPurchaseItem(item);
                    const isOutOfStock = purchaseItem && Number(item.stock || 0) <= 0;

                    const itemText = document.createElement("p");
                    itemText.textContent = `${item.name} - Rs ${item.price} (${item.time} mins)`;
                    block.appendChild(itemText);

                    if (isOutOfStock) {
                        const outOfStockNote = document.createElement("p");
                        outOfStockNote.className = "out-of-stock-note mb-0";
                        outOfStockNote.textContent = "Out of stock";
                        block.appendChild(outOfStockNote);
                    } else {
                        const qtyWrap = document.createElement("div");
                        qtyWrap.className = "d-flex align-items-center mb-2";

                        const minusBtn = document.createElement("button");
                        minusBtn.className = "btn btn-sm btn-light";
                        minusBtn.textContent = "-";

                        const qtyInput = document.createElement("input");
                        qtyInput.type = "number";
                        qtyInput.min = "1";
                        qtyInput.value = "1";
                        qtyInput.className = "form-control qty-input mx-2";

                        const plusBtn = document.createElement("button");
                        plusBtn.className = "btn btn-sm btn-light";
                        plusBtn.textContent = "+";

                        minusBtn.addEventListener("click", () => changeQty(qtyInput, -1));
                        plusBtn.addEventListener("click", () => changeQty(qtyInput, 1));

                        qtyWrap.appendChild(minusBtn);
                        qtyWrap.appendChild(qtyInput);
                        qtyWrap.appendChild(plusBtn);

                        const addBtn = document.createElement("button");
                        addBtn.className = "btn btn-success w-100";
                        addBtn.textContent = "Add";
                        addBtn.addEventListener("click", () => {
                            addToCart(item, qtyInput.value);
                            qtyInput.value = "1";
                        });

                        block.appendChild(qtyWrap);
                        block.appendChild(addBtn);
                    }

                    card.appendChild(block);
                });

            col.appendChild(card);
            menuContainer.appendChild(col);
        });

        if (cartWasUpdated) {
            alert("Your cart was updated because some item details changed.");
        }
    }

    customerName.textContent = session.name;
    customerPhone.textContent = session.phone;
    customerTable.textContent = session.tableNo;

    cartShortcutBtn.addEventListener("click", () => {
        location.href = "cart.html";
    });

    updateCartBadge();

    try {
        await SmartDB.init();
        await renderCustomerMenu();
    } catch (error) {
        console.error(error);
        alert("Could not load menu.");
    }
})();
