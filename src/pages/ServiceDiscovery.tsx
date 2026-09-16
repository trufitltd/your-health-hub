import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { ServiceSelection } from '@/components/service-selection/ServiceSelection';
import { useOrganisationServices } from '@/hooks/useOrganisationServices';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader } from 'lucide-react';

export default function ServiceDiscovery() {
  const [searchParams] = useSearchParams();
  const organisationId = searchParams.get('organisationId');

  const { data: orgData } = useQuery({
    queryKey: ['organisation', organisationId],
    queryFn: async () => {
      if (!organisationId) return null;
      const { data } = await supabase
        .from('organisations')
        .select('name, slug')
        .eq('id', organisationId)
        .maybeSingle();
      return data;
    },
    enabled: !!organisationId,
  });

  const { data: services = [], isLoading } = useOrganisationServices(organisationId);

  if (!organisationId) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No organisation specified. Please access this page through your organisation's portal.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <ServiceSelection
            services={services}
            organisationId={organisationId}
            organisationName={orgData?.name}
          />
        )}
      </div>
    </Layout>
  );
}
