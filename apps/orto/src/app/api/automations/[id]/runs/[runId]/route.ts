import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";
import { ID_PATTERN } from "@/lib/route-params";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, runId } = await params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid automation ID" }, { status: 400 });
  }
  if (!ID_PATTERN.test(runId)) {
    return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
  }

  try {
    const response = await controlPlaneFetch(`/automations/${id}/runs/${runId}`);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch automation run:", error);
    return NextResponse.json({ error: "Failed to fetch automation run" }, { status: 500 });
  }
}
