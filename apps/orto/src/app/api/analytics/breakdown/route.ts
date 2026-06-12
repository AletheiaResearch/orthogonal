import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildAnalyticsBreakdownPath } from "@/lib/analytics-query";
import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = buildAnalyticsBreakdownPath(new URL(request.url).searchParams);

  try {
    const response = await controlPlaneFetch(path);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch analytics breakdown:", error);
    return NextResponse.json({ error: "Failed to fetch analytics breakdown" }, { status: 500 });
  }
}
