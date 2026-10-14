import { AlertTriangle, Image as ImageIcon, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateAppearance } from '@/hooks/use-settings';
import { applyTheme, buildRamp, hexToRgb } from '@/lib/theme';
import type { Settings } from '@/types/settings';

/** Cores de fábrica — o botão "restaurar" volta para elas. */
const DEFAULT_PRIMARY = '#2563eb';
const DEFAULT_SECONDARY = '#0d9488';

/** Teto do arquivo enviado, já em base64. Espelha o limite da API. */
const LOGO_MAX_BASE64 = 400 * 1024;

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/**
 * Contraste entre a cor e o texto branco, pela fórmula do WCAG.
 *
 * Existe porque a escolha de cor tem consequência de acessibilidade: um amarelo
 * bonito no seletor vira um botão com texto branco ilegível. O aviso não impede
 * de salvar — a decisão é de quem opera o sistema —, mas ninguém deveria
 * descobrir o problema só quando um cliente reclamar.
 */
function contrastWithWhite(hex: string): number {
  const { r, g, b } = hexToRgb(hex);

  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

  return Number(((1.05) / (luminance + 0.05)).toFixed(2));
}

interface AppearanceTabProps {
  settings: Settings;
  canEdit: boolean;
}

export function AppearanceTab({ settings, canEdit }: AppearanceTabProps) {
  const mutation = useUpdateAppearance();
  const fileInput = useRef<HTMLInputElement>(null);

  const [primary, setPrimary] = useState(settings.primaryColor);
  const [secondary, setSecondary] = useState(settings.secondaryColor);
  const [logo, setLogo] = useState<string | null>(settings.logo);
  const [logoTouched, setLogoTouched] = useState(false);

  useEffect(() => {
    setPrimary(settings.primaryColor);
    setSecondary(settings.secondaryColor);
    setLogo(settings.logo);
    setLogoTouched(false);
  }, [settings]);

  /**
   * Pré-visualização ao vivo: o sistema inteiro muda de cor enquanto a pessoa
   * arrasta o seletor, sem salvar. É a única forma de avaliar uma cor de marca
   * — num quadradinho de 40px qualquer tom parece aceitável.
   */
  useEffect(() => {
    applyTheme({ primaryColor: primary, secondaryColor: secondary });
  }, [primary, secondary]);

  /** Desfaz a pré-visualização ao sair da aba sem salvar. */
  useEffect(() => {
    return () => {
      applyTheme({
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
      });
    };
  }, [settings.primaryColor, settings.secondaryColor]);

  function handleFile(file: File): void {
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Envie uma imagem PNG, JPEG, WEBP ou SVG.');
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result);

      if (result.length > LOGO_MAX_BASE64) {
        toast.error('A imagem é grande demais. Use um arquivo de até 400 KB.');
        return;
      }

      setLogo(result);
      setLogoTouched(true);
    };

    reader.onerror = () => toast.error('Não foi possível ler o arquivo.');
    reader.readAsDataURL(file);
  }

  function handleSubmit(): void {
    mutation.mutate({
      primaryColor: primary,
      secondaryColor: secondary,
      // Só envia o logo se ele foi mexido: sem isto, salvar apenas uma cor
      // reenviaria a imagem inteira a cada gravação.
      ...(logoTouched ? { logo } : {}),
    });
  }

  const disabled = !canEdit || mutation.isPending;
  const primaryContrast = contrastWithWhite(primary);

  return (
    <div className="space-y-5">
      {/* ---------------- Logotipo ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            Logotipo
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Aparece no menu lateral e na tela de login. PNG, JPEG, WEBP ou SVG, até 400 KB.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-5">
            {/* Fundo escuro na amostra: é sobre o menu lateral que a marca
                aparece, e um logo de texto escuro some ali. */}
            <div className="flex h-24 w-56 items-center justify-center rounded-lg border border-border bg-brand-900 p-3">
              {logo ? (
                <img src={logo} alt="Pré-visualização do logotipo" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-white/70">Símbolo padrão do sistema</span>
              )}
            </div>

            {canEdit && (
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED.join(',')}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleFile(file);
                    // Zera o input para que escolher o MESMO arquivo de novo
                    // volte a disparar o evento.
                    event.target.value = '';
                  }}
                />

                <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={disabled}>
                  <ImageIcon />
                  Escolher imagem
                </Button>

                {logo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLogo(null);
                      setLogoTouched(true);
                    }}
                    disabled={disabled}
                  >
                    <Trash2 />
                    Remover e usar o padrão
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Cores ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cores da marca</CardTitle>
          <p className="text-sm text-muted-foreground">
            As mudanças aparecem na hora, em todo o sistema. Nada é gravado até você salvar.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <ColorField
              id="primary-color"
              label="Cor principal"
              hint="Botões, links, menu lateral e o item ativo da navegação."
              value={primary}
              onChange={setPrimary}
              disabled={disabled}
            />

            <ColorField
              id="secondary-color"
              label="Cor secundária"
              hint="Realces e a segunda série dos gráficos."
              value={secondary}
              onChange={setSecondary}
              disabled={disabled}
            />
          </div>

          {primaryContrast < 4.5 && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                Texto branco sobre esta cor tem contraste de{' '}
                <strong className="tabular-nums">{primaryContrast}:1</strong>, abaixo do mínimo
                de 4,5:1 recomendado para leitura. Os botões ficarão difíceis de ler. Um tom mais
                escuro resolve.
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tons derivados da cor principal
            </p>
            {/* Mostrar a rampa inteira responde a pergunta que o seletor sozinho
                não responde: como essa cor vai se comportar como fundo claro de
                selo e como fundo escuro do menu. */}
            <div className="flex overflow-hidden rounded-lg border border-border">
              {Object.entries(buildRamp(primary)).map(([step, hsl]) => (
                <div
                  key={step}
                  className="flex h-12 flex-1 items-end justify-center pb-1"
                  style={{ backgroundColor: `hsl(${hsl})` }}
                  title={`brand-${step}`}
                >
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: Number(step) >= 500 ? '#fff' : '#1e293b' }}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setPrimary(DEFAULT_PRIMARY);
                  setSecondary(DEFAULT_SECONDARY);
                }}
                disabled={disabled}
              >
                <RotateCcw />
                Restaurar cores padrão
              </Button>

              <Button onClick={handleSubmit} disabled={disabled}>
                {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                {mutation.isPending ? 'Salvando…' : 'Salvar identidade visual'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ColorFieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

function ColorField({ id, label, hint, value, onChange, disabled }: ColorFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="size-10 shrink-0 cursor-pointer rounded border border-border bg-transparent disabled:cursor-not-allowed"
        />
        {/* O campo de texto ao lado existe para colar um código de cor vindo do
            manual de marca — o seletor nativo não aceita colagem. */}
        <Input
          value={value}
          onChange={(event) => {
            const next = event.target.value.toLowerCase();
            if (/^#[0-9a-f]{0,6}$/.test(next)) onChange(next);
          }}
          disabled={disabled}
          className="font-mono uppercase"
          maxLength={7}
          aria-label={`${label} em hexadecimal`}
        />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
