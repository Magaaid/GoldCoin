Const tg = window.Telegram.WebApp;

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

    balanceElement.textContent =
        formatCoins(state.balance + pendingClicks * state.income) +
        " байтов";

    earnButton.textContent = "+" + formatCoins(state.income);
    upgradeButton.textContent =
        "Улучшение — " + formatCoins(state.upgrade_cost) + " байтов";
    
    updateBonusButtonCost();
}

async function api(action = null, extra = {}) {
    const options = {
        method: action ? "POST" : "GET",
        headers: { "X-Telegram-Init-Data": tg.initData }
    };

    if (action) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify({ action, ...extra });
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
        if (pendingClicks > 0) return flushQueue();
        return;
    }

    flushPromise = (async () => {
        while (pendingClicks > 0) {
            const count = Math.min(pendingClicks, 1000);
            const result = await api("earn_batch", { count });
            pendingClicks -= count;
            state = result;
            updateUI();
        }
    })();

    try {
        await flushPromise;
    } finally {
        flushPromise = null;
    }
}

function earn() {
    if (!state || upgrading || spinning) return;
    pendingClicks++;
    updateUI();
    scheduleFlush();
}

async function upgrade() {
    if (!state || upgrading || spinning) return;
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

// РУЛЕТКА
const numbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17,
    34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31,
    9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

const wheel = document.getElementById("wheel");
const ball = document.getElementById("ball");
const spinButton = document.getElementById("spinButton");
const resultElement = document.getElementById("rouletteResult");
const messageElement = document.getElementById("rouletteMessage");
const historyElement = document.getElementById("rouletteHistory");

const SEGMENT = 360 / numbers.length;
let spinning = false;
let wheelRotation = 0;
let history = [];
let labels = [];

function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
}

function getColor(number) {
    if (number === 0) return "green";
    return redNumbers.includes(number) ? "red" : "black";
}

function getColorHex(number) {
    const color = getColor(number);
    if (color === "red") return "#b92c35";
    if (color === "green") return "#16834b";
    return "#171923";
}

function updateLabels(rotation) {
    labels.forEach(label => {
        const angle = Number(label.dataset.angle);
        label.style.transform = `rotate(${angle}deg) translateY(-108px) rotate(${-angle - rotation}deg)`;
    });
}

function createWheel() {
    const gradient = numbers.map((number, index) => {
        const start = index * SEGMENT;
        const end = (index + 1) * SEGMENT;
        return `${getColorHex(number)} ${start}deg ${end}deg`;
    });

    wheel.style.background = `conic-gradient(${gradient.join(",")})`;
    wheel.querySelectorAll(".wheel-number").forEach(el => el.remove());
    labels = [];

    numbers.forEach((number, index) => {
        const label = document.createElement("div");
        const angle = (index + 0.5) * SEGMENT;

        label.className = "wheel-number";
        label.textContent = number;
        label.dataset.angle = angle;

        label.style.position = "absolute";
        label.style.left = "50%";
        label.style.top = "50%";
        label.style.width = "24px";
        label.style.height = "18px";
        label.style.lineHeight = "18px";
        label.style.marginLeft = "-12px";
        label.style.marginTop = "-9px";
        label.style.textAlign = "center";
        label.style.fontSize = "11px";
        label.style.fontWeight = "bold";
        label.style.color = "white";
        label.style.pointerEvents = "none";
        label.style.zIndex = "2";

        wheel.appendChild(label);
        labels.push(label);
    });

    updateLabels(0);
}

const wheelFrame = wheel ? wheel.parentElement : null;
if (ball && wheelFrame) {
    wheelFrame.appendChild(ball);
    ball.style.transform = "translate(-50%, -50%)";
}

function setBallPosition(angle, radius) {
    const rad = angle * Math.PI / 180;
    const x = Math.sin(rad) * radius;
    const y = -Math.cos(rad) * radius;
    ball.style.left = `calc(50% + ${x}px)`;
    ball.style.top = `calc(50% + ${y}px)`;
}

function getTargetRotation(index) {
    const sectorCenter = (index + 0.5) * SEGMENT;
    const desired = normalizeAngle(-sectorCenter);
    const current = normalizeAngle(wheelRotation);
    const extra = normalizeAngle(desired - current);
    return wheelRotation + 360 * 7 + extra;
}

function renderHistory() {
    historyElement.innerHTML = "";
    history.forEach(item => {
        const chip = document.createElement("span");
        chip.textContent = item.number;
        chip.style.display = "inline-grid";
        chip.style.placeItems = "center";
        chip.style.width = "32px";
        chip.style.height = "32px";
        chip.style.borderRadius = "50%";
        chip.style.background = getColorHex(item.number);
        chip.style.color = "white";
        chip.style.fontWeight = "bold";
        historyElement.appendChild(chip);
    });
}

