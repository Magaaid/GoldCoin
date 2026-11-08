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
    if (!initData) return { id: "test_user", first_name: "Test" };
    
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);
    if (!authDate || now - authDate > 86400) return null;

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const secret = await crypto.subtle.sign("HMAC", key, encoder.encode(botToken));
    const validationKey = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", validationKey, encoder.encode(dataCheckString));
    const calculatedHash = [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, "0")).join("");

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
    if (!env.BOT_TOKEN) return { user: { id: "test_user" } };

    try {
        const user = await verifyTelegram(initData, env.BOT_TOKEN);
        if (!user || !user.id) return { error: "initData validation failed" };
        return { user };
    } catch (error) {
        return { error: "Verification error: " + error.message };
    }
}

async function ensureTables(db) {
    try {
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id TEXT PRIMARY KEY,
                balance REAL DEFAULT 0,
                income REAL DEFAULT 0.5,
                upgrade_cost REAL DEFAULT 1024
            );
            CREATE TABLE IF NOT EXISTS promos (
                code TEXT PRIMARY KEY,
                reward REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS used_promos (
                telegram_id TEXT,
                code TEXT,
                PRIMARY KEY (telegram_id, code)
            );
        `);
        await db.prepare(`INSERT OR IGNORE INTO promos (code, reward) VALUES ('ZEUS', 10000000000000)`).run();
        await db.prepare(`INSERT OR IGNORE INTO promos (code, reward) VALUES ('BONUS', 5000000000000)`).run();
    } catch (e) {}
}

async function getUser(env, id) {
    if (!env.DB) throw new Error("База данных D1 не привязана!");
    await ensureTables(env.DB);

    const strId = String(id);
    let user = await env.DB.prepare(`SELECT balance, income, upgrade_cost FROM users WHERE telegram_id = ?`).bind(strId).first();

    if (!user) {
        await env.DB.prepare(`INSERT INTO users (telegram_id, balance, income, upgrade_cost) VALUES (?, 0, 0.5, 1024)`).bind(strId).run();
        user = { balance: 0, income: 0.5, upgrade_cost: 1024 };
    }
    return user;
}

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

// СУЩЕСТВЕННО СНИЖЕННЫЕ ШАНСЫ НА МНОЖИТЕЛИ ЗЕВСА (высокая волатильность)
function getRandomZeusMultiplier(isBonus = false) {
    const rand = Math.random();
    const chanceMultiplier = isBonus ? 1.2 : 1;

    // 85% шансов, что в спинах вообще не будет множителя (пустой удар)
    if (rand < 0.85 / chanceMultiplier) return 0;
    if (rand < 0.93) return 2;
    if (rand < 0.97) return 5;
    if (rand < 0.99) return 10;
    if (rand < 0.995) return 25;
    if (rand < 0.998) return 50;
    if (rand < 0.9995) return 100;
    return 500;
}

// СТРОГИЙ ГЕНЕРАТОР СИМВОЛОВ (меньше совпадений от 8 штук)
function getRandomSymbol() {
    const rand = Math.random();
    if (rand < 0.01) return 10; // Скаттеры выпадают крайне редко
    if (rand < 0.06) return 9;
    if (rand < 0.15) return 8;
    if (rand < 0.30) return 7;
    if (rand < 0.50) return 6;
    const lowSymbols = [1, 2, 3, 4, 5];
    return lowSymbols[Math.floor(Math.random() * lowSymbols.length)];
}

function calculateSingleSpin(isBonus = false) {
    const rows = 5, cols = 6;
    let grid = [];
    for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) row.push(getRandomSymbol());
        grid.push(row);
    }
    
    const counts = {};
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const sym = grid[r][c];
            counts[sym] = (counts[sym] || 0) + 1;
        }
    }

    let baseWinMult = 0;
    for (const [sym, count] of Object.entries(counts)) {
        const s = Number(sym);
        // Требуется строго от 8 символов, но коэффициенты уменьшены для жесткой дисперсии
        if (s !== 10 && count >= 8) {
            let mult = 0.25;
            if (s >= 9) mult = 6;
            else if (s >= 8) mult = 4;
            else if (s >= 7) mult = 2.5;
            else if (s >= 6) mult = 1;
            else if (s >= 4) mult = 0.5;

            baseWinMult += mult * (count / 8);
        }
    }
    let zeusBall = getRandomZeusMultiplier(isBonus);
    return { grid, baseWin: baseWinMult, zeus: zeusBall };
}

export async function onRequestGet({ request, env }) {
    try {
        const auth = await authenticate(request, env);
        if (auth.error) return response({ error: auth.error }, 401);
        const user = await getUser(env, auth.user.id);
        return response(user);
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
            const updated = await getUser(env, id);
            return response(updated);

        } else if (body.action === "upgrade") {
            if (currentUser.balance < currentUser.upgrade_cost) {
                return response({ error: "Недостаточно байтов" }, 400);
            }
            await env.DB.prepare(`
                UPDATE users SET balance = balance - upgrade_cost, income = income * 2, upgrade_cost = upgrade_cost * 2
                WHERE telegram_id = ?
            `).bind(id).run();
            const updated = await getUser(env, id);
            return response(updated);

        } else if (body.action === "spin") {
            const choice = String(body.choice);
            const amount = body.all === true ? currentUser.balance : Number(body.amount);
            if (!Number.isFinite(amount) || amount <= 0) return response({ error: "Неверная ставка" }, 400);
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
            if (!Number.isFinite(amount) || amount <= 0) return response({ error: "Неверная ставка" }, 400);
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

            if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
                return response({ error: "Неверная ставка" }, 400);
            }

            const totalCost = isBonus ? baseAmount * 100 : baseAmount;
            if (totalCost > currentUser.balance) {
                return response({ error: "Недостаточно байтов для ставки/покупки бонуски" }, 400);
            }

            let finalMultiplier = 0;
            let lastGrid = [];
            let maxZeusHit = 0;

            if (isBonus) {
                let globalMultiplierAccumulator = 0;
                for (let i = 0; i < 15; i++) {
                    const spin = calculateSingleSpin(true);
                    lastGrid = spin.grid;
                    if (spin.zeus > 0) {
                        globalMultiplierAccumulator += spin.zeus;
                        if (spin.zeus > maxZeusHit) maxZeusHit = spin.zeus;
                    }
                    if (spin.baseWin > 0) {
                        finalMultiplier += spin.baseWin * Math.max(1, globalMultiplierAccumulator);
                    }
                }
                // Часто бонуска будет давать ноль или минимальный утешительный коэффициент
                if (finalMultiplier < 0.5) finalMultiplier = 0;
            } else {
                const spin = calculateSingleSpin(false);
                lastGrid = spin.grid;
                maxZeusHit = spin.zeus;
                if (spin.baseWin > 0) {
                    finalMultiplier = spin.baseWin * Math.max(1, spin.zeus);
                }
            }

            const cleanMult = Number(finalMultiplier.toFixed(2));
            const winAmount = Math.floor(baseAmount * cleanMult);
            const delta = winAmount - totalCost;

            await env.DB.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).bind(delta, id).run();
            const updated = await getUser(env, id);

            return response({
                ...updated,
                win: cleanMult > 0,
                grid: lastGrid,
                slotMultiplier: cleanMult,
                zeus: maxZeusHit,
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
