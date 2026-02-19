import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';

function sanitize(val: string): string {
  return val.replace(/[\n\r]/g, ' ').substring(0, 200);
}

function sanitizeArray(arr: string[]): string {
  return arr.map(s => sanitize(s)).join(', ');
}

const ClientSchema = z.object({
  firstName: z.string().max(100).default(''),
  lastName: z.string().max(100).default(''),
  age: z.coerce.number().int().min(1).max(120).optional(),
  gender: z.string().max(20).default('unknown'),
  height: z.coerce.number().min(50).max(300).optional(),
  weight: z.coerce.number().min(20).max(500).optional(),
  primaryGoal: z.string().max(100).default('general fitness'),
  trainingExperience: z.string().max(50).default('beginner'),
  activityLevel: z.string().max(50).default('moderately_active'),
  trainingDaysPerWeek: z.coerce.number().int().min(1).max(7).default(3),
  sessionDuration: z.coerce.number().int().min(10).max(300).default(60),
  dietType: z.string().max(50).default('omnivore'),
  mealsPerDay: z.coerce.number().int().min(1).max(10).default(3),
  allergies: z.array(z.string().max(100)).max(50).default([]),
  intolerances: z.array(z.string().max(100)).max(50).default([]),
  dislikedFoods: z.array(z.string().max(100)).max(50).default([]),
  medicalConditions: z.array(z.string().max(100)).max(50).default([]),
  equipmentAvailable: z.array(z.string().max(100)).max(50).optional(),
  equipment: z.array(z.string().max(100)).max(50).optional(),
});

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Missing auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create authenticated Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the JWT and get user claims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log('Authenticated user:', userId);

    const body = await req.json();
    const parseResult = ClientSchema.safeParse(body.client);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid client data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const client = parseResult.data;

    // Create a detailed prompt for GPT-5 to generate the fitness plan
    const systemPrompt = `You are an expert fitness and nutrition coach specializing in personalized plans for men aged 25-55. 
Generate a complete, scientifically-backed fitness plan based on the latest research (2020-2025).

IMPORTANT: You must respond with ONLY a valid JSON object, no additional text or markdown.

The response must include:
1. nutrition_plan: 7-day meal plan with exact portions, timing, and macros
2. training_plan: Complete weekly workout schedule with exercises, sets, reps, RPE
3. grocery_list: Consolidated shopping list with exact quantities
4. recommendations: Personalized tips for adherence and success

Consider the client's:
- Medical conditions and red flags
- Allergies and intolerances  
- Dietary preferences
- Equipment availability
- Training experience
- Schedule constraints`;

    const equipment = client.equipmentAvailable || client.equipment || [];

    const userPrompt = `Generate a complete fitness plan for this client:

Name: ${sanitize(client.firstName)} ${sanitize(client.lastName)}
Age: ${client.age ?? 'unknown'} years
Gender: ${sanitize(client.gender)}
Height: ${client.height ?? 'unknown'} cm
Weight: ${client.weight ?? 'unknown'} kg
Goal: ${sanitize(client.primaryGoal)}
Training Experience: ${sanitize(client.trainingExperience)}
Activity Level: ${sanitize(client.activityLevel)}
Training Days Per Week: ${client.trainingDaysPerWeek}
Session Duration: ${client.sessionDuration} minutes
Diet Type: ${sanitize(client.dietType)}
Meals Per Day: ${client.mealsPerDay}
Allergies: ${client.allergies.length > 0 ? sanitizeArray(client.allergies) : 'None'}
Intolerances: ${client.intolerances.length > 0 ? sanitizeArray(client.intolerances) : 'None'}
Disliked Foods: ${client.dislikedFoods.length > 0 ? sanitizeArray(client.dislikedFoods) : 'None'}
Medical Conditions: ${client.medicalConditions.length > 0 ? sanitizeArray(client.medicalConditions) : 'None'}
Equipment Available: ${equipment.length > 0 ? sanitizeArray(equipment) : 'Bodyweight only'}

Generate a JSON response with this exact structure:
{
  "nutrition_plan": {
    "daily_calories": number,
    "daily_macros": {
      "protein": number,
      "carbs": number, 
      "fat": number
    },
    "meal_plans": [
      {
        "day": number,
        "meals": [
          {
            "meal_number": number,
            "meal_type": "breakfast|lunch|dinner|snack",
            "time": "HH:MM",
            "foods": [
              {
                "name": string,
                "amount": number,
                "unit": string,
                "calories": number,
                "protein": number,
                "carbs": number,
                "fat": number
              }
            ]
          }
        ]
      }
    ]
  },
  "training_plan": {
    "split": string,
    "workouts": [
      {
        "day": number,
        "name": string,
        "exercises": [
          {
            "name": string,
            "sets": number,
            "reps": string,
            "rest": number,
            "intensity": string,
            "notes": string
          }
        ]
      }
    ]
  },
  "grocery_list": [
    {
      "category": string,
      "items": [
        {
          "name": string,
          "amount": number,
          "unit": string
        }
      ]
    }
  ],
  "recommendations": {
    "nutrition_tips": [string],
    "training_tips": [string],
    "adherence_strategies": [string]
  }
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate plan with AI');
    }

    const data = await response.json();
    const generatedPlan = JSON.parse(data.choices[0].message.content);

    console.log('Plan generated successfully for user:', userId);

    return new Response(JSON.stringify({ 
      success: true,
      plan: generatedPlan 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-fitness-plan function:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'An unexpected error occurred. Please try again.' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
