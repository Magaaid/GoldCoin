
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
    return response({
        bindings: Object.keys(env)
    });
}

export async function onRequestPost({ env }) {
    return response({
        bindings: Object.keys(env)
    });
}