function showResult(number) {
    const color = getColor(number);
    resultElement.textContent = number;
    resultElement.style.color = color === "red" ? "#ff525b" : color === "green" ? "#39d98a" : "white";
    messageElement.textContent = color === "green" ? "Зелёное" : color === "red" ? "Красное" : "Чёрное";

    history.unshift({ number });
    history = history.slice(0, 12);
    renderHistory();
}

function animateSpin(number, onDone) {
    const index = numbers.indexOf(number);
    const duration = 6500;
    const startTime = performance.now();
    const startRotation = wheelRotation;
    const targetRotation = getTargetRotation(index);
    const ballTurns = 7;

    function frame(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentRotation = startRotation + (targetRotation - startRotation) * eased;

        wheel.style.transform = `rotate(${currentRotation}deg)`;
        updateLabels(currentRotation);

        const ballAngle = -360 * ballTurns * eased;
        const drop = Math.max(0, (progress - 0.82) / 0.18);
        const radius = 119 - 22 * drop;

        setBallPosition(ballAngle, radius);

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            wheelRotation = targetRotation;
            wheel.style.transform = `rotate(${wheelRotation}deg)`;
            updateLabels(wheelRotation);
            setBallPosition(0, 97);
            onDone();
        }
    }
    requestAnimationFrame(frame);
}

async function spin() {
    if (spinning || upgrading || !wheel || !ball || !state) return;
    if (!selectedPrediction) {
        tg.showAlert("Сначала выбери прогноз");
        return;
    }

    const amount = parseBet();
    if (!betAll && !amount) {
        tg.showAlert("Введи сумму ставки (мин. 100 байтов)");
        return;
    }

    spinning = true;
    spinButton.disabled = true;
    resultElement.textContent = "?";
    messageElement.textContent = "Колесо вращается...";

    let result;
    try {
        await flushQueue();
        result = await api("spin", { choice: selectedPrediction, amount: amount, all: betAll });
    } catch (error) {
        tg.showAlert(error.message);
        messageElement.textContent = "Нажми, чтобы запустить колесо";
        spinning = false;
        spinButton.disabled = false;
        return;
    }

    const balanceBefore = state.balance;
    const choiceName = predictionNames[selectedPrediction];

    animateSpin(result.number, () => {
        state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        updateUI();
        showResult(result.number);

        const delta = Math.abs(result.balance - balanceBefore);
        predictionStatus.textContent = result.win
            ? `Победа! ${choiceName}. Выпало ${result.number}. +${formatCoins(delta)} байтов`
            : `Проигрыш. ${choiceName}. Выпало ${result.number}. −${formatCoins(delta)} байтов`;

        selectedPrediction = null;
        predictionButtons.forEach(item => item.classList.remove("selected"));
        spinning = false;
        spinButton.disabled = false;
    });
}

if (wheel) createWheel();
if (spinButton) spinButton.addEventListener("click", spin);

async function loadGame() {
    try {
        if (!tg.initData) throw new Error("Открой игру через Telegram");
        state = await api();
        updateUI();
    } catch (error) {
        tg.showAlert("Не удалось загрузить игру: " + error.message);
    }
}

earnButton.addEventListener("click", earn);
upgradeButton.addEventListener("click", upgrade);
loadGame();

// СТАВКА И БОНУСКА
let betAll = false;
const betInput = document.getElementById("betInput");
const quickButtons = document.querySelectorAll(".prediction-option[data-fraction]");
const buyBonusButton = document.getElementById("buyBonusButton");

function parseBet() {
    const raw = betInput.value.trim().replace(",", ".");
    const coins = Number(raw);
    if (!raw || !Number.isFinite(coins) || coins < 1) return null;
    return Math.round(coins * 1000000000);
}

function updateBonusButtonCost() {
    if (!buyBonusButton) return;
    let amount = parseBet();
    if (betAll && state) {
        amount = state.balance;
    }
    
    if (amount && amount > 0) {
        const bonusCost = amount * 100;
        buyBonusButton.textContent = `🎁 КУПИТЬ БОНУСКУ — ${formatCoins(bonusCost)}`;
    } else {
        buyBonusButton.textContent = `🎁 КУПИТЬ БОНУСКУ (×100)`;
    }
}

betInput.addEventListener("input", () => {
    betAll = false;
    quickButtons.forEach(item => item.classList.remove("selected"));
    updateBonusButtonCost();
});

quickButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (spinning || !state) return;
        const fraction = Number(button.dataset.fraction);
        quickButtons.forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        betAll = fraction === 1;
        betInput.value = formatCoins(Math.floor(state.balance * fraction));
        updateBonusButtonCost();
    });
});

