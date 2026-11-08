function response(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
        }
    });
}

export async function onRequestGet({ env }) {
    try {
        const result = await env.DB.prepare(
            "SELECT 1 AS test"
        ).first();

        return response({
            success: true,
            database: result
        });
    } catch (error) {
        return response({
            success: false,
            error: error.message
        }, 500);
    }
}
