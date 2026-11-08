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
    Return (value / 1000000000).toFixed(10).replace(".", ",");
}

function updateUI() {
    If (!state) return;

    BalanceElement.textContent =
        FormatCoins(state.balance + pendingClicks * state.income) +
        " байтов";

    EarnButton.textContent = "+" + formatCoins(state.income);
    UpgradeButton.textContent =
        "Улучшение — " + formatCoins(state.upgrade_cost) + " байтов";
    
    UpdateBonusButtonCost();
}

async function api(action = null, extra = {}) {
    Const options = {
        Method: action ? "POST" : "GET",
        Headers: { "X-Telegram-Init-Data": tg.initData }
    };

    If (action) {
        Options.headers["Content-Type"] = "application/json";
        Options.body = JSON.stringify({ action, ...extra });
    }

    Const response = await fetch("/api/state", options);
    Const data = await response.json();

    If (!response.ok) {
        Throw new Error(data.error || "Ошибка сервера");
    }

    Return data;
}

function scheduleFlush() {
    If (flushTimer) clearTimeout(flushTimer);
    FlushTimer = setTimeout(() => {
        FlushQueue().catch(error => {
            Tg.showAlert("Ошибка сохранения: " + error.message);
        });
    }, 120);
}

async function flushQueue() {
    If (flushTimer) {
        ClearTimeout(flushTimer);
        FlushTimer = null;
    }

    If (flushPromise) {
        Await flushPromise;
        If (pendingClicks > 0) return flushQueue();
        Return;
    }

    FlushPromise = (async () => {
        While (pendingClicks > 0) {
            Const count = Math.min(pendingClicks, 1000);
            Const result = await api("earn_batch", { count });
            PendingClicks -= count;
            State = result;
            UpdateUI();
        }
    })();

    Try {
        Await flushPromise;
    } finally {
        FlushPromise = null;
    }
}

function earn() {
    If (!state || upgrading || spinning) return;
    PendingClicks++;
    UpdateUI();
    ScheduleFlush();
}

async function upgrade() {
    If (!state || upgrading || spinning) return;
    Upgrading = true;
    UpgradeButton.disabled = true;

    Try {
        Await flushQueue();
        State = await api("upgrade");
        UpdateUI();
    } catch (error) {
        Tg.showAlert(error.message);
    } finally {
        Upgrading = false;
        UpgradeButton.disabled = false;
    }
}

// РУЛЕТКА
const numbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17,
    34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31,
    9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
Const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

const wheel = document.getElementById("wheel");
const ball = document.getElementById("ball");
const spinButton = document.getElementById("spinButton");
const resultElement = document.getElementById("rouletteResult");
const messageElement = document.getElementById("rouletteMessage");
const historyElement = document.getElementById("rouletteHistory");

const SEGMENT = 360 / numbers.length;
Let spinning = false;
Let wheelRotation = 0;
Let history = [];
Let labels = [];

function normalizeAngle(angle) {
    Return ((angle % 360) + 360) % 360;
}

function getColor(number) {
    If (number === 0) return "green";
    Return redNumbers.includes(number) ? "red" : "black";
}

function getColorHex(number) {
    Const color = getColor(number);
    If (color === "red") return "#b92c35";
    If (color === "green") return "#16834b";
    Return "#171923";
}

function updateLabels(rotation) {
    Labels.forEach(label => {
        Const angle = Number(label.dataset.angle);
        Label.style.transform = `rotate(${angle}deg) translateY(-108px) rotate(${-angle - rotation}deg)`;
    });
}

function createWheel() {
    Const gradient = numbers.map((number, index) => {
        Const start = index * SEGMENT;
        Const end = (index + 1) * SEGMENT;
        Return `${getColorHex(number)} ${start}deg ${end}deg`;
    });

    Wheel.style.background = `conic-gradient(${gradient.join(",")})`;
    Wheel.querySelectorAll(".wheel-number").forEach(el => el.remove());
    Labels = [];

    Numbers.forEach((number, index) => {
        Const label = document.createElement("div");
        Const angle = (index + 0.5) * SEGMENT;

        Label.className = "wheel-number";
        Label.textContent = number;
        Label.dataset.angle = angle;

        Label.style.position = "absolute";
        Label.style.left = "50%";
        Label.style.top = "50%";
        Label.style.width = "24px";
        Label.style.height = "18px";
        Label.style.lineHeight = "18px";
        Label.style.marginLeft = "-12px";
        Label.style.marginTop = "-9px";
        Label.style.textAlign = "center";
        Label.style.fontSize = "11px";
        Label.style.fontWeight = "bold";
        Label.style.color = "white";
        Label.style.pointerEvents = "none";
        Label.style.zIndex = "2";

        Wheel.appendChild(label);
        Labels.push(label);
    });

    UpdateLabels(0);
}

