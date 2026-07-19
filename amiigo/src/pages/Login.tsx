import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { auth, googleProvider, db } from '../firebase'; 
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore'; 

export default function Login() {
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const checkUserExistsAndRedirect = async (uid: string) => {
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      navigate('/home');
    } else {
      navigate('/register', { state: { requireProfileSetup: true } });
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
      
      if (!userCredential.user.emailVerified) {
        setError('Por favor, verifica tu correo electrónico antes de iniciar sesión.');
        await auth.signOut();
        return;
      }

      await checkUserExistsAndRedirect(userCredential.user.uid);

    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Correo o contraseña incorrectos.');
      } else {
        setError('Ocurrió un error al intentar iniciar sesión.');
      }
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      await checkUserExistsAndRedirect(userCredential.user.uid);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-md bg-[#2a2a2a] rounded-[2rem] border-2 border-white p-8 shadow-2xl relative overflow-hidden">
        
        <div className="text-center mb-8">
          <img src="public/logoAmiigo.png" alt="Amiigo" className="mx-auto h-12 md:h-16 object-contain mb-2" />
          <p className="text-gray-400 text-sm tracking-wider uppercase">
            Iniciar Sesión
          </p>
        </div>

        <form onSubmit={handleEmailLogin} className="flex flex-col gap-5">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="email" name="email" placeholder="Correo electrónico" required
              value={formData.email} onChange={handleChange}
              className="w-full bg-[#1a1a1a] border-2 border-gray-600 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:border-white focus:outline-none transition-colors text-sm font-bold"
            />
          </div>
          
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="password" name="password" placeholder="Contraseña" required
              value={formData.password} onChange={handleChange}
              className="w-full bg-[#1a1a1a] border-2 border-gray-600 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:border-white focus:outline-none transition-colors text-sm font-bold"
            />
          </div>

          {error && <p className="text-red-400 text-sm font-bold text-center">{error}</p>}

          <button type="submit" className="mt-4 w-full border border-teal-600 bg-[#3a3a3a] text-white py-4 rounded-xl hover:bg-[#4a4a4a] transition-colors text-sm tracking-widest uppercase font-bold flex items-center justify-center gap-2">
            Entrar <ArrowRight className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4 my-2">
            <div className="flex-1 h-px bg-gray-600"></div>
            <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">O</span>
            <div className="flex-1 h-px bg-gray-600"></div>
          </div>

          <button type="button" onClick={handleGoogleLogin} className="w-full border border-white bg-white text-black py-4 rounded-xl hover:bg-gray-200 transition-colors text-sm tracking-widest uppercase font-bold flex items-center justify-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continuar con Google
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            ¿No tienes una cuenta?{' '}
            <button onClick={() => navigate('/register')} className="text-teal-400 font-bold tracking-wider hover:text-teal-300 transition-colors uppercase underline decoration-2 underline-offset-4">
              Regístrate aquí
            </button>
          </p>
        </div>

      </div>
    </div>
  );
}