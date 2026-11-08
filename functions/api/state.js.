
async function verifyTelegram(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) return null;

    params.delete("hash");

    const authDate = Number(params.get("auth_date"));

    if (!authDate || Date.now() / 1000 - authDate > 86400 ||
        authDate > Date.now() / 1000 + 60) {
        return null;
    }

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
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

    const secret = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(botToken)
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

function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
        }
    });
}

async function authenticate(request, env) {
    const initData = request.headers.get("X-Telegram-Init-Data");

    if (!initData || !env.BOT_TOKEN) return null;

    return await verifyTelegram(initData, env.BOT_TOKEN);
}

async function getUser(env, id) {
    await env.DB.prepare(
        "INSERT OR IGNORE INTO users (telegram_id) VALUES (?)"
    ).bind(String(id)).run();

    return await env.DB.prepare(
        `SELECT balance, income, upgrade_cost
         FROM users WHERE telegram_id = ?`
    ).bind(String(id)).first();
}

export async function onRequestGet({ request, env }) {
    if (!env.DB) return response({ error: "Database not configured" }, 500);

    const user = await authenticate(request, env);

    if (!user) return response({ error: "Unauthorized" }, 401);

    const data = await getUser(env, user.id);

    return response(data);
}

export async function onRequestPost({ request, env }) {
    if (!env.DB) return response({ error: "Database not configured" }, 500);

    const user = await authenticate(request, env);

    if (!user) return response({ error: "Unauthorized" }, 401);

    let body;

    try {
        body = await request.json();
    } catch {
        return response({ error: "Invalid JSON" }, 400);
    }

    const id = String(user.id);

    await getUser(env, id);

    if (body.action === "earn") {
        await env.DB.prepare(
            `UPDATE users
             SET balance = balance + income
             WHERE telegram_id = ?`
        ).bind(id).run();

    } else if (body.action === "upgrade") {
        const result = await env.DB.prepare(
            `UPDATE users
             SET balance = balance - upgrade_cost,
                 income = income * 2,
                 upgrade_cost = upgrade_cost * 2
             WHERE telegram_id = ?
             AND balance >= upgrade_cost`
        ).bind(id).run();

        if (result.meta.changes === 0) {
            return response({ error: "Недостаточно коинов" }, 400);
        }

    } else {
        return response({ error: "Unknown action" }, 400);
    }

    return response(await getUser(env, id));
}

