import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";
import { SECRET_KEY_PATTERN } from "@/lib/route-params";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  if (!SECRET_KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: "Invalid secret key" }, { status: 400 });
  }

  try {
    const response = await controlPlaneFetch(`/secrets/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to delete global secret:", error);
    return NextResponse.json({ error: "Failed to delete global secret" }, { status: 500 });
  }
}