const wheelFrame = wheel ? Wheel.parentElement : null;
if (ball && wheelFrame) {
    WheelFrame.appendChild(ball);
    Ball.style.transform = "translate(-50%, -50%)";
}

function setBallPosition(angle, radius) {
    Const rad = angle * Math.PI / 180;
    Const x = Math.sin(rad) * radius;
    Const y = -Math.cos(rad) * radius;
    Ball.style.left = `calc(50% + ${x}px)`;
    Ball.style.top = `calc(50% + ${y}px)`;
}

function getTargetRotation(index) {
    Const sectorCenter = (index + 0.5) * SEGMENT;
    Const desired = normalizeAngle(-sectorCenter);
    Const current = normalizeAngle(wheelRotation);
    Const extra = normalizeAngle(desired - current);
    Return wheelRotation + 360 * 7 + extra;
}

function renderHistory() {
    HistoryElement.innerHTML = "";
    History.forEach(item => {
        Const chip = document.createElement("span");
        Chip.textContent = item.number;
        Chip.style.display = "inline-grid";
        Chip.style.placeItems = "center";
        Chip.style.width = "32px";
        Chip.style.height = "32px";
        Chip.style.borderRadius = "50%";
        Chip.style.background = getColorHex(item.number);
        Chip.style.color = "white";
        Chip.style.fontWeight = "bold";
        HistoryElement.appendChild(chip);
    });
}

function showResult(number) {
    Const color = getColor(number);
    ResultElement.textContent = number;
    ResultElement.style.color = color === "red" ? "#ff525b" : color === "green" ? "#39d98a" : "white";
    MessageElement.textContent = color === "green" ? "Зелёное" : color === "red" ? "Красное" : "Чёрное";

    History.unshift({ number });
    History = history.slice(0, 12);
    RenderHistory();
}

function animateSpin(number, onDone) {
    Const index = numbers.indexOf(number);
    Const duration = 6500;
    Const startTime = performance.now();
    Const startRotation = wheelRotation;
    Const targetRotation = getTargetRotation(index);
    Const ballTurns = 7;

    Function frame(now) {
        Const progress = Math.min((now - startTime) / duration, 1);
        Const eased = 1 - Math.pow(1 - progress, 3);
        Const currentRotation = startRotation + (targetRotation - startRotation) * eased;

        Wheel.style.transform = `rotate(${currentRotation}deg)`;
        UpdateLabels(currentRotation);

        Const ballAngle = -360 * ballTurns * eased;
        Const drop = Math.max(0, (progress - 0.82) / 0.18);
        Const radius = 119 - 22 * drop;

        SetBallPosition(ballAngle, radius);

        If (progress < 1) {
            RequestAnimationFrame(frame);
        } else {
            WheelRotation = targetRotation;
            Wheel.style.transform = `rotate(${wheelRotation}deg)`;
            UpdateLabels(wheelRotation);
            SetBallPosition(0, 97);
            OnDone();
        }
    }
    RequestAnimationFrame(frame);
}

async function spin() {
    If (spinning || upgrading || !wheel || !ball || !state) return;
    If (!selectedPrediction) {
        Tg.showAlert("Сначала выбери прогноз");
        Return;
    }

    Const amount = parseBet();
    If (!betAll && !amount) {
        Tg.showAlert("Введи сумму ставки (мин. 100 байтов)");
        Return;
    }

    Spinning = true;
    SpinButton.disabled = true;
    ResultElement.textContent = "?";
    MessageElement.textContent = "Колесо вращается...";

    Let result;
    Try {
        Await flushQueue();
        Result = await api("spin", { choice: selectedPrediction, amount: amount, all: betAll });
    } catch (error) {
        Tg.showAlert(error.message);
        MessageElement.textContent = "Нажми, чтобы запустить колесо";
        Spinning = false;
        SpinButton.disabled = false;
        Return;
    }

    Const balanceBefore = state.balance;
    Const choiceName = predictionNames[selectedPrediction];

    AnimateSpin(result.number, () => {
        State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        UpdateUI();
        ShowResult(result.number);

        Const delta = Math.abs(result.balance - balanceBefore);
        PredictionStatus.textContent = result.win
            ? `Победа! ${choiceName}. Выпало ${result.number}. +${formatCoins(delta)} байтов`
            : `Проигрыш. ${choiceName}. Выпало ${result.number}. −${formatCoins(delta)} байтов`;

        SelectedPrediction = null;
        PredictionButtons.forEach(item => item.classList.remove("selected"));
        Spinning = false;
        SpinButton.disabled = false;
    });
}

