
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

// 1 внутренняя единица = 0.000000001 коина
let balance = 0;
let income = 0.5;
let upgradeCost = 1024;

const balanceElement = document.getElementById("balance");
const earnButton = document.getElementById("earnButton");
const upgradeButton = document.getElementById("upgradeButton");

function formatCoins(value) {
    return (value / 1000000000).toFixed(10).replace(".", ",");
}

function updateUI() {
    balanceElement.textContent = formatCoins(balance) + " коинов";
    earnButton.textContent = "+" + formatCoins(income);

    upgradeButton.textContent =
        "Улучшение — " + formatCoins(upgradeCost) + " коинов";
}

earnButton.addEventListener("click", () => {
    balance += income;
    updateUI();
});

upgradeButton.addEventListener("click", () => {
    if (balance < upgradeCost) {
        tg.showAlert("Недостаточно коинов!");
        return;
    }

    balance -= upgradeCost;
    income *= 2;
    upgradeCost *= 2;

    updateUI();
    tg.showAlert("Улучшение куплено!");
});

updateUI();

