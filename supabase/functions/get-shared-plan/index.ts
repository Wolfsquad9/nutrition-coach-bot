import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Support BOTH authenticated (Bearer) and anonymous (apikey) access.
    // Sprint 1.75 behavior: public shared plans work WITHOUT authentication.
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');
    
    let supabase;
    if (authHeader?.startsWith('Bearer ')) {
      // Authenticated request — create client with JWT for RLS-enforced access
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
    } else if (apikeyHeader === supabaseAnonKey) {
      // Anonymous request — create client with anon key (Sprint 1.75 behavior)
      supabase = createClient(supabaseUrl, supabaseAnonKey);
    } else {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing or invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const versionId = url.searchParams.get("versionId");

    if (!versionId) {
      return new Response(
        JSON.stringify({ error: "Missing versionId parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(versionId)) {
      return new Response(
        JSON.stringify({ error: "Invalid versionId format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the plan version with its snapshot (RLS enforced for authenticated, 
    // public access for anonymous via apikey)
    const { data, error } = await supabase
      .from("plan_versions")
      .select("id, locked_snapshot_json, plan_payload, created_at")
      .eq("id", versionId)
      .maybeSingle();

    if (error) {
      console.error("DB error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch plan" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ error: "Plan not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only serve plans that have a locked snapshot (i.e. were actually locked)
    if (!data.locked_snapshot_json) {
      return new Response(
        JSON.stringify({ error: "Plan not available for sharing" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        snapshot: data.locked_snapshot_json,
        createdAt: data.created_at,
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});