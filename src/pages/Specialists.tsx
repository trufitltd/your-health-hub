import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout';
import { Search, Star, Clock, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface DoctorCard {
  id: string;
  name: string;
  specialty: string;
  avatar_url?: string | null;
  bio?: string | null;
}

interface DoctorScheduleRow {
  doctor_id: string;
  day_of_week: number;
  start_time: string;
  is_available: boolean;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatTime = (time: string) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = Number(hours);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${minutes} ${suffix}`;
};

const getNextAvailable = (schedules: DoctorScheduleRow[] | undefined) => {
  if (!schedules || schedules.length === 0) return null;
  const now = new Date();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const day = date.getDay();
    const daySchedules = schedules.filter((schedule) => schedule.day_of_week === day && schedule.is_available);
    if (daySchedules.length > 0) {
      const first = daySchedules.sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
      return `${DAY_NAMES[day]}, ${formatTime(first.start_time)}`;
    }
  }
  return null;
};

export default function SpecialistsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All Specialties');
  const [expandedBios, setExpandedBios] = useState<Set<string>>(new Set());

  // Scroll to top when page mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: doctors = [], isLoading: doctorsLoading } = useQuery({
    queryKey: ['specialists-doctors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctors')
        .select('id,name,specialty,avatar_url')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching doctors:', error);
        throw error;
      }

      // Fetch bio from doctor_registrations
      const doctorIds = (data || []).map(d => d.id);
      const { data: registrations } = await supabase
        .from('doctor_registrations')
        .select('user_id,bio')
        .in('user_id', doctorIds);

      const bioMap = new Map(registrations?.map(r => [r.user_id, r.bio]) || []);

      return (data || []).map(d => ({
        ...d,
        bio: bioMap.get(d.id) || null
      })) as DoctorCard[];
    },
  });

  const { data: ratings = [] } = useQuery({
    queryKey: ['specialists-doctor-ratings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('doctor_id,rating')
        .not('rating', 'is', null);

      if (error) {
        console.error('Error fetching ratings:', error);
        return [];
      }

      return data || [];
    },
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ['specialists-doctor-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_schedules')
        .select('doctor_id,day_of_week,start_time,is_available')
        .eq('is_available', true);

      if (error) {
        console.error('Error fetching schedules:', error);
        return [];
      }

      return data || [];
    },
  });

  const ratingByDoctor = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    ratings.forEach((row: { doctor_id: string; rating: number | null }) => {
      if (!row.doctor_id || typeof row.rating !== 'number') return;
      if (!map.has(row.doctor_id)) {
        map.set(row.doctor_id, { total: 0, count: 0 });
      }
      const entry = map.get(row.doctor_id)!;
      entry.total += row.rating;
      entry.count += 1;
    });
    return map;
  }, [ratings]);

  const schedulesByDoctor = useMemo(() => {
    const map = new Map<string, DoctorScheduleRow[]>();
    schedules.forEach((row: DoctorScheduleRow) => {
      if (!map.has(row.doctor_id)) {
        map.set(row.doctor_id, []);
      }
      map.get(row.doctor_id)!.push(row);
    });
    return map;
  }, [schedules]);

  const specialties = useMemo(() => {
    const values = Array.from(
      new Set(
        doctors
          .map((doctor) => doctor.specialty)
          .filter((specialty) => specialty && specialty.trim().length > 0)
      )
    ).sort();
    return ['All Specialties', ...values];
  }, [doctors]);

  const filteredDoctors = doctors.filter((doctor) => {
    const matchesSearch = doctor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doctor.specialty || '').toLowerCase().includes(searchQuery.toLowerCase());
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
            {filteredDoctors.map((doctor, index) => {
              const ratingInfo = ratingByDoctor.get(doctor.id);
              const rating = ratingInfo && ratingInfo.count > 0
                ? Number((ratingInfo.total / ratingInfo.count).toFixed(1))
                : null;
              const reviews = ratingInfo?.count || 0;
              const nextAvailable = getNextAvailable(schedulesByDoctor.get(doctor.id));
              const isBioExpanded = expandedBios.has(doctor.id);
              const hasLongBio = (doctor.bio || '').trim().length > 140;

              return (
              <motion.div
                key={doctor.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="bg-card rounded-2xl border border-border p-6 hover:shadow-card hover:border-primary/20 transition-all duration-300"
              >
                <div className="flex items-start gap-4 mb-4">
                  <img
                    src={doctor.avatar_url || '/placeholder.svg'}
                    alt={doctor.name}
                    className="w-16 h-16 rounded-2xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{doctor.name}</h3>
                    <p className="text-sm text-primary">{doctor.specialty || 'General Practice'}</p>
                    <div className="text-xs text-muted-foreground">
                      <p className={isBioExpanded ? '' : 'line-clamp-2'}>
                        {doctor.bio || 'No bio provided.'}
                      </p>
                      {hasLongBio && (
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-medium text-primary hover:underline"
                          onClick={() => {
                            setExpandedBios((prev) => {
                              const next = new Set(prev);
                              if (next.has(doctor.id)) {
                                next.delete(doctor.id);
                              } else {
                                next.add(doctor.id);
                              }
                              return next;
                            });
                          }}
                        >
                          {isBioExpanded ? 'Read less' : 'Read more'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-warning fill-warning" />
                    <span className="font-medium">{rating ?? 'N/A'}</span>
                    <span className="text-muted-foreground">({reviews})</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Clock className="w-4 h-4" />
                  <span>Next: {nextAvailable || 'Check availability'}</span>
                </div>

                <div className="flex items-center justify-end pt-4 border-t border-border">
                  <Link to={`/booking?doctor=${doctor.id}`}>
                    <Button variant="gradient" size="sm">
                      <Video className="w-4 h-4" />
                      Book Now
                    </Button>
                  </Link>
                </div>
              </motion.div>
            );
            })}
          </div>

          {doctorsLoading && (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Loading specialists...</p>
            </div>
          )}

          {!doctorsLoading && filteredDoctors.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No specialists found matching your criteria.</p>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
