(async function () {
    // Change these three values if you want a different admin login.
    const ADMIN_LOGIN = {
        name: "Admin",
        phone: "7418529630",
        tableNo: "420"
    };

    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const phoneInput = document.getElementById("phoneNo");
    const tableInput = document.getElementById("tableNo");
    const returningNote = document.getElementById("returningNote");

    function isAdminLogin(name, phone, tableNo) {
        return name.toLowerCase() === ADMIN_LOGIN.name.toLowerCase()
            && phone === ADMIN_LOGIN.phone
            && tableNo === ADMIN_LOGIN.tableNo;
    }

    async function autoFillReturningCustomer() {
        const phone = phoneInput.value.trim();
        if (!/^\d{10}$/.test(phone)) {
            returningNote.textContent = "";
            return;
        }

        const customer = await SmartDB.getCustomerByPhone(phone);
        if (!customer) {
            returningNote.textContent = "";
            return;
        }

        usernameInput.value = customer.name || "";
        returningNote.textContent = "Returning customer detected. Just enter table number and sign in.";
    }

    async function login() {
        const name = usernameInput.value.trim();
        const phone = phoneInput.value.trim();
        const tableNo = tableInput.value.trim();

        if (!phone || !tableNo) {
            alert("Enter phone number and table number.");
            return;
        }

        if (!/^\d{10}$/.test(phone)) {
            alert("Phone number must be 10 digits.");
            return;
        }

        if (isAdminLogin(name, phone, tableNo)) {
            SmartApp.clearSession();
            SmartApp.setCart([]);
            SmartApp.clearOrderState();
            SmartApp.unlockAdmin();
            location.href = "admin.html";
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
        await SmartDB.init();
    } catch (error) {
        console.error(error);
        alert("App initialization failed.");
    }
})();
