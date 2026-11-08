
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const balanceElement = document.getElementById("balance");
const earnButton = document.getElementById("earnButton");
const upgradeButton = document.getElementById("upgradeButton");

let state = null;
let busy = false;

function formatCoins(value) {
    return (value / 1000000000).toFixed(10).replace(".", ",");
}

function updateUI() {
    if (!state) return;

    balanceElement.textContent =
        formatCoins(state.balance) + " коинов";

    earnButton.textContent =
        "+" + formatCoins(state.income);

    upgradeButton.textContent =
        "Улучшение — " + formatCoins(state.upgrade_cost) + " коинов";
}

async function api(action = null) {
    const options = {
        method: action ? "POST" : "GET",
        headers: {
            "X-Telegram-Init-Data": tg.initData
        }
    };

    if (action) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify({ action });
    }

    const response = await fetch("/api/state", options);
    console.log("Telegram initData length:", tg.initData.length);
console.log("Request status:", response.status);

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Ошибка сервера");
    }

    return data;
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

async function performAction(action) {
    if (busy || !state) return;

    busy = true;
    earnButton.disabled = true;
    upgradeButton.disabled = true;

    try {
        state = await api(action);
        updateUI();

    } catch (error) {
        tg.showAlert(error.message);

    } finally {
        busy = false;
        earnButton.disabled = false;
        upgradeButton.disabled = false;
    }
}

earnButton.addEventListener("click", () => {
    performAction("earn");
});

upgradeButton.addEventListener("click", () => {
    performAction("upgrade");
});

loadGame();
