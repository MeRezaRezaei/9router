import { NextResponse } from "next/server";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { provider, expected, received, url, error } = body;

    if (!provider || !error) {
      return NextResponse.json({ error: "Missing required fields (provider, error)" }, { status: 400 });
    }

    // Log the structure drift with a clear pattern that AI agents or alerting can grep
    console.warn(`[MOC_DRIFT_ALERT] Provider: ${provider} | URL: ${url || "N/A"} | Error: ${error}`);
    console.warn(`[MOC_DRIFT_DETAIL] Expected: ${JSON.stringify(expected)} | Received: ${JSON.stringify(received)}`);

    // In a production setup, this can persist to a drift db or trigger a GitHub webhook/dispatch
    return NextResponse.json({
      ok: true,
      message: "Drift report submitted. The AI agent will investigate and suggest updates.",
    }, {
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
