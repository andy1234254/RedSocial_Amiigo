import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, User, Image as ImageIcon, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { auth, googleProvider, db, storage } from '../firebase'; 
import { createUserWithEmailAndPassword, signInWithPopup, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; 

export default function Register() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [profilePic, setProfilePic] = useState<File | null>(null);
  const [coverPic, setCoverPic] = useState<File | null>(null);
  const [existingUser, setExistingUser] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false); 
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
  });

  useEffect(() => {
    if (location.state?.requireProfileSetup) {
      setStep(3);
    }
  }, [location]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (step === 2) {
      interval = setInterval(async () => {
        const user = auth.currentUser;
        if (user) {
          await user.reload();
          if (user.emailVerified) {
            clearInterval(interval);
            setStep(3);
          }
        }
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      await sendEmailVerification(userCredential.user);
      setStep(2); 
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Este correo ya está registrado. Por favor, inicia sesión.');
      } else {
        setError(err.message);
      }
    }
  };

  const handleGoogleRegister = async () => {
    setError('');
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const user = userCredential.user;

      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        setExistingUser(userDocSnap.data());
        setStep(4);
      } else {
        setStep(3);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // --- LÓGICA PARA SUBIR IMÁGENES A FIREBASE STORAGE ---
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsUploading(true); 

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No hay un usuario autenticado.");

      // Valores por defecto (si el usuario decide no subir fotos)
      let avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.name}&backgroundColor=ffffff`;
      let coverUrl = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=600&auto=format&fit=crop";

      // 1. Si subió Foto de Perfil, la guardamos en Storage
      if (profilePic) {
        // Creamos una referencia en Storage: ruta 'users/{uid}/profilePic'
        const profileRef = ref(storage, `users/${user.uid}/profilePic`);
        await uploadBytes(profileRef, profilePic);
        avatarUrl = await getDownloadURL(profileRef);
      }

      // 2. Si subió Foto de Portada, la guardamos en Storage
      if (coverPic) {
        // Creamos una referencia en Storage: ruta 'users/{uid}/coverPic'
        const coverRef = ref(storage, `users/${user.uid}/coverPic`);
        await uploadBytes(coverRef, coverPic);
        coverUrl = await getDownloadURL(coverRef);
      }

      // 3. Guardamos los datos finales (con las URLs reales) en Firestore
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        name: formData.name,
        profilePicUrl: avatarUrl,
        coverPicUrl: coverUrl,
        createdAt: new Date().toISOString()
      });

      navigate('/home');
    } catch (err: any) {
      setError("Error al guardar el perfil: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-md bg-[#2a2a2a] rounded-[2rem] border-2 border-white p-8 shadow-2xl relative overflow-hidden">
        
        <div className="text-center mb-8">
          <img src="/logoAmiigo.png" alt="Amiigo" className="mx-auto h-12 md:h-16 object-contain mb-2" />
          <p className="text-gray-400 text-sm tracking-wider uppercase">
            {step === 1 && "Crea tu cuenta"}
            {step === 2 && "Verifica tu correo"}
            {step === 3 && "Personaliza tu perfil"}
            {step === 4 && "Cuenta Existente"}
          </p>
        </div>

        {step === 1 && ( 
           <form onSubmit={handleEmailRegister} className="flex flex-col gap-5">
             <div className="relative">
               <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
               <input type="email" name="email" placeholder="Correo electrónico" required value={formData.email} onChange={handleChange} className="w-full bg-[#1a1a1a] border-2 border-gray-600 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:border-white focus:outline-none transition-colors text-sm font-bold" />
             </div>
             <div className="relative">
               <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
               <input type="password" name="password" placeholder="Contraseña" required value={formData.password} onChange={handleChange} className="w-full bg-[#1a1a1a] border-2 border-gray-600 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:border-white focus:outline-none transition-colors text-sm font-bold" />
             </div>
             <div className="relative">
               <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
               <input type="password" name="confirmPassword" placeholder="Confirmar contraseña" required value={formData.confirmPassword} onChange={handleChange} className="w-full bg-[#1a1a1a] border-2 border-gray-600 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:border-white focus:outline-none transition-colors text-sm font-bold" />
             </div>
             {error && <p className="text-red-400 text-sm font-bold text-center">{error}</p>}
             <button type="submit" className="mt-4 w-full border border-teal-600 bg-[#3a3a3a] text-white py-4 rounded-xl hover:bg-[#4a4a4a] transition-colors text-sm tracking-widest uppercase font-bold flex items-center justify-center gap-2">
               Registrarse con Correo <ArrowRight className="w-5 h-5" />
             </button>
             <div className="flex items-center gap-4 my-2">
               <div className="flex-1 h-px bg-gray-600"></div>
               <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">O</span>
               <div className="flex-1 h-px bg-gray-600"></div>
             </div>
             <button type="button" onClick={handleGoogleRegister} className="w-full border border-white bg-white text-black py-4 rounded-xl hover:bg-gray-200 transition-colors text-sm tracking-widest uppercase font-bold flex items-center justify-center gap-3">
               <svg className="w-5 h-5" viewBox="0 0 24 24">
                 <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                 <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                 <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                 <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
               </svg>
               Continuar con Google
             </button>
           </form>
        )}

        {step === 2 && ( 
          <div className="flex flex-col gap-5 animate-fade-in text-center">
             <div className="w-16 h-16 bg-[#3a3a3a] rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-teal-600 relative">
               <CheckCircle className="w-8 h-8 text-teal-400" />
             </div>
             <p className="text-sm text-gray-300">
               Hemos enviado un enlace de verificación a <br/>
               <span className="font-bold text-white">{formData.email}</span>
             </p>
             <p className="text-xs text-gray-400">
               Por favor revisa tu bandeja de entrada o la carpeta de spam y haz clic en el enlace.
             </p>
             <div className="mt-4 flex items-center justify-center gap-2 text-teal-400 text-sm font-bold uppercase tracking-wider">
               <Loader2 className="animate-spin h-5 w-5 text-teal-400" />
               Esperando verificación...
             </div>
           </div>
        )}

        {/* PASO 3 ACTUALIZADO CON ESTADO DE CARGA */}
        {step === 3 && (
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-5 animate-fade-in">
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text" name="name" placeholder="Tu nombre en Amiigo" required
                value={formData.name} onChange={handleChange} disabled={isUploading}
                className="w-full bg-[#1a1a1a] border-2 border-gray-600 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:border-white focus:outline-none transition-colors text-sm font-bold disabled:opacity-50"
              />
            </div>

            <label className={`w-full h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors group ${coverPic ? 'border-green-400 bg-green-500/10' : 'border-gray-500 hover:border-white hover:bg-white/5'} ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <ImageIcon className={`w-6 h-6 mb-2 ${coverPic ? 'text-green-400' : 'text-gray-400 group-hover:text-white'}`} />
              <span className={`text-xs font-bold uppercase tracking-wider ${coverPic ? 'text-green-400' : 'text-gray-400 group-hover:text-white'}`}>
                {coverPic ? '¡Portada Seleccionada!' : 'Subir Portada'}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setCoverPic(e.target.files?.[0] || null)} disabled={isUploading} />
            </label>

            <label className={`w-full h-20 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-colors group gap-3 ${profilePic ? 'border-green-400 bg-green-500/10' : 'border-indigo-400 bg-indigo-500/10 hover:border-indigo-300'} ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <User className={`w-6 h-6 ${profilePic ? 'text-green-400' : 'text-indigo-400'}`} />
              <span className={`text-xs font-bold uppercase tracking-wider ${profilePic ? 'text-green-400' : 'text-indigo-400'}`}>
                {profilePic ? '¡Foto Seleccionada!' : 'Subir Foto de Perfil'}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setProfilePic(e.target.files?.[0] || null)} disabled={isUploading} />
            </label>

            {error && <p className="text-red-400 text-sm font-bold text-center">{error}</p>}

            {/* BOTÓN CON ESTADO DE CARGA */}
            <button 
              type="submit" 
              disabled={isUploading}
              className="mt-4 w-full border border-indigo-400 bg-indigo-600/20 text-white py-4 rounded-xl hover:bg-indigo-600/40 transition-colors text-sm tracking-widest uppercase font-bold shadow-[0_0_15px_rgba(99,102,241,0.2)] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando Perfil...
                </>
              ) : (
                'Finalizar y Entrar'
              )}
            </button>
          </form>
        )}

        {/* PASO 4 (Se mantiene igual) */}
        {step === 4 && existingUser && (
          <div className="flex flex-col items-center gap-5 animate-fade-in text-center mt-2">
            <div className="w-24 h-24 rounded-full border-4 border-indigo-400 overflow-hidden shadow-[0_0_15px_rgba(99,102,241,0.4)]">
               <img src={existingUser.profilePicUrl} alt={existingUser.name} className="w-full h-full object-cover"/>
            </div>
            <div>
               <p className="text-sm text-gray-400 font-bold tracking-widest uppercase">Este correo ya tiene una cuenta</p>
               <h2 className="text-3xl font-black text-white mt-2 uppercase">{existingUser.name}</h2>
            </div>
            
            <button 
              onClick={() => navigate('/login')} 
              className="mt-6 w-full border border-indigo-400 bg-[#3a3a3a] text-white py-4 rounded-xl hover:bg-[#4a4a4a] transition-colors text-sm tracking-widest uppercase font-bold flex items-center justify-center gap-2"
            >
              Ir a Iniciar Sesión <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
         <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            ¿Ya tienes una cuenta?{' '}
            <button onClick={() => navigate('/login')} className="text-teal-400 font-bold tracking-wider hover:text-teal-300 transition-colors uppercase underline decoration-2 underline-offset-4">
              Inicia Sesión
            </button>
          </p>
        </div>

      </div>
    </div>
  );
}