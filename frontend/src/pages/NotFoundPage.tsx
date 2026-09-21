import { ArrowLeft, FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <Logo variant="full" size={44} />

      <span className="flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <FileQuestion className="size-8" aria-hidden="true" />
      </span>

      <div className="max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido.
        </p>
      </div>

      <Button asChild>
        <Link to="/dashboard">
          <ArrowLeft aria-hidden="true" />
          Voltar ao painel
        </Link>
      </Button>
    </div>
  );
}
