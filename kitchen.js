(function () {
    const session = SmartApp.requireSession("index.html");
    const order = SmartApp.requireOrderState("cart.html");

    if (!session || !order) {
        return;
    }

    const statusText = document.getElementById("statusText");
    const readyTime = document.getElementById("kitchenReadyTime");
    const paymentBtn = document.getElementById("paymentBtn");

    function updateKitchenStatus() {
        const currentOrder = SmartApp.getOrderState();
        if (!currentOrder) {
            location.replace("cart.html");
            return true;
        }

        readyTime.textContent = `Expected Ready Time: ${currentOrder.readyClock || "--"}`;

        if (SmartApp.getRemainingDemoMs(currentOrder) <= 0) {
            statusText.textContent = "Order Ready!";
            paymentBtn.classList.remove("d-none");
            return true;
        }

        statusText.textContent = "Preparing your order...";
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