// ПРОГНОЗЫ РУЛЕТКИ
let selectedPrediction = null;
const predictionStatus = document.getElementById("predictionStatus");
const predictionButtons = document.querySelectorAll(".prediction-option[data-choice]");
const predictionMultipliers = { red: 1.9, black: 1.9, even: 1.9, odd: 1.9, zero: 36 };
const predictionNames = { red: "Красное", black: "Чёрное", even: "Чётное", odd: "Нечётное", zero: "Ноль" };

predictionButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (spinning) return;
        predictionButtons.forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        selectedPrediction = button.dataset.choice;
        predictionStatus.textContent = "Прогноз: " + predictionNames[selectedPrediction] + " ×" + predictionMultipliers[selectedPrediction];
    });
});

// МОНЕТКА
let selectedCoin = null;
let coinRotation = 0;
const coinElement = document.getElementById("coin");
const coinButton = document.getElementById("coinButton");
const coinStatus = document.getElementById("coinStatus");
const coinChoiceButtons = document.querySelectorAll(".prediction-option[data-coin]");
const coinNames = { heads: "Орёл", tails: "Решка" };

coinChoiceButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (spinning) return;
        coinChoiceButtons.forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        selectedCoin = button.dataset.coin;
        coinStatus.textContent = "Выбрано: " + coinNames[selectedCoin] + " ×1.9";
    });
});

function animateCoin(side, onDone) {
    const needed = side === "heads" ? 0 : 180;
    const current = normalizeAngle(coinRotation);
    const extra = normalizeAngle(needed - current);
    coinRotation = coinRotation + 360 * 5 + extra;
    coinElement.style.transform = `rotateY(${coinRotation}deg)`;
    setTimeout(onDone, 2100);
}

async function flipCoin() {
    if (spinning || upgrading || !state) return;
    if (!selectedCoin) {
        tg.showAlert("Сначала выбери орла или решку");
        return;
    }

    const amount = parseBet();
    if (!betAll && !amount) {
        tg.showAlert("Введи сумму ставки (мин. 100 байтов)");
        return;
    }

    spinning = true;
    coinButton.disabled = true;
    coinStatus.textContent = "Монета в воздухе...";

    let result;
    try {
        await flushQueue();
        result = await api("coin", { choice: selectedCoin, amount: amount, all: betAll });
    } catch (error) {
        tg.showAlert(error.message);
        coinStatus.textContent = "Выбери сторону и сумму ставки";
        spinning = false;
        coinButton.disabled = false;
        return;
    }

    const balanceBefore = state.balance;
    const choiceName = coinNames[selectedCoin];

    animateCoin(result.side, () => {
        state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        updateUI();

        const delta = Math.abs(result.balance - balanceBefore);
        const sideName = coinNames[result.side];

        coinStatus.textContent = result.win
            ? `Победа! Выпал ${sideName}. +${formatCoins(delta)} байтов`
            : `Проигрыш. Выпал ${sideName} (ты ставил на ${choiceName.toLowerCase()}). −${formatCoins(delta)} байтов`;

        selectedCoin = null;
        coinChoiceButtons.forEach(item => item.classList.remove("selected"));
        spinning = false;
        coinButton.disabled = false;
    });
}
if (coinButton) coinButton.addEventListener("click", flipCoin);

// СЛОТЫ И БОНУСКА (GATES OF OLYMPUS — ЗАМЕДЛЕННЫЕ И ПЛАВНЫЕ)
const slotGridElement = document.getElementById("slotGrid");
const slotButton = document.getElementById("slotButton");
const slotStatus = document.getElementById("slotStatus");
const zeusBadge = document.getElementById("zeusMultiplierBadge");

const symbolData = {
    1: { icon: "💎", name: "Кристалл" }, 
    2: { icon: "🟢", name: "Зеленый камень" }, 
    3: { icon: "🟡", name: "Желтый камень" },
    4: { icon: "🟠", name: "Оранжевый камень" }, 
    5: { icon: "🟣", name: "Фиолетовый камень" }, 
    6: { icon: "🏆", name: "Чаша" },
    7: { icon: "💍", name: "Кольцо" }, 
    8: { icon: "⏳", name: "Песочные часы" }, 
    9: { icon: "👑", name: "Корона" },
    10: { icon: "⚡", name: "Зевс (Scatter)" }
};

const multiplierOrbs = [2, 3, 4, 5, 8, 10, 15, 20, 25, 50, 100, 250, 500];

