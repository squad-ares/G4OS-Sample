import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as React from 'react';
import { cn } from '../libs/utils.ts';

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square h-full w-full', className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-muted',
        className,
      )}
      {...props}
    />
  );
}

/**
 * CrossfadeAvatar — avatar com transição suave (crossfade) do fallback para
 * a imagem assim que ela carrega. Os dois elementos ficam empilhados no
 * mesmo ponto, então a troca não tem flash.
 */
interface CrossfadeAvatarProps {
  src?: string | null;
  alt?: string;
  fallback: React.ReactNode;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
}

function CrossfadeAvatar({
  src,
  alt,
  fallback,
  className,
  fallbackClassName,
  imageClassName,
}: Readonly<CrossfadeAvatarProps>) {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [currentSrc, setCurrentSrc] = React.useState(src);

  // Detecta se é SVG (renderizamos como background pra preservar controle de aspect-ratio).
  const isSvg = React.useMemo(() => src?.endsWith('.svg') ?? false, [src]);

  // Reseta isLoaded quando `src` muda — mas se o navegador já tem a nova imagem
  // em cache, evita flash do fallback marcando como carregada direto.
  // Guarda o objeto Image para nulificar src no cleanup (F-CR49-5): sem isso,
  // o request fica in-flight até completar mesmo após src mudar — acumula
  // handles em listas longas com muitos avatares sendo trocados.
  // currentSrc excluído das deps intencionalmente: usamos ref interna para
  // rastrear a última src vista, evitando re-execução em loop quando
  // setCurrentSrc é chamado dentro do próprio effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: (reason: currentSrc controlado pelo próprio effect — incluir causaria loop de re-execução)
  React.useEffect(() => {
    if (src === currentSrc) return;

    if (src) {
      const img = new Image();
      img.src = src;
      if (img.complete && img.naturalWidth > 0) {
        // Imagem já em cache — pula fallback.
        setCurrentSrc(src);
        setIsLoaded(true);
        return () => {
          img.src = '';
        };
      }
      // Img ainda não está em cache — aguarda load normal via imgCallbackRef.
      return () => {
        img.src = '';
      };
    }

    setIsLoaded(false);
    setCurrentSrc(src);
    return undefined;
  }, [src]);

  const imgCallbackRef = React.useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node?.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, []);

  return (
    <div className={cn('relative flex shrink-0 overflow-hidden', className)}>
      {/* Fallback — sempre renderizado, fade-out quando imagem carrega */}
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-opacity duration-200',
          isLoaded ? 'opacity-0' : 'opacity-100',
          fallbackClassName,
        )}
      >
        {fallback}
      </div>

      {/* Imagem — fade-in quando carregada */}
      {src &&
        (isSvg ? (
          // SVG renderizado como background pra preservar contain/aspect-ratio
          <div
            className={cn(
              'w-full h-full transition-opacity duration-200',
              isLoaded ? 'opacity-100' : 'opacity-0',
              imageClassName,
            )}
            style={{
              backgroundImage: `url("${src}")`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
            // Contrato: alt=undefined → fallback inacessível (sem label);
            // alt='' → decorativo (role=presentation + aria-hidden);
            // alt='texto' → semântico (role=img + aria-label). F-CR49-6.
            {...(alt === ''
              ? { role: 'presentation' as const, 'aria-hidden': true as const }
              : alt === undefined
                ? { role: 'img' as const }
                : { role: 'img' as const, 'aria-label': alt })}
          >
            {/* <img> oculto só pra detectar onLoad e popular o cache do navegador */}
            <img
              ref={imgCallbackRef}
              src={src}
              alt=""
              onLoad={() => setIsLoaded(true)}
              style={{ display: 'none' }}
            />
          </div>
        ) : (
          // Imagem raster comum (PNG/JPG/etc.)
          <img
            ref={imgCallbackRef}
            src={src}
            alt={alt}
            onLoad={() => setIsLoaded(true)}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-200',
              isLoaded ? 'opacity-100' : 'opacity-0',
              imageClassName,
            )}
          />
        ))}

      {/* Sem `src` — fallback fica estático sem transição */}
      {!src && (
        <div className={cn('flex h-full w-full items-center justify-center', fallbackClassName)}>
          {fallback}
        </div>
      )}
    </div>
  );
}

export { Avatar, AvatarFallback, AvatarImage, CrossfadeAvatar };
