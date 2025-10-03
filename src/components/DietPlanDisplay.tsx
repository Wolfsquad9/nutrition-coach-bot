import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Utensils, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DietPlanDisplayProps {
  plan: {
    totalCalories: number;
    macros: {
      protein: number;
      carbs: number;
      fat: number;
    };
    meals: Array<{
      day: number;
      meals: Array<{
        name: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      }>;
    }>;
  };
}

export function DietPlanDisplay({ plan }: DietPlanDisplayProps) {
  const chartData = plan.meals.slice(0, 7).map(day => ({
    name: `Jour ${day.day}`,
    Protéines: day.meals.reduce((sum, m) => sum + m.protein, 0),
    Glucides: day.meals.reduce((sum, m) => sum + m.carbs, 0),
    Lipides: day.meals.reduce((sum, m) => sum + m.fat, 0),
  }));

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Utensils className="h-5 w-5 text-primary" />
          Plan Nutritionnel
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Macro Summary */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Calories</p>
            <p className="text-xl font-bold text-primary">{plan.totalCalories}</p>
            <p className="text-xs text-muted-foreground">kcal/jour</p>
          </div>
          <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Protéines</p>
            <p className="text-xl font-bold text-success">{plan.macros.protein}g</p>
          </div>
          <div className="p-3 rounded-lg bg-info/10 border border-info/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Glucides</p>
            <p className="text-xl font-bold text-info">{plan.macros.carbs}g</p>
          </div>
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Lipides</p>
            <p className="text-xl font-bold text-warning">{plan.macros.fat}g</p>
          </div>
        </div>

        {/* Weekly Chart */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Répartition Hebdomadaire</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
              <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: '12px' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Protéines" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Glucides" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Lipides" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Meals Preview */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Exemple Journée Type</h4>
          <ScrollArea className="h-[200px] pr-4">
            <div className="space-y-2">
              {plan.meals[0]?.meals.map((meal, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-card border border-border hover:bg-card-hover transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-foreground">{meal.name}</span>
                    <Badge variant="secondary">{meal.calories} kcal</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-3">
                    <span>P: {meal.protein}g</span>
                    <span>C: {meal.carbs}g</span>
                    <span>L: {meal.fat}g</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Shopping List Preview */}
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">Liste de Courses</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Liste complète disponible dans l'export PDF
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
