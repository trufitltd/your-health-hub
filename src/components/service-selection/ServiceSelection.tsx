import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Video, Phone, MessageSquare, ChevronRight } from 'lucide-react';
import type { OrganisationService } from '@/hooks/useOrganisationServices';
import { useLanguage } from '@/contexts/LanguageContext';

interface ServiceSelectionProps {
  services: OrganisationService[];
  organisationId: string;
  organisationName?: string;
}

const CONSULTATION_MODE_ICONS: Record<string, typeof Video> = {
  video: Video,
  voice: Phone,
  chat: MessageSquare,
};

const CONSULTATION_MODE_LABELS: Record<string, string> = {
  video: 'Video Call',
  voice: 'Voice Call',
  chat: 'Chat',
};

export function ServiceSelection({ services, organisationId, organisationName }: ServiceSelectionProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [selectedService, setSelectedService] = useState<OrganisationService | null>(null);

  const handleServiceSelect = (service: OrganisationService) => {
    setSelectedService(service);
  };

  const handleProceed = () => {
    if (!selectedService) return;

    navigate('/slot-selection', {
      state: {
        organisationId,
        serviceType: selectedService.name,
        serviceName: selectedService.name,
        serviceDescription: selectedService.description,
        defaultDuration: selectedService.default_duration_minutes,
        consultationMode: selectedService.consultation_mode,
        basePrice: selectedService.base_price,
        currency: selectedService.currency,
      },
    });
  };

  if (services.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {t('serviceSelection.noServices', 'No services available at this time.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">
          {t('serviceSelection.title', 'Select a Service')}
        </h2>
        <p className="text-muted-foreground">
          {organisationName
            ? t('serviceSelection.subtitle', 'Choose the type of consultation you need.')
            : t('serviceSelection.subtitleGeneric', 'Choose the type of consultation you need.')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service, index) => {
          const ModeIcon = CONSULTATION_MODE_ICONS[service.consultation_mode] || Video;
          const isSelected = selectedService?.id === service.id;

          return (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isSelected ? 'ring-2 ring-primary shadow-md' : ''
                }`}
                onClick={() => handleServiceSelect(service)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{service.name}</CardTitle>
                    <ModeIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  {service.description && (
                    <CardDescription className="line-clamp-2">
                      {service.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{service.default_duration_minutes} min</span>
                      <Badge variant="secondary" className="ml-2">
                        {CONSULTATION_MODE_LABELS[service.consultation_mode] || service.consultation_mode}
                      </Badge>
                    </div>
                    <div className="font-semibold">
                      {service.currency} {service.base_price.toLocaleString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {selectedService && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center pt-4"
        >
          <Button size="lg" onClick={handleProceed} className="px-8">
            {t('serviceSelection.proceed', 'Select Time & Date')}
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
