/**
 * PDF Export Module
 * Generates professional PDFs for nutrition and training plans
 */

import jsPDF from 'jspdf';
import { CompletePlan, NutritionPlan, TrainingPlan, MealPlan, GroceryItem } from '@/types';

/**
 * Generates a complete PDF of the client plan
 */
export function generateCompletePlanPDF(plan: CompletePlan): jsPDF {
  const doc = new jsPDF();
  let yPosition = 20;
  
  // Header
  doc.setFontSize(24);
  doc.setTextColor(33, 37, 41);
  doc.text('FitPlan Pro', 105, yPosition, { align: 'center' });
  yPosition += 10;
  
  doc.setFontSize(16);
  doc.text('Complete Client Plan', 105, yPosition, { align: 'center' });
  yPosition += 15;
  
  // Client information
  doc.setFontSize(18);
  doc.setTextColor(0, 123, 255);
  doc.text('Client Information', 20, yPosition);
  yPosition += 10;
  
  doc.setFontSize(11);
  doc.setTextColor(33, 37, 41);
  doc.text(`Name: ${plan.client.firstName} ${plan.client.lastName}`, 20, yPosition);
  yPosition += 6;
  doc.text(`Age: ${calculateAge(plan.client.birthDate)} years | Gender: ${plan.client.gender}`, 20, yPosition);
  yPosition += 6;
  doc.text(`Height: ${plan.client.height}cm | Weight: ${plan.client.weight}kg`, 20, yPosition);
  yPosition += 6;
  doc.text(`Goal: ${plan.client.primaryGoal.replace('_', ' ')}`, 20, yPosition);
  yPosition += 6;
  doc.text(`Activity Level: ${plan.client.activityLevel.replace('_', ' ')}`, 20, yPosition);
  yPosition += 12;
  
  // Nutrition metrics
  doc.setFontSize(18);
  doc.setTextColor(0, 123, 255);
  doc.text('Nutrition Metrics', 20, yPosition);
  yPosition += 10;
  
  doc.setFontSize(11);
  doc.setTextColor(33, 37, 41);
  const metrics = plan.nutritionPlan.metrics;
  doc.text(`TDEE: ${metrics.tdee} kcal/day`, 20, yPosition);
  yPosition += 6;
  doc.text(`Target Calories: ${metrics.targetCalories} kcal/day`, 20, yPosition);
  yPosition += 6;
  doc.text(`Protein: ${metrics.proteinGrams}g | Carbs: ${metrics.carbsGrams}g | Fat: ${metrics.fatGrams}g`, 20, yPosition);
  yPosition += 6;
  doc.text(`Fiber: ${metrics.fiberGrams}g | Water: ${metrics.waterLiters}L`, 20, yPosition);
  yPosition += 12;
  
  // Training plan summary
  doc.setFontSize(18);
  doc.setTextColor(0, 123, 255);
  doc.text('Training Plan', 20, yPosition);
  yPosition += 10;
  
  doc.setFontSize(11);
  doc.setTextColor(33, 37, 41);
  doc.text(`Program: ${plan.trainingPlan.name}`, 20, yPosition);
  yPosition += 6;
  doc.text(`Frequency: ${plan.trainingPlan.frequency} days/week`, 20, yPosition);
  yPosition += 6;
  doc.text(`Split: ${plan.trainingPlan.split.replace('_', ' ')}`, 20, yPosition);
  yPosition += 6;
  doc.text(`Phase: ${plan.trainingPlan.phase}`, 20, yPosition);
  
  // New page for detailed nutrition plan
  doc.addPage();
  addNutritionPlanPages(doc, plan.nutritionPlan);
  
  // New page for detailed training plan
  doc.addPage();
  addTrainingPlanPages(doc, plan.trainingPlan);
  
  // New page for grocery list
  doc.addPage();
  addGroceryListPage(doc, plan.nutritionPlan.groceryList);
  
  return doc;
}

/**
 * Adds nutrition plan pages
 */
