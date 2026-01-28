-- Add rating column to appointments table
ALTER TABLE appointments 
ADD COLUMN rating INTEGER CHECK (rating >= 1 AND rating <= 5);

-- Add review comment column
ALTER TABLE appointments 
ADD COLUMN review_comment TEXT;

-- Add comment to explain the rating column
COMMENT ON COLUMN appointments.rating IS 'Patient rating for the doctor (1-5 stars) after completed appointment';
COMMENT ON COLUMN appointments.review_comment IS 'Patient review comment for the doctor after completed appointment';