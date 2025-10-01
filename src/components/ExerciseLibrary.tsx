import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, Search, Filter, ChevronRight } from 'lucide-react';
import { Exercise } from '@/types';

const exerciseVideos = [
  {
    id: 'squat',
    name: 'Barbell Squat',
    category: 'legs',
    videoUrl: 'https://www.youtube.com/embed/ultWZbUMPL8',
    thumbnailUrl: 'https://img.youtube.com/vi/ultWZbUMPL8/mqdefault.jpg',
    duration: 180,
    difficulty: 'intermediate',
    primaryMuscles: ['Quadriceps', 'Glutes'],
    equipment: ['Barbell', 'Squat Rack']
  },
  {
    id: 'bench-press',
    name: 'Bench Press',
    category: 'chest',
    videoUrl: 'https://www.youtube.com/embed/rT7DgCr-3pg',
    thumbnailUrl: 'https://img.youtube.com/vi/rT7DgCr-3pg/mqdefault.jpg',
    duration: 150,
    difficulty: 'intermediate',
    primaryMuscles: ['Chest', 'Triceps'],
    equipment: ['Barbell', 'Bench']
  },
  {
    id: 'deadlift',
    name: 'Deadlift',
    category: 'back',
    videoUrl: 'https://www.youtube.com/embed/op9kVnSso6Q',
    thumbnailUrl: 'https://img.youtube.com/vi/op9kVnSso6Q/mqdefault.jpg',
    duration: 200,
    difficulty: 'advanced',
    primaryMuscles: ['Back', 'Hamstrings', 'Glutes'],
    equipment: ['Barbell']
  },
  {
    id: 'shoulder-press',
    name: 'Overhead Press',
    category: 'shoulders',
    videoUrl: 'https://www.youtube.com/embed/2yjwXTZQDDI',
    thumbnailUrl: 'https://img.youtube.com/vi/2yjwXTZQDDI/mqdefault.jpg',
    duration: 160,
    difficulty: 'intermediate',
    primaryMuscles: ['Shoulders', 'Triceps'],
    equipment: ['Barbell']
  },
  {
    id: 'pull-up',
    name: 'Pull-ups',
    category: 'back',
    videoUrl: 'https://www.youtube.com/embed/eGo4IYlbE5g',
    thumbnailUrl: 'https://img.youtube.com/vi/eGo4IYlbE5g/mqdefault.jpg',
    duration: 120,
    difficulty: 'intermediate',
    primaryMuscles: ['Lats', 'Biceps'],
    equipment: ['Pull-up Bar']
  }
];

interface ExerciseLibraryProps {
  onSelectExercise?: (exercise: any) => void;
}

export const ExerciseLibrary = ({ onSelectExercise }: ExerciseLibraryProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const categories = ['all', 'chest', 'back', 'shoulders', 'legs', 'arms', 'abs'];

  const filteredExercises = exerciseVideos.filter(exercise => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || exercise.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-success/10 text-success';
      case 'intermediate': return 'bg-warning/10 text-warning';
      case 'advanced': return 'bg-destructive/10 text-destructive';
      default: return '';
    }
  };

  return (
    <Card className="p-6 shadow-card">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-primary mb-2">Exercise Video Library</h2>
        <p className="text-muted-foreground">Learn proper form with HD video demonstrations</p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map(category => (
            <Button
              key={category}
              variant={selectedCategory === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className={selectedCategory === category ? 'bg-gradient-primary text-white' : ''}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Video Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg max-w-4xl w-full">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold">Exercise Demonstration</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedVideo(null)}
              >
                ✕
              </Button>
            </div>
            <div className="aspect-video">
              <iframe
                src={selectedVideo}
                className="w-full h-full"
                allowFullScreen
                title="Exercise Video"
              />
            </div>
          </div>
        </div>
      )}

      {/* Exercise Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredExercises.map(exercise => (
          <Card
            key={exercise.id}
            className="overflow-hidden hover:shadow-lg transition-all cursor-pointer group"
            onClick={() => onSelectExercise ? onSelectExercise(exercise) : setSelectedVideo(exercise.videoUrl)}
          >
            <div className="relative aspect-video">
              <img
                src={exercise.thumbnailUrl}
                alt={exercise.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-all flex items-center justify-center">
                <PlayCircle className="w-12 h-12 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
              </div>
              <Badge 
                className={`absolute top-2 right-2 ${getDifficultyColor(exercise.difficulty)}`}
              >
                {exercise.difficulty}
              </Badge>
            </div>
            <div className="p-4">
              <h4 className="font-semibold mb-2">{exercise.name}</h4>
              <div className="flex flex-wrap gap-1 mb-2">
                {exercise.primaryMuscles.map(muscle => (
                  <Badge key={muscle} variant="secondary" className="text-xs">
                    {muscle}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{Math.floor(exercise.duration / 60)}:{(exercise.duration % 60).toString().padStart(2, '0')}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredExercises.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No exercises found matching your criteria</p>
        </div>
      )}
    </Card>
  );
};