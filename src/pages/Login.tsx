import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabaseSinConfigurar } from '@/lib/supabase';
import { toast, Toaster } from 'sonner';

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const { signIn, signUp, resetPasswordForEmail } = useSupabaseAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log('Iniciando proceso de auth...', { isSignUp, isForgotPassword });

    try {
      if (isForgotPassword) {
        const { error } = await resetPasswordForEmail(email);
        if (error) throw error;
        toast.success('Te hemos enviado un email con un enlace para poner una nueva contraseña.');
        setIsForgotPassword(false);
        return;
      }

      if (isSignUp) {
        const { data, error } = await signUp(email, password);
        if (error) throw error;
        if (data?.user?.identities?.length === 0) {
          toast.error('Este email ya está registrado. Intenta iniciar sesión.');
        } else {
          toast.success('¡Cuenta creada! Revisa tu email para confirmar.');
        }
      } else {
        const { data, error } = await signIn(email, password);
        if (error) throw error;
        toast.success('¡Sesión iniciada!');
        onLoginSuccess();
      }
    } catch (error: any) {
      console.error('Error de auth:', error);
      if (error.message === 'Failed to fetch') {
        toast.error('Error de conexión con la base de datos. Por favor, verifica tu conexión a internet o la configuración de Supabase.');
      } else {
        toast.error(error.message || 'Error en la autenticación');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-primary/5">
      <Toaster position="top-center" richColors />
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground mb-2">Thermomix CRM</h1>
          <p className="text-muted-foreground">
            {isForgotPassword ? 'Recuperar contraseña' : isSignUp ? 'Crea una cuenta' : 'Inicia sesión'}
          </p>
        </div>

        {supabaseSinConfigurar && (
          <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Plantilla vacía · configura tu Supabase.</strong> Faltan las claves
            VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Netlify (Site configuration →
            Environment variables). Después, en Netlify: Deploys → Trigger deploy.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Email
            </label>
            <Input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {!isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Contraseña
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {!isForgotPassword && !isSignUp && (
            <div className="text-right -mt-2">
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading
              ? 'Cargando...'
              : isForgotPassword
              ? 'Enviar enlace de recuperación'
              : isSignUp
              ? 'Crear cuenta'
              : 'Iniciar sesión'}
          </Button>
        </form>

        <div className="text-center">
          {isForgotPassword ? (
            <button
              type="button"
              onClick={() => setIsForgotPassword(false)}
              className="text-sm text-primary hover:underline"
            >
              Volver a iniciar sesión
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-primary hover:underline"
            >
              {isSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