function renderSlotGrid(grid, animate = true) {
    if (!slotGridElement) return;
    slotGridElement.innerHTML = "";
    
    grid.forEach((row, rIndex) => {
        row.forEach((cellData, cIndex) => {
            const cell = document.createElement("div");
            cell.className = "slot-cell";
            if (animate) {
                cell.classList.add("animate-drop");
                cell.style.animationDelay = `${cIndex * 100}ms`;
            }

            if (typeof cellData === "object" && cellData !== null && cellData.isOrb) {
                cell.classList.add("multiplier-orb");
                cell.textContent = `x${cellData.multiplier}`;
            } else {
                const sym = typeof cellData === "number" ? cellData : cellData.sym;
                if (sym === 10) cell.classList.add("scatter-cell");
                if (sym >= 8) cell.classList.add("high-cell");
                cell.textContent = symbolData[sym]?.icon || "💎";
            }

            slotGridElement.appendChild(cell);
        });
    });
}

function generateRandomGridWithOrbs() {
    return Array.from({ length: 5 }, () =>
        Array.from({ length: 6 }, () => {
            if (Math.random() < 0.07) {
                const rand = Math.random();
                let multiplier = 2;
                if (rand > 0.95) multiplier = 500;
                else if (rand > 0.90) multiplier = 100;
                else if (rand > 0.80) multiplier = 50;
                else if (rand > 0.65) multiplier = 25;
                else if (rand > 0.45) multiplier = 10;
                else if (rand > 0.25) multiplier = 5;
                else multiplier = multiplierOrbs[Math.floor(Math.random() * 4)];

                return { isOrb: true, multiplier: multiplier };
            }
            return Math.floor(Math.random() * 9) + 1;
        })
    );
}

async function requestSlotSpin(isBonus = false) {
    if (spinning || upgrading || !state) return;

    let amount = parseBet();
    if (betAll) amount = state.balance;
    if (!amount) amount = 1000000000;

    spinning = true;
    slotButton.disabled = true;
    buyBonusButton.disabled = true;

    let result;
    try {
        await flushQueue();
        result = await api("slot", { amount: amount, all: betAll, isBonus: isBonus });
    } catch (error) {
        tg.showAlert(error.message);
        slotStatus.textContent = error.message;
        spinning = false;
        slotButton.disabled = false;
        buyBonusButton.disabled = false;
        return;
    }

    if (isBonus) {
        let currentSpin = 1;
        slotStatus.textContent = `🎁 БОНУСКА АКТИВИРОВАНА! Спин 1 из 15...`;
        zeusBadge.textContent = `⚡ ×1`;

        const runBonusSpin = () => {
            if (currentSpin <= 15) {
                slotStatus.textContent = `🎁 Бесплатное вращение ${currentSpin} из 15...`;
                
                let steps = 0;
                const innerInterval = setInterval(() => {
                    renderSlotGrid(generateRandomGridWithOrbs(), false);
                    steps++;
                    if (steps > 5) {
                        clearInterval(innerInterval);
                        currentSpin++;
                        setTimeout(runBonusSpin, 700);
                    }
                }, 200);

            } else {
                renderSlotGrid(result.grid, true);

                state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                updateUI();

                zeusBadge.textContent = `⚡ ×${result.zeus}`;
                if (result.zeus > 0) {
                    const frame = document.querySelector(".olympus-frame");
                    if (frame) {
                        frame.classList.remove("zeus-flash");
                        void frame.offsetWidth;
                        frame.classList.add("zeus-flash");
                    }
                }

                const bonusCost = amount * 100;
                const netProfit = (amount * result.slotMultiplier) - bonusCost;
                const formattedDelta = formatCoins(Math.abs(netProfit));

                if (netProfit >= 0) {
                    slotStatus.textContent = `🎉 БОНУСКА ЗАВЕРШЕНА! Множитель ×${result.slotMultiplier}! Выигрыш: +${formattedDelta} байтов`;
                } else {
                    slotStatus.textContent = `💀 БОНУСКА ЗАВЕРШЕНА! Множитель ×${result.slotMultiplier}. В минус: −${formattedDelta} байтов`;
                }

                spinning = false;
                slotButton.disabled = false;
                buyBonusButton.disabled = false;
            }
        };

        runBonusSpin();

    } else {
        slotStatus.textContent = `⚡ Барабаны крутятся...`;
        
        let delay = 120;
        let counter = 0;
        const totalSteps = 22;

        const stepSpin = () => {
            renderSlotGrid(generateRandomGridWithOrbs(), false);
            counter++;

            if (counter < totalSteps) {
                delay += 35;
                setTimeout(stepSpin, delay);
            } else {
                renderSlotGrid(result.grid, true);

                state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                updateUI();

                zeusBadge.textContent = `⚡ ×${result.zeus}`;
                if (result.zeus > 0) {
                    const frame = document.querySelector(".olympus-frame");
                    if (frame) {
                        frame.classList.remove("zeus-flash");
                        void frame.offsetWidth;
                        frame.classList.add("zeus-flash");
                    }
                }

                if (result.win) {
                    slotStatus.textContent = `⚡ Победа! Множитель ×${result.slotMultiplier}! +${formatCoins(Math.abs(amount * result.slotMultiplier - amount))} байтов`;
                } else {
                    slotStatus.textContent = `Манна богов исчерпана. Попробуй еще!`;
                }

                spinning = false;
                slotButton.disabled = false;
                buyBonusButton.disabled = false;
            }
        };

        stepSpin();
    }
}

