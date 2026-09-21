import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { Logo } from '@/components/brand/Logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/services/api';

/**
 * Validação do formulário.
 *
 * Espelha a validação da API (backend/src/validators/auth.validator.ts). A
 * daqui existe para dar resposta imediata ao usuário; a que vale para
 * segurança é sempre a do servidor — validação de cliente pode ser contornada.
 */
const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe seu e-mail.')
    .email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Se o usuário caiu no login ao tentar abrir uma página protegida, volta
  // para ela depois de entrar, em vez de despejá-lo sempre no painel.
  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function handleSubmit(values: LoginFormValues): Promise<void> {
    setFormError(null);

    try {
      await signIn(values);
      toast.success('Acesso liberado. Bem-vindo!');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        // Erros de validação do servidor viram mensagem no campo específico.
        if (error.issues) {
          for (const issue of error.issues) {
            if (issue.field === 'email' || issue.field === 'password') {
              form.setError(issue.field, { message: issue.message });
            }
          }
        }
        setFormError(error.message);
      } else {
        setFormError('Não foi possível entrar. Tente novamente em instantes.');
      }

      // A senha digitada não deve permanecer na tela após uma falha.
      form.resetField('password');
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* No desktop o painel institucional à esquerda já mostra a marca; aqui
          ela aparece só no celular, onde aquele painel não existe. */}
      <div className="mb-8 flex justify-center lg:hidden">
        <Logo variant="full" size={44} />
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Entrar no sistema</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Informe suas credenciais para acessar o painel.
        </p>
      </div>

      {formError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="voce@empresa.com.br"
                    disabled={isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Sua senha"
                      className="pr-11"
                      disabled={isSubmitting}
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={isSubmitting}
                      // aria-label muda junto com o estado para que o leitor de
                      // tela anuncie a ação correta, não um rótulo fixo.
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Entrando…
              </>
            ) : (
              <>
                <LogIn aria-hidden="true" />
                Entrar
              </>
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Esqueceu a senha? Solicite a redefinição a um administrador.
        <br />
        {/* A recuperação por e-mail entra na etapa de autenticação completa. */}
        <span className="text-slate-400">Recuperação por e-mail em breve.</span>
      </p>
    </div>
  );
}
