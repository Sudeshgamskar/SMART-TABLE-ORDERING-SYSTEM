(function () {
    const session = SmartApp.requireSession("index.html");
    const order = SmartApp.requireOrderState("cart.html");

    if (!session || !order) {
        return;
    }

    const statusText = document.getElementById("statusText");
    const readyTime = document.getElementById("kitchenReadyTime");
    const paymentBtn = document.getElementById("paymentBtn");
    const kitchenGuestName = document.getElementById("kitchenGuestName");
    const kitchenTableNo = document.getElementById("kitchenTableNo");
    const kitchenHint = document.getElementById("kitchenHint");
    const kitchenStageBadge = document.getElementById("kitchenStageBadge");
    const kitchenProgressBar = document.getElementById("kitchenProgressBar");
    const kitchenProgressText = document.getElementById("kitchenProgressText");
    const kitchenProgressPercent = document.getElementById("kitchenProgressPercent");

    kitchenGuestName.textContent = session.name || "Guest";
    kitchenTableNo.textContent = session.tableNo || "-";

    function setProgress(currentOrder) {
        const totalMs = Math.max(Number(currentOrder.totalTime || 0) * SmartApp.DEMO_TIME_MS, 1);
        const remainingMs = SmartApp.getRemainingDemoMs(currentOrder);
        const progress = Math.max(0, Math.min(1, 1 - (remainingMs / totalMs)));
        const percent = Math.round(progress * 100);

        kitchenProgressBar.style.width = `${percent}%`;
        kitchenProgressPercent.textContent = `${percent}%`;

        if (percent >= 85) {
            kitchenProgressText.textContent = "Final touches and plating";
        } else if (percent >= 45) {
            kitchenProgressText.textContent = "Dishes are actively being prepared";
        } else {
            kitchenProgressText.textContent = "Order accepted by the kitchen";
        }
    }

    function updateKitchenStatus() {
        const currentOrder = SmartApp.getOrderState();
        if (!currentOrder) {
            location.replace("cart.html");
            return true;
        }

        readyTime.textContent = `Expected ready time: ${currentOrder.readyClock || "--"}`;
        setProgress(currentOrder);

        if (SmartApp.getRemainingDemoMs(currentOrder) <= 0) {
            statusText.textContent = "Order Ready To Serve";
            kitchenHint.textContent = "Everything for this table is ready. Open the bill to continue to payment and review.";
            kitchenStageBadge.textContent = "Ready";
            kitchenProgressBar.style.width = "100%";
            kitchenProgressPercent.textContent = "100%";
            kitchenProgressText.textContent = "Ready for billing and payment";
            document.body.classList.add("order-ready");
            paymentBtn.classList.remove("d-none");
            return true;
        }

        statusText.textContent = "Preparing Your Order";
        kitchenHint.textContent = "The kitchen has started your dishes and we'll update this screen automatically.";
        kitchenStageBadge.textContent = "Preparing";
        document.body.classList.remove("order-ready");
        paymentBtn.classList.add("d-none");
        return false;
    }

    paymentBtn.addEventListener("click", () => {
        location.href = "bill.html";
    });

    const isReady = updateKitchenStatus();
    if (!isReady) {
        const timer = setInterval(() => {
            const finished = updateKitchenStatus();
            if (finished) {
                clearInterval(timer);
            }
        }, 500);
    }
})();