if (wheel) createWheel();
if (spinButton) spinButton.addEventListener("click", spin);

async function loadGame() {
    Try {
        If (!tg.initData) throw new Error("Открой игру через Telegram");
        State = await api();
        UpdateUI();
    } catch (error) {
        Tg.showAlert("Не удалось загрузить игру: " + error.message);
    }
}

earnButton.addEventListener("click", earn);
upgradeButton.addEventListener("click", upgrade);
LoadGame();

// СТАВКА И БОНУСКА
let betAll = false;
const betInput = document.getElementById("betInput");
const quickButtons = document.querySelectorAll(".prediction-option[data-fraction]");
const buyBonusButton = document.getElementById("buyBonusButton");

function parseBet() {
    Const raw = betInput.value.trim().replace(",", ".");
    Const coins = Number(raw);
    If (!raw || !Number.isFinite(coins) || coins < 1) return null;
    Return Math.round(coins * 1000000000);
}

function updateBonusButtonCost() {
    If (!buyBonusButton) return;
    Let amount = parseBet();
    If (betAll && state) {
        Amount = state.balance;
    }
    
    If (amount && amount > 0) {
        Const bonusCost = amount * 100;
        BuyBonusButton.textContent = `🎁 КУПИТЬ БОНУСКУ — ${formatCoins(bonusCost)}`;
    } else {
        BuyBonusButton.textContent = `🎁 КУПИТЬ БОНУСКУ (×100)`;
    }
}

betInput.addEventListener("input", () => {
    BetAll = false;
    QuickButtons.forEach(item => item.classList.remove("selected"));
    UpdateBonusButtonCost();
});

quickButtons.forEach(button => {
    Button.addEventListener("click", () => {
        If (spinning || !state) return;
        Const fraction = Number(button.dataset.fraction);
        QuickButtons.forEach(item => item.classList.remove("selected"));
        Button.classList.add("selected");
        BetAll = fraction === 1;
        BetInput.value = formatCoins(Math.floor(state.balance * fraction));
        UpdateBonusButtonCost();
    });
});

// ПРОГНОЗЫ РУЛЕТКИ
let selectedPrediction = null;
const predictionStatus = document.getElementById("predictionStatus");
const predictionButtons = document.querySelectorAll(".prediction-option[data-choice]");
const predictionMultipliers = { red: 1.9, black: 1.9, even: 1.9, odd: 1.9, zero: 36 };
const predictionNames = { red: "Красное", black: "Чёрное", even: "Чётное", odd: "Нечётное", zero: "Ноль" };

