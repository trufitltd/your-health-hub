import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { Search, Star, Clock, Calendar, MapPin, Video, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const specialties = [
  'All Specialties',
  'General Medicine',
  'Cardiology',
  'Dermatology',
  'Pediatrics',
  'Gynecology',
  'Neurology',
  'Orthopedics',
  'Psychiatry',
];

const doctors = [
  {
    id: 1,
    name: 'Dr. Sarah Johnson',
    specialty: 'Cardiology',
    experience: '15 years',
    rating: 4.9,
    reviews: 234,
    nextAvailable: 'Today, 2:00 PM',
    image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=300&h=300&fit=crop',
    price: 75,
  },
  {
    id: 2,
    name: 'Dr. Michael Chen',
    specialty: 'General Medicine',
    experience: '12 years',
    rating: 4.8,
    reviews: 189,
    nextAvailable: 'Today, 4:30 PM',
    image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=300&h=300&fit=crop',
    price: 50,
  },
  {
    id: 3,
    name: 'Dr. Emily Williams',
    specialty: 'Dermatology',
    experience: '10 years',
    rating: 4.9,
    reviews: 156,
    nextAvailable: 'Tomorrow, 10:00 AM',
    image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=300&h=300&fit=crop',
    price: 80,
  },
  {
    id: 4,
    name: 'Dr. James Rodriguez',
    specialty: 'Pediatrics',
    experience: '18 years',
    rating: 4.7,
    reviews: 312,
    nextAvailable: 'Today, 5:00 PM',
    image: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=300&h=300&fit=crop',
    price: 60,
  },
  {
    id: 5,
    name: 'Dr. Lisa Park',
    specialty: 'Gynecology',
    experience: '14 years',
    rating: 4.9,
    reviews: 278,
    nextAvailable: 'Tomorrow, 9:00 AM',
    image: 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=300&h=300&fit=crop',
    price: 85,
  },
  {
    id: 6,
    name: 'Dr. David Kim',
    specialty: 'Neurology',
    experience: '20 years',
    rating: 4.8,
    reviews: 167,
    nextAvailable: 'Wed, 11:00 AM',
    image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=300&h=300&fit=crop',
    price: 95,
  },
];

export default function SpecialistsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All Specialties');

  // Scroll to top when page mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const filteredDoctors = doctors.filter((doctor) => {
    const matchesSearch = doctor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doctor.specialty.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSpecialty = selectedSpecialty === 'All Specialties' || doctor.specialty === selectedSpecialty;
    return matchesSearch && matchesSpecialty;
  });

  return (
    <Layout>
      {/* Hero */}
      <section className="pt-32 pb-12 gradient-subtle">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto mb-12"
          >
            <span className="text-primary font-medium text-sm uppercase tracking-wider">Our Specialists</span>
            <h1 className="text-4xl md:text-5xl font-bold mt-3 mb-6">
              Find Your Perfect Doctor
            </h1>
            <p className="text-lg text-muted-foreground">
              Browse our network of certified specialists and book your consultation today
            </p>
          </motion.div>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="max-w-2xl mx-auto"
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by doctor name or specialty..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-base rounded-2xl shadow-card"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Filters & Results */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          {/* Specialty Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-4 mb-8 scrollbar-hide">
            {specialties.map((specialty) => (
              <button
                key={specialty}
                onClick={() => setSelectedSpecialty(specialty)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200',
                  selectedSpecialty === specialty
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {specialty}
              </button>
            ))}
          </div>

          {/* Results Count */}
          <p className="text-muted-foreground mb-6">
            Showing {filteredDoctors.length} specialists
          </p>

          {/* Doctors Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDoctors.map((doctor, index) => (
              <motion.div
                key={doctor.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="bg-card rounded-2xl border border-border p-6 hover:shadow-card hover:border-primary/20 transition-all duration-300"
              >
                <div className="flex items-start gap-4 mb-4">
                  <img
                    src={doctor.image}
                    alt={doctor.name}
                    className="w-16 h-16 rounded-2xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{doctor.name}</h3>
                    <p className="text-sm text-primary">{doctor.specialty}</p>
                    <p className="text-xs text-muted-foreground">{doctor.experience} experience</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-warning fill-warning" />
                    <span className="font-medium">{doctor.rating}</span>
                    <span className="text-muted-foreground">({doctor.reviews})</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Clock className="w-4 h-4" />
                  <span>Next: {doctor.nextAvailable}</span>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div>
                    <span className="text-2xl font-bold text-primary">₦{doctor.price}</span>
                    <span className="text-sm text-muted-foreground">/session</span>
                  </div>
                  <Link to={`/booking?doctor=${doctor.id}`}>
                    <Button variant="gradient" size="sm">
                      <Video className="w-4 h-4" />
                      Book Now
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>

          {filteredDoctors.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No specialists found matching your criteria.</p>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
