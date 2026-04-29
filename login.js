(async function () {
    // Change these three values if you want a different admin login.
    const ADMIN_LOGIN = {
        name: "Admin",
        phone: "7418529630",
        tableNo: "20"
    };

    const loginForm = document.getElementById("loginForm");
    const loginLead = document.getElementById("loginLead");
    const loginFootnote = document.getElementById("loginFootnote");
    const usernameInput = document.getElementById("username");
    const phoneInput = document.getElementById("phoneNo");
    const tableInput = document.getElementById("tableNo");
    const tableFieldGroup = document.getElementById("tableFieldGroup");
    const detectedTableCard = document.getElementById("detectedTableCard");
    const detectedTableValue = document.getElementById("detectedTableValue");
    const detectedTableHint = document.getElementById("detectedTableHint");
    const returningNote = document.getElementById("returningNote");
    const tableParamExists = new URLSearchParams(window.location.search).has("table");
    const qrTableNo = SmartApp.getRequestedTableNumber();
    const isQrTableLogin = Boolean(qrTableNo);

    function isAdminLogin(name, phone, tableNo) {
        return name.toLowerCase() === ADMIN_LOGIN.name.toLowerCase()
            && phone === ADMIN_LOGIN.phone
            && tableNo === ADMIN_LOGIN.tableNo;
    }

    function updateLoginMode() {
        if (isQrTableLogin) {
            tableFieldGroup.classList.add("d-none");
            detectedTableCard.classList.remove("d-none");
            detectedTableValue.textContent = `Table ${qrTableNo}`;
            detectedTableHint.textContent = "This table number came from the QR code on the table.";
            loginLead.textContent = `Enter only your name and phone number. Table ${qrTableNo} is already detected from the QR code.`;
            loginFootnote.textContent = "Returning guests are recognized by phone number, and the scanned QR code keeps the order linked to the correct table.";
            return;
        }

        tableFieldGroup.classList.remove("d-none");
        detectedTableCard.classList.add("d-none");
        loginLead.textContent = "Enter your details to unlock the menu book for your table.";
        loginFootnote.textContent = "Returning guests are recognized by phone number to make sign-in quicker.";

        if (tableParamExists) {
            returningNote.textContent = `The scanned QR code had an invalid table number. Please enter a table between 1 and ${SmartApp.TABLE_LIMIT}.`;
        }
    }

    async function autoFillReturningCustomer() {
        const phone = phoneInput.value.trim();
        if (!/^\d{10}$/.test(phone)) {
            updateLoginMode();
            return;
        }

        const customer = await SmartDB.getCustomerByPhone(phone);
        if (!customer) {
            updateLoginMode();
            return;
        }

        usernameInput.value = customer.name || "";
        if (isQrTableLogin) {
            returningNote.textContent = `Returning customer detected. Table ${qrTableNo} was linked from the QR code.`;
            return;
        }

        returningNote.textContent = "Returning customer detected. Just enter table number and sign in.";
    }

    async function login() {
        const name = usernameInput.value.trim();
        const phone = phoneInput.value.trim();
        const rawTableNo = tableInput.value.trim();

        if (!phone && !isQrTableLogin && !rawTableNo) {
            alert("Enter phone number and table number.");
            return;
        }

        if (!phone) {
            alert("Enter phone number.");
            return;
        }

        if (!/^\d{10}$/.test(phone)) {
            alert("Phone number must be 10 digits.");
            return;
        }

        if (!isQrTableLogin && !rawTableNo) {
            alert(`Enter a table number between 1 and ${SmartApp.TABLE_LIMIT}.`);
            return;
        }

        if (isAdminLogin(name, phone, rawTableNo)) {
            SmartApp.clearSession();
            SmartApp.setCart([]);
            SmartApp.clearOrderState();
            SmartApp.unlockAdmin();
            location.href = "admin.html";
            return;
        }

        const tableNo = isQrTableLogin ? qrTableNo : SmartApp.normalizeTableNumber(rawTableNo);

        if (!tableNo) {
            alert(`Enter a valid table number between 1 and ${SmartApp.TABLE_LIMIT}.`);
            return;
        }

        let finalName = name;

        try {
            const existing = await SmartDB.getCustomerByPhone(phone);
            if (!existing && !name) {
                alert("Enter name for first-time customer.");
                return;
            }

            if (!finalName && existing) {
                finalName = existing.name;
            }

            await SmartDB.upsertCustomer({
                phone,
                name: finalName,
                updatedAt: new Date().toISOString()
            });

            const visitAt = new Date().toISOString();
            await SmartDB.addVisit({
                name: finalName,
                phone,
                tableNo,
                createdAt: visitAt
            });

            SmartApp.setSession({
                name: finalName,
                phone,
                tableNo,
                loginAt: visitAt
            });
            SmartApp.lockAdmin();
            SmartApp.setCart([]);
            SmartApp.clearOrderState();

            location.href = "menu.html";
        } catch (error) {
            console.error(error);
            alert("Could not save login details.");
        }
    }

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        await login();
    });

    phoneInput.addEventListener("blur", async () => {
        await autoFillReturningCustomer();
    });

    try {
        updateLoginMode();
        await SmartDB.init();
    } catch (error) {
        console.error(error);
        alert("App initialization failed.");
    }
})();
