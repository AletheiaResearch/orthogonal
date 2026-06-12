import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";
import { ID_PATTERN } from "@/lib/route-params";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid integration ID" }, { status: 400 });
  }

  try {
    const response = await controlPlaneFetch(
      `/integration-settings/${encodeURIComponent(id)}/repos`
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch repo settings:", error);
    return NextResponse.json({ error: "Failed to fetch repo settings" }, { status: 500 });
  }
}
