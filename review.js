(async function () {
    const AUTO_RETURN_MS = 30000;
    const reviewPageStatus = document.getElementById("reviewPageStatus");
    const reviewContent = document.getElementById("reviewContent");
    const reviewDoneBtn = document.getElementById("reviewDoneBtn");
    const params = new URLSearchParams(window.location.search);
    const billNo = Number(params.get("billNo"));

    let currentBill = null;
    let selectedRating = 0;
    let autoReturnTimer = null;

    reviewDoneBtn.addEventListener("click", () => {
        window.location.href = "index.html";
    });

    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function getSavedRating(bill) {
        return Math.max(0, Math.min(5, Number(bill && bill.reviewRating || 0)));
    }

    function hasSavedReview(bill) {
        return getSavedRating(bill) > 0 || String((bill && bill.reviewFeedback) || "").trim() !== "";
    }

    function isReviewLocked(bill) {
        return Boolean(bill && bill.reviewedAt);
    }

    function buildRatingButtons(activeRating, isLocked = false) {
        return [1, 2, 3, 4, 5].map((value) => `
            <button
                type="button"
                class="rating-star${value <= activeRating ? " active" : ""}"
                data-rating="${value}"
                aria-label="${value} star"
                ${isLocked ? "disabled" : ""}
            >
                &#9733;
            </button>
        `).join("");
    }

    function buildReviewStatusText(bill) {
        if (!hasSavedReview(bill)) {
            return "Select 1 to 5 stars. Feedback is optional.";
        }

        const rating = getSavedRating(bill);
        const reviewedAt = bill.reviewedAt
            ? ` Saved on ${escapeHTML(SmartApp.formatDateTime(bill.reviewedAt))}.`
            : "";
        return `Saved rating: ${escapeHTML(String(rating))}/5.${reviewedAt}`;
    }

    function setReviewStatus(message, statusType) {
        const reviewStatus = document.getElementById("reviewStatus");
        if (!reviewStatus) {
            return;
        }

        reviewStatus.textContent = message;
        reviewStatus.classList.remove("success", "error");

        if (statusType) {
            reviewStatus.classList.add(statusType);
        }
    }

    function updateRatingButtons() {
        document.querySelectorAll(".rating-star").forEach((button) => {
            const buttonRating = Number(button.dataset.rating || 0);
            button.classList.toggle("active", buttonRating <= selectedRating);
        });
    }

    function startAutoReturnTimer() {
        clearTimeout(autoReturnTimer);
        autoReturnTimer = setTimeout(() => {
            window.location.replace("index.html");
        }, AUTO_RETURN_MS);
    }

    function renderMissingReview(message) {
        reviewPageStatus.textContent = message;
        reviewContent.innerHTML = `
            <div class="review-empty-state">
                <h4 class="mb-2">Review Not Available</h4>
                <p class="mb-0">${escapeHTML(message)}</p>
            </div>
        `;
    }

    function buildReviewMarkup(bill) {
        return `
            <div class="review-stack">
                <section class="review-form-card">
                    <h4 class="mb-1">Rate Your Experience</h4>
                    <p class="mb-0 review-help">${isReviewLocked(bill) ? "Review already submitted. No more updates are allowed." : "Choose 1 to 5 stars. Feedback is optional."}</p>

                    <div id="ratingStars" class="rating-stars" role="radiogroup" aria-label="Select a rating">
                        ${buildRatingButtons(getSavedRating(bill), isReviewLocked(bill))}
                    </div>

                    <label class="review-label" for="feedbackInput">Feedback</label>
                    <textarea id="feedbackInput" class="review-textarea" rows="4" placeholder="Write feedback if you want..."${isReviewLocked(bill) ? " disabled" : ""}>${escapeHTML(bill.reviewFeedback || "")}</textarea>

                    <div class="review-actions">
                        ${isReviewLocked(bill) ? "" : `
                            <button id="saveReviewBtn" class="btn btn-primary" type="button">Save Review</button>
                        `}
                        <p id="reviewStatus" class="review-status${hasSavedReview(bill) ? " success" : ""}">
                            ${isReviewLocked(bill) ? "Review already submitted." : buildReviewStatusText(bill)}
                        </p>
                    </div>
                </section>
            </div>
        `;
    }

    async function saveReview() {
        const feedbackInput = document.getElementById("feedbackInput");
        const saveReviewBtn = document.getElementById("saveReviewBtn");

        if (!feedbackInput || !saveReviewBtn || !currentBill) {
            return;
        }

        if (selectedRating < 1 || selectedRating > 5) {
            setReviewStatus("Please select a star rating before saving.", "error");
            return;
        }

        saveReviewBtn.disabled = true;

        try {
            const updatedBill = {
                ...currentBill,
                reviewFeedback: feedbackInput.value.trim(),
                reviewRating: selectedRating,
                reviewedAt: new Date().toISOString()
            };

            await SmartDB.saveBill(updatedBill);
            currentBill = updatedBill;
            reviewDoneBtn.textContent = "New Order";
            clearTimeout(autoReturnTimer);
            setReviewStatus("Review saved. Redirecting to new order...", "success");
            setTimeout(() => {
                window.location.replace("index.html");
            }, 700);
        } catch (error) {
            console.error(error);
            setReviewStatus("Could not save the review right now.", "error");
        } finally {
            saveReviewBtn.disabled = false;
        }
    }

    function bindReviewUI() {
        if (isReviewLocked(currentBill)) {
            return;
        }

        document.querySelectorAll(".rating-star").forEach((button) => {
            button.addEventListener("click", () => {
                selectedRating = Number(button.dataset.rating || 0);
                updateRatingButtons();
                setReviewStatus(`Selected rating: ${selectedRating}/5`, "");
            });
        });

        const saveReviewBtn = document.getElementById("saveReviewBtn");
        if (saveReviewBtn) {
            saveReviewBtn.addEventListener("click", async () => {
                await saveReview();
            });
        }
    }

    function renderReviewPage(bill) {
        currentBill = bill;
        selectedRating = getSavedRating(bill);
        reviewPageStatus.textContent = isReviewLocked(bill)
            ? `Bill ${SmartApp.formatBillNumber(bill.billNo)} review is already submitted. Returning to new order in 30 seconds.`
            : `Bill ${SmartApp.formatBillNumber(bill.billNo)} is ready for rating and feedback. Returning to new order in 30 seconds if not submitted.`;
        reviewContent.innerHTML = buildReviewMarkup(bill);
        bindReviewUI();
        startAutoReturnTimer();
    }

    if (!Number.isInteger(billNo) || billNo <= 0) {
        renderMissingReview("A valid bill number was not provided.");
        return;
    }

    try {
        await SmartDB.init();
        const bill = await SmartDB.getBillByNumber(billNo);

        if (!bill) {
            renderMissingReview(`Bill ${SmartApp.formatBillNumber(billNo)} was not found.`);
            return;
        }

        renderReviewPage(bill);
    } catch (error) {
        console.error(error);
        renderMissingReview("Could not load the review page right now.");
    }
})();
