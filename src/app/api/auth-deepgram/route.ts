import { createClient } from "@deepgram/sdk";
import { NextRequest, NextResponse } from "next/server";

// Function to get temporary Deepgram api key for client side auth
export async function GET(request: NextRequest) {
    // Get api key from env variables
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }
    try {
        // Create deepgram client and get project
        const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

        let { result: projectsResult, error: projectsError } =
            await deepgram.manage.getProjects();

        if (projectsError) {
            return NextResponse.json(projectsError);
        }

        const project = projectsResult?.projects[0];
        if (!project) {
            console.error("Error creating deepgram token: Cannot find a Deepgram project");
            return NextResponse.json({ error: "Cannot find a Deepgram project"}, { status: 500 });
        }

        // Create the temporary api key
        let { result: newKeyResult, error: newKeyError } =
            await deepgram.manage.createProjectKey(project.project_id, {
                comment: "Temporary API key",
                scopes: ["usage:write"],
                tags: ["next.js"],
                time_to_live_in_seconds: 60,
            });
        if (newKeyError) {
            console.error("New key result error");
            return NextResponse.json({ error: newKeyError }, { status: 500 });
        }

        // Handle response
        const response = NextResponse.json({ ...newKeyResult});
        response.headers.set("Surrogate-Control", "no-store");
        response.headers.set(
            "Cache-Control",
            "s-maxage=0, no-store, no-cache, must-revalidate, proxy-revalidate"
        );
        response.headers.set("Expires", "0");

        if (!response.ok) {
            console.error("Error creating deepgram token");
            return NextResponse.json({ error: "Failed to create deepgram auth token" }, { status: 500 });
        }

        return response;
    } catch (error) {
        console.error("Deepgram token generation failed:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic'