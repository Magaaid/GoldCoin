
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
    const now = Date.now() / 1000;

    if (!authDate || now - authDate > 86400 || authDate > now + 60) {
        return null;
    }

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(botToken),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const secret = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode("WebAppData")
    );

    const validationKey = await crypto.subtle.importKey(
        "raw",
        secret,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        validationKey,
        encoder.encode(dataCheckString)
    );

    const calculatedHash = [...new Uint8Array(signature)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    if (calculatedHash !== hash) return null;

    try {
        return JSON.parse(params.get("user"));
    } catch {
        return null;
    }
}

async function authenticate(request, env) {
    const initData = request.headers.get("X-Telegram-Init-Data");

    if (!initData) {
        return { error: "initData missing" };
    }

    if (!env.BOT_TOKEN) {
        return { error: "BOT_TOKEN missing" };
    }

    try {
        const user = await verifyTelegram(initData, env.BOT_TOKEN);

        if (!user) {
            return { error: "initData validation failed" };
        }

        return { user };
    } catch (error) {
        return { error: "Verification error: " + error.message };
    }
}

async function getUser(env, id) {
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

export async function onRequestGet({ request, env }) {
    try {
        if (!env.DB) {
            return response({ error: "Database not configured" }, 500);
        }

        const auth = await authenticate(request, env);

        if (auth.error) {
            return response({ error: auth.error }, 401);
        }

        const user = auth.user;
        const data = await getUser(env, user.id);

        return response(data);

    } catch (error) {
        return response({ error: error.message }, 500);
    }
}

export async function onRequestPost({ request, env }) {
    try {
        if (!env.DB) {
            return response({ error: "Database not configured" }, 500);
        }

        const auth = await authenticate(request, env);

        if (auth.error) {
            return response({ error: auth.error }, 401);
        }

        const user = auth.user;
        const body = await request.json();
        const id = String(user.id);

        await getUser(env, id);

        if (body.action === "earn") {
            await env.DB.prepare(`
                UPDATE users
                SET balance = balance + income
                WHERE telegram_id = ?
            `).bind(id).run();

        } else if (body.action === "upgrade") {
            const result = await env.DB.prepare(`
                UPDATE users
                SET balance = balance - upgrade_cost,
                    income = income * 2,
                    upgrade_cost = upgrade_cost * 2
                WHERE telegram_id = ?
                AND balance >= upgrade_cost
            `).bind(id).run();

            if (result.meta.changes === 0) {
                return response({ error: "Недостаточно коинов" }, 400);
            }

        } else {
            return response({ error: "Unknown action" }, 400);
        }

        return response(await getUser(env, id));

    } catch (error) {
        return response({ error: error.message }, 500);
    }
}
