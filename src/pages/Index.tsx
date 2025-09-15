import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calculateNutritionMetrics } from '@/utils/calculations';
import { sampleClient, sampleRecipes } from '@/data/sampleData';
import { Client } from '@/types';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [activeClient, setActiveClient] = useState<Client>(sampleClient);
  const { toast } = useToast();

  const handleGeneratePlan = () => {
    const metrics = calculateNutritionMetrics(activeClient);
    
    toast({
      title: "Plan Generated Successfully!",
      description: `TDEE: ${metrics.tdee} cal | Protein: ${metrics.proteinGrams}g | Carbs: ${metrics.carbsGrams}g | Fat: ${metrics.fatGrams}g`,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-card-hover">
      <header className="bg-gradient-hero text-white py-6 px-4 shadow-xl">
        <div className="container mx-auto">
          <h1 className="text-4xl font-bold">FitPlan Pro</h1>
          <p className="text-white/90 mt-2">Professional Nutrition & Training Planning System</p>
        </div>
      </header>

      <main className="container mx-auto p-6">
        <Tabs defaultValue="client" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-card shadow-card">
            <TabsTrigger value="client">Client Data</TabsTrigger>
            <TabsTrigger value="nutrition">Nutrition Plan</TabsTrigger>
            <TabsTrigger value="training">Training Plan</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="client" className="space-y-4">
            <Card className="p-6 shadow-card">
              <h2 className="text-2xl font-bold mb-4 text-primary">Client Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" value={activeClient.firstName} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" value={activeClient.lastName} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input id="weight" type="number" value={activeClient.weight} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input id="height" type="number" value={activeClient.height} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="goal">Primary Goal</Label>
                  <Select defaultValue={activeClient.primaryGoal}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fat_loss">Fat Loss</SelectItem>
                      <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                      <SelectItem value="recomposition">Body Recomposition</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="activity">Activity Level</Label>
                  <Select defaultValue={activeClient.activityLevel}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sedentary">Sedentary</SelectItem>
                      <SelectItem value="lightly_active">Lightly Active</SelectItem>
                      <SelectItem value="moderately_active">Moderately Active</SelectItem>
                      <SelectItem value="very_active">Very Active</SelectItem>
                      <SelectItem value="extra_active">Extra Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button 
                onClick={handleGeneratePlan}
                className="mt-6 bg-gradient-primary text-white shadow-glow hover:shadow-xl"
              >
                Generate Complete Plan
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="nutrition" className="space-y-4">
            <Card className="p-6 shadow-card">
              <h2 className="text-2xl font-bold mb-4 text-primary">Nutrition Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(() => {
                  const metrics = calculateNutritionMetrics(activeClient);
                  return (
                    <>
                      <div className="bg-gradient-card p-4 rounded-lg">
                        <p className="text-muted-foreground text-sm">TDEE</p>
                        <p className="text-2xl font-bold text-primary">{metrics.tdee}</p>
                        <p className="text-xs text-muted-foreground">kcal/day</p>
                      </div>
                      <div className="bg-gradient-card p-4 rounded-lg">
                        <p className="text-muted-foreground text-sm">Target</p>
                        <p className="text-2xl font-bold text-accent">{metrics.targetCalories}</p>
                        <p className="text-xs text-muted-foreground">kcal/day</p>
                      </div>
                      <div className="bg-gradient-card p-4 rounded-lg">
                        <p className="text-muted-foreground text-sm">Protein</p>
                        <p className="text-2xl font-bold text-success">{metrics.proteinGrams}g</p>
                      </div>
                      <div className="bg-gradient-card p-4 rounded-lg">
                        <p className="text-muted-foreground text-sm">Carbs</p>
                        <p className="text-2xl font-bold text-info">{metrics.carbsGrams}g</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </Card>

            <Card className="p-6 shadow-card">
              <h3 className="text-xl font-bold mb-4">Sample Recipes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sampleRecipes.slice(0, 4).map(recipe => (
                  <div key={recipe.id} className="border border-border rounded-lg p-4 hover:bg-card-hover transition-all">
                    <h4 className="font-semibold text-primary">{recipe.name}</h4>
                    <p className="text-sm text-muted-foreground">{recipe.category} • {recipe.prepTime + recipe.cookTime} min</p>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span>P: {recipe.macrosPerServing.protein}g</span>
                      <span>C: {recipe.macrosPerServing.carbs}g</span>
                      <span>F: {recipe.macrosPerServing.fat}g</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="training">
            <Card className="p-6 shadow-card">
              <h2 className="text-2xl font-bold text-primary">Training Plan</h2>
              <p className="text-muted-foreground">Configure and generate personalized workout plans</p>
            </Card>
          </TabsContent>

          <TabsContent value="export">
            <Card className="p-6 shadow-card">
              <h2 className="text-2xl font-bold text-primary">Export Plans</h2>
              <div className="flex gap-4 mt-4">
                <Button variant="gradient">Export as PDF</Button>
                <Button variant="outline">Send via Email</Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;