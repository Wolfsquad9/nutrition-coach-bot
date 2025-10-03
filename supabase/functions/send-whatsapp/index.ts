import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientPhone, planData, planType } = await req.json();

    // Validate input
    if (!clientPhone || !planData) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: clientPhone, planData" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TODO: Integrate with Twilio or Make.com webhook
    // For now, this is a skeleton endpoint
    
    console.log("WhatsApp send request:", {
      phone: clientPhone,
      planType: planType || "complete",
      dataSize: JSON.stringify(planData).length
    });

    // Placeholder response
    // Replace with actual Twilio/Make.com integration:
    // const twilioResponse = await fetch("https://api.twilio.com/...", {
    //   method: "POST",
    //   headers: { ... },
    //   body: JSON.stringify({ ... })
    // });

    return new Response(
      JSON.stringify({
        success: true,
        message: "WhatsApp send endpoint ready for integration",
        clientPhone,
        planType: planType || "complete",
        note: "Replace this with actual Twilio/Make.com webhook call"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