if (slotButton) slotButton.addEventListener("click", () => requestSlotSpin(false));
if (buyBonusButton) buyBonusButton.addEventListener("click", () => requestSlotSpin(true));

renderSlotGrid(generateRandomGridWithOrbs(), false);

// ПРОМОКОДЫ
const promoInput = document.getElementById("promoInput");
const promoButton = document.getElementById("promoButton");
const promoStatus = document.getElementById("promoStatus");

async function redeemPromo() {
    const code = promoInput.value.trim();
    if (!code) {
        promoStatus.textContent = "Введите промокод!";
        promoStatus.style.color = "#ff525b";
        return;
    }

    promoButton.disabled = true;
    promoStatus.textContent = "Проверка...";
    promoStatus.style.color = "#aab1c0";

    try {
        await flushQueue();
        const result = await api("redeem_promo", { code });

        state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        updateUI();

        promoStatus.textContent = `🎉 Промокод активирован! Награда зачислена.`;
        promoStatus.style.color = "#39d98a";
        promoInput.value = "";
    } catch (error) {
        promoStatus.textContent = error.message;
        promoStatus.style.color = "#ff525b";
    } finally {
        promoButton.disabled = false;
    }
}

if (promoButton) promoButton.addEventListener("click", redeemPromo);

// ПЕРЕВОДЫ ПО ЮЗЕРНЕЙМУ
const transferTargetInput = document.getElementById("transferTargetInput");
const transferAmountInput = document.getElementById("transferAmountInput");
const transferButton = document.getElementById("transferButton");
const transferStatus = document.getElementById("transferStatus");

async function makeTransfer() {
    if (spinning || upgrading || !state) return;

    let targetUsername = transferTargetInput.value.trim().replace(/^@/, "").toLowerCase();
    const rawAmount = transferAmountInput.value.trim().replace(",", ".");
    const coins = Number(rawAmount);

    if (!targetUsername) {
        transferStatus.textContent = "Введи юзернейм получателя!";
        transferStatus.style.color = "#ff525b";
        return;
    }

    if (!rawAmount || !Number.isFinite(coins) || coins <= 0) {
        transferStatus.textContent = "Введи корректную сумму перевода!";
        transferStatus.style.color = "#ff525b";
        return;
    }

    const amount = Math.round(coins * 1000000000);

    if (amount > state.balance) {
        transferStatus.textContent = "Недостаточно байтов на балансе!";
        transferStatus.style.color = "#ff525b";
        return;
    }

    transferButton.disabled = true;
    transferStatus.textContent = "Выполняется перевод...";
    transferStatus.style.color = "#aab1c0";

    try {
        await flushQueue();
        const result = await api("transfer", { targetUsername, amount });

        state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        updateUI();

        transferStatus.textContent = `🎉 Успешно! Переведено ${formatCoins(amount)} байтов игроку @${targetUsername}`;
        transferStatus.style.color = "#39d98a";
        transferTargetInput.value = "";
        transferAmountInput.value = "";
    } catch (error) {
        transferStatus.textContent = error.message;
        transferStatus.style.color = "#ff525b";
    } finally {
        transferButton.disabled = false;
    }
}

if (transferButton) {
    transferButton.addEventListener("click", makeTransfer);
}

// AVIAMASTERS
const aviaButton = document.getElementById("aviaButton");
const aviaMultiplierElement = document.getElementById("aviaMultiplier");
const aviaStatus = document.getElementById("aviaStatus");
const planeContainer = document.getElementById("planeContainer");

