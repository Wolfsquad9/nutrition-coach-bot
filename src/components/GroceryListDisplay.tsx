import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShoppingCart, DollarSign } from 'lucide-react';
import type { GroceryItem } from '@/types';

interface GroceryListDisplayProps {
  groceryList: GroceryItem[];
  totalEstimatedCost?: number;
}

export function GroceryListDisplay({ groceryList, totalEstimatedCost }: GroceryListDisplayProps) {
  if (!groceryList || groceryList.length === 0) {
    return (
      <Card className="bg-gradient-card border-border">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <ShoppingCart className="h-5 w-5 text-accent" />
            Grocery List
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-muted-foreground">No grocery items available.</p>
        </CardContent>
      </Card>
    );
  }

  // Group by category
  const groupedByCategory = groceryList.reduce(
    (acc, item) => {
      const category = item.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, GroceryItem[]>
  );

  const categories = Object.keys(groupedByCategory).sort();
  const totalItems = groceryList.length;

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <ShoppingCart className="h-5 w-5 text-accent" />
            Grocery List
          </CardTitle>
          <Badge variant="outline" className="text-sm">
            {totalItems} items
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Items</p>
            <p className="text-lg font-bold text-accent">{totalItems}</p>
          </div>
          {totalEstimatedCost !== undefined && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Est. Cost
              </p>
              <p className="text-lg font-bold text-primary">${totalEstimatedCost.toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* Grocery items by category */}
        <ScrollArea className="h-[350px] pr-4">
          <div className="space-y-4">
            {categories.map((category) => (
              <div key={category} className="p-4 rounded-lg bg-card border border-border">
                <h4 className="text-sm font-semibold text-foreground mb-3 capitalize">
                  {category}
                </h4>
                <div className="space-y-2">
                  {groupedByCategory[category]?.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-sm p-2 rounded bg-muted/50 hover:bg-muted/70 transition-colors"
                    >
                      <span className="text-foreground font-medium">
                        {item.ingredient}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {item.totalAmount} {item.unit}
                        </Badge>
                        {item.estimatedCost && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-success/10 text-success border-success/20"
                          >
                            ${item.estimatedCost.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Shopping tips */}
        <div className="p-4 rounded-lg bg-info/10 border border-info/20">
          <h5 className="text-sm font-semibold text-info mb-1">Shopping Tips</h5>
          <p className="text-xs text-muted-foreground">
            Shop for fresh items 2-3 days before starting the meal plan for optimal freshness
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
