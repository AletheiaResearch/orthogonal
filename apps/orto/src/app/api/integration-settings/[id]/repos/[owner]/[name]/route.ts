import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";
import { GITHUB_NAME_PATTERN, ID_PATTERN } from "@/lib/route-params";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; owner: string; name: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, owner, name } = await params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid integration ID" }, { status: 400 });
  }
  if (!GITHUB_NAME_PATTERN.test(owner)) {
    return NextResponse.json({ error: "Invalid repository owner" }, { status: 400 });
  }
  if (!GITHUB_NAME_PATTERN.test(name)) {
    return NextResponse.json({ error: "Invalid repository name" }, { status: 400 });
  }

  try {
    const response = await controlPlaneFetch(
      `/integration-settings/${encodeURIComponent(id)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch repo integration settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch repo integration settings" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; owner: string; name: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, owner, name } = await params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid integration ID" }, { status: 400 });
  }
  if (!GITHUB_NAME_PATTERN.test(owner)) {
    return NextResponse.json({ error: "Invalid repository owner" }, { status: 400 });
  }
  if (!GITHUB_NAME_PATTERN.test(name)) {
    return NextResponse.json({ error: "Invalid repository name" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const response = await controlPlaneFetch(
      `/integration-settings/${encodeURIComponent(id)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      }
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to update repo integration settings:", error);
    return NextResponse.json(
      { error: "Failed to update repo integration settings" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; owner: string; name: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, owner, name } = await params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid integration ID" }, { status: 400 });
  }
  if (!GITHUB_NAME_PATTERN.test(owner)) {
    return NextResponse.json({ error: "Invalid repository owner" }, { status: 400 });
  }
  if (!GITHUB_NAME_PATTERN.test(name)) {
    return NextResponse.json({ error: "Invalid repository name" }, { status: 400 });
  }

  try {
    const response = await controlPlaneFetch(
      `/integration-settings/${encodeURIComponent(id)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
      }
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to delete repo integration settings:", error);
    return NextResponse.json(
      { error: "Failed to delete repo integration settings" },
      { status: 500 }
    );
  }
}
