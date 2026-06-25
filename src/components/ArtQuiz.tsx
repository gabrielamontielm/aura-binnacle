import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, CheckCircle2, XCircle, Trophy, Lightbulb, Sparkles, Loader2, CheckCircle, ArrowRight, ImageOff } from 'lucide-react';
import { HistoryItem, DailyQuizQuestion } from '../types';
import axios from 'axios';
import { db, sanitizeForFirestore } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ValidatedImage } from './ValidatedImage';

interface ArtQuizProps {
  history: HistoryItem[];
  bucketList: HistoryItem[];
  onCorrect: (xp: number) => void;
}

export const ArtQuiz: React.FC<ArtQuizProps> = ({ history, bucketList, onCorrect }) => {
  const [session, setSession] = useState<DailyQuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [score, setScore] = useState(0);

  const today = new Date().toISOString().split('T')[0];

  const fetchDailyAiQuestions = async (): Promise<DailyQuizQuestion[]> => {
    const dailyDocRef = doc(db, 'daily_quizzes', today);
    const dailySnap = await getDoc(dailyDocRef);

    if (dailySnap.exists()) {
      return dailySnap.data().questions;
    }

    // Generate 20 questions via Server API
    const response = await axios.get('/api/art/daily-quiz');
    const aiQuestions: DailyQuizQuestion[] = response.data.map((q: any, i: number) => ({
      ...q,
      id: `ai-${today}-${i}`,
      isAiGenerated: true
    }));

    // Cache for all users
    await setDoc(dailyDocRef, sanitizeForFirestore({
      date: today,
      questions: aiQuestions
    }));

    return aiQuestions;
  };

  const generatePersonalQuestions = (): DailyQuizQuestion[] => {
    const combined = [...history, ...bucketList];
    if (combined.length === 0) return [];

    const personal: DailyQuizQuestion[] = [];
    const count = Math.min(10, combined.length);
    
    // Shuffle combined list
    const shuffled = [...combined].sort(() => Math.random() - 0.5);

    for (let i = 0; i < count; i++) {
        const target = shuffled[i];
        const type = Math.random() > 0.5 ? 'artist' : 'movement';
        const correctAnswer = type === 'artist' ? target.details.artist : target.details.movement;

        if (!correctAnswer || correctAnswer.toLowerCase() === 'unknown') continue;

        const otherOptions = combined
            .map(item => type === 'artist' ? item.details.artist : item.details.movement)
            .filter(val => val && val !== correctAnswer && val.toLowerCase() !== 'unknown');

        const fallbackOptions = type === 'artist' 
            ? ['Vincent van Gogh', 'Claude Monet', 'Pablo Picasso', 'Gustav Klimt']
            : ['Impressionism', 'Renaissance', 'Baroque', 'Romanticism'];

        const finalOptions = Array.from(new Set([...otherOptions, ...fallbackOptions]))
            .filter(val => val !== correctAnswer)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);

        personal.push({
            id: `personal-${target.id}-${i}`,
            artworkTitle: target.details.title,
            imageUrl: target.image,
            type: type as any,
            correctAnswer,
            options: [...finalOptions, correctAnswer].sort(() => Math.random() - 0.5),
            hint: `This work is from your own ${history.some(h => h.id === target.id) ? 'Gallery' : 'Bucket List'}.`,
            isAiGenerated: false
        });
    }

    return personal;
  };

  const initQuiz = async () => {
    setIsLoading(true);
    try {
      const aiQs = await fetchDailyAiQuestions();
      const personalQs = generatePersonalQuestions();
      
      // Mix them and shuffle the whole set of 30 (or less if personal is sparse)
      const fullSession = [...aiQs, ...personalQs].sort(() => Math.random() - 0.5);
      
      setSession(fullSession);
      setCurrentIndex(0);
      setIsCompleted(false);
      setScore(0);
    } catch (error) {
      console.error("Quiz init failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initQuiz();
  }, []);

  const handleOptionClick = (option: string) => {
    if (selectedOption !== null) return;
    
    setSelectedOption(option);
    const correct = option === session[currentIndex].correctAnswer;
    setIsCorrect(correct);
    
    if (correct) {
      setScore(s => s + 1);
      onCorrect(session[currentIndex].isAiGenerated ? 75 : 50);
    }
  };

  const nextQuestion = () => {
    if (currentIndex < session.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsCorrect(null);
      setShowHint(false);
    } else {
      setIsCompleted(true);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 bg-white rounded-3xl border border-artistic-ink/5 shadow-sm flex flex-col items-center justify-center text-center">
        <Loader2 className="w-8 h-8 text-artistic-accent animate-spin mb-4" />
        <h4 className="font-serif italic text-lg opacity-40">Curating today's session...</h4>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="p-12 bg-artistic-ink text-white rounded-3xl text-center">
        <Trophy className="w-12 h-12 text-amber-500 mx-auto mb-6" />
        <h3 className="font-serif italic text-3xl mb-2">Challenge Complete</h3>
        <p className="opacity-60 text-sm mb-8 italic">You mastered {score} of {session.length} curations for today.</p>
        <div className="flex flex-col gap-3">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
             <span className="text-xs uppercase tracking-widest block opacity-40 mb-1">Total Rewards</span>
             <span className="text-2xl font-black text-artistic-accent">+{score * 60} XP</span>
          </div>
          <button 
            onClick={initQuiz}
            className="w-full py-4 bg-white text-artistic-ink rounded-full text-xs uppercase font-bold tracking-[0.2em]"
          >
            Review Session
          </button>
        </div>
      </div>
    );
  }

  const current = session[currentIndex];
  if (!current) return null;

  return (
    <div className="p-8 bg-white rounded-3xl border border-artistic-ink/5 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 flex items-center gap-4">
        <div className="flex items-center gap-1 px-2 py-1 bg-artistic-shadow/30 rounded-full">
            <span className="text-[11px] font-black uppercase tracking-widest">{currentIndex + 1} / {session.length}</span>
        </div>
        {current.isAiGenerated && (
          <div className="flex items-center gap-1 px-2 py-1 bg-artistic-accent/10 text-artistic-accent rounded-full">
            <Sparkles className="w-3 h-3" />
            <span className="text-[11px] font-black uppercase tracking-widest">Masterpiece</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="text-xs uppercase tracking-[0.4em] font-bold text-artistic-accent block mb-1">
            {current.isAiGenerated ? 'Daily Challenge' : 'Collection Recall'}
          </span>
          <h4 className="font-serif italic text-xl">Art Intelligence</h4>
        </div>
      </div>

      <div className="aspect-video w-full rounded-2xl overflow-hidden mb-4 bg-artistic-shadow relative group">
        <ValidatedImage 
          src={current.imageUrl} 
          alt={current.artworkTitle} 
          className="w-full h-full object-contain"
          fallback={
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-artistic-shadow/20 text-center">
              <ImageOff className="w-10 h-10 opacity-20 mb-4" />
              <p className="text-xs font-serif italic text-artistic-ink/40">Visual record unavailable. Identifying by metadata...</p>
            </div>
          }
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
          <p className="text-xs text-white/80 font-medium">
            {current.isAiGenerated ? `Question ${currentIndex + 1} of today's Masterpiece collection.` : "A work you have encountered recently."}
          </p>
        </div>
      </div>

      <div className="mb-6 text-center">
        <h5 className="font-serif italic text-lg text-artistic-ink mb-1">"{current.artworkTitle}"</h5>
        <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-artistic-ink/40">
            Current Subject
        </p>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-6 text-center">
        Identfying the <span className="text-artistic-accent">{current.type}</span> 
        {current.isAiGenerated ? '' : ' of this personal curation'}
      </p>

      <div className="grid grid-cols-1 gap-3">
        {current.options.map((option) => {
          const isSelected = selectedOption === option;
          const isTheCorrect = option === current.correctAnswer;
          
          let bgColor = 'bg-artistic-shadow/30';
          let borderColor = 'border-transparent';
          let Icon = null;

          if (selectedOption) {
            if (isTheCorrect) {
              bgColor = 'bg-green-50';
              borderColor = 'border-green-500';
              Icon = CheckCircle2;
            } else if (isSelected) {
              bgColor = 'bg-red-50';
              borderColor = 'border-red-500';
              Icon = XCircle;
            }
          }

          return (
            <button
              key={option}
              disabled={selectedOption !== null}
              onClick={() => handleOptionClick(option)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center justify-between group ${bgColor} ${borderColor} ${selectedOption === null ? 'hover:border-artistic-accent hover:bg-white shadow-sm' : ''}`}
            >
              <span className={`text-xs font-black uppercase tracking-tight ${selectedOption ? (isTheCorrect ? 'text-green-700' : isSelected ? 'text-red-700' : 'opacity-40') : 'opacity-70'}`}>
                {option}
              </span>
              {Icon && <Icon className={`w-4 h-4 ${isTheCorrect ? 'text-green-500' : 'text-red-500'}`} />}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {isCorrect !== null && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-8 text-center"
          >
            <div className={`inline-flex items-center gap-2 mb-2 px-4 py-1 rounded-full ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {isCorrect ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <span className="text-xs font-black uppercase tracking-widest">
                    {isCorrect ? `Correct! +${current.isAiGenerated ? 75 : 50} XP` : "Incorrect"}
                </span>
            </div>
            
            {isCorrect && current.artworkTitle && (
              <p className="text-xs text-artistic-ink/60 mb-6 italic">
                "{current.artworkTitle}" by {current.correctAnswer}.
              </p>
            )}
            {!isCorrect && (
              <p className="text-xs text-artistic-ink/60 mb-6 italic">
                The correct answer was {current.correctAnswer}.
              </p>
            )}

            <button 
              onClick={nextQuestion}
              className="w-full py-4 bg-artistic-ink text-artistic-bg rounded-xl flex items-center justify-center gap-3 text-xs uppercase font-bold tracking-[0.2em] hover:bg-artistic-accent transition-all group"
            >
              {currentIndex < session.length - 1 ? 'Next Question' : 'Complete Session'}
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!selectedOption && (
        <div className="mt-8 flex flex-col items-center gap-4 border-t border-artistic-ink/5 pt-6">
            <button 
              onClick={() => setShowHint(!showHint)}
              className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold opacity-30 hover:opacity-100 transition-opacity"
            >
              <Lightbulb className="w-3 h-3" />
              {showHint ? "The Curator says..." : "Need a hint?"}
            </button>
            <AnimatePresence>
              {showHint && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-xs text-center text-artistic-ink/60 bg-artistic-shadow/20 p-4 rounded-2xl italic leading-relaxed"
                >
                  {current.hint || "Look closely at the texture and palette."}
                </motion.p>
              )}
            </AnimatePresence>
        </div>
      )}
    </div>
  );
};