async function playAviamasters() {
    if (spinning || upgrading || !state) return;

    let amount = parseBet();
    if (betAll) amount = state.balance;
    if (!amount) {
        tg.showAlert("Введи сумму ставки!");
        return;
    }

    spinning = true;
    aviaButton.disabled = true;
    if (buyBonusButton) buyBonusButton.disabled = true;

    aviaStatus.textContent = "✈️ Самолет заходит на взлетную полосу...";
    
    const possibleSteps = [
        { type: "add", val: 0.3, text: "📈 Набор высоты (+0.3)" },
        { type: "add", val: 0.6, text: "📈 Отличный подъем (+0.6)" },
        { type: "sub", val: 0.4, text: "⚠️ Потеря высоты (−0.4)" },
        { type: "sub", val: 0.8, text: "⚠️ Сильный снос (−0.8)" },
        { type: "mult", val: 1.5, text: "🚀 Ускорение (×1.5)" },
        { type: "mult", val: 2.0, text: "🔥 Супер-ускорение (×2)" },
        { type: "div", val: 1.3, text: "💨 Турбулентность (÷1.3)" },
        { type: "div", val: 1.8, text: "🌪️ Мощный вихрь (÷1.8)" }
    ];

    const totalSteps = Math.floor(Math.random() * 5) + 6;
    const pathSteps = [];
    for (let i = 0; i < totalSteps; i++) {
        const randomStep = possibleSteps[Math.floor(Math.random() * possibleSteps.length)];
        pathSteps.push({ ...randomStep });
    }

    let currentStep = 0;
    let finalMultiplier = 1.00;

    const flightInterval = setInterval(async () => {
        if (currentStep < pathSteps.length) {
            const step = pathSteps[currentStep];
            
            if (step.type === "add") finalMultiplier += step.val;
            else if (step.type === "mult") finalMultiplier *= step.val;
            else if (step.type === "div") finalMultiplier /= step.val;
            else if (step.type === "sub") finalMultiplier = Math.max(0.1, finalMultiplier - step.val);

            finalMultiplier = Math.max(0.05, Number(finalMultiplier.toFixed(2)));
            
            aviaMultiplierElement.textContent = `×${finalMultiplier}`;
            aviaStatus.textContent = step.text;
            
            aviaMultiplierElement.style.color = (step.type === "div" || step.type === "sub") ? "#ff525b" : "#38bdf8";

            if (planeContainer) {
                const yOffset = (step.type === "div" || step.type === "sub") ? 12 : -12;
                planeContainer.style.transform = `translate(${currentStep * 8}px, ${yOffset}px) rotate(${(step.type === "div" || step.type === "sub") ? -15 : 15}deg)`;
            }

            currentStep++;
        } else {
            clearInterval(flightInterval);

            const isCrashed = Math.random() < 0.85;

            if (isCrashed) {
                finalMultiplier = 0;
                aviaMultiplierElement.textContent = "0.00";
                aviaMultiplierElement.style.color = "#ff525b";
                aviaStatus.textContent = "💥 Ракета сбила самолет! Ставка сгорела.";
            } else {
                aviaMultiplierElement.style.color = "#38bdf8";
                aviaStatus.textContent = `🎉 Эпический пролет! Итоговый множитель: ×${finalMultiplier.toFixed(2)}`;
            }

            try {
                await flushQueue();
                const result = await api("spin", { choice: isCrashed ? "zero" : "red", amount: amount, all: betAll });
                state = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                updateUI();
            } catch (e) {
                if (isCrashed) {
                    state.balance = Math.max(0, state.balance - amount);
                } else {
                    state.balance += Math.floor(amount * finalMultiplier);
                }
                updateUI();
            }

            setTimeout(() => {
                aviaMultiplierElement.style.color = "#38bdf8";
                if (planeContainer) planeContainer.style.transform = "none";
                aviaButton.disabled = false;
                spinning = false;
                aviaMultiplierElement.textContent = "×1.00";
                aviaStatus.textContent = "Сделай ставку и взлетай!";
            }, 2500);
        }
    }, 550);
}

if (aviaButton) {
    aviaButton.addEventListener("click", playAviamasters);
}

// ФУНКЦИЯ СОЗДАНИЯ ОБЪЕМНОЙ КАРТЫ ДЛЯ БЛЕКДЖЕКА
function createCardElement(suit, value, isHidden = false) {
    const cardDiv = document.createElement('div');
    cardDiv.className = `bj-card ${isHidden ? '' : 'flipped'}`;

    const isRed = (suit === '♥' || suit === '♦');
    const redClass = isRed ? 'red' : '';

    cardDiv.innerHTML = `
        <div class="card-face card-back">?</div>
        <div class="card-face card-front ${redClass}">
            <span class="card-value">${value}</span>
            <span class="card-suit">${suit}</span>
        </div>
    `;

    return cardDiv;
}

// БЛЕКДЖЕК ЛОГИКА
const bjDealButton = document.getElementById("bjDealButton");
const bjHitButton = document.getElementById("bjHitButton");
const bjStandButton = document.getElementById("bjStandButton");
const bjDoubleButton = document.getElementById("bjDoubleButton");
const bjActionButtons = document.getElementById("bjActionButtons");
const playerCardsDiv = document.getElementById("playerCards");
const dealerCardsDiv = document.getElementById("dealerCards");
const playerScoreSpan = document.getElementById("playerScore");
const dealerScoreSpan = document.getElementById("dealerScore");
const bjStatus = document.getElementById("bjStatus");

let bjDeck = [];
let bjPlayerHand = [];
let bjDealerHand = [];
let bjBetAmount = 0;
let bjGameActive = false;

