
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const balanceElement = document.getElementById("balance");
const earnButton = document.getElementById("earnButton");
const upgradeButton = document.getElementById("upgradeButton");

let state = null;
let pendingClicks = 0;
let flushTimer = null;
let flushPromise = null;
let upgrading = false;

function formatCoins(value) {
    return (value / 1000000000).toFixed(10).replace(".", ",");
}

function updateUI() {
    if (!state) return;

    const displayedBalance =
        state.balance + pendingClicks * state.income;

    balanceElement.textContent =
        formatCoins(displayedBalance) + " коинов";

    earnButton.textContent =
        "+" + formatCoins(state.income);

    upgradeButton.textContent =
        "Улучшение — " +
        formatCoins(state.upgrade_cost) +
        " коинов";
}

async function api(action = null, count = null) {
    const options = {
        method: action ? "POST" : "GET",
        headers: {
            "X-Telegram-Init-Data": tg.initData
        }
    };

    if (action) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify({ action, count });
    }

    const response = await fetch("/api/state", options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Ошибка сервера");
    }

    return data;
}

function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);

    flushTimer = setTimeout(() => {
        flushQueue().catch(error => {
            tg.showAlert("Ошибка сохранения: " + error.message);
        });
    }, 120);
}

async function flushQueue() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    if (flushPromise) {
        await flushPromise;

        if (pendingClicks > 0) {
            return flushQueue();
        }

        return;
    }

    flushPromise = (async () => {
        while (pendingClicks > 0) {
            const count = Math.min(pendingClicks, 1000);

            try {
                const result = await api("earn_batch", count);

                pendingClicks -= count;
                state = result;
                updateUI();

            } catch (error) {
                throw error;
            }
        }
    })();

    try {
        await flushPromise;
    } finally {
        flushPromise = null;

        if (pendingClicks > 0 && !flushTimer) {
            scheduleFlush();
        }
    }
}

function earn() {
    if (!state || upgrading) return;

    pendingClicks++;
    updateUI();
    scheduleFlush();
}

async function upgrade() {
    if (!state || upgrading) return;

    upgrading = true;
    upgradeButton.disabled = true;

    try {
        await flushQueue();

        state = await api("upgrade");
        updateUI();

    } catch (error) {
        tg.showAlert(error.message);

    } finally {
        upgrading = false;
        upgradeButton.disabled = false;
    }
}

async function loadGame() {
    try {
        if (!tg.initData) {
            throw new Error("Открой игру через Telegram");
        }

        state = await api();
        updateUI();

    } catch (error) {
        tg.showAlert("Не удалось загрузить игру: " + error.message);
    }
}

earnButton.addEventListener("click", earn);
upgradeButton.addEventListener("click", upgrade);

loadGame();