predictionButtons.forEach(button => {
    Button.addEventListener("click", () => {
        If (spinning) return;
        PredictionButtons.forEach(item => item.classList.remove("selected"));
        Button.classList.add("selected");
        SelectedPrediction = button.dataset.choice;
        PredictionStatus.textContent = "Прогноз: " + predictionNames[selectedPrediction] + " ×" + predictionMultipliers[selectedPrediction];
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
    Button.addEventListener("click", () => {
        If (spinning) return;
        CoinChoiceButtons.forEach(item => item.classList.remove("selected"));
        Button.classList.add("selected");
        SelectedCoin = button.dataset.coin;
        CoinStatus.textContent = "Выбрано: " + coinNames[selectedCoin] + " ×1.9";
    });
});

function animateCoin(side, onDone) {
    Const needed = side === "heads" ? 0 : 180;
    Const current = normalizeAngle(coinRotation);
    Const extra = normalizeAngle(needed - current);
    CoinRotation = coinRotation + 360 * 5 + extra;
    CoinElement.style.transform = `rotateY(${coinRotation}deg)`;
    SetTimeout(onDone, 2100);
}

async function flipCoin() {
    If (spinning || upgrading || !state) return;
    If (!selectedCoin) {
        Tg.showAlert("Сначала выбери орла или решку");
        Return;
    }

    Const amount = parseBet();
    If (!betAll && !amount) {
        Tg.showAlert("Введи сумму ставки (мин. 100 байтов)");
        Return;
    }

    Spinning = true;
    CoinButton.disabled = true;
    CoinStatus.textContent = "Монета в воздухе...";

    Let result;
    Try {
        Await flushQueue();
        Result = await api("coin", { choice: selectedCoin, amount: amount, all: betAll });
    } catch (error) {
        Tg.showAlert(error.message);
        CoinStatus.textContent = "Выбери сторону и сумму ставки";
        Spinning = false;
        CoinButton.disabled = false;
        Return;
    }

    Const balanceBefore = state.balance;
    Const choiceName = coinNames[selectedCoin];

    AnimateCoin(result.side, () => {
        State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        UpdateUI();

        Const delta = Math.abs(result.balance - balanceBefore);
        Const sideName = coinNames[result.side];

        CoinStatus.textContent = result.win
            ? `Победа! Выпал ${sideName}. +${formatCoins(delta)} байтов`
            : `Проигрыш. Выпал ${sideName} (ты ставил на ${choiceName.toLowerCase()}). −${formatCoins(delta)} байтов`;

        SelectedCoin = null;
        CoinChoiceButtons.forEach(item => item.classList.remove("selected"));
        Spinning = false;
        CoinButton.disabled = false;
    });
}
if (coinButton) coinButton.addEventListener("click", flipCoin);

// СЛОТЫ И БОНУСКА
const slotGridElement = document.getElementById("slotGrid");
const slotButton = document.getElementById("slotButton");
const slotStatus = document.getElementById("slotStatus");
const zeusBadge = document.getElementById("zeusMultiplierBadge");

const symbolData = {
    1: { icon: "💎" }, 2: { icon: "🟢" }, 3: { icon: "🟡" },
    4: { icon: "🟠" }, 5: { icon: "🟣" }, 6: { icon: "🏆" },
    7: { icon: "💍" }, 8: { icon: "⏳" }, 9: { icon: "👑" },
    10: { icon: "⚡" }
};

function renderSlotGrid(grid, animate = true) {
    If (!slotGridElement) return;
    SlotGridElement.innerHTML = "";
    
    Grid.forEach((row, rIndex) => {
        Row.forEach((sym, cIndex) => {
            Const cell = document.createElement("div");
            Cell.className = "slot-cell";
            If (animate) {
                Cell.classList.add("animate-drop");
                Cell.style.animationDelay = `${cIndex * 70}ms`;
            }
            If (sym === 10) cell.classList.add("scatter-cell");
            If (sym >= 8) cell.classList.add("high-cell");
            Cell.textContent = symbolData[sym]?.icon || "💎";
            SlotGridElement.appendChild(cell);
        });
    });
}

async function requestSlotSpin(isBonus = false) {
    If (spinning || upgrading || !state) return;

    Let amount = parseBet();
    If (betAll) amount = state.balance;
    If (!amount) amount = 1000000000;

    Spinning = true;
    SlotButton.disabled = true;
    BuyBonusButton.disabled = true;

    Let result;
    Try {
        Await flushQueue();
        Result = await api("slot", { amount: amount, all: betAll, isBonus: isBonus });
    } catch (error) {
        Tg.showAlert(error.message);
        SlotStatus.textContent = error.message;
        Spinning = false;
        SlotButton.disabled = false;
        BuyBonusButton.disabled = false;
        Return;
    }

    If (isBonus) {
        Let currentSpin = 1;
        SlotStatus.textContent = `🎁 БОНУСКА АКТИВИРОВАНА! Спин 1 из 15...`;
        ZeusBadge.textContent = `⚡ ×1`;

        Const bonusInterval = setInterval(() => {
            RenderSlotGrid(
                Array.from({ length: 5 }, () =>
                    Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
                ),
                false
            );

            CurrentSpin++;
            If (currentSpin <= 15) {
                SlotStatus.textContent = `🎁 Бесплатное вращение ${currentSpin} из 15...`;
            } else {
                clearInterval(bonusInterval);
                RenderSlotGrid(result.grid, true);

                State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                UpdateUI();

                ZeusBadge.textContent = `⚡ ×${result.zeus}`;
                If (result.zeus > 0) {
                    Const frame = document.querySelector(".olympus-frame");
                    If (frame) {
                        Frame.classList.remove("zeus-flash");
                        Void frame.offsetWidth;
                        Frame.classList.add("zeus-flash");
                    }
                }

                Const bonusCost = amount * 100;
                Const netProfit = (amount * result.slotMultiplier) - bonusCost;
                Const formattedDelta = formatCoins(Math.abs(netProfit));

                If (netProfit >= 0) {
                    SlotStatus.textContent = `🎉 БОНУСКА ЗАВЕРШЕНА! Множитель ×${result.slotMultiplier}! Выигрыш: +${formattedDelta} байтов`;
                } else {
                    SlotStatus.textContent = `💀 БОНУСКА ЗАВЕРШЕНА! Множитель ×${result.slotMultiplier}. В минус: −${formattedDelta} байтов`;
                }

                Spinning = false;
                SlotButton.disabled = false;
                BuyBonusButton.disabled = false;
            }
        }, 300);

    } else {
        SlotStatus.textContent = `⚡ Барабаны крутятся...`;
        Let counter = 0;
        Const interval = setInterval(() => {
            RenderSlotGrid(
                Array.from({ length: 5 }, () =>
                    Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
                ),
                false
            );
            Counter++;
            If (counter > 10) {
                clearInterval(interval);
                RenderSlotGrid(result.grid, true);

                State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                UpdateUI();

                ZeusBadge.textContent = `⚡ ×${result.zeus}`;
                If (result.zeus > 0) {
                    Const frame = document.querySelector(".olympus-frame");
                    If (frame) {
                        Frame.classList.remove("zeus-flash");
                        Void frame.offsetWidth;
                        Frame.classList.add("zeus-flash");
                    }
                }

                If (result.win) {
                    SlotStatus.textContent = `⚡ Победа! Множитель ×${result.slotMultiplier}! +${formatCoins(Math.abs(amount * result.slotMultiplier - amount))} байтов`;
                } else {
                    SlotStatus.textContent = `Манна богов исчерпана. Попробуй еще!`;
                }

                Spinning = false;
                SlotButton.disabled = false;
                BuyBonusButton.disabled = false;
            }
        }, 80);
    }
}

if (slotButton) slotButton.addEventListener("click", () => requestSlotSpin(false));
if (buyBonusButton) buyBonusButton.addEventListener("click", () => requestSlotSpin(true));

renderSlotGrid(
    Array.from({ length: 5 }, () =>
        Array.from({ length: 6 }, () => Math.floor(Math.random() * 9) + 1)
    ),
    false
);

// ПРОМОКОДЫ
const promoInput = document.getElementById("promoInput");
const promoButton = document.getElementById("promoButton");
const promoStatus = document.getElementById("promoStatus");

async function redeemPromo() {
    Const code = promoInput.value.trim();
    If (!code) {
        PromoStatus.textContent = "Введите промокод!";
        PromoStatus.style.color = "#ff525b";
        Return;
    }

    PromoButton.disabled = true;
    PromoStatus.textContent = "Проверка...";
    PromoStatus.style.color = "#aab1c0";

    Try {
        Await flushQueue();
        Const result = await api("redeem_promo", { code });

        State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        UpdateUI();

        PromoStatus.textContent = `🎉 Промокод активирован! Награда зачислена.`;
        PromoStatus.style.color = "#39d98a";
        PromoInput.value = "";
    } catch (error) {
        PromoStatus.textContent = error.message;
        PromoStatus.style.color = "#ff525b";
    } finally {
        PromoButton.disabled = false;
    }
}

if (promoButton) promoButton.addEventListener("click", redeemPromo);

// ПЕРЕВОДЫ ПО ЮЗЕРНЕЙМУ
const transferTargetInput = document.getElementById("transferTargetInput");
const transferAmountInput = document.getElementById("transferAmountInput");
const transferButton = document.getElementById("transferButton");
const transferStatus = document.getElementById("transferStatus");

async function makeTransfer() {
    If (spinning || upgrading || !state) return;

    Let targetUsername = transferTargetInput.value.trim().replace(/^@/, "").toLowerCase();
    Const rawAmount = transferAmountInput.value.trim().replace(",", ".");
    Const coins = Number(rawAmount);

    If (!targetUsername) {
        TransferStatus.textContent = "Введи юзернейм получателя!";
        TransferStatus.style.color = "#ff525b";
        Return;
    }

    If (!rawAmount || !Number.isFinite(coins) || coins <= 0) {
        TransferStatus.textContent = "Введи корректную сумму перевода!";
        TransferStatus.style.color = "#ff525b";
        Return;
    }

    Const amount = Math.round(coins * 1000000000);

    If (amount > state.balance) {
        TransferStatus.textContent = "Недостаточно байтов на балансе!";
        TransferStatus.style.color = "#ff525b";
        Return;
    }

    TransferButton.disabled = true;
    TransferStatus.textContent = "Выполняется перевод...";
    TransferStatus.style.color = "#aab1c0";

    Try {
        Await flushQueue();
        Const result = await api("transfer", { targetUsername, amount });

        State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
        UpdateUI();

        TransferStatus.textContent = `🎉 Успешно! Переведено ${formatCoins(amount)} байтов игроку @${targetUsername}`;
        TransferStatus.style.color = "#39d98a";
        TransferTargetInput.value = "";
        TransferAmountInput.value = "";
    } catch (error) {
        TransferStatus.textContent = error.message;
        TransferStatus.style.color = "#ff525b";
    } finally {
        TransferButton.disabled = false;
    }
}

if (transferButton) {
    TransferButton.addEventListener("click", makeTransfer);
}

// AVIAMASTERS
const aviaButton = document.getElementById("aviaButton");
const aviaMultiplierElement = document.getElementById("aviaMultiplier");
const aviaStatus = document.getElementById("aviaStatus");
const planeContainer = document.getElementById("planeContainer");

async function playAviamasters() {
    If (spinning || upgrading || !state) return;

    Let amount = parseBet();
    If (betAll) amount = state.balance;
    If (!amount) {
        Tg.showAlert("Введи сумму ставки!");
        Return;
    }

    Spinning = true;
    AviaButton.disabled = true;
    If (buyBonusButton) buyBonusButton.disabled = true;

    AviaStatus.textContent = "✈️ Самолет заходит на взлетную полосу...";
    
    Const possibleSteps = [
        { type: "add", val: 0.3, text: "📈 Набор высоты (+0.3)" },
        { type: "add", val: 0.6, text: "📈 Отличный подъем (+0.6)" },
        { type: "sub", val: 0.4, text: "⚠️ Потеря высоты (−0.4)" },
        { type: "sub", val: 0.8, text: "⚠️ Сильный снос (−0.8)" },
        { type: "mult", val: 1.5, text: "🚀 Ускорение (×1.5)" },
        { type: "mult", val: 2.0, text: "🔥 Супер-ускорение (×2)" },
        { type: "div", val: 1.3, text: "💨 Турбулентность (÷1.3)" },
        { type: "div", val: 1.8, text: "🌪️ Мощный вихрь (÷1.8)" }
    ];

    Const totalSteps = Math.floor(Math.random() * 5) + 6;
    Const pathSteps = [];
    For (let i = 0; i < totalSteps; i++) {
        Const randomStep = possibleSteps[Math.floor(Math.random() * possibleSteps.length)];
        PathSteps.push({ ...randomStep });
    }

    Let currentStep = 0;
    Let finalMultiplier = 1.00;

    Const flightInterval = setInterval(async () => {
        If (currentStep < pathSteps.length) {
            Const step = pathSteps[currentStep];
            
            If (step.type === "add") finalMultiplier += step.val;
            else if (step.type === "mult") finalMultiplier *= step.val;
            else if (step.type === "div") finalMultiplier /= step.val;
            else if (step.type === "sub") finalMultiplier = Math.max(0.1, finalMultiplier - step.val);

            FinalMultiplier = Math.max(0.05, Number(finalMultiplier.toFixed(2)));
            
            AviaMultiplierElement.textContent = `×${finalMultiplier}`;
            AviaStatus.textContent = step.text;
            
            AviaMultiplierElement.style.color = (step.type === "div" || step.type === "sub") ? "#ff525b" : "#38bdf8";

            If (planeContainer) {
                Const yOffset = (step.type === "div" || step.type === "sub") ? 12 : -12;
                PlaneContainer.style.transform = `translate(${currentStep * 8}px, ${yOffset}px) rotate(${(step.type === "div" || step.type === "sub") ? -15 : 15}deg)`;
            }

            CurrentStep++;
        } else {
            clearInterval(flightInterval);

            Const isCrashed = Math.random() < 0.85;

            If (isCrashed) {
                FinalMultiplier = 0;
                AviaMultiplierElement.textContent = "0.00";
                AviaMultiplierElement.style.color = "#ff525b";
                AviaStatus.textContent = "💥 Ракета сбила самолет! Ставка сгорела.";
            } else {
                AviaMultiplierElement.style.color = "#38bdf8";
                AviaStatus.textContent = `🎉 Эпический пролет! Итоговый множитель: ×${finalMultiplier.toFixed(2)}`;
            }

            Try {
                Await flushQueue();
                Const result = await api("spin", { choice: isCrashed ? "zero" : "red", amount: amount, all: betAll });
                State = { balance: result.balance, income: result.income, upgrade_cost: result.upgrade_cost };
                UpdateUI();
            } catch (e) {
                If (isCrashed) {
                    State.balance = Math.max(0, state.balance - amount);
                } else {
                    State.balance += Math.floor(amount * finalMultiplier);
                }
                UpdateUI();
            }

            SetTimeout(() => {
                AviaMultiplierElement.style.color = "#38bdf8";
                If (planeContainer) planeContainer.style.transform = "none";
                AviaButton.disabled = false;
                Spinning = false;
                AviaMultiplierElement.textContent = "×1.00";
                AviaStatus.textContent = "Сделай ставку и взлетай!";
            }, 2500);
        }
    }, 550);
}

if (aviaButton) {
    AviaButton.addEventListener("click", playAviamasters);
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
    Const suits = ["♠", "♣", "♥", "♦"];
    Const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    Let deck = [];
    For (let suit of suits) {
        For (let val of values) {
            Deck.push({ val, suit });
        }
    }
    For (let i = deck.length - 1; i > 0; i--) {
        Const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    Return deck;
}

function calculateBjHand(hand) {
    Let sum = 0;
    Let aces = 0;
    For (let card of hand) {
        If (card.val === "A") {
            Aces++;
            Sum += 11;
        } else if (["K", "Q", "J", "10"].includes(card.val)) {
            Sum += 10;
        } else {
            Sum += parseInt(card.val);
        }
    }
    While (sum > 21 && aces > 0) {
        Sum -= 10;
        Aces--;
    }
    Return sum;
}

function renderBjHands(hideDealerSecond = true) {
    PlayerCardsDiv.textContent = bjPlayerHand.map(c => `${c.val}${c.suit}`).join(" ");
    PlayerScoreSpan.textContent = calculateBjHand(bjPlayerHand);

    If (hideDealerSecond && bjDealerHand.length >= 2) {
        DealerCardsDiv.textContent = `${bjDealerHand[0].val}${bjDealerHand[0].suit} 🂠`;
        DealerScoreSpan.textContent = calculateBjHand([bjDealerHand[0]]);
    } else {
        DealerCardsDiv.textContent = bjDealerHand.map(c => `${c.val}${c.suit}`).join(" ");
        DealerScoreSpan.textContent = calculateBjHand(bjDealerHand);
    }
}

async function startBlackjack() {
    If (spinning || upgrading || !state) return;

    BjBetAmount = parseBet();
    If (betAll) bjBetAmount = state.balance;
    If (!bjBetAmount || bjBetAmount <= 0) {
        Tg.showAlert("Введи сумму ставки!");
        Return;
    }
    If (bjBetAmount > state.balance) {
        Tg.showAlert("Недостаточно байтов на балансе!");
        Return;
    }

    Spinning = true;
    If (bjDealButton) bjDealButton.disabled = true;

    Try {
        Await flushQueue();
        Const res = await api("spin", { choice: "zero", amount: bjBetAmount, all: betAll });
        State = { balance: res.balance, income: res.income, upgrade_cost: res.upgrade_cost };
        UpdateUI();
    } catch (e) {
        State.balance -= bjBetAmount;
        UpdateUI();
    } finally {
        Spinning = false;
    }

    BjDeck = createBjDeck();
    BjPlayerHand = [bjDeck.pop(), bjDeck.pop()];
    BjDealerHand = [bjDeck.pop(), bjDeck.pop()];
    BjGameActive = true;

    RenderBjHands(true);
    BjStatus.textContent = "Твой ход: Ещё, Хватит или Удвоить?";
    
    If (bjDealButton) bjDealButton.classList.add("hidden");
    If (bjActionButtons) bjActionButtons.classList.remove("hidden");
    
    If (bjDoubleButton) {
        BjDoubleButton.disabled = state.balance < bjBetAmount;
        BjDoubleButton.classList.remove("hidden");
    }

    If (calculateBjHand(bjPlayerHand) === 21) {
        EndBlackjack("blackjack");
    }
}

async function hitBlackjack() {
    If (!bjGameActive || spinning) return;
    BjPlayerHand.push(bjDeck.pop());
    RenderBjHands(true);
    
    If (bjDoubleButton) bjDoubleButton.classList.add("hidden");

    Const playerSum = calculateBjHand(bjPlayerHand);
    If (playerSum > 21) {
        EndBlackjack("bust");
    } else if (playerSum === 21) {
        StandBlackjack();
    }
}

async function doubleDownBlackjack() {
    If (!bjGameActive || spinning) return;
    If (state.balance < bjBetAmount) {
        Tg.showAlert("Недостаточно байтов для удвоения ставки!");
        Return;
    }

    State.balance -= bjBetAmount;
    BjBetAmount *= 2;
    UpdateUI();

    BjPlayerHand.push(bjDeck.pop());
    RenderBjHands(true);

    Const playerSum = calculateBjHand(bjPlayerHand);
    If (playerSum > 21) {
        EndBlackjack("bust");
    } else {
        StandBlackjack();
    }
}

async function standBlackjack() {
    If (!bjGameActive || spinning) return;
    BjGameActive = false;

    RenderBjHands(false);
    BjStatus.textContent = "Ход дилера...";

    Let dealerSum = calculateBjHand(bjDealerHand);
    While (dealerSum < 17) {
        Await new Promise(r => setTimeout(r, 600));
        BjDealerHand.push(bjDeck.pop());
        RenderBjHands(false);
        DealerSum = calculateBjHand(bjDealerHand);
    }

    Const playerSum = calculateBjHand(bjPlayerHand);

    If (dealerSum > 21 || playerSum > dealerSum) {
        EndBlackjack("win");
    } else if (playerSum < dealerSum) {
        EndBlackjack("lose");
    } else {
        EndBlackjack("push");
    }
}

async function endBlackjack(result) {
    BjGameActive = false;
    RenderBjHands(false);
    
    If (bjActionButtons) bjActionButtons.classList.add("hidden");
    If (bjDealButton) {
        BjDealButton.classList.remove("hidden");
        BjDealButton.disabled = false;
    }
    If (bjDoubleButton) bjDoubleButton.classList.remove("hidden");

    Let payout = 0;
    If (result === "blackjack") {
        Payout = Math.floor(bjBetAmount * 2.5);
        State.balance += payout;
        BjStatus.textContent = `🎉 БЛЕКДЖЕК! Выигрыш: +${formatCoins(payout)} байтов`;
    } else if (result === "win") {
        Payout = bjBetAmount * 2;
        State.balance += payout;
        BjStatus.textContent = `🎉 Победа! Выигрыш: +${formatCoins(payout)} байтов`;
    } else if (result === "push") {
        State.balance += bjBetAmount;
        BjStatus.textContent = `🤝 Ничья (Push). Ставка возвращена.`;
    } else if (result === "bust") {
        BjStatus.textContent = `💥 Перебор! Ты проиграл.`;
    } else {
        BjStatus.textContent = `💀 Дилер выиграл. Проигрыш.`;
    }

    UpdateUI();
    Spinning = false;
}

if (bjDealButton) bjDealButton.addEventListener("click", startBlackjack);
if (bjHitButton) bjHitButton.addEventListener("click", hitBlackjack);
if (bjStandButton) bjStandButton.addEventListener("click", standBlackjack);
if (bjDoubleButton) bjDoubleButton.addEventListener("click", doubleDownBlackjack);

// --- ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК И НАСТРОЙКИ ТЕМЫ ---
const tabButtons = document.querySelectorAll(".tab-button");
const gameViews = document.querySelectorAll(".game-view");

tabButtons.forEach(button => {
    Button.addEventListener("click", () => {
        If (typeof spinning !== 'undefined' && spinning) return;
        
        TabButtons.forEach(item => item.classList.remove("active"));
        Button.classList.add("active");

        Const targetGame = button.dataset.game;
        GameViews.forEach(view => {
            If (view.id === "game-" + targetGame) {
                View.classList.remove("hidden");
            } else {
                View.classList.add("hidden");
            }
        });
    });
});

const colorButtons = document.querySelectorAll(".color-btn");
const settingsStatus = document.getElementById("settingsStatus");

function setThemeColor(color) {
    Document.documentElement.style.setProperty("--accent-color", color);
    
    ColorButtons.forEach(btn => {
        If (btn.dataset.color === color) {
            Btn.classList.add("active-color");
        } else {
            Btn.classList.remove("active-color");
        }
    });

    LocalStorage.setItem("gcoin_theme_color", color);
}

colorButtons.forEach(button => {
    Button.addEventListener("click", () => {
        Const color = button.dataset.color;
        SetThemeColor(color);
        If (settingsStatus) {
            SettingsStatus.textContent = `🎨 Тема успешно изменена!`;
            SettingsStatus.style.color = color;
        }
    });
});

Const savedTheme = localStorage.getItem("gcoin_theme_color") || "#8b5cf6";
SetThemeColor(savedTheme);