function addNutritionPlanPages(doc: jsPDF, nutritionPlan: NutritionPlan): void {
  let yPosition = 20;
  
  doc.setFontSize(20);
  doc.setTextColor(0, 123, 255);
  doc.text('Weekly Nutrition Plan', 105, yPosition, { align: 'center' });
  yPosition += 15;
  
  // Display each day
  nutritionPlan.weeklyMealPlan.forEach((dayPlan: MealPlan) => {
    // Check if we need a new page
    if (yPosition > 240) {
      doc.addPage();
      yPosition = 20;
    }
    
    doc.setFontSize(14);
    doc.setTextColor(40, 167, 69);
    doc.text(`Day ${dayPlan.day}`, 20, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(33, 37, 41);
    doc.text(`Total: ${dayPlan.totalMacros.calories} kcal | P: ${dayPlan.totalMacros.protein}g | C: ${dayPlan.totalMacros.carbs}g | F: ${dayPlan.totalMacros.fat}g`, 20, yPosition);
    yPosition += 8;
    
    dayPlan.meals.forEach(meal => {
      doc.setFontSize(11);
      doc.setTextColor(108, 117, 125);
      doc.text(`${meal.time} - ${meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}`, 25, yPosition);
      yPosition += 5;
      
      meal.recipes.forEach(recipeServing => {
        doc.setFontSize(10);
        doc.setTextColor(33, 37, 41);
        doc.text(`• ${recipeServing.recipe.name} (${recipeServing.servings} serving${recipeServing.servings !== 1 ? 's' : ''})`, 30, yPosition);
        yPosition += 5;
        doc.setFontSize(9);
        doc.setTextColor(108, 117, 125);
        doc.text(`${recipeServing.adjustedMacros.calories} kcal | P: ${recipeServing.adjustedMacros.protein}g | C: ${recipeServing.adjustedMacros.carbs}g | F: ${recipeServing.adjustedMacros.fat}g`, 35, yPosition);
        yPosition += 6;
      });
    });
    
    yPosition += 4;
  });
}

/**
 * Adds training plan pages
 */
function addTrainingPlanPages(doc: jsPDF, trainingPlan: TrainingPlan): void {
  let yPosition = 20;
  
  doc.setFontSize(20);
  doc.setTextColor(0, 123, 255);
  doc.text('Training Program', 105, yPosition, { align: 'center' });
  yPosition += 15;
  
  trainingPlan.workouts.forEach(workout => {
    // Check if we need a new page
    if (yPosition > 200) {
      doc.addPage();
      yPosition = 20;
    }
    
    doc.setFontSize(14);
    doc.setTextColor(40, 167, 69);
    doc.text(`Day ${workout.dayNumber}: ${workout.name}`, 20, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(108, 117, 125);
    doc.text(`Duration: ${workout.duration} minutes`, 20, yPosition);
    yPosition += 8;
    
    workout.exercises.forEach((exercise, index) => {
      doc.setFontSize(11);
      doc.setTextColor(33, 37, 41);
      doc.text(`${index + 1}. ${exercise.exercise.name}`, 25, yPosition);
      yPosition += 5;
      
      doc.setFontSize(9);
      doc.setTextColor(108, 117, 125);
      doc.text(`${exercise.sets} sets × ${exercise.reps} reps | Rest: ${exercise.rest}s | ${exercise.intensity}`, 30, yPosition);
      yPosition += 6;
      
      if (exercise.notes) {
        doc.setFontSize(8);
        doc.setTextColor(173, 181, 189);
        doc.text(`Note: ${exercise.notes}`, 30, yPosition);
        yPosition += 5;
      }
    });
    
    yPosition += 6;
  });
  
  // Add progression notes
  if (yPosition > 240) {
    doc.addPage();
    yPosition = 20;
  }
  
  doc.setFontSize(12);
  doc.setTextColor(0, 123, 255);
  doc.text('Progression Notes', 20, yPosition);
  yPosition += 8;
  
  doc.setFontSize(10);
  doc.setTextColor(33, 37, 41);
  const progressionText = doc.splitTextToSize(trainingPlan.progressionScheme, 170);
  progressionText.forEach((line: string) => {
    doc.text(line, 20, yPosition);
    yPosition += 5;
  });
}

/**
 * Adds grocery list page
 */
function addGroceryListPage(doc: jsPDF, groceryList: GroceryItem[]): void {
  let yPosition = 20;
  
  doc.setFontSize(20);
  doc.setTextColor(0, 123, 255);
  doc.text('Weekly Grocery List', 105, yPosition, { align: 'center' });
  yPosition += 15;
  
  // Group by category
  const categories = [...new Set(groceryList.map(item => item.category))];
  
  categories.forEach(category => {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }
    
    doc.setFontSize(12);
    doc.setTextColor(40, 167, 69);
    doc.text(category.charAt(0).toUpperCase() + category.slice(1), 20, yPosition);
    yPosition += 8;
    
    const categoryItems = groceryList.filter(item => item.category === category);
    categoryItems.forEach(item => {
      doc.setFontSize(10);
      doc.setTextColor(33, 37, 41);
      
      // Format quantity
      const formattedAmount = formatAmount(item.totalAmount, item.unit);
      doc.text(`□ ${item.ingredient}: ${formattedAmount}`, 25, yPosition);
      yPosition += 5;
    });
    
    yPosition += 3;
  });
  
  // Add estimated total cost
  const totalCost = groceryList.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
  
  if (yPosition > 250) {
    doc.addPage();
    yPosition = 20;
  }
  
  yPosition += 10;
  doc.setFontSize(12);
  doc.setTextColor(0, 123, 255);
  doc.text(`Estimated Total Cost: €${totalCost.toFixed(2)}`, 20, yPosition);
}

/**
 * Formats quantities for the grocery list
 */
function formatAmount(amount: number, unit: string): string {
  // Convert to practical units
  if (unit === 'g' && amount >= 1000) {
    return `${(amount / 1000).toFixed(1)} kg`;
  }
  if (unit === 'ml' && amount >= 1000) {
    return `${(amount / 1000).toFixed(1)} L`;
  }
  
  // Round intelligently
  if (amount % 1 === 0) {
    return `${amount} ${unit}`;
  }
  
  return `${amount.toFixed(1)} ${unit}`;
}

/**
 * Calculates age from birth date
 */
function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Exports plan as JSON
 */
export function exportPlanAsJSON(plan: CompletePlan): string {
  return JSON.stringify(plan, null, 2);
}

/**
 * Downloads the PDF
 */
export function downloadPDF(pdf: jsPDF, filename: string = 'client-plan.pdf'): void {
  pdf.save(filename);
}

/**
 * Downloads the JSON
 */
export function downloadJSON(data: string, filename: string = 'client-plan.json'): void {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}