function createBjDeck() {
    const suits = ["♠", "♣", "♥", "♦"];
    const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    let deck = [];
    for (let suit of suits) {
        for (let val of values) {
            deck.push({ val, suit });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function calculateBjHand(hand) {
    let sum = 0;
    let aces = 0;
    for (let card of hand) {
        if (card.val === "A") {
            aces++;
            sum += 11;
        } else if (["K", "Q", "J", "10"].includes(card.val)) {
            sum += 10;
        } else {
            sum += parseInt(card.val);
        }
    }
    while (sum > 21 && aces > 0) {
        sum -= 10;
        aces--;
    }
    return sum;
}

function renderBjHands(hideDealerSecond = true) {
    // Рендер рук игрока с помощью 3D-карточек
    playerCardsDiv.innerHTML = "";
    bjPlayerHand.forEach(card => {
        playerCardsDiv.appendChild(createCardElement(card.suit, card.val, false));
    });
    playerScoreSpan.textContent = calculateBjHand(bjPlayerHand);

    // Рендер рук дилера
    dealerCardsDiv.innerHTML = "";
    bjDealerHand.forEach((card, index) => {
        const isHidden = hideDealerSecond && index === 1;
        dealerCardsDiv.appendChild(createCardElement(card.suit, card.val, isHidden));
    });

    if (hideDealerSecond && bjDealerHand.length >= 2) {
        dealerScoreSpan.textContent = calculateBjHand([bjDealerHand[0]]);
    } else {
        dealerScoreSpan.textContent = calculateBjHand(bjDealerHand);
    }
}

async function startBlackjack() {
    if (spinning || upgrading || !state) return;

    bjBetAmount = parseBet();
    if (betAll) bjBetAmount = state.balance;
    if (!bjBetAmount || bjBetAmount <= 0) {
        tg.showAlert("Введи сумму ставки!");
        return;
    }
    if (bjBetAmount > state.balance) {
        tg.showAlert("Недостаточно байтов на балансе!");
        return;
    }

    spinning = true;
    if (bjDealButton) bjDealButton.disabled = true;

    try {
        await flushQueue();
        const res = await api("spin", { choice: "zero", amount: bjBetAmount, all: betAll });
        state = { balance: res.balance, income: res.income, upgrade_cost: res.upgrade_cost };
        updateUI();
    } catch (e) {
        state.balance -= bjBetAmount;
        updateUI();
    } finally {
        spinning = false;
    }

    bjDeck = createBjDeck();
    bjPlayerHand = [bjDeck.pop(), bjDeck.pop()];
    bjDealerHand = [bjDeck.pop(), bjDeck.pop()];
    bjGameActive = true;

    renderBjHands(true);
    bjStatus.textContent = "Твой ход: Ещё, Хватит или Удвоить?";
    
    if (bjDealButton) bjDealButton.classList.add("hidden");
    if (bjActionButtons) bjActionButtons.classList.remove("hidden");
    
    if (bjDoubleButton) {
        bjDoubleButton.disabled = state.balance < bjBetAmount;
        bjDoubleButton.classList.remove("hidden");
    }

    if (calculateBjHand(bjPlayerHand) === 21) {
        endBlackjack("blackjack");
    }
}

async function hitBlackjack() {
    if (!bjGameActive || spinning) return;
    bjPlayerHand.push(bjDeck.pop());
    renderBjHands(true);
    
    if (bjDoubleButton) bjDoubleButton.classList.add("hidden");

    const playerSum = calculateBjHand(bjPlayerHand);
    if (playerSum > 21) {
        endBlackjack("bust");
    } else if (playerSum === 21) {
        standBlackjack();
    }
}

async function doubleDownBlackjack() {
    if (!bjGameActive || spinning) return;
    if (state.balance < bjBetAmount) {
        tg.showAlert("Недостаточно байтов для удвоения ставки!");
        return;
    }

    state.balance -= bjBetAmount;
    bjBetAmount *= 2;
    updateUI();

    bjPlayerHand.push(bjDeck.pop());
    renderBjHands(true);

    const playerSum = calculateBjHand(bjPlayerHand);
    if (playerSum > 21) {
        endBlackjack("bust");
    } else {
        standBlackjack();
    }
}

async function standBlackjack() {
    if (!bjGameActive || spinning) return;
    bjGameActive = false;

    renderBjHands(false);
    bjStatus.textContent = "Ход дилера...";

    let dealerSum = calculateBjHand(bjDealerHand);
    while (dealerSum < 17) {
        await new Promise(r => setTimeout(r, 600));
        bjDealerHand.push(bjDeck.pop());
        renderBjHands(false);
        dealerSum = calculateBjHand(bjDealerHand);
    }

    const playerSum = calculateBjHand(bjPlayerHand);

    if (dealerSum > 21 || playerSum > dealerSum) {
        endBlackjack("win");
    } else if (playerSum < dealerSum) {
        endBlackjack("lose");
    } else {
        endBlackjack("push");
    }
}

async function endBlackjack(result) {
    bjGameActive = false;
    renderBjHands(false);
    
    if (bjActionButtons) bjActionButtons.classList.add("hidden");
    if (bjDealButton) {
        bjDealButton.classList.remove("hidden");
        bjDealButton.disabled = false;
    }
    if (bjDoubleButton) bjDoubleButton.classList.remove("hidden");

    let payout = 0;
    if (result === "blackjack") {
        payout = Math.floor(bjBetAmount * 2.5);
        state.balance += payout;
        bjStatus.textContent = `🎉 БЛЕКДЖЕК! Выигрыш: +${formatCoins(payout)} байтов`;
    } else if (result === "win") {
        payout = bjBetAmount * 2;
        state.balance += payout;
        bjStatus.textContent = `🎉 Победа! Выигрыш: +${formatCoins(payout)} байтов`;
    } else if (result === "push") {
        state.balance += bjBetAmount;
        bjStatus.textContent = `🤝 Ничья (Push). Ставка возвращена.`;
    } else if (result === "bust") {
        bjStatus.textContent = `💥 Перебор! Ты проиграл.`;
    } else {
        bjStatus.textContent = `💀 Дилер выиграл. Проигрыш.`;
    }

    updateUI();
    spinning = false;
}

if (bjDealButton) bjDealButton.addEventListener("click", startBlackjack);
if (bjHitButton) bjHitButton.addEventListener("click", hitBlackjack);
if (bjStandButton) bjStandButton.addEventListener("click", standBlackjack);
if (bjDoubleButton) bjDoubleButton.addEventListener("click", doubleDownBlackjack);

// --- ЛОГИКА ВКЛАДОК ---
const tabButtons = document.querySelectorAll(".tab-button");
const gameViews = document.querySelectorAll(".game-view");

tabButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (typeof spinning !== 'undefined' && spinning) return;
        
        tabButtons.forEach(item => item.classList.remove("active"));
        button.classList.add("active");

        const targetGame = button.dataset.game;
        gameViews.forEach(view => {
            if (view.id === "game-" + targetGame) {
                view.classList.remove("hidden");
            } else {
                view.classList.add("hidden");
            }
        });
    });
});

