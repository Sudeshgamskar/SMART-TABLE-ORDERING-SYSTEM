(async function () {
    const session = SmartApp.requireSession("index.html");
    if (!session) {
        return;
    }

    const ITEM_TYPES = SmartDB.ITEM_TYPES || {
        PREPARE: "prepare",
        PURCHASE: "purchase"
    };
    const PREVIEW_DURATION_MS = 6200;
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
                return /(veg|vegetarian|paneer|dal|mushroom|gobi|aloo|salad)/.test(category) && !/non/.test(category);
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
            key: "soup",
            label: "Soup",
            title: "Soup And Broth Bowls",
            description: "Warm bowls, slow-simmered broths, and comforting soup servings for lighter first courses.",
            caption: "Simmered bowls and warm starters",
            emptyMessage: "Soup options will appear here once the kitchen adds them to today's menu.",
            themeClass: "page-theme--soup",
            matcher(category) {
                return /soup|shorba|broth|rasam/.test(category);
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
                return /dessert|sweet|sweets|ice cream|icecream|mithai|cake|pastry|brownie/.test(category);
            }
        }
    ];
    const RECOMMENDATION_GROUPS = ["veg", "non-veg", "dessert", "soup"];

    let cart = SmartApp.getCart();
    let cartAnimationTimer = null;
    let menuPages = [];
    let currentMenuIndex = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let currentMenuItems = [];
    let recommendationData = null;
    let previewCloseTimer = null;
    let previewStepTimers = [];

    const customerName = document.getElementById("customerName");
    const customerPhone = document.getElementById("customerPhone");
    const customerTable = document.getElementById("customerTable");
    const menuContainer = document.getElementById("menuContainer");
    const recommendationBtn = document.getElementById("recommendationBtn");
    const cartShortcutBtn = document.getElementById("cartShortcutBtn");
    const cartCount = document.getElementById("cartCount");
    const menuPageTabs = document.getElementById("menuPageTabs");
    const prevPageBtn = document.getElementById("prevPageBtn");
    const nextPageBtn = document.getElementById("nextPageBtn");
    const goToCartBtn = document.getElementById("goToCartBtn");
    const pageReadout = document.getElementById("pageReadout");
    const recommendationOverlay = document.getElementById("recommendationOverlay");
    const recommendationStatus = document.getElementById("recommendationStatus");
    const recommendationHighestSale = document.getElementById("recommendationHighestSale");
    const recommendationBestFood = document.getElementById("recommendationBestFood");
    const closeRecommendationBtn = document.getElementById("closeRecommendationBtn");
    const dishTheatre = document.getElementById("dishTheatre");
    const dishTheatreEyebrow = document.getElementById("dishTheatreEyebrow");
    const dishTheatreName = document.getElementById("dishTheatreName");
    const dishTheatreStatus = document.getElementById("dishTheatreStatus");
    const dishTheatreTag = document.getElementById("dishTheatreTag");
    const dishTheatreDuration = document.getElementById("dishTheatreDuration");
    const dishTheatreProgressBar = document.getElementById("dishTheatreProgressBar");
    const dishTheatreScene = document.getElementById("dishTheatreScene");
    const dishTheatreCloseBtn = document.getElementById("dishTheatreCloseBtn");

    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function isPurchaseItem(item) {
        return item && item.itemType === ITEM_TYPES.PURCHASE;
    }

    function normalizeCategory(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function inferCategoryFromName(name) {
        const normalizedName = normalizeCategory(name);
        const matchedChapter = BOOK_CHAPTERS.find((chapter) => chapter.matcher(normalizedName));
        if (matchedChapter) {
            return matchedChapter.label;
        }

        return "Specials";
    }

    function getChapterByCategory(category) {
        const normalizedCategory = normalizeCategory(category);
        return BOOK_CHAPTERS.find((chapter) => chapter.matcher(normalizedCategory)) || null;
    }

    function getCategoryKey(category) {
        const chapter = getChapterByCategory(category);
        return chapter ? chapter.key : "special";
    }

    function findMenuMatch(menu, itemRef) {
        return menu.find((menuItem) => Number(menuItem.id) === Number(itemRef.id))
            || menu.find((menuItem) => menuItem.name === itemRef.item)
            || menu.find((menuItem) => menuItem.name === itemRef.name);
    }

    function persistCart() {
        SmartApp.setCart(cart);
    }

    function formatAmount(value) {
        return SmartApp.formatCurrency(value);
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

    function goToCart() {
        location.href = "cart.html";
    }

    function isAnyOverlayOpen() {
        return !recommendationOverlay.hidden || !dishTheatre.hidden;
    }

    function closeRecommendationPanel() {
        if (recommendationOverlay.hidden) {
            return;
        }

        recommendationOverlay.hidden = true;
        document.body.classList.remove("menu-overlay-open");
    }

    function openRecommendationPanel() {
        recommendationOverlay.hidden = false;
        document.body.classList.add("menu-overlay-open");
    }

    function clearDishPreviewTimers() {
        window.clearTimeout(previewCloseTimer);
        previewCloseTimer = null;
        previewStepTimers.forEach((timer) => window.clearTimeout(timer));
        previewStepTimers = [];
    }

    function closeDishPreview() {
        clearDishPreviewTimers();
        dishTheatre.hidden = true;
        dishTheatreScene.innerHTML = "";
        dishTheatreProgressBar.style.transitionDuration = "0ms";
        dishTheatreProgressBar.style.transform = "scaleX(0)";

        if (recommendationOverlay.hidden) {
            document.body.classList.remove("menu-overlay-open");
        }
    }

    function buildRepeatedSpans(className, total) {
        return Array.from({ length: total }, (_, index) => `<span class="${className} ${className}--${index + 1}"></span>`).join("");
    }

    function buildDishSceneMarkup(profileKey) {
        if (profileKey === "coffee") {
            return `
                <div class="dish-scene dish-scene--coffee">
                    <div class="scene-counter"></div>
                    <div class="coffee-kettle"></div>
                    <div class="coffee-spout"></div>
                    <div class="coffee-pour"></div>
                    <div class="coffee-cup"><div class="coffee-fill"></div></div>
                    ${buildRepeatedSpans("scene-steam", 3)}
                </div>
            `;
        }

        if (profileKey === "popcorn") {
            return `
                <div class="dish-scene dish-scene--popcorn">
                    <div class="scene-counter"></div>
                    <div class="popcorn-machine"></div>
                    <div class="popcorn-bucket">
                        <div class="popcorn-bucket__fill"></div>
                    </div>
                    ${buildRepeatedSpans("kernel", 10)}
                </div>
            `;
        }

        if (profileKey === "chicken") {
            return `
                <div class="dish-scene dish-scene--chicken">
                    <div class="scene-counter"></div>
                    <div class="chicken-bird"></div>
                    <div class="scene-grill"></div>
                    <div class="scene-platter"></div>
                    ${buildRepeatedSpans("scene-flame", 3)}
                    ${buildRepeatedSpans("chicken-piece", 4)}
                </div>
            `;
        }

        if (profileKey === "mutton") {
            return `
                <div class="dish-scene dish-scene--mutton">
                    <div class="scene-counter"></div>
                    <div class="mutton-sheep"></div>
                    <div class="mutton-board"></div>
                    <div class="mutton-knife"></div>
                    <div class="mutton-pan"></div>
                    ${buildRepeatedSpans("mutton-chop", 4)}
                    ${buildRepeatedSpans("scene-steam", 3)}
                </div>
            `;
        }

        if (profileKey === "veg") {
            return `
                <div class="dish-scene dish-scene--veg">
                    <div class="scene-counter"></div>
                    <div class="veg-board"></div>
                    <div class="veg-knife"></div>
                    <div class="veg-pan"></div>
                    ${buildRepeatedSpans("veg-slice", 7)}
                    ${buildRepeatedSpans("scene-steam", 3)}
                </div>
            `;
        }

        if (profileKey === "soup") {
            return `
                <div class="dish-scene dish-scene--soup">
                    <div class="scene-counter"></div>
                    <div class="soup-pot"></div>
                    <div class="soup-ladle"></div>
                    <div class="soup-bowl">
                        <div class="soup-bowl__fill"></div>
                    </div>
                    ${buildRepeatedSpans("scene-steam", 3)}
                </div>
            `;
        }

        if (profileKey === "dessert") {
            return `
                <div class="dish-scene dish-scene--dessert">
                    <div class="scene-counter"></div>
                    <div class="dessert-glass">
                        <div class="dessert-glass__fill"></div>
                    </div>
                    <div class="dessert-scoop"></div>
                    <div class="dessert-drizzle"></div>
                    <div class="dessert-cherry"></div>
                    ${buildRepeatedSpans("dessert-spark", 4)}
                </div>
            `;
        }

        if (profileKey === "biryani") {
            return `
                <div class="dish-scene dish-scene--biryani">
                    <div class="scene-counter"></div>
                    <div class="biryani-pot">
                        <div class="biryani-pot__layer"></div>
                    </div>
                    <div class="biryani-lid"></div>
                    ${buildRepeatedSpans("biryani-grain", 12)}
                    ${buildRepeatedSpans("scene-steam", 3)}
                </div>
            `;
        }

        return `
            <div class="dish-scene dish-scene--generic">
                <div class="scene-counter"></div>
                <div class="generic-pan"></div>
                ${buildRepeatedSpans("generic-ingredient", 8)}
                ${buildRepeatedSpans("scene-flame", 3)}
                ${buildRepeatedSpans("scene-steam", 3)}
            </div>
        `;
    }

    function getDishProfile(item) {
        const normalizedName = normalizeCategory(item && item.name ? item.name : item.item);
        const categoryKey = getCategoryKey(item && item.category ? item.category : inferCategoryFromName(item && item.name ? item.name : item.item));

        if (/coffee|espresso|latte|cappuccino|tea/.test(normalizedName)) {
            return {
                key: "coffee",
                label: "Coffee Ritual",
                steps: [
                    "Warming the kettle and waking up the roast.",
                    "Pouring fresh coffee directly into the cup.",
                    "Finishing with aroma, steam, and a polished serve."
                ]
            };
        }

        if (/popcorn/.test(normalizedName)) {
            return {
                key: "popcorn",
                label: "Popcorn Drop",
                steps: [
                    "Heating the popper for a fast snack service.",
                    "Dropping fresh popcorn into the serving bucket.",
                    "Topping the bucket so it is ready to serve."
                ]
            };
        }

        if (/mutton|lamb/.test(normalizedName)) {
            return {
                key: "mutton",
                label: "Mutton Roast",
                steps: [
                    "Bringing the mutton cut to the prep board.",
                    "Slicing it into cooking pieces for the dish.",
                    "Roasting the pieces until the pan is ready to plate."
                ]
            };
        }

        if (/chicken/.test(normalizedName)) {
            return {
                key: "chicken",
                label: "Chicken Fire Grill",
                steps: [
                    "Sending the chicken straight into the kitchen line.",
                    "Roasting and turning it over the hot grill.",
                    "Finishing the chicken pieces for the final dish."
                ]
            };
        }

        if (/biryani|pulao|rice/.test(normalizedName)) {
            return {
                key: "biryani",
                label: "Layered Pot",
                steps: [
                    "Starting the pot with heat, spices, and stock.",
                    "Layering grains and ingredients into the vessel.",
                    "Finishing with steam so the pot opens at full aroma."
                ]
            };
        }

        if (/soup|shorba|broth|rasam/.test(normalizedName) || categoryKey === "soup") {
            return {
                key: "soup",
                label: "Soup Simmer",
                steps: [
                    "Simmering the broth until it is smooth and hot.",
                    "Lifting the soup with the ladle for serving.",
                    "Filling the bowl with a warm final pour."
                ]
            };
        }

        if (/ice cream|icecream|dessert|sweet|gulab|jamun|cake|pastry|brownie/.test(normalizedName) || categoryKey === "dessert") {
            return {
                key: "dessert",
                label: "Dessert Finish",
                steps: [
                    "Building the dessert base and chilled layers.",
                    "Dropping the sweet top and finishing the drizzle.",
                    "Adding the final garnish for the serve."
                ]
            };
        }

        if (/paneer|veg|vegetable|masala|curry|dal|mushroom|gobi|aloo|salad/.test(normalizedName) || categoryKey === "veg") {
            return {
                key: "veg",
                label: "Vegetable Prep",
                steps: [
                    "Bringing fresh vegetables onto the chopping board.",
                    "Cutting the vegetables and sending them into the pan.",
                    "Tossing everything together until the dish is ready."
                ]
            };
        }

        return {
            key: "generic",
            label: "Chef Finish",
            steps: [
                "Pulling ingredients into the hot pan.",
                "Cooking the dish in the main kitchen station.",
                "Finishing the plate with steam and final touches."
            ]
        };
    }

    function openDishPreview(item, options = {}) {
        const quantity = Math.max(1, Number(options.quantity || 1));
        const mode = options.mode || "preview";
        const itemName = item && item.name ? item.name : item.item;
        const itemCategory = item && item.category ? item.category : inferCategoryFromName(itemName);
        const profile = getDishProfile({
            ...item,
            name: itemName,
            category: itemCategory
        });

        clearDishPreviewTimers();
        closeRecommendationPanel();

        dishTheatreEyebrow.textContent = mode === "added" ? "Added To Cart" : "Dish Theatre";
        dishTheatreName.textContent = itemName;
        dishTheatreTag.textContent = mode === "added" ? `Added x${quantity}` : profile.label;
        dishTheatreDuration.textContent = `${Math.round(PREVIEW_DURATION_MS / 1000)} second animated preparation preview`;
        dishTheatreStatus.textContent = profile.steps[0];
        dishTheatreScene.innerHTML = buildDishSceneMarkup(profile.key);
        dishTheatre.hidden = false;
        document.body.classList.add("menu-overlay-open");

        dishTheatreProgressBar.style.transitionDuration = "0ms";
        dishTheatreProgressBar.style.transform = "scaleX(0)";
        requestAnimationFrame(() => {
            dishTheatreProgressBar.style.transitionDuration = `${PREVIEW_DURATION_MS}ms`;
            dishTheatreProgressBar.style.transform = "scaleX(1)";
        });

        const stepDuration = Math.floor(PREVIEW_DURATION_MS / profile.steps.length);
        profile.steps.forEach((step, index) => {
            const timer = window.setTimeout(() => {
                dishTheatreStatus.textContent = step;
            }, index * stepDuration);
            previewStepTimers.push(timer);
        });

        previewCloseTimer = window.setTimeout(() => {
            closeDishPreview();
        }, PREVIEW_DURATION_MS);
    }

    function addToCart(item, quantity) {
        const parsedQuantity = Number(quantity);
        if (!parsedQuantity || parsedQuantity < 1) {
            alert("Invalid quantity.");
            return false;
        }

        const purchaseItem = isPurchaseItem(item);
        const availableStock = Number(item.stock || 0);
        if (purchaseItem && availableStock <= 0) {
            alert(`${item.name} is out of stock.`);
            return false;
        }

        const existing = cart.find((food) => Number(food.id) === Number(item.id) || food.item === item.name);
        const existingQuantity = existing ? existing.quantity : 0;

        if (purchaseItem && existingQuantity + parsedQuantity > availableStock) {
            alert(`Only ${availableStock} stock available for ${item.name}.`);
            return false;
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
        return true;
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
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Preview preparation for ${item.name}`);

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

        const previewHint = document.createElement("p");
        previewHint.className = "dish-card__preview-hint";
        previewHint.textContent = "Tap the dish card to watch an animated preparation preview.";

        const previewDish = () => {
            openDishPreview({
                ...item,
                name: item.name,
                category: item.category
            }, {
                mode: "preview"
            });
        };

        card.appendChild(head);
        card.appendChild(facts);
        card.appendChild(previewHint);

        card.addEventListener("click", (event) => {
            if (isInteractiveElement(event.target)) {
                return;
            }

            previewDish();
        });

        card.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }

            if (isInteractiveElement(event.target) && event.target !== card) {
                return;
            }

            event.preventDefault();
            previewDish();
        });

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
            const quantity = Number(qtyInput.value || 1);
            const added = addToCart(item, quantity);
            if (!added) {
                return;
            }

            openDishPreview({
                ...item,
                name: item.name,
                category: item.category
            }, {
                mode: "added",
                quantity
            });
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
        meta.appendChild(createMetaChip("Tap any dish card to preview the preparation"));

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

        currentMenuIndex = Math.min(currentMenuIndex, Math.max(menuPages.length - 1, 0));
        updateBookState();
    }

    function updateBookState() {
        const pageElements = [...menuContainer.querySelectorAll(".menu-page")];
        const tabElements = [...menuPageTabs.querySelectorAll(".chapter-tab")];

        pageElements.forEach((pageElement, index) => {
            let shift = 0;

            if (index < currentMenuIndex) {
                shift = -Math.min(currentMenuIndex - index, 3) * 8;
            } else if (index > currentMenuIndex) {
                shift = Math.min(index - currentMenuIndex, 3) * 8;
            }

            pageElement.style.setProperty("--page-shift", `${shift}px`);
            pageElement.classList.toggle("is-active", index === currentMenuIndex);
            pageElement.classList.toggle("is-turned", index < currentMenuIndex);
            pageElement.classList.toggle("is-resting", index > currentMenuIndex);
            pageElement.style.zIndex = String(menuPages.length - index);
            pageElement.setAttribute("aria-hidden", index === currentMenuIndex ? "false" : "true");
        });

        tabElements.forEach((tabElement, index) => {
            const isActive = index === currentMenuIndex;
            tabElement.classList.toggle("is-active", isActive);
            if (isActive) {
                tabElement.setAttribute("aria-current", "page");
            } else {
                tabElement.removeAttribute("aria-current");
            }
        });

        prevPageBtn.disabled = currentMenuIndex <= 0;
        nextPageBtn.disabled = currentMenuIndex >= menuPages.length - 1;

        if (menuPages.length === 0) {
            pageReadout.textContent = "No pages available";
            return;
        }

        const currentPage = menuPages[currentMenuIndex];
        pageReadout.textContent = `Page ${currentMenuIndex + 1} of ${menuPages.length} - ${currentPage.label}`;
    }

    function setCurrentPage(nextIndex) {
        if (!menuPages.length) {
            return;
        }

        const clampedIndex = Math.max(0, Math.min(nextIndex, menuPages.length - 1));
        currentMenuIndex = clampedIndex;
        updateBookState();
    }

    function isInteractiveElement(target) {
        return target
            && (target.closest("input")
                || target.closest("button")
                || target.closest("textarea")
                || target.closest("select")
                || target.closest("a"));
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

    function getItemDescriptor(menuItems, itemRef) {
        const matchedItem = findMenuMatch(menuItems, itemRef) || null;
        const name = matchedItem ? matchedItem.name : (itemRef.item || itemRef.name || "Dish");
        const category = matchedItem ? matchedItem.category : (itemRef.category || inferCategoryFromName(name));

        return {
            key: matchedItem ? `id:${matchedItem.id}` : `name:${normalizeCategory(name)}`,
            id: matchedItem ? matchedItem.id : itemRef.id,
            name,
            category,
            categoryKey: getCategoryKey(category),
            price: Number(matchedItem ? matchedItem.price : (itemRef.price || 0))
        };
    }

    function buildRecommendationData(menuItems, orders, bills) {
        const statsByKey = new Map();

        function ensureStat(itemRef) {
            const descriptor = getItemDescriptor(menuItems, itemRef);

            if (!statsByKey.has(descriptor.key)) {
                statsByKey.set(descriptor.key, {
                    ...descriptor,
                    quantity: 0,
                    revenue: 0,
                    reviewPoints: 0,
                    reviewQuantity: 0,
                    ratedBills: 0
                });
            }

            return statsByKey.get(descriptor.key);
        }

        menuItems.forEach((menuItem) => {
            ensureStat(menuItem);
        });

        orders.forEach((order) => {
            (order.items || []).forEach((orderItem) => {
                const stat = ensureStat(orderItem);
                const quantity = Math.max(0, Number(orderItem.quantity || 0));
                const price = Number(orderItem.price || stat.price || 0);
                stat.quantity += quantity;
                stat.revenue += quantity * price;
            });
        });

        bills.forEach((bill) => {
            const rating = Math.max(0, Number(bill.reviewRating || 0));
            if (rating <= 0) {
                return;
            }

            (bill.items || []).forEach((billItem) => {
                const stat = ensureStat(billItem);
                const quantity = Math.max(1, Number(billItem.quantity || 0));
                stat.reviewPoints += rating * quantity;
                stat.reviewQuantity += quantity;
                stat.ratedBills += 1;
            });
        });

        const rankedItems = [...statsByKey.values()].map((item) => {
            const averageRating = item.reviewQuantity > 0
                ? item.reviewPoints / item.reviewQuantity
                : 0;
            const popularityScore = (averageRating > 0 ? averageRating * 120 : 0)
                + item.quantity * 8
                + item.revenue * 0.04;

            return {
                ...item,
                averageRating,
                popularityScore
            };
        });

        const highestSale = RECOMMENDATION_GROUPS.map((groupKey) => {
            const chapter = BOOK_CHAPTERS.find((entry) => entry.key === groupKey);
            const soldCandidate = rankedItems
                .filter((item) => item.categoryKey === groupKey && item.quantity > 0)
                .sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue || left.name.localeCompare(right.name))[0];

            if (soldCandidate) {
                return {
                    groupKey,
                    label: chapter ? chapter.label : groupKey,
                    status: "live",
                    item: soldCandidate
                };
            }

            const menuFallback = menuItems
                .filter((menuItem) => getCategoryKey(menuItem.category) === groupKey)
                .sort((left, right) => left.name.localeCompare(right.name))[0];

            if (menuFallback) {
                return {
                    groupKey,
                    label: chapter ? chapter.label : groupKey,
                    status: "pending",
                    item: {
                        name: menuFallback.name,
                        category: menuFallback.category,
                        quantity: 0,
                        revenue: 0,
                        averageRating: 0
                    }
                };
            }

            return {
                groupKey,
                label: chapter ? chapter.label : groupKey,
                status: "empty",
                item: null
            };
        });

        let bestFood = rankedItems
            .filter((item) => item.quantity > 0 || item.averageRating > 0)
            .sort((left, right) =>
                right.popularityScore - left.popularityScore
                || right.averageRating - left.averageRating
                || right.quantity - left.quantity
                || right.revenue - left.revenue
                || left.name.localeCompare(right.name)
            )
            .slice(0, 4);

        if (bestFood.length === 0) {
            bestFood = menuItems.slice(0, 4).map((menuItem) => ({
                ...getItemDescriptor(menuItems, menuItem),
                quantity: 0,
                revenue: 0,
                averageRating: 0,
                popularityScore: 0,
                isFallback: true
            }));
        }

        return {
            bestFood,
            highestSale,
            orderCount: orders.length,
            reviewCount: bills.filter((bill) => Number(bill.reviewRating || 0) > 0).length
        };
    }

    function getBestFoodReason(item, index) {
        if (item.averageRating >= 4.5) {
            return "Guest favourite";
        }

        if (item.quantity >= 10) {
            return "High repeat orders";
        }

        if (index === 0) {
            return "House spotlight";
        }

        if (item.isFallback) {
            return "Chef pick";
        }

        return "Trending plate";
    }

    function renderRecommendationPanel(data) {
        recommendationData = data;

        if (data.orderCount > 0 || data.reviewCount > 0) {
            recommendationStatus.textContent = "Recommendations are generated from saved orders and guest feedback, so they update as your restaurant activity grows.";
        } else {
            recommendationStatus.textContent = "Recommendations will become smarter after your first completed orders. For now, the menu is showing chef-style starting picks.";
        }

        recommendationHighestSale.innerHTML = data.highestSale.map((entry) => {
            if (!entry.item) {
                return `
                    <article class="recommendation-card recommendation-card--empty">
                        <div class="recommendation-card__top">
                            <span class="recommendation-card__label">${escapeHTML(entry.label)}</span>
                            <span class="recommendation-card__badge">No Items</span>
                        </div>
                        <h4>No ${escapeHTML(entry.label)} dishes added yet</h4>
                        <p class="mb-0">Add a ${escapeHTML(entry.label.toLowerCase())} item to the menu and it will appear here automatically.</p>
                    </article>
                `;
            }

            if (entry.status === "pending") {
                return `
                    <article class="recommendation-card recommendation-card--pending">
                        <div class="recommendation-card__top">
                            <span class="recommendation-card__label">${escapeHTML(entry.label)}</span>
                            <span class="recommendation-card__badge">Waiting For First Sale</span>
                        </div>
                        <h4>${escapeHTML(entry.item.name)}</h4>
                        <p class="mb-0">This chapter is ready in the menu, but the first completed order will decide its highest seller.</p>
                    </article>
                `;
            }

            return `
                <article class="recommendation-card">
                    <div class="recommendation-card__top">
                        <span class="recommendation-card__label">${escapeHTML(entry.label)}</span>
                        <span class="recommendation-card__badge">Highest Sale</span>
                    </div>
                    <h4>${escapeHTML(entry.item.name)}</h4>
                    <div class="recommendation-card__metrics">
                        <span>${escapeHTML(String(entry.item.quantity))} plate${entry.item.quantity === 1 ? "" : "s"} sold</span>
                        <span>Rs ${escapeHTML(formatAmount(entry.item.revenue))} sales</span>
                    </div>
                </article>
            `;
        }).join("");

        recommendationBestFood.innerHTML = data.bestFood.map((item, index) => `
            <article class="recommendation-card recommendation-card--best">
                <div class="recommendation-card__top">
                    <span class="recommendation-card__label">#${index + 1} ${escapeHTML(item.category || inferCategoryFromName(item.name))}</span>
                    <span class="recommendation-card__badge">${escapeHTML(getBestFoodReason(item, index))}</span>
                </div>
                <h4>${escapeHTML(item.name)}</h4>
                <div class="recommendation-card__metrics">
                    <span>${item.averageRating > 0 ? `${item.averageRating.toFixed(1)}/5 guest score` : "Fresh recommendation"}</span>
                    <span>${item.quantity > 0 ? `${escapeHTML(String(item.quantity))} completed plates` : "Waiting for first orders"}</span>
                </div>
            </article>
        `).join("");
    }

    async function renderCustomerMenu() {
        const [menuItems, orders, bills] = await Promise.all([
            SmartDB.getMenuItems(),
            SmartDB.getAllOrders(),
            SmartDB.getAllBills()
        ]);

        currentMenuItems = menuItems;
        const cartWasUpdated = syncCartWithMenu(menuItems);
        renderRecommendationPanel(buildRecommendationData(menuItems, orders, bills));
        updateCartBadge();
        renderBookPages(buildBookPages(menuItems));

        if (cartWasUpdated) {
            alert("Your cart was updated because some item details changed.");
        }
    }

    customerName.textContent = session.name || "Guest";
    customerPhone.textContent = session.phone || "-";
    customerTable.textContent = session.tableNo || "-";

    recommendationBtn.addEventListener("click", () => {
        openRecommendationPanel();
    });

    cartShortcutBtn.addEventListener("click", goToCart);
    goToCartBtn.addEventListener("click", goToCart);

    closeRecommendationBtn.addEventListener("click", closeRecommendationPanel);
    recommendationOverlay.querySelector("[data-close-recommendations]").addEventListener("click", closeRecommendationPanel);
    dishTheatreCloseBtn.addEventListener("click", closeDishPreview);
    dishTheatre.querySelector("[data-close-dish-theatre]").addEventListener("click", closeDishPreview);

    prevPageBtn.addEventListener("click", () => {
        setCurrentPage(currentMenuIndex - 1);
    });

    nextPageBtn.addEventListener("click", () => {
        setCurrentPage(currentMenuIndex + 1);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            if (!dishTheatre.hidden) {
                closeDishPreview();
                return;
            }

            if (!recommendationOverlay.hidden) {
                closeRecommendationPanel();
                return;
            }
        }

        if (isAnyOverlayOpen() || isInteractiveElement(event.target)) {
            return;
        }

        if (event.key === "ArrowRight") {
            setCurrentPage(currentMenuIndex + 1);
        } else if (event.key === "ArrowLeft") {
            setCurrentPage(currentMenuIndex - 1);
        }
    });

    menuContainer.addEventListener("touchstart", (event) => {
        if (isInteractiveElement(event.target) || isAnyOverlayOpen()) {
            touchStartX = 0;
            touchStartY = 0;
            return;
        }

        const touch = event.changedTouches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }, { passive: true });

    menuContainer.addEventListener("touchend", (event) => {
        if (isInteractiveElement(event.target) || isAnyOverlayOpen() || (!touchStartX && !touchStartY)) {
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
            setCurrentPage(currentMenuIndex + 1);
        } else {
            setCurrentPage(currentMenuIndex - 1);
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
