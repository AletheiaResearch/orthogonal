import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";
import { GITHUB_NAME_PATTERN } from "@/lib/route-params";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { owner, name } = await params;
  if (!GITHUB_NAME_PATTERN.test(owner)) {
    return NextResponse.json({ error: "Invalid repository owner" }, { status: 400 });
  }
  if (!GITHUB_NAME_PATTERN.test(name)) {
    return NextResponse.json({ error: "Invalid repository name" }, { status: 400 });
  }

  try {
    const body = await request.json();

    const response = await controlPlaneFetch(
      `/repo-images/toggle/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to toggle image build:", error);
    return NextResponse.json({ error: "Failed to toggle image build" }, { status: 500 });
  }
}
