import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";
import { GITHUB_NAME_PATTERN } from "@/lib/route-params";

export async function POST(
  _request: NextRequest,
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
    const response = await controlPlaneFetch(
      `/repo-images/trigger/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      { method: "POST" }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to trigger image build:", error);
    return NextResponse.json({ error: "Failed to trigger image build" }, { status: 500 });
  }
}
