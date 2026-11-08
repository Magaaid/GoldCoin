function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
        }
    });
}

async function verifyTelegram(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) return null;
    params.delete("hash");

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);

    if (!authDate || now - authDate > 86400 || authDate > now + 60) {
        return null;
    }

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode("WebAppData"),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const secret = await crypto.subtle.sign("HMAC", key, encoder.encode(botToken));
    const validationKey = await crypto.subtle.importKey(
        "raw",
        secret,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", validationKey, encoder.encode(dataCheckString));
    const calculatedHash = [...new Uint8Array(signature)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    if (calculatedHash !== hash) return null;

    try {
        const userData = params.get("user");
        return userData ? JSON.parse(userData) : null;
    } catch {
        return null;
    }
}

async function authenticate(request, env) {
    const initData = request.headers.get("X-Telegram-Init-Data");
    if (!initData) return { error: "initData missing" };
    if (!env.BOT_TOKEN) return { error: "BOT_TOKEN missing" };

    try {
        const user = await verifyTelegram(initData, env.BOT_TOKEN);
        if (!user || !user.id) return { error: "initData validation failed" };
        return { user };
    } catch (error) {
        return { error: "Verification error: " + error.message };
    }
}

async function initDatabase(env) {
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            telegram_id TEXT PRIMARY KEY,
            balance REAL DEFAULT 0,
            income REAL DEFAULT 0.5,
            upgrade_cost REAL DEFAULT 1024
        )
    `).run();

    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS promos (
            code TEXT PRIMARY KEY,
            reward REAL NOT NULL
        )
    `).run();

    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS used_promos (
            telegram_id TEXT,
            code TEXT,
            PRIMARY KEY (telegram_id, code)
        )
    `).run();

    await env.DB.prepare(`INSERT OR IGNORE INTO promos (code, reward) VALUES ('ZEUS', 10000000000000)`).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO promos (code, reward) VALUES ('BONUS', 5000000000000)`).run();
}

async function getUser(env, id) {
    await initDatabase(env);
    await env.DB.prepare(`
        INSERT OR IGNORE INTO users
        (telegram_id, balance, income, upgrade_cost)
        VALUES (?, 0, 0.5, 1024)
    `).bind(String(id)).run();

    return await env.DB.prepare(`
        SELECT balance, income, upgrade_cost
        FROM users
        WHERE telegram_id = ?
    `).bind(String(id)).first();
}

// РУЛЕТКА И МОНЕТКА
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const MULTIPLIERS = { red: 1.9, black: 1.9, even: 1.9, odd: 1.9, zero: 36 };
const COIN_MULTIPLIER = 1.9;

function randomRouletteNumber() {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / 37) * 37;
    do {
        crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % 37;
}

function isWin(choice, number) {
    switch (choice) {
        case "zero": return number === 0;
        case "red": return RED_NUMBERS.includes(number);
        case "black": return number !== 0 && !RED_NUMBERS.includes(number);
        case "even": return number !== 0 && number % 2 === 0;
        case "odd": return number % 2 === 1;
        default: return false;
    }
}

// СЛОТЫ И БОНУСКА (15 спинов)
const MULTIFIER_VALUES = [2, 3, 4, 5, 10, 15, 20, 25, 50, 100, 500];

function getRandomSymbol(forceScatter = false) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const rand = buf[0] / 0x100000000;

    if (forceScatter || rand < 0.04) return 10;
    if (rand < 0.14) return 9;
    if (rand < 0.27) return 8;
    if (rand < 0.42) return 7;
    if (rand < 0.58) return 6;
    const lowSymbols = [1, 2, 3, 4, 5];
    return lowSymbols[Math.floor(rand * lowSymbols.length) % lowSymbols.length];
}

// Симуляция одного спина сетки
function calculateSingleSpin(forceZeus = false) {
    const rows = 5;
    const cols = 6;
    let grid = [];
    
    for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
            row.push(getRandomSymbol(false));
        }
        grid.push(row);
    }
    
    const counts = {};
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const sym = grid[r][c];
            counts[sym] = (counts[sym] || 0) + 1;
        }
    }

    let winMultiplier = 0;
    for (const [sym, count] of Object.entries(counts)) {
        const s = Number(sym);
        if (s !== 10 && count >= 8) {
            let baseMult = s >= 8 ? 8 : (s >= 6 ? 3 : 1);
            winMultiplier += baseMult * (count / 8);
        }
    }

    let zeusMultiplier = 0;
    if (winMultiplier > 0 || forceZeus) {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        if (forceZeus || buf[0] / 0x100000000 < 0.4) {
            zeusMultiplier = MULTIFIER_VALUES[Math.floor(Math.random() * MULTIFIER_VALUES.length)];
        }
    }

    const totalMult = winMultiplier > 0 
        ? Number((winMultiplier * (zeusMultiplier > 0 ? zeusMultiplier : 1)).toFixed(2)) 
        : 0;

    return { grid, multiplier: totalMult, zeus: zeusMultiplier };
}

export async function onRequestGet({ request, env }) {
    try {
        const auth = await authenticate(request, env);
        if (auth.error) return response({ error: auth.error }, 401);
        return response(await getUser(env, auth.user.id));
    } catch (error) {
        return response({ error: error.message }, 500);
    }
}

