import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client } = await req.json();

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

    const userPrompt = `Generate a complete fitness plan for this client:

Name: ${client.firstName} ${client.lastName}
Age: ${client.age} years
Gender: ${client.gender}
Height: ${client.height} cm
Weight: ${client.weight} kg
Goal: ${client.primaryGoal}
Training Experience: ${client.trainingExperience}
Activity Level: ${client.activityLevel}
Training Days Per Week: ${client.trainingDaysPerWeek}
Session Duration: ${client.sessionDuration} minutes
Diet Type: ${client.dietType}
Meals Per Day: ${client.mealsPerDay}
Allergies: ${client.allergies.join(', ')}
Intolerances: ${client.intolerances.join(', ')}
Disliked Foods: ${client.dislikedFoods.join(', ')}
Medical Conditions: ${client.medicalConditions.join(', ')}
Equipment Available: ${client.equipmentAvailable.join(', ')}

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
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});