import { NextRequest, NextResponse } from "next/server";

// Function to get auth token for the OpenAI realtime api
export async function POST(request: NextRequest) {
    // Get api key from env variables
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }
    try {
        // Get voice choice and prompt from request
        const { voice, instructions } = await request.json();
        if (!instructions || typeof instructions !== "string") {
            return NextResponse.json({ error: "Missing instructions in request body" }, { status: 400 });
        }
        if (!voice || typeof voice !== "string") {
            return NextResponse.json({ error: "Missing voice selection in request body" }, { status: 400 });
        }

        // Send api key + voice prompt and get a temporary token for client side auth
        const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-realtime-preview-2024-12-17",
                voice: voice,
                instructions: instructions
            }),
        });

        // Handle response
        const data = await res.json();
        if (!res.ok) {
            console.error("Error creating session:", data);
            return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("Token generation failed:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}