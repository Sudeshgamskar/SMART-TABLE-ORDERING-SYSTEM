(function () {
    const DB_NAME = "smart_table_db";
    const DB_VERSION = 3;
    const CUSTOMER_STORE = "customers";
    const VISIT_STORE = "visits";
    const ORDER_STORE = "orders";
    const BILL_STORE = "bills";
    const MENU_STORE = "menu";
    const DEFAULT_STOCK = 10;
    const ITEM_TYPES = {
        PREPARE: "prepare",
        PURCHASE: "purchase"
    };

    const DEFAULT_MENU = [
        { name: "Paneer Butter Masala", category: "Veg", price: 200, purchasePrice: 120, time: 5, stock: null, itemType: ITEM_TYPES.PREPARE },
        { name: "Veg Biryani", category: "Veg", price: 180, purchasePrice: 105, time: 7, stock: null, itemType: ITEM_TYPES.PREPARE },
        { name: "Chicken Biryani", category: "Non-Veg", price: 220, purchasePrice: 135, time: 8, stock: null, itemType: ITEM_TYPES.PREPARE },
        { name: "Mutton Curry", category: "Non-Veg", price: 300, purchasePrice: 185, time: 10, stock: null, itemType: ITEM_TYPES.PREPARE },
        { name: "Ice Cream", category: "Dessert", price: 60, purchasePrice: 35, time: 2, stock: 20, itemType: ITEM_TYPES.PURCHASE },
        { name: "Gulab Jamun", category: "Dessert", price: 45, purchasePrice: 20, time: 3, stock: null, itemType: ITEM_TYPES.PREPARE }
    ];

    function normalizeNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? fallback : parsed;
    }

    function defaultPurchasePrice(price) {
        return Math.max(Math.round(normalizeNumber(price, 0) * 0.6), 0);
    }

    function normalizeItemType(itemType) {
        return itemType === ITEM_TYPES.PURCHASE ? ITEM_TYPES.PURCHASE : ITEM_TYPES.PREPARE;
    }

    function inferItemType(item) {
        if (item && (item.itemType === ITEM_TYPES.PURCHASE || item.itemType === ITEM_TYPES.PREPARE)) {
            return item.itemType;
        }

        if (item && item.stock !== undefined && item.stock !== null && item.stock !== "") {
            return ITEM_TYPES.PURCHASE;
        }

        return ITEM_TYPES.PREPARE;
    }

    function normalizeStock(stock, itemType, fallback = DEFAULT_STOCK) {
        if (normalizeItemType(itemType) !== ITEM_TYPES.PURCHASE) {
            return null;
        }

        if (stock === null || stock === undefined || stock === "") {
            return fallback;
        }

        const parsed = Math.floor(Number(stock));
        if (Number.isNaN(parsed)) {
            return fallback;
        }

        return Math.max(parsed, 0);
    }

    function normalizePurchasePrice(purchasePrice, sellingPrice) {
        if (purchasePrice === null || purchasePrice === undefined || purchasePrice === "") {
            return defaultPurchasePrice(sellingPrice);
        }

        return Math.max(normalizeNumber(purchasePrice, defaultPurchasePrice(sellingPrice)), 0);
    }

    function normalizeMenuItem(item) {
        const price = Math.max(normalizeNumber(item.price, 0), 0);
        const itemType = normalizeItemType(inferItemType(item));

        return {
            ...item,
            itemType,
            price,
            purchasePrice: normalizePurchasePrice(item.purchasePrice, price),
            time: Math.max(normalizeNumber(item.time, 0), 0),
            stock: normalizeStock(item.stock, itemType)
        };
    }

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(CUSTOMER_STORE)) {
                    db.createObjectStore(CUSTOMER_STORE, { keyPath: "phone" });
                }

                if (!db.objectStoreNames.contains(VISIT_STORE)) {
                    const visits = db.createObjectStore(VISIT_STORE, { keyPath: "id", autoIncrement: true });
                    visits.createIndex("createdAt", "createdAt", { unique: false });
                    visits.createIndex("phone", "phone", { unique: false });
                    visits.createIndex("tableNo", "tableNo", { unique: false });
                }

                if (!db.objectStoreNames.contains(ORDER_STORE)) {
                    const orders = db.createObjectStore(ORDER_STORE, { keyPath: "id", autoIncrement: true });
                    orders.createIndex("createdAt", "createdAt", { unique: false });
                    orders.createIndex("tableNo", "tableNo", { unique: false });
                    orders.createIndex("phone", "phone", { unique: false });
                }

                if (!db.objectStoreNames.contains(BILL_STORE)) {
                    const bills = db.createObjectStore(BILL_STORE, { keyPath: "billNo", autoIncrement: true });
                    bills.createIndex("createdAt", "createdAt", { unique: false });
                    bills.createIndex("phone", "phone", { unique: false });
                    bills.createIndex("orderId", "orderId", { unique: false });
                }

                if (!db.objectStoreNames.contains(MENU_STORE)) {
                    db.createObjectStore(MENU_STORE, { keyPath: "id", autoIncrement: true });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function txComplete(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    async function addRecord(storeName, value) {
        const db = await openDB();
        const tx = db.transaction(storeName, "readwrite");
        const request = tx.objectStore(storeName).add(value);
        const key = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await txComplete(tx);
        return key;
    }

    async function putRecord(storeName, value) {
        const db = await openDB();
        const tx = db.transaction(storeName, "readwrite");
        const request = tx.objectStore(storeName).put(value);
        const key = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await txComplete(tx);
        return key;
    }

    async function getRecordByKey(storeName, key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async function getCustomerByPhone(phone) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CUSTOMER_STORE, "readonly");
            const request = tx.objectStore(CUSTOMER_STORE).get(phone);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async function upsertCustomer(customer) {
        const db = await openDB();
        const tx = db.transaction(CUSTOMER_STORE, "readwrite");
        tx.objectStore(CUSTOMER_STORE).put(customer);
        await txComplete(tx);
    }

    async function addVisit(visit) {
        const db = await openDB();
        const tx = db.transaction(VISIT_STORE, "readwrite");
        tx.objectStore(VISIT_STORE).add(visit);
        await txComplete(tx);
    }

    async function addOrder(order) {
        return addRecord(ORDER_STORE, order);
    }

    async function addBill(bill) {
        return addRecord(BILL_STORE, bill);
    }

    async function saveBill(bill) {
        return putRecord(BILL_STORE, bill);
    }

    async function getAllFromStore(storeName) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async function clearStore(storeName) {
        const db = await openDB();
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).clear();
        await txComplete(tx);
    }

    async function seedMenuIfEmpty() {
        const items = await getAllFromStore(MENU_STORE);
        if (items.length > 0) {
            return;
        }

        const db = await openDB();
        const tx = db.transaction(MENU_STORE, "readwrite");
        const store = tx.objectStore(MENU_STORE);
        DEFAULT_MENU.forEach((item) => store.add(item));
        await txComplete(tx);
    }

    async function ensureMenuItemFields() {
        const items = await getAllFromStore(MENU_STORE);
        const itemsToUpdate = items.filter((item) =>
            item.itemType === undefined
            || item.itemType === null
            || item.itemType === ""
            || (item.itemType !== ITEM_TYPES.PREPARE && item.itemType !== ITEM_TYPES.PURCHASE)
            || item.purchasePrice === undefined
            || item.purchasePrice === null
            || item.purchasePrice === ""
            || item.price === undefined
            || item.time === undefined
            || (normalizeItemType(inferItemType(item)) === ITEM_TYPES.PURCHASE && (item.stock === undefined || item.stock === null || item.stock === ""))
            || (item.itemType === ITEM_TYPES.PREPARE && item.stock !== null)
        );

        if (itemsToUpdate.length === 0) {
            return;
        }

        const db = await openDB();
        const tx = db.transaction(MENU_STORE, "readwrite");
        const store = tx.objectStore(MENU_STORE);

        itemsToUpdate.forEach((item) => {
            store.put(normalizeMenuItem(item));
        });

        await txComplete(tx);
    }

    async function init() {
        await openDB();
        await seedMenuIfEmpty();
        await ensureMenuItemFields();
    }

    async function getMenuItems() {
        const items = await getAllFromStore(MENU_STORE);
        const normalizedItems = items.map(normalizeMenuItem);
        normalizedItems.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
        return normalizedItems;
    }

    async function saveMenu(menu) {
        const db = await openDB();
        const tx = db.transaction(MENU_STORE, "readwrite");
        tx.objectStore(MENU_STORE).put(normalizeMenuItem(menu));
        await txComplete(tx);
    }

    async function deleteMenu(id) {
        const db = await openDB();
        const tx = db.transaction(MENU_STORE, "readwrite");
        tx.objectStore(MENU_STORE).delete(id);
        await txComplete(tx);
    }

    function getAllCustomers() {
        return getAllFromStore(CUSTOMER_STORE);
    }

    function getAllBills() {
        return getAllFromStore(BILL_STORE);
    }

    function getAllVisits() {
        return getAllFromStore(VISIT_STORE);
    }

    function getAllOrders() {
        return getAllFromStore(ORDER_STORE);
    }

    function getBillByNumber(billNo) {
        return getRecordByKey(BILL_STORE, Number(billNo));
    }

    async function reduceMenuStock(orderItems) {
        const menuItems = await getMenuItems();
        const menuMap = new Map(menuItems.map((item) => [Number(item.id), item]));
        const quantityByItemId = new Map();

        (orderItems || []).forEach((item) => {
            const itemId = Number(item.id);
            const quantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
            const menuItem = menuMap.get(itemId);

            if (!itemId || quantity <= 0 || !menuItem || menuItem.itemType !== ITEM_TYPES.PURCHASE) {
                return;
            }

            quantityByItemId.set(itemId, (quantityByItemId.get(itemId) || 0) + quantity);
        });

        if (quantityByItemId.size === 0) {
            return;
        }

        const updates = [];
        quantityByItemId.forEach((quantity, itemId) => {
            const menuItem = menuMap.get(itemId);
            if (!menuItem) {
                throw new Error(`Menu item ${itemId} not found.`);
            }

            if (quantity > Number(menuItem.stock || 0)) {
                throw new Error(`Insufficient stock for ${menuItem.name}.`);
            }

            updates.push({
                ...menuItem,
                stock: Number(menuItem.stock || 0) - quantity
            });
        });

        await Promise.all(updates.map((item) => saveMenu(item)));
    }

    window.SmartDB = {
        ITEM_TYPES,
        addBill,
        addOrder,
        addVisit,
        clearStore,
        deleteMenu,
        getAllBills,
        getAllCustomers,
        getAllOrders,
        getAllVisits,
        getBillByNumber,
        getCustomerByPhone,
        getMenuItems,
        init,
        reduceMenuStock,
        saveBill,
        saveMenu,
        upsertCustomer
    };
})();