// --- НАСТРОЙКИ ТЕМЫ ---
const colorButtons = document.querySelectorAll(".color-btn");
const settingsStatus = document.getElementById("settingsStatus");

function setThemeColor(color) {
    document.documentElement.style.setProperty("--accent-color", color);
    
    colorButtons.forEach(btn => {
        if (btn.dataset.color === color) {
            btn.classList.add("active-color");
        } else {
            btn.classList.remove("active-color");
        }
    });

    localStorage.setItem("gcoin_theme_color", color);
}

colorButtons.forEach(button => {
    button.addEventListener("click", () => {
        const color = button.dataset.color;
        setThemeColor(color);
        if (settingsStatus) {
            settingsStatus.textContent = `🎨 Тема успешно изменена!`;
            settingsStatus.style.color = color;
        }
    });
});

const savedTheme = localStorage.getItem("gcoin_theme_color") || "#8b5cf6";
setThemeColor(savedTheme);

// --- РЕФЕРАЛЬНАЯ СИСТЕМА ---
const refLinkInput = document.getElementById("refLinkInput");
const copyRefBtn = document.getElementById("copyRefBtn");
const refStatus = document.getElementById("refStatus");
const refCountElement = document.getElementById("refCount");
const refEarnedElement = document.getElementById("refEarned");

function initReferralSystem() {
    if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) return;
    
    const userId = tg.initDataUnsafe.user.id;
    const botUsername = "GoldCo1n_bot"; 
    
    const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;
    if (refLinkInput) refLinkInput.value = refLink;

    loadReferralStats();
}

async function loadReferralStats() {
    try {
        const data = await api("get_referrals");
        if (refCountElement) refCountElement.textContent = data.count || 0;
        if (refEarnedElement) refEarnedElement.textContent = formatCoins(data.earned || 0);
    } catch (e) {
        console.error("Не удалось загрузить рефералов", e);
    }
}

if (copyRefBtn) {
    copyRefBtn.addEventListener("click", () => {
        if (!refLinkInput.value) return;
        
        navigator.clipboard.writeText(refLinkInput.value).then(() => {
            if (refStatus) {
                refStatus.textContent = "✅ Ссылка скопирована в буфер обмена!";
                refStatus.style.color = "#39d98a";
            }
        }).catch(() => {
            refLinkInput.select();
            document.execCommand("copy");
            if (refStatus) {
                refStatus.textContent = "✅ Ссылка скопирована!";
                refStatus.style.color = "#39d98a";
            }
        });
    });
}

setTimeout(initReferralSystem, 1000);
renderSlotGrid(generateRandomGridWithOrbs(), false);
