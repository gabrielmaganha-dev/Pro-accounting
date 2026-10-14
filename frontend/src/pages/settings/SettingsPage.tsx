import { Lock, Settings as SettingsIcon } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import { CompanyTab } from '@/components/settings/CompanyTab';
import { GeneralTab } from '@/components/settings/GeneralTab';
import { ProfileTab } from '@/components/settings/ProfileTab';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { useSettings } from '@/hooks/use-settings';

/**
 * Configurações.
 *
 * Quatro abas, com permissões diferentes: **Meu perfil** é de todo mundo; as
 * outras três alteram o sistema inteiro e são de administrador.
 *
 * O funcionário VÊ as abas de empresa, identidade visual e preferências, em
 * modo somente leitura, em vez de não vê-las. Ele já enxerga o resultado delas
 * na tela toda — a marca, as cores — e esconder a origem faria a informação
 * parecer vir do nada. O que ele não tem é o botão de salvar, e a API recusa a
 * escrita de qualquer forma.
 */
export function SettingsPage() {
  const { user } = useAuth();
  const { data, isPending, isError, error } = useSettings();

  const canEdit = user?.role === 'ADMIN';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Configurações
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dados da empresa, identidade visual, preferências do sistema e o seu perfil.
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-5">
        <TabsList>
          <TabsTrigger value="profile">Meu perfil</TabsTrigger>
          <TabsTrigger value="company">Empresa</TabsTrigger>
          <TabsTrigger value="appearance">Identidade visual</TabsTrigger>
          <TabsTrigger value="general">Preferências</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        {isError ? (
          <Card>
            <EmptyState
              title="Não foi possível carregar as configurações"
              description={error instanceof Error ? error.message : undefined}
              icon={SettingsIcon}
            />
          </Card>
        ) : isPending || !data ? (
          <TabSkeleton />
        ) : (
          <>
            <TabsContent value="company" className="space-y-4">
              {!canEdit && <ReadOnlyNotice />}
              <CompanyTab settings={data.settings} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4">
              {!canEdit && <ReadOnlyNotice />}
              <AppearanceTab settings={data.settings} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="general" className="space-y-4">
              {!canEdit && <ReadOnlyNotice />}
              <GeneralTab settings={data.settings} options={data.options} canEdit={canEdit} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function ReadOnlyNotice() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden="true" />
      <p>
        Estas configurações valem para todo o escritório e só administradores podem alterá-las.
        Você pode consultá-las aqui.
      </p>
    </div>
  );
}

function TabSkeleton() {
  return (
    <Card className="space-y-4 p-6">
      <Skeleton className="h-5 w-48" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}
