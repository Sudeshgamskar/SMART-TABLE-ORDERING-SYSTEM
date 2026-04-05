(async function () {
    const ITEM_TYPES = SmartDB.ITEM_TYPES || {
        PREPARE: "prepare",
        PURCHASE: "purchase"
    };
    const LOW_STOCK_LIMIT = 5;

    let editingMenuId = null;
    let dashboardData = {
        bills: [],
        customers: [],
        menu: [],
        orders: [],
        visits: []
    };

    function ensureAdminAccess() {
        if (SmartApp.isAdminUnlocked()) {
            return true;
        }

        alert("Log in with the admin credentials on the login page to open the admin panel.");
        location.replace("index.html");
        return false;
    }

    if (!ensureAdminAccess()) {
        return;
    }

    const todayRevenue = document.getElementById("todayRevenue");
    const monthRevenue = document.getElementById("monthRevenue");
    const tableRevenue = document.getElementById("tableRevenue");
    const tableRevenueInput = document.getElementById("tableRevenueInput");
    const adminMenuTableBody = document.getElementById("adminMenuTableBody");
    const customerDetailsBody = document.getElementById("customerDetailsBody");
    const purchaseHistoryBody = document.getElementById("purchaseHistoryBody");
    const billTableBody = document.getElementById("billTableBody");
    const purchaseSectionBody = document.getElementById("purchaseSectionBody");
    const tallyTableBody = document.getElementById("tallyTableBody");
    const menuName = document.getElementById("menuName");
    const menuCategory = document.getElementById("menuCategory");
    const menuType = document.getElementById("menuType");
    const menuPrice = document.getElementById("menuPrice");
    const menuPurchasePrice = document.getElementById("menuPurchasePrice");
    const menuTime = document.getElementById("menuTime");
    const menuStock = document.getElementById("menuStock");
    const stockHint = document.getElementById("stockHint");
    const saveMenuBtn = document.getElementById("saveMenuBtn");
    const settingsDrawer = document.getElementById("settingsDrawer");
    const settingsBackdrop = document.getElementById("settingsBackdrop");
    const settingsNavButtons = Array.from(document.querySelectorAll("[data-section-target]"));
    const adminSections = Array.from(document.querySelectorAll(".admin-section"));

    function formatNumber(value) {
        return new Intl.NumberFormat("en-IN", {
            maximumFractionDigits: 0
        }).format(Number(value || 0));
    }

    function formatPercent(value) {
        return `${Number(value || 0).toFixed(1)}%`;
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function itemTypeLabel(itemType) {
        return itemType === ITEM_TYPES.PURCHASE ? "Must Be Purchased" : "Can Be Prepared";
    }

    function isPurchaseType(itemType) {
        return itemType === ITEM_TYPES.PURCHASE;
    }

    function defaultPurchasePrice(sellingPrice) {
        return Math.max(Math.round(Number(sellingPrice || 0) * 0.6), 0);
    }

    function findMenuMatch(menuItems, itemRef) {
        return menuItems.find((menuItem) => Number(menuItem.id) === Number(itemRef.id))
            || menuItems.find((menuItem) => menuItem.name === itemRef.item);
    }

    function getOrderItemSnapshot(orderItem) {
        const matchedItem = findMenuMatch(dashboardData.menu, orderItem);
        const itemType = orderItem.itemType || (matchedItem ? matchedItem.itemType : ITEM_TYPES.PREPARE);
        const sellingPrice = Number(
            orderItem.price !== undefined
                ? orderItem.price
                : (matchedItem ? matchedItem.price : 0)
        );
        const purchasePrice = Number(
            orderItem.purchasePrice !== undefined
                ? orderItem.purchasePrice
                : (matchedItem ? matchedItem.purchasePrice : defaultPurchasePrice(sellingPrice))
        );
        const quantity = Number(orderItem.quantity || 0);
        const revenue = sellingPrice * quantity;
        const cost = purchasePrice * quantity;

        return {
            id: matchedItem ? matchedItem.id : orderItem.id,
            item: matchedItem ? matchedItem.name : orderItem.item,
            itemType,
            purchasePrice,
            quantity,
            revenue,
            cost,
            profit: revenue - cost
        };
    }

    function getOrderDetails(order) {
        const itemSnapshots = (order.items || []).map(getOrderItemSnapshot);
        const totalAmount = Number(order.total || 0);
        const totalCost = itemSnapshots.reduce((sum, item) => sum + item.cost, 0);
        const totalQuantity = itemSnapshots.reduce((sum, item) => sum + item.quantity, 0);

        return {
            amount: totalAmount,
            itemSnapshots,
            itemsText: itemSnapshots.length > 0
                ? itemSnapshots.map((item) => `${item.item} x${item.quantity}`).join(", ")
                : "-",
            profit: totalAmount - totalCost,
            quantity: totalQuantity
        };
    }

    function openSettingsDrawer() {
        settingsDrawer.classList.add("open");
        document.body.classList.add("drawer-open");
    }

    function closeSettingsDrawer() {
        settingsDrawer.classList.remove("open");
        document.body.classList.remove("drawer-open");
    }

    function showSection(sectionKey) {
        adminSections.forEach((section) => {
            section.classList.toggle("active", section.dataset.section === sectionKey);
        });

        settingsNavButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.sectionTarget === sectionKey);
        });
    }

    function toggleStockField() {
        const purchaseType = isPurchaseType(menuType.value);

        menuStock.disabled = !purchaseType;
        menuStock.classList.toggle("stock-disabled", !purchaseType);

        if (purchaseType) {
            stockHint.textContent = "Purchased items use stock. Prepared items can be cooked fresh when ordered.";
            if (menuStock.value === "") {
                menuStock.value = "0";
            }
            menuStock.placeholder = "Stock";
        } else {
            stockHint.textContent = "Prepared items are not blocked by stock. Their purchase price is still used for profit calculation.";
            menuStock.value = "";
            menuStock.placeholder = "N/A";
        }
    }

    async function refreshDashboardData() {
        const [menu, customers, visits, orders, bills] = await Promise.all([
            SmartDB.getMenuItems(),
            SmartDB.getAllCustomers(),
            SmartDB.getAllVisits(),
            SmartDB.getAllOrders(),
            SmartDB.getAllBills()
        ]);

        dashboardData = {
            bills,
            customers,
            menu,
            orders,
            visits
        };
    }

    function loadRevenueCards() {
        const now = new Date();
        let today = 0;
        let month = 0;

        dashboardData.orders.forEach((order) => {
            const orderDate = new Date(order.createdAt);
            if (SmartApp.isSameDay(orderDate, now)) {
                today += Number(order.total || 0);
            }
            if (SmartApp.isSameMonth(orderDate, now)) {
                month += Number(order.total || 0);
            }
        });

        todayRevenue.textContent = formatNumber(today);
        monthRevenue.textContent = formatNumber(month);
    }

    function checkTableRevenue() {
        const tableNo = tableRevenueInput.value.trim();
        if (!tableNo) {
            tableRevenue.textContent = "0";
            return;
        }

        const total = dashboardData.orders
            .filter((order) => String(order.tableNo) === String(tableNo))
            .reduce((sum, order) => sum + Number(order.total || 0), 0);

        tableRevenue.textContent = formatNumber(total);
    }

    function loadCustomerDetails() {
        const visitMap = new Map();
        const orderMap = new Map();

        dashboardData.visits.forEach((visit) => {
            const list = visitMap.get(visit.phone) || [];
            list.push(visit);
            visitMap.set(visit.phone, list);
        });

        dashboardData.orders.forEach((order) => {
            const list = orderMap.get(order.phone) || [];
            list.push(order);
            orderMap.set(order.phone, list);
        });

        const allPhones = new Set([
            ...dashboardData.customers.map((customer) => customer.phone),
            ...dashboardData.visits.map((visit) => visit.phone),
            ...dashboardData.orders.map((order) => order.phone)
        ]);

        const rows = Array.from(allPhones).map((phone) => {
            const customer = dashboardData.customers.find((entry) => entry.phone === phone) || {};
            const visits = visitMap.get(phone) || [];
            const orders = orderMap.get(phone) || [];
            const latestVisit = visits
                .slice()
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
            const latestOrder = orders
                .slice()
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;

            const lastVisitAt = visits
                .map((visit) => visit.createdAt)
                .sort()
                .slice(-1)[0] || customer.updatedAt || null;

            const totalSpent = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
            const displayName = customer.name
                || (latestVisit ? latestVisit.name : "")
                || (latestOrder ? latestOrder.name : "")
                || "-";

            return {
                name: displayName,
                phone,
                lastVisitAt,
                totalOrders: orders.length,
                totalSpent,
                totalVisits: visits.length
            };
        });

        rows.sort((a, b) => {
            if (!a.lastVisitAt && !b.lastVisitAt) {
                return String(a.name).localeCompare(String(b.name));
            }
            if (!a.lastVisitAt) {
                return 1;
            }
            if (!b.lastVisitAt) {
                return -1;
            }
            return new Date(b.lastVisitAt) - new Date(a.lastVisitAt);
        });

        customerDetailsBody.innerHTML = "";

        if (rows.length === 0) {
            customerDetailsBody.innerHTML = '<tr><td colspan="6" class="text-center">No customers found</td></tr>';
            return;
        }

        rows.forEach((row) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.name}</td>
                <td>${row.phone}</td>
                <td>${row.lastVisitAt ? SmartApp.formatDateTime(row.lastVisitAt) : "-"}</td>
                <td>${formatNumber(row.totalVisits)}</td>
                <td>${formatNumber(row.totalOrders)}</td>
                <td>Rs ${formatNumber(row.totalSpent)}</td>
            `;
            customerDetailsBody.appendChild(tr);
        });
    }

    function loadPurchaseHistory() {
        const filterType = document.getElementById("historyFilterType").value;
        const filterValue = document.getElementById("historyFilterValue").value.trim().toLowerCase();
        const sortType = document.getElementById("historySortType").value;

        const rows = dashboardData.orders.map((order) => {
            const details = getOrderDetails(order);

            return {
                amount: details.amount,
                createdAt: order.createdAt,
                itemsText: details.itemsText,
                name: order.name,
                phone: order.phone,
                profit: details.profit,
                quantity: details.quantity,
                tableNo: order.tableNo
            };
        });

        const filtered = rows.filter((row) => {
            if (!filterValue) {
                return true;
            }

            if (filterType === "phone") {
                return String(row.phone).toLowerCase().includes(filterValue);
            }
            if (filterType === "customer") {
                return String(row.name).toLowerCase().includes(filterValue);
            }
            if (filterType === "item") {
                return row.itemsText.toLowerCase().includes(filterValue);
            }
            if (filterType === "table") {
                return String(row.tableNo).toLowerCase().includes(filterValue);
            }
            if (filterType === "amount") {
                const numeric = Number(filterValue);
                if (!Number.isNaN(numeric)) {
                    return row.amount === numeric;
                }
                return String(row.amount).includes(filterValue);
            }

            return true;
        });

        filtered.sort((a, b) => {
            if (sortType === "amount_desc") {
                return b.amount - a.amount;
            }
            if (sortType === "amount_asc") {
                return a.amount - b.amount;
            }
            if (sortType === "quantity") {
                return b.quantity - a.quantity;
            }
            if (sortType === "profit") {
                return b.profit - a.profit;
            }
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        purchaseHistoryBody.innerHTML = "";

        if (filtered.length === 0) {
            purchaseHistoryBody.innerHTML = '<tr><td colspan="7" class="text-center">No purchase history found</td></tr>';
            return;
        }

        filtered.forEach((row) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.name}</td>
                <td>${row.phone}</td>
                <td>${row.tableNo}</td>
                <td>${SmartApp.formatDateTime(row.createdAt)}</td>
                <td>${row.itemsText}</td>
                <td>Rs ${formatNumber(row.amount)}</td>
                <td>Rs ${formatNumber(row.profit)}</td>
            `;
            purchaseHistoryBody.appendChild(tr);
        });
    }

    function getBillItemsText(bill) {
        const items = Array.isArray(bill.items) ? bill.items : [];
        if (items.length === 0) {
            return "-";
        }

        return items
            .map((item) => `${item.item || "-"} x${Number(item.quantity || 0)}`)
            .join(", ");
    }

    function getBillRatingText(bill) {
        const rating = Number(bill.reviewRating || 0);
        return rating > 0 ? `${rating}/5` : "-";
    }

    function getBillFeedbackText(bill) {
        const feedback = String(bill.reviewFeedback || "").trim();
        return feedback || "-";
    }

    function loadBillsSection() {
        const bills = dashboardData.bills
            .slice()
            .sort((a, b) => Number(b.billNo || 0) - Number(a.billNo || 0));
        const totalBilledAmount = bills.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
        const latestBill = bills[0] || null;

        document.getElementById("billCount").textContent = formatNumber(bills.length);
        document.getElementById("latestBillNumber").textContent = latestBill
            ? SmartApp.formatBillNumber(latestBill.billNo)
            : "000";
        document.getElementById("totalBillAmount").textContent = `Rs ${formatNumber(totalBilledAmount)}`;

        billTableBody.innerHTML = "";

        if (bills.length === 0) {
            billTableBody.innerHTML = '<tr><td colspan="10" class="text-center">No bills saved yet</td></tr>';
            return;
        }

        bills.forEach((bill) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${SmartApp.formatBillNumber(bill.billNo)}</td>
                <td>${SmartApp.formatDateTime(bill.createdAt)}</td>
                <td>${escapeHTML(bill.name || "-")}</td>
                <td>${escapeHTML(bill.phone || "-")}</td>
                <td>${escapeHTML(bill.tableNo || "-")}</td>
                <td>${escapeHTML(getBillItemsText(bill))}</td>
                <td>${escapeHTML(getBillRatingText(bill))}</td>
                <td class="bill-feedback-cell">${escapeHTML(getBillFeedbackText(bill))}</td>
                <td>Rs ${SmartApp.formatCurrency(bill.total)}</td>
                <td>
                    <a class="btn btn-info btn-sm bill-open-link" href="bill.html?billNo=${encodeURIComponent(bill.billNo)}&from=admin">View Bill</a>
                </td>
            `;
            billTableBody.appendChild(tr);
        });
    }

    function loadPurchaseSection() {
        const purchaseItems = dashboardData.menu.filter((item) => isPurchaseType(item.itemType));
        const preparedItems = dashboardData.menu.filter((item) => !isPurchaseType(item.itemType));
        const lowStockItems = purchaseItems.filter((item) => Number(item.stock || 0) <= LOW_STOCK_LIMIT);

        document.getElementById("purchaseItemCount").textContent = formatNumber(purchaseItems.length);
        document.getElementById("preparedItemCount").textContent = formatNumber(preparedItems.length);
        document.getElementById("lowStockCount").textContent = formatNumber(lowStockItems.length);

        purchaseSectionBody.innerHTML = "";

        if (dashboardData.menu.length === 0) {
            purchaseSectionBody.innerHTML = '<tr><td colspan="8" class="text-center">No items found</td></tr>';
            return;
        }

        dashboardData.menu.forEach((item) => {
            const tr = document.createElement("tr");
            const profitPerItem = Number(item.price || 0) - Number(item.purchasePrice || 0);
            const stockText = isPurchaseType(item.itemType) ? formatNumber(item.stock || 0) : "-";
            let statusText = "Prepared";

            if (isPurchaseType(item.itemType)) {
                if (Number(item.stock || 0) <= 0) {
                    statusText = "Out of Stock";
                } else if (Number(item.stock || 0) <= LOW_STOCK_LIMIT) {
                    statusText = "Low Stock";
                } else {
                    statusText = "In Stock";
                }
            }

            tr.innerHTML = `
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td><span class="type-badge">${itemTypeLabel(item.itemType)}</span></td>
                <td>Rs ${formatNumber(item.purchasePrice)}</td>
                <td>Rs ${formatNumber(item.price)}</td>
                <td>Rs ${formatNumber(profitPerItem)}</td>
                <td>${stockText}</td>
                <td>${statusText}</td>
            `;
            purchaseSectionBody.appendChild(tr);
        });
    }

    function loadTallySheet() {
        const tallyMap = new Map();
        let totalSales = 0;
        let totalCost = 0;

        dashboardData.orders.forEach((order) => {
            const details = getOrderDetails(order);
            totalSales += details.amount;
            totalCost += details.itemSnapshots.reduce((sum, item) => sum + item.cost, 0);

            details.itemSnapshots.forEach((item) => {
                const key = item.id ? `id-${item.id}` : `name-${item.item}`;
                const existing = tallyMap.get(key) || {
                    item: item.item,
                    itemType: item.itemType,
                    quantity: 0,
                    sales: 0,
                    cost: 0,
                    profit: 0
                };

                existing.quantity += item.quantity;
                existing.sales += item.revenue;
                existing.cost += item.cost;
                existing.profit += item.profit;

                tallyMap.set(key, existing);
            });
        });

        const totalProfit = totalSales - totalCost;
        const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

        document.getElementById("tallySales").textContent = `Rs ${formatNumber(totalSales)}`;
        document.getElementById("tallyCost").textContent = `Rs ${formatNumber(totalCost)}`;
        document.getElementById("tallyProfit").textContent = `Rs ${formatNumber(totalProfit)}`;
        document.getElementById("tallyMargin").textContent = formatPercent(profitMargin);

        const rows = Array.from(tallyMap.values()).sort((a, b) => b.profit - a.profit);

        tallyTableBody.innerHTML = "";

        if (rows.length === 0) {
            tallyTableBody.innerHTML = '<tr><td colspan="6" class="text-center">No tally data available yet</td></tr>';
            return;
        }

        rows.forEach((row) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row.item}</td>
                <td><span class="type-badge">${itemTypeLabel(row.itemType)}</span></td>
                <td>${formatNumber(row.quantity)}</td>
                <td>Rs ${formatNumber(row.sales)}</td>
                <td>Rs ${formatNumber(row.cost)}</td>
                <td>Rs ${formatNumber(row.profit)}</td>
            `;
            tallyTableBody.appendChild(tr);
        });
    }

    function loadMenuAdmin() {
        adminMenuTableBody.innerHTML = "";

        if (dashboardData.menu.length === 0) {
            adminMenuTableBody.innerHTML = '<tr><td colspan="8" class="text-center">No menu items</td></tr>';
            return;
        }

        dashboardData.menu.forEach((item) => {
            const tr = document.createElement("tr");
            const actionCell = document.createElement("td");

            const editBtn = document.createElement("button");
            editBtn.className = "btn btn-warning btn-sm me-1";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => {
                editingMenuId = item.id;
                menuName.value = item.name;
                menuCategory.value = item.category;
                menuType.value = item.itemType;
                menuPrice.value = item.price;
                menuPurchasePrice.value = item.purchasePrice;
                menuTime.value = item.time;
                menuStock.value = isPurchaseType(item.itemType) ? Number(item.stock || 0) : "";
                toggleStockField();
                saveMenuBtn.textContent = "Update Item";
                showSection("overview");
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn btn-danger btn-sm";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", async () => {
                const ok = confirm("Delete this menu item?");
                if (!ok) {
                    return;
                }

                await SmartDB.deleteMenu(item.id);
                await loadAdminDashboard();
            });

            actionCell.appendChild(editBtn);
            actionCell.appendChild(deleteBtn);

            tr.innerHTML = `
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td><span class="type-badge">${itemTypeLabel(item.itemType)}</span></td>
                <td>Rs ${formatNumber(item.price)}</td>
                <td>Rs ${formatNumber(item.purchasePrice)}</td>
                <td>${formatNumber(item.time)} mins</td>
                <td>${isPurchaseType(item.itemType) ? formatNumber(item.stock || 0) : "-"}</td>
            `;
            tr.appendChild(actionCell);
            adminMenuTableBody.appendChild(tr);
        });
    }

    function resetMenuForm() {
        editingMenuId = null;
        menuName.value = "";
        menuCategory.value = "";
        menuType.value = ITEM_TYPES.PREPARE;
        menuPrice.value = "";
        menuPurchasePrice.value = "";
        menuTime.value = "";
        menuStock.value = "";
        saveMenuBtn.textContent = "Add Item";
        toggleStockField();
    }

    async function saveMenuItem() {
        const name = menuName.value.trim();
        const category = menuCategory.value.trim();
        const itemType = menuType.value;
        const price = Number(menuPrice.value.trim());
        const purchasePriceInput = menuPurchasePrice.value.trim();
        const purchasePrice = purchasePriceInput === ""
            ? defaultPurchasePrice(price)
            : Number(purchasePriceInput);
        const time = Number(menuTime.value.trim());
        const stock = isPurchaseType(itemType) ? Number(menuStock.value.trim()) : null;

        if (!name || !category || price <= 0 || purchasePrice < 0 || Number.isNaN(purchasePrice) || time < 0 || Number.isNaN(time)) {
            alert("Fill all menu fields with valid values.");
            return;
        }

        if (isPurchaseType(itemType) && (Number.isNaN(stock) || stock < 0)) {
            alert("Purchased items need stock value 0 or more.");
            return;
        }

        const menuItem = {
            category,
            itemType,
            name,
            price,
            purchasePrice,
            stock,
            time
        };

        if (editingMenuId) {
            menuItem.id = editingMenuId;
        }

        await SmartDB.saveMenu(menuItem);
        resetMenuForm();
        await loadAdminDashboard();
    }

    async function loadAdminDashboard() {
        await refreshDashboardData();
        loadRevenueCards();
        loadMenuAdmin();
        loadCustomerDetails();
        loadPurchaseHistory();
        loadBillsSection();
        loadPurchaseSection();
        loadTallySheet();
    }

    document.getElementById("backBtn").addEventListener("click", () => {
        SmartApp.lockAdmin();
        location.href = "index.html";
    });

    document.getElementById("settingsBtn").addEventListener("click", openSettingsDrawer);
    document.getElementById("closeSettingsBtn").addEventListener("click", closeSettingsDrawer);
    settingsBackdrop.addEventListener("click", closeSettingsDrawer);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeSettingsDrawer();
        }
    });

    settingsNavButtons.forEach((button) => {
        button.addEventListener("click", () => {
            showSection(button.dataset.sectionTarget);
            closeSettingsDrawer();
        });
    });

    menuType.addEventListener("change", toggleStockField);

    document.getElementById("checkTableRevenueBtn").addEventListener("click", checkTableRevenue);
    document.getElementById("refreshMenuBtn").addEventListener("click", async () => {
        await loadAdminDashboard();
    });
    document.getElementById("saveMenuBtn").addEventListener("click", async () => {
        await saveMenuItem();
    });
    document.getElementById("resetMenuBtn").addEventListener("click", resetMenuForm);
    document.getElementById("refreshCustomersBtn").addEventListener("click", async () => {
        await loadAdminDashboard();
        showSection("customers");
    });
    document.getElementById("historyFilterBtn").addEventListener("click", loadPurchaseHistory);
    document.getElementById("historySortBtn").addEventListener("click", loadPurchaseHistory);
    document.getElementById("refreshBillsBtn").addEventListener("click", async () => {
        await loadAdminDashboard();
        showSection("bills");
    });
    document.getElementById("refreshPurchaseBtn").addEventListener("click", async () => {
        await loadAdminDashboard();
        showSection("purchase");
    });
    document.getElementById("refreshTallyBtn").addEventListener("click", async () => {
        await loadAdminDashboard();
        showSection("tally");
    });

    try {
        await SmartDB.init();
        resetMenuForm();
        showSection("overview");
        await loadAdminDashboard();
    } catch (error) {
        console.error(error);
        alert("Could not load admin dashboard.");
    }
})();
