import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface MacroDonutChartProps {
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export function MacroDonutChart({ macros }: MacroDonutChartProps) {
  const data = [
    { name: 'Protéines', value: macros.protein * 4, color: 'hsl(var(--success))' },
    { name: 'Glucides', value: macros.carbs * 4, color: 'hsl(var(--info))' },
    { name: 'Lipides', value: macros.fat * 9, color: 'hsl(var(--warning))' },
  ];

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => `${Math.round(value)} kcal`}
            contentStyle={{ 
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              color: 'hsl(var(--foreground))'
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded bg-success/10 border border-success/20">
          <p className="text-xs text-muted-foreground">Protéines</p>
          <p className="text-lg font-bold text-success">{macros.protein}g</p>
          <p className="text-xs text-muted-foreground">{total > 0 ? Math.round((macros.protein * 4 / total) * 100) : 0}%</p>
        </div>
        <div className="p-2 rounded bg-info/10 border border-info/20">
          <p className="text-xs text-muted-foreground">Glucides</p>
          <p className="text-lg font-bold text-info">{macros.carbs}g</p>
          <p className="text-xs text-muted-foreground">{total > 0 ? Math.round((macros.carbs * 4 / total) * 100) : 0}%</p>
        </div>
        <div className="p-2 rounded bg-warning/10 border border-warning/20">
          <p className="text-xs text-muted-foreground">Lipides</p>
          <p className="text-lg font-bold text-warning">{macros.fat}g</p>
          <p className="text-xs text-muted-foreground">{total > 0 ? Math.round((macros.fat * 9 / total) * 100) : 0}%</p>
        </div>
      </div>

      <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Calories</p>
        <p className="text-2xl font-bold text-primary">{macros.calories}</p>
        <p className="text-xs text-muted-foreground">kcal</p>
      </div>
    </div>
  );
}
