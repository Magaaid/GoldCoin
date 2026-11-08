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
    if (!env.BOT_TOKEN) return { user: { id: "test_user", username: "test_user" } };

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
                username TEXT,
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
        // Добавляем колонку username для старых баз данных, если её ещё нет
        await db.prepare(`ALTER TABLE users ADD COLUMN username TEXT`).run().catch(() => {});

        await db.prepare(`INSERT OR IGNORE INTO promos (code, reward) VALUES ('ZEUS', 10000000000000)`).run();
        await db.prepare(`INSERT OR IGNORE INTO promos (code, reward) VALUES ('BONUS', 5000000000000)`).run();
    } catch (e) {}
}

async function getUser(env, authUser) {
    if (!env.DB) throw new Error("База данных D1 не привязана!");
    await ensureTables(env.DB);

    const strId = String(authUser.id);
    const username = authUser.username ? String(authUser.username).toLowerCase() : null;

    let user = await env.DB.prepare(`SELECT balance, income, upgrade_cost, username FROM users WHERE telegram_id = ?`).bind(strId).first();

    if (!user) {
        await env.DB.prepare(`INSERT INTO users (telegram_id, username, balance, income, upgrade_cost) VALUES (?, ?, 0, 0.5, 1024)`).bind(strId, username).run();
        user = { balance: 0, income: 0.5, upgrade_cost: 1024, username };
    } else if (username && user.username !== username) {
        // Обновляем юзернейм в базе, если он поменялся в Telegram
        await env.DB.prepare(`UPDATE users SET username = ? WHERE telegram_id = ?`).bind(username, strId).run();
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

function getRandomZeusMultiplier(isBonus = false) {
    const rand = Math.random();
    const chanceMultiplier = isBonus ? 1.2 : 1;

    if (rand < 0.85 / chanceMultiplier) return 0;
    if (rand < 0.93) return 2;
    if (rand < 0.97) return 5;
    if (rand < 0.99) return 10;
    if (rand < 0.995) return 25;
    if (rand < 0.998) return 50;
    if (rand < 0.9995) return 100;
    return 500;
}

function getRandomSymbol() {
    const rand = Math.random();
    if (rand < 0.01) return 10;
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
        const user = await getUser(env, auth.user);
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
        const currentUser = await getUser(env, auth.user);

        if (body.action === "earn_batch") {
            const count = Number(body.count);
            if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
                return response({ error: "Invalid click count" }, 400);
            }
            await env.DB.prepare(`UPDATE users SET balance = balance + income * ? WHERE telegram_id = ?`).bind(count, id).run();
            const updated = await getUser(env, auth.user);
            return response(updated);

        } else if (body.action === "upgrade") {
            if (currentUser.balance < currentUser.upgrade_cost) {
                return response({ error: "Недостаточно байтов" }, 400);
            }
            await env.DB.prepare(`
                UPDATE users SET balance = balance - upgrade_cost, income = income * 2, upgrade_cost = upgrade_cost * 2
                WHERE telegram_id = ?
            `).bind(id).run();
            const updated = await getUser(env, auth.user);
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
            const updated = await getUser(env, auth.user);
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
            const updated = await getUser(env, auth.user);
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
            const updated = await getUser(env, auth.user);

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

            const updated = await getUser(env, auth.user);
            return response(updated);

        // ==========================================
        // ЛОГИКА ПЕРЕВОДОВ ПО ЮЗЕРНЕЙМУ
        // ==========================================
        } else if (body.action === "transfer") {
            const { targetUsername, amount } = body;
            const senderTelegramId = id;
            const senderUsername = (auth.user.username || "").toLowerCase();

            if (!targetUsername || !amount || amount <= 0) {
                return response({ error: "Неверные данные для перевода" }, 400);
            }

            if (senderUsername && senderUsername === targetUsername.toLowerCase()) {
                return response({ error: "Нельзя переводить средства самому себе" }, 400);
            }

            try {
                // 1. Ищем получателя в базе по юзернейму
                const recipient = await env.DB.prepare("SELECT telegram_id FROM users WHERE LOWER(username) = ?")
                    .bind(targetUsername.toLowerCase())
                    .first();

                if (!recipient) {
                    return response({ error: "Игрок с таким юзернеймом не найден в базе (он должен хотя бы раз открыть игру)" }, 400);
                }

                const recipientTelegramId = recipient.telegram_id;

                if (String(senderTelegramId) === String(recipientTelegramId)) {
                    return response({ error: "Нельзя переводить средства самому себе" }, 400);
                }

                // 2. Выполняем атомарный перевод средств через транзакцию D1
                await env.DB.batch([
                    env.DB.prepare("UPDATE users SET balance = balance - ? WHERE telegram_id = ? AND balance >= ?")
                        .bind(amount, senderTelegramId, amount),
                    env.DB.prepare("UPDATE users SET balance = balance + ? WHERE telegram_id = ?")
                        .bind(amount, recipientTelegramId)
                ]);

                // 3. Получаем свежий баланс отправителя
                const updatedSender = await getUser(env, auth.user);

                return response({
                    balance: updatedSender.balance,
                    income: updatedSender.income,
                    upgrade_cost: updatedSender.upgrade_cost
                });

            } catch (err) {
                return response({ error: "Ошибка перевода (недостаточно средств или сбой базы данных)" }, 400);
            }

        } else {
            return response({ error: "Unknown action" }, 400);
        }

    } catch (error) {
        return response({ error: error.message }, 500);
    }
}