export async function onRequestPost({ request, env }) {
    try {
        const auth = await authenticate(request, env);
        if (auth.error) return response({ error: auth.error }, 401);

        const body = await request.json();
        const id = String(auth.user.id);
        const currentUser = await getUser(env, id);

        if (body.action === "earn_batch") {
            const count = Number(body.count);
            if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
                return response({ error: "Invalid click count" }, 400);
            }
            await env.DB.prepare(`UPDATE users SET balance = balance + income * ? WHERE telegram_id = ?`).bind(count, id).run();

        } else if (body.action === "earn") {
            await env.DB.prepare(`UPDATE users SET balance = balance + income WHERE telegram_id = ?`).bind(id).run();

        } else if (body.action === "upgrade") {
            const result = await env.DB.prepare(`
                UPDATE users SET balance = balance - upgrade_cost, income = income * 2, upgrade_cost = upgrade_cost * 2
                WHERE telegram_id = ? AND balance >= upgrade_cost
            `).bind(id).run();
            if (result.meta.changes === 0) return response({ error: "Недостаточно байтов" }, 400);

        } else if (body.action === "spin") {
            const choice = String(body.choice);
            const amount = body.all === true ? currentUser.balance : Number(body.amount);
            if (!Number.isFinite(amount) || amount < 100) return response({ error: "Минимальная ставка — 100 байтов" }, 400);
            if (amount > currentUser.balance) return response({ error: "Недостаточно байтов" }, 400);

            const number = randomRouletteNumber();
            const win = isWin(choice, number);
            const delta = win ? amount * (MULTIPLIERS[choice] - 1) : -amount;

            await env.DB.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).bind(delta, id).run();
            const updated = await getUser(env, id);
            return response({ ...updated, number, win });

        } else if (body.action === "coin") {
            const choice = String(body.choice);
            const amount = body.all === true ? currentUser.balance : Number(body.amount);
            if (!Number.isFinite(amount) || amount < 100) return response({ error: "Минимальная ставка — 100 байтов" }, 400);
            if (amount > currentUser.balance) return response({ error: "Недостаточно байтов" }, 400);

            const side = Math.random() < 0.5 ? "heads" : "tails";
            const win = side === choice;
            const delta = win ? amount * (COIN_MULTIPLIER - 1) : -amount;

            await env.DB.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).bind(delta, id).run();
            const updated = await getUser(env, id);
            return response({ ...updated, side, win });

        } else if (body.action === "slot") {
            const isBonus = Boolean(body.isBonus);
            let baseAmount = body.all === true ? currentUser.balance : Number(body.amount);

            if (!Number.isFinite(baseAmount) || baseAmount < 100) {
                return response({ error: "Минимальная ставка — 100 байтов" }, 400);
            }

            // Если покупка бонуски, стоимость = ставка * 100
            const totalCost = isBonus ? baseAmount * 100 : baseAmount;

            if (totalCost > currentUser.balance) {
                return response({ error: "Недостаточно байтов для ставки/покупки бонуски" }, 400);
            }

            let totalWinMultiplier = 0;
            let lastGrid = [];
            let bonusSpinsResults = [];
            let totalAccumulatedZeus = 0;

            if (isBonus) {
                // ПОЛНОЦЕННАЯ БОНУСКА: 15 СПИНОВ С НАКОПИТЕЛЬНЫМ МНОЖИТЕЛЕМ ЗЕВСА
                let globalBonusMultiplier = 0;
                for (let i = 0; i < 15; i++) {
                    const spinRes = calculateSingleSpin(true);
                    lastGrid = spinRes.grid;
                    if (spinRes.zeus > 0) {
                        globalBonusMultiplier += spinRes.zeus;
                        totalAccumulatedZeus = globalBonusMultiplier;
                    }
                    if (spinRes.multiplier > 0) {
                        // В бонуске выигрыши умножаются на накопленный глобальный множитель
                        const multiplierWithGlobal = spinRes.multiplier * Math.max(1, globalBonusMultiplier);
                        totalWinMultiplier += multiplierWithGlobal;
                        bonusSpinsResults.push({ spin: i + 1, mult: multiplierWithGlobal });
                    }
                }
                if (totalWinMultiplier === 0) totalWinMultiplier = 5.0; // Гарантированный бонус
            } else {
                // ОБЫЧНЫЙ СПИН
                const spinRes = calculateSingleSpin(false);
                lastGrid = spinRes.grid;
                totalWinMultiplier = spinRes.multiplier;
                totalAccumulatedZeus = spinRes.zeus;
            }

            const winAmount = Math.floor(baseAmount * totalWinMultiplier);
            const delta = winAmount - totalCost;

            await env.DB.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).bind(delta, id).run();
            const updated = await getUser(env, id);

            return response({
                ...updated,
                win: totalWinMultiplier > 0,
                grid: lastGrid,
                slotMultiplier: Number(totalWinMultiplier.toFixed(2)),
                zeus: totalAccumulatedZeus || 1,
                isBonus: isBonus
            });

        } else if (body.action === "redeem_promo") {
            const code = String(body.code || "").trim().toUpperCase();
            if (!code) return response({ error: "Введите промокод" }, 400);

            const promo = await env.DB.prepare(`SELECT reward FROM promos WHERE code = ?`).bind(code).first();
            if (!promo) return response({ error: "Промокод не найден или устарел" }, 400);

            const used = await env.DB.prepare(`SELECT 1 FROM used_promos WHERE telegram_id = ? AND code = ?`).bind(id, code).first();
            if (used) return response({ error: "Вы уже активировали этот промокод" }, 400);

            await env.DB.prepare(`INSERT INTO used_promos (telegram_id, code) VALUES (?, ?)`).bind(id, code).run();
            await env.DB.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).bind(promo.reward, id).run();

            const updated = await getUser(env, id);
            return response(updated);

        } else {
            return response({ error: "Unknown action" }, 400);
        }

    } catch (error) {
        return response({ error: error.message }, 500);
    }
}
