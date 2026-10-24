import { NextResponse } from "next/server";
import { getUserOrThrow } from "@/lib/supabase/server";

export function jsonError(error: string, status: number, code: string) {
  return NextResponse.json({ error, code }, { status });
}

export async function requireApiUser() {
  try {
    const user = await getUserOrThrow();
    return { user, response: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Not signed in") {
      return { user: null, response: jsonError("Not signed in", 401, "unauthorized") };
    }
    return {
      user: null,
      response: jsonError("Server is missing its configuration.", 500, "config"),
    };
  }
}
