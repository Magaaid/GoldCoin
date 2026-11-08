const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

// Сохранение данных
let savedData;

try {
    savedData = JSON.parse(localStorage.getItem("goldcoin_data"));
} catch {
    savedData = null;
}

let balance = savedData?.balance ?? 0;
let income = savedData?.income ?? 0.5;
let upgradeCost = savedData?.upgradeCost ?? 1024;

const balanceElement = document.getElementById("balance");
const earnButton = document.getElementById("earnButton");
const upgradeButton = document.getElementById("upgradeButton");

function saveData() {
    localStorage.setItem("goldcoin_data", JSON.stringify({
        balance,
        income,
        upgradeCost
    }));
}

function formatCoins(value) {
    return (value / 1000000000)
        .toFixed(10)
        .replace(".", ",");
}

function updateUI() {
    balanceElement.textContent =
        formatCoins(balance) + " коинов";

    earnButton.textContent =
        "+" + formatCoins(income);

    upgradeButton.textContent =
        "Улучшение — " + formatCoins(upgradeCost) + " коинов";

    saveData();
}

earnButton.addEventListener("click", () => {
    balance += income;
    updateUI();
});

upgradeButton.addEventListener("click", () => {
    if (balance < upgradeCost) {
        if (tg) {
            tg.showAlert("Недостаточно коинов!");
        } else {
            alert("Недостаточно коинов!");
        }
        return;
    }

    balance -= upgradeCost;
    income *= 2;
    upgradeCost *= 2;

    updateUI();

    if (tg) {
        tg.showAlert("Улучшение куплено!");
    }
});

updateUI();
