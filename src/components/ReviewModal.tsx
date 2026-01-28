import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  doctorName: string;
}

export function ReviewModal({ isOpen, onClose, appointmentId, doctorName }: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({ title: 'Rating required', description: 'Please select a rating before submitting.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ 
          rating,
          review_comment: comment.trim() || null
        })
        .eq('id', appointmentId);

      if (error) throw error;

      toast({ 
        title: 'Review submitted', 
        description: 'Thank you for your feedback!' 
      });
      
      onClose();
      setRating(0);
      setComment('');
    } catch (err) {
      toast({ 
        title: 'Error', 
        description: 'Failed to submit review. Please try again.' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Your Consultation</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              How was your consultation with {doctorName}?
            </p>
            
            <div className="flex justify-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= rating 
                        ? 'text-yellow-400 fill-yellow-400' 
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Comments (optional)
            </label>
            <Textarea
              placeholder="Share your experience..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting || rating === 0}
              className="flex-1"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}