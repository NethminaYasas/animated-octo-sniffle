import { checkSupabaseConnection } from "@/lib/supabase/status";
import { NextResponse } from "next/server";

export async function GET() {
  const result = await checkSupabaseConnection();
  return NextResponse.json(result);
}