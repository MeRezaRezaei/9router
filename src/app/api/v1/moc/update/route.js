import { NextResponse } from "next/server";
import { setMocData } from "@/lib/localDb.js";

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
    const { provider, models, capabilities, pricing } = body;

    if (!provider || typeof provider !== "string") {
      return NextResponse.json({ error: "Missing or invalid provider" }, { status: 400 });
    }

    const payload = {
      provider,
      models: Array.isArray(models) ? models : [],
      capabilities: capabilities || null,
      pricing: pricing || null,
      updatedAt: new Date().toISOString(),
    };

    await setMocData(provider, payload);

    return NextResponse.json({ ok: true, provider, message: "MOC data updated successfully" }, {
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
