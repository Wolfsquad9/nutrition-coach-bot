// ============================================================================
// Shared Plan Edge Function
//
// Architecture (see docs/architecture/shared-plan.md):
//   - This endpoint is intentionally PUBLIC. Authentication is OPTIONAL.
//   - The UUID is the authorization boundary. Possession of the link grants
//     read-only access to the locked snapshot.
//   - The RPC `get_shared_plan_snapshot` is the ENTIRE security boundary.
//     It explicitly SELECTs only (snapshot, created_at) from plan_versions.
//     No other column is reachable through this endpoint.
//   - There is NO service_role key in this function. There is NO
//     SELECT * against plan_versions. There is NO bearer-token branching.
//
// CORS:
//   Access-Control-Allow-Origin: * is intentional. Sharing works across
//   origins (email link, chat, etc.). This function returns a public
//   snapshot — no private data leaves the database.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Single client. No branching on Authorization. The RPC is the boundary.
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing token parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!UUID_REGEX.test(token)) {
      return new Response(
        JSON.stringify({ error: "Invalid token format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // The RPC is the entire security boundary. It returns at most one row of
    // (snapshot, created_at). It refuses to return plans that are not locked
    // or that are archived. It refuses unknown UUIDs (empty result).
    const { data, error } = await supabase.rpc("get_shared_plan_snapshot", {
      p_token: token,
    });

    if (error) {
      console.error("RPC error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch plan" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // RPC returns a SETOF; we expect 0 or 1 rows.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.snapshot) {
      return new Response(
        JSON.stringify({ error: "Plan not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        snapshot: row.snapshot,
        createdAt: row.created_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});