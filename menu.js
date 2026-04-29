(async function () {
    const session = SmartApp.requireSession("index.html");
    if (!session) {
        return;
    }

    const ITEM_TYPES = SmartDB.ITEM_TYPES || {
        PREPARE: "prepare",
        PURCHASE: "purchase"
    };
    const BOOK_CHAPTERS = [
        {
            key: "veg",
            label: "Veg",
            title: "Vegetarian Signatures",
            description: "Fresh curries, biryanis, and garden-led comforts prepared with a lighter, fragrant touch.",
            caption: "Fresh from the vegetarian kitchen",
            emptyMessage: "Vegetarian dishes will appear here once the kitchen adds them to today's menu.",
            themeClass: "page-theme--veg",
            matcher(category) {
                return /(veg|vegetarian)/.test(category) && !/non/.test(category);
            }
        },
        {
            key: "non-veg",
            label: "Non Veg",
            title: "Non-Veg Favourites",
            description: "Rich gravies, biryanis, and indulgent mains for guests craving bolder flavours.",
            caption: "Hearty mains and chef favourites",
            emptyMessage: "Non-vegetarian dishes will appear here once the kitchen adds them to today's menu.",
            themeClass: "page-theme--nonveg",
            matcher(category) {
                return /non\s*veg|nonveg|meat|chicken|mutton|fish|seafood/.test(category);
            }
        },
        {
            key: "dessert",
            label: "Desserts",
            title: "Dessert Finale",
            description: "Sweet endings, chilled treats, and comforting classics to close the meal beautifully.",
            caption: "Sweet finishes and chilled delights",
            emptyMessage: "Dessert options will appear here once the kitchen adds them to today's menu.",
            themeClass: "page-theme--dessert",
            matcher(category) {
                return /dessert|sweet|sweets|ice cream|icecream|mithai/.test(category);
            }
        }
    ];

    let cart = SmartApp.getCart();

    const customerName = document.getElementById("customerName");
    const customerPhone = document.getElementById("customerPhone");
    const customerTable = document.getElementById("customerTable");
    const menuContainer = document.getElementById("menuContainer");
    const cartShortcutBtn = document.getElementById("cartShortcutBtn");
    const cartCount = document.getElementById("cartCount");
    const menuPageTabs = document.getElementById("menuPageTabs");
    const prevPageBtn = document.getElementById("prevPageBtn");
    const nextPageBtn = document.getElementById("nextPageBtn");
    const pageReadout = document.getElementById("pageReadout");
    let cartAnimationTimer = null;
    let menuPages = [];
    let currentPageIndex = 0;
    let touchStartX = 0;
    let touchStartY = 0;

    function isPurchaseItem(item) {
        return item && item.itemType === ITEM_TYPES.PURCHASE;
    }

    function normalizeCategory(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function findMenuMatch(menu, itemRef) {
        return menu.find((menuItem) => Number(menuItem.id) === Number(itemRef.id))
            || menu.find((menuItem) => menuItem.name === itemRef.item);
    }

    function persistCart() {
        SmartApp.setCart(cart);
    }

    function changeQty(input, change, max) {
        let value = parseInt(input.value, 10) || 1;
        value += change;
        if (value < 1) {
            value = 1;
        }
        if (max && value > max) {
            value = max;
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

    function createChapterTemplate(definition) {
        return {
            ...definition,
            items: []
        };
    }

    function createExtraChapter(category) {
        return {
            key: `extra-${normalizeCategory(category) || "special"}`,
            label: category || "Specials",
            title: category || "Chef Specials",
            description: "Additional dishes curated by the kitchen beyond the main chapters.",
            caption: "Extra selections from the house",
            emptyMessage: "More dishes will be added here when the kitchen updates this section.",
            themeClass: "page-theme--special",
            items: []
        };
    }

    function buildBookPages(menu) {
        const chapters = BOOK_CHAPTERS.map(createChapterTemplate);
        const extras = new Map();

        menu.forEach((item) => {
            const normalizedCategory = normalizeCategory(item.category);
            const matchedChapter = chapters.find((chapter) => chapter.matcher(normalizedCategory));

            if (matchedChapter) {
                matchedChapter.items.push(item);
                return;
            }

            const extraKey = normalizeCategory(item.category) || "special";
            if (!extras.has(extraKey)) {
                extras.set(extraKey, createExtraChapter(item.category));
            }
            extras.get(extraKey).items.push(item);
        });

        const extraPages = [...extras.values()].sort((a, b) => a.title.localeCompare(b.title));
        return [...chapters, ...extraPages].map((page, index) => ({
            ...page,
            pageNumber: index + 1,
            items: [...page.items].sort((a, b) => a.name.localeCompare(b.name))
        }));
    }

    function createMetaChip(label, className) {
        const chip = document.createElement("span");
        chip.className = className || "menu-page__meta-chip";
        chip.textContent = label;
        return chip;
    }

    function buildDishCard(item) {
        const purchaseItem = isPurchaseItem(item);
        const availableStock = Number(item.stock || 0);
        const isOutOfStock = purchaseItem && availableStock <= 0;
        const card = document.createElement("article");
        card.className = "dish-card";

        if (isOutOfStock) {
            card.classList.add("is-unavailable");
        }

        const head = document.createElement("div");
        head.className = "dish-card__head";

        const titleWrap = document.createElement("div");
        const title = document.createElement("h4");
        title.className = "dish-card__title";
        title.textContent = item.name;

        const description = document.createElement("p");
        description.className = "dish-card__description";
        description.textContent = purchaseItem
            ? "Quick-serve item ready from available stock for a faster table experience."
            : "Prepared fresh after ordering so the kitchen can serve it at its best.";

        titleWrap.appendChild(title);
        titleWrap.appendChild(description);

        const tag = document.createElement("span");
        tag.className = "dish-card__tag";
        tag.textContent = purchaseItem ? "Ready Stock" : "Fresh Cook";

        head.appendChild(titleWrap);
        head.appendChild(tag);

        const facts = document.createElement("div");
        facts.className = "dish-card__facts";
        facts.appendChild(createMetaChip(`Rs ${Number(item.price || 0)}`, "dish-card__fact"));
        facts.appendChild(createMetaChip(`${Number(item.time || 0)} mins`, "dish-card__fact"));
        facts.appendChild(createMetaChip(
            purchaseItem
                ? `${availableStock} in stock`
                : "Made on order",
            "dish-card__fact"
        ));

        card.appendChild(head);
        card.appendChild(facts);

        if (isOutOfStock) {
            const status = document.createElement("p");
            status.className = "dish-card__status";
            status.textContent = "Sold out for now. Please try another selection.";
            card.appendChild(status);
            return card;
        }

        const footer = document.createElement("div");
        footer.className = "dish-card__footer";

        const qtySelector = document.createElement("div");
        qtySelector.className = "qty-selector";

        const minusBtn = document.createElement("button");
        minusBtn.type = "button";
        minusBtn.className = "qty-btn";
        minusBtn.textContent = "-";

        const qtyInput = document.createElement("input");
        qtyInput.type = "number";
        qtyInput.min = "1";
        qtyInput.value = "1";
        qtyInput.inputMode = "numeric";
        qtyInput.className = "form-control qty-input";

        if (purchaseItem) {
            qtyInput.max = String(availableStock);
        }

        const plusBtn = document.createElement("button");
        plusBtn.type = "button";
        plusBtn.className = "qty-btn";
        plusBtn.textContent = "+";

        minusBtn.addEventListener("click", () => changeQty(qtyInput, -1, purchaseItem ? availableStock : null));
        plusBtn.addEventListener("click", () => changeQty(qtyInput, 1, purchaseItem ? availableStock : null));
        qtyInput.addEventListener("input", () => {
            let value = parseInt(qtyInput.value, 10) || 1;
            if (value < 1) {
                value = 1;
            }
            if (purchaseItem && value > availableStock) {
                value = availableStock;
            }
            qtyInput.value = value;
        });

        qtySelector.appendChild(minusBtn);
        qtySelector.appendChild(qtyInput);
        qtySelector.appendChild(plusBtn);

        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "dish-card__add-btn";
        addBtn.textContent = "Add to cart";
        addBtn.addEventListener("click", () => {
            addToCart(item, qtyInput.value);
            qtyInput.value = "1";
        });

        footer.appendChild(qtySelector);
        footer.appendChild(addBtn);

        card.appendChild(footer);
        return card;
    }

    function buildPageElement(page) {
        const article = document.createElement("article");
        article.className = `menu-page ${page.themeClass}`;
        article.dataset.pageIndex = String(page.pageNumber - 1);

        const top = document.createElement("div");
        top.className = "menu-page__top";

        const headingWrap = document.createElement("div");
        const eyebrow = document.createElement("p");
        eyebrow.className = "menu-page__eyebrow";
        eyebrow.textContent = `Chapter ${String(page.pageNumber).padStart(2, "0")}`;

        const title = document.createElement("h3");
        title.className = "menu-page__title";
        title.textContent = page.title;

        const description = document.createElement("p");
        description.className = "menu-page__description";
        description.textContent = page.description;

        headingWrap.appendChild(eyebrow);
        headingWrap.appendChild(title);
        headingWrap.appendChild(description);

        const badge = document.createElement("div");
        badge.className = "menu-page__badge";

        const badgeLabel = document.createElement("span");
        badgeLabel.textContent = "Page";

        const badgeValue = document.createElement("strong");
        badgeValue.textContent = String(page.pageNumber).padStart(2, "0");

        badge.appendChild(badgeLabel);
        badge.appendChild(badgeValue);

        top.appendChild(headingWrap);
        top.appendChild(badge);

        const meta = document.createElement("div");
        meta.className = "menu-page__meta";
        meta.appendChild(createMetaChip(`${page.items.length} item${page.items.length === 1 ? "" : "s"}`));
        meta.appendChild(createMetaChip(page.caption));
        meta.appendChild(createMetaChip("Tap add to send dishes to cart"));

        article.appendChild(top);
        article.appendChild(meta);

        if (page.items.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.className = "menu-page__empty";

            const emptyTitle = document.createElement("h3");
            emptyTitle.textContent = "Kitchen Is Updating This Chapter";

            const emptyText = document.createElement("p");
            emptyText.textContent = page.emptyMessage;

            emptyState.appendChild(emptyTitle);
            emptyState.appendChild(emptyText);
            article.appendChild(emptyState);
            return article;
        }

        const itemsGrid = document.createElement("div");
        itemsGrid.className = "menu-page__items";
        page.items.forEach((item) => {
            itemsGrid.appendChild(buildDishCard(item));
        });

        article.appendChild(itemsGrid);
        return article;
    }

    function buildTabElement(page, index) {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "chapter-tab";
        tab.setAttribute("aria-label", `Open ${page.label} page`);

        const tabIndex = document.createElement("span");
        tabIndex.className = "chapter-tab__index";
        tabIndex.textContent = String(index + 1).padStart(2, "0");

        const tabText = document.createElement("span");
        tabText.className = "chapter-tab__text";

        const tabTitle = document.createElement("span");
        tabTitle.className = "chapter-tab__title";
        tabTitle.textContent = page.label;

        const tabCaption = document.createElement("span");
        tabCaption.className = "chapter-tab__caption";
        tabCaption.textContent = page.caption;

        tabText.appendChild(tabTitle);
        tabText.appendChild(tabCaption);
        tab.appendChild(tabIndex);
        tab.appendChild(tabText);

        tab.addEventListener("click", () => {
            setCurrentPage(index);
        });

        return tab;
    }

    function renderBookPages(pages) {
        menuPages = pages;
        menuContainer.innerHTML = "";
        menuPageTabs.innerHTML = "";

        menuPages.forEach((page, index) => {
            menuContainer.appendChild(buildPageElement(page));
            menuPageTabs.appendChild(buildTabElement(page, index));
        });

        currentPageIndex = Math.min(currentPageIndex, Math.max(menuPages.length - 1, 0));
        updateBookState();
    }

    function updateBookState() {
        const pageElements = [...menuContainer.querySelectorAll(".menu-page")];
        const tabElements = [...menuPageTabs.querySelectorAll(".chapter-tab")];

        pageElements.forEach((pageElement, index) => {
            let shift = 0;

            if (index < currentPageIndex) {
                shift = -Math.min(currentPageIndex - index, 3) * 8;
            } else if (index > currentPageIndex) {
                shift = Math.min(index - currentPageIndex, 3) * 8;
            }

            pageElement.style.setProperty("--page-shift", `${shift}px`);
            pageElement.classList.toggle("is-active", index === currentPageIndex);
            pageElement.classList.toggle("is-turned", index < currentPageIndex);
            pageElement.classList.toggle("is-resting", index > currentPageIndex);
            pageElement.style.zIndex = String(menuPages.length - index);
            pageElement.setAttribute("aria-hidden", index === currentPageIndex ? "false" : "true");
        });

        tabElements.forEach((tabElement, index) => {
            const isActive = index === currentPageIndex;
            tabElement.classList.toggle("is-active", isActive);
            if (isActive) {
                tabElement.setAttribute("aria-current", "page");
            } else {
                tabElement.removeAttribute("aria-current");
            }
        });

        prevPageBtn.disabled = currentPageIndex <= 0;
        nextPageBtn.disabled = currentPageIndex >= menuPages.length - 1;

        if (menuPages.length === 0) {
            pageReadout.textContent = "No pages available";
            return;
        }

        const currentPage = menuPages[currentPageIndex];
        pageReadout.textContent = `Page ${currentPageIndex + 1} of ${menuPages.length} - ${currentPage.label}`;
    }

    function setCurrentPage(nextIndex) {
        if (!menuPages.length) {
            return;
        }

        const clampedIndex = Math.max(0, Math.min(nextIndex, menuPages.length - 1));
        currentPageIndex = clampedIndex;
        updateBookState();
    }

    function isInteractiveElement(target) {
        return target
            && (target.closest("input")
                || target.closest("button")
                || target.closest("textarea")
                || target.closest("select"));
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
        const cartWasUpdated = syncCartWithMenu(menu);
        updateCartBadge();
        renderBookPages(buildBookPages(menu));

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

    prevPageBtn.addEventListener("click", () => {
        setCurrentPage(currentPageIndex - 1);
    });

    nextPageBtn.addEventListener("click", () => {
        setCurrentPage(currentPageIndex + 1);
    });

    document.addEventListener("keydown", (event) => {
        if (isInteractiveElement(event.target)) {
            return;
        }

        if (event.key === "ArrowRight") {
            setCurrentPage(currentPageIndex + 1);
        } else if (event.key === "ArrowLeft") {
            setCurrentPage(currentPageIndex - 1);
        }
    });

    menuContainer.addEventListener("touchstart", (event) => {
        if (isInteractiveElement(event.target)) {
            touchStartX = 0;
            touchStartY = 0;
            return;
        }

        const touch = event.changedTouches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }, { passive: true });

    menuContainer.addEventListener("touchend", (event) => {
        if (isInteractiveElement(event.target) || (!touchStartX && !touchStartY)) {
            return;
        }

        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;

        touchStartX = 0;
        touchStartY = 0;

        if (Math.abs(deltaX) < 70 || Math.abs(deltaY) > 90) {
            return;
        }

        if (deltaX < 0) {
            setCurrentPage(currentPageIndex + 1);
        } else {
            setCurrentPage(currentPageIndex - 1);
        }
    }, { passive: true });

    updateCartBadge();

    try {
        await SmartDB.init();
        await renderCustomerMenu();
    } catch (error) {
        console.error(error);
        alert("Could not load menu.");
    }
})();
