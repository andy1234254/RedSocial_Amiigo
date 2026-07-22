import { useState, useEffect, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, X, Camera, Loader2, MapPin, User as UserIcon, Calendar, LogOut, UserMinus } from 'lucide-react';
import { auth, db, storage } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, arrayRemove, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
interface UserProfile {
  uid: string;
  name: string;
  email: string;
  profilePicUrl: string;
  coverPicUrl: string;
  bio?: string;
  age?: string;
  gender?: string;
  country?: string;
  friends?: string[];
  friendsList?: string[];
}

export default function Profile() {
 const { uid } = useParams();
  const navigate = useNavigate();
  
  // 1. NUEVOS ESTADOS: Separamos al perfil visitado del usuario autenticado
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null); 
  const [isOwnProfile, setIsOwnProfile] = useState(false); 
  const [currentUserData, setCurrentUserData] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState<'cover' | 'profile' | null>(null);

  // Estado para los inputs del formulario
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    age: '',
    gender: '',
    country: '',
  });

 // Cargar datos del usuario
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    
    if (user) {
      const targetUid = uid ? uid : user.uid;
      setIsOwnProfile(targetUid === user.uid);

      // 1. Cargamos SIEMPRE los datos del usuario logueado (para saber su lista de amigos)
      const currentUserRef = doc(db, 'users', user.uid);
      const currentUserSnap = await getDoc(currentUserRef);
      
      if (currentUserSnap.exists()) {
        const myData = currentUserSnap.data() as UserProfile;
        setCurrentUserData(myData);

        // 2. Cargamos los datos del perfil visitado
        if (targetUid === user.uid) {
          setProfileUser(myData);
          setFormData({
            name: myData.name || '',
            bio: myData.bio || '',
            age: myData.age || '',
            gender: myData.gender || '',
            country: myData.country || '',
          });
        } else {
          const targetUserRef = doc(db, 'users', targetUid);
          const targetUserSnap = await getDoc(targetUserRef);
          
          if (targetUserSnap.exists()) {
            const targetData = targetUserSnap.data() as UserProfile;
            setProfileUser(targetData);
            setFormData({
              name: targetData.name || '',
              bio: targetData.bio || '',
              age: targetData.age || '',
              gender: targetData.gender || '',
              country: targetData.country || '',
            });
          }
        }
      }
    } else {
      navigate('/login');
    }
  });
  
  return () => unsubscribe();
}, [navigate, uid]);
  // Función para guardar los textos (Nombre, Bio, Edad, etc.)
  const handleSaveProfile = async () => {
    if (!profileUser) return;
    setIsSaving(true);
    
    try {
      const userRef = doc(db, 'users', profileUser.uid);
      await updateDoc(userRef, {
        name: formData.name,
        bio: formData.bio,
        age: formData.age,
        gender: formData.gender,
        country: formData.country,
      });

      // Si el nombre cambió, actualizar todos los posts para mantener consistencia
      if (formData.name !== profileUser.name) {
        const postsQuery = query(
          collection(db, 'posts'),
          where('userId', '==', profileUser.uid)
        );
        const postsSnapshot = await getDocs(postsQuery);
        const batch = writeBatch(db);
        postsSnapshot.forEach((postDoc) => {
          batch.update(postDoc.ref, { userName: formData.name });
        });
        await batch.commit();

        // También actualizar el nombre en los comentarios dentro de cada post
        for (const postDoc of postsSnapshot.docs) {
          const postData = postDoc.data();
          const comments = postData.comments || [];
          const hasStaleComments = comments.some(
            (c: any) => c.userId === profileUser.uid
          );
          if (hasStaleComments) {
            const updatedComments = comments.map((c: any) => {
              if (c.userId === profileUser.uid) {
                return { ...c, userName: formData.name };
              }
              return c;
            });
            await updateDoc(postDoc.ref, { comments: updatedComments });
          }
        }
      }

      setProfileUser({ ...profileUser, ...formData });
      setIsEditing(false); 
    } catch (error) {
      console.error("Error al guardar perfil:", error);
    } finally {
      setIsSaving(false);
    }
  };
const handleRemoveFriend = async () => {
    if (!currentUserData || !profileUser) return;
    if (!window.confirm(`¿Estás seguro de eliminar a ${profileUser.name} de tus amigos?`)) return;

    try {
      // 1. Eliminar al amigo de MI lista de amigos (arrayRemove en mi propio doc)
      const myRef = doc(db, 'users', currentUserData.uid);
      await updateDoc(myRef, {
        friendsList: arrayRemove(profileUser.uid),
      });

      // 2. Eliminarme de la lista de amigos DEL OTRO usuario
      //    Lee el documento del amigo, filtra el array y escribe el resultado.
      //    No se usa arrayRemove en el doc ajeno porque Firestore no puede
      //    evaluar FieldValue sentinels en las reglas de seguridad.
      const friendRef = doc(db, 'users', profileUser.uid);
      const friendSnap = await getDoc(friendRef);
      if (friendSnap.exists()) {
        const friendData = friendSnap.data();
        const updatedFriendsList = (friendData.friendsList || []).filter(
          (uid: string) => uid !== currentUserData.uid
        );
        await updateDoc(friendRef, { friendsList: updatedFriendsList });
      }

      setCurrentUserData({
        ...currentUserData,
        friendsList: currentUserData.friendsList?.filter((friendId) => friendId !== profileUser.uid) || [],
      });
      alert('Amigo eliminado correctamente');
      navigate('/home');
    } catch (error) {
      console.error('Error al eliminar amigo:', error);
    }
  };
  // Función para cambiar imágenes directamente (Portada o Perfil)
  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>, type: 'cover' | 'profile') => {
    const file = e.target.files?.[0];
    if (!file || !profileUser) return;

    setImageUploading(type);
    
    try {
      // Subir a Storage
      const storageRef = ref(storage, `users/${profileUser.uid}/${type}Pic`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      // 1. Actualizar el documento del usuario en Firestore
      const userRef = doc(db, 'users', profileUser.uid);
      if (type === 'cover') {
        await updateDoc(userRef, { coverPicUrl: downloadUrl });
        setProfileUser({ ...profileUser, coverPicUrl: downloadUrl });
      } else {
        await updateDoc(userRef, { profilePicUrl: downloadUrl });
        setProfileUser({ ...profileUser, profilePicUrl: downloadUrl });
      }

      // 2. Actualizar TODOS los posts anteriores del usuario para que
      //    muestren la nueva imagen (la URL vieja deja de funcionar al
      //    sobrescribir el archivo en Storage).
      const fieldToUpdate = type === 'cover' ? 'userCover' : 'userAvatar';
      const commentFieldToUpdate = type === 'cover' ? 'userCover' : 'userAvatar';
      const postsQuery = query(
        collection(db, 'posts'),
        where('userId', '==', profileUser.uid)
      );
      const postsSnapshot = await getDocs(postsQuery);
      const batch = writeBatch(db);
      postsSnapshot.forEach((postDoc) => {
        batch.update(postDoc.ref, { [fieldToUpdate]: downloadUrl });
      });
      await batch.commit();

      // 3. Actualizar los comentarios del usuario dentro de cada post
      //    para que también reflejen la nueva imagen.
      for (const postDoc of postsSnapshot.docs) {
        const postData = postDoc.data();
        const comments = postData.comments || [];
        const hasStaleComments = comments.some(
          (c: any) => c.userId === profileUser.uid
        );
        if (hasStaleComments) {
          const updatedComments = comments.map((c: any) => {
            if (c.userId === profileUser.uid) {
              return { ...c, [commentFieldToUpdate]: downloadUrl };
            }
            return c;
          });
          await updateDoc(postDoc.ref, { comments: updatedComments });
        }
      }
    } catch (error) {
      console.error(`Error subiendo foto de ${type}:`, error);
    } finally {
      setImageUploading(null);
    }
  };
  // Función para cerrar sesión
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  // Pantalla de carga inicial
  if (!profileUser) {
    return (
      <div className="flex h-screen w-full bg-[#1a1a1a] items-center justify-center">
        <Loader2 className="w-12 h-12 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white font-sans overflow-x-hidden pb-12">
      
      {/* HEADER / NAVBAR DE NAVEGACIÓN */}
      <div className="fixed top-0 w-full z-50 bg-[#1a1a1a]/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button 
          onClick={() => navigate('/home')}
          className="flex items-center gap-2 hover:text-teal-400 transition-colors uppercase text-sm font-bold tracking-wider"
        >
          <ArrowLeft className="w-5 h-5" /> 
        </button>
        <h1 className="text-xl md:text-2xl font-serif tracking-widest absolute left-1/2 -translate-x-1/2 pointer-events-none">MI PERFIL</h1>
        <div className="flex items-center gap-2">
          {isOwnProfile ? (
            /* SI ES MI PERFIL: Muestro los controles de edición */
            !isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-lg text-white transition-colors text-sm font-bold uppercase tracking-wider backdrop-blur-sm"
              >
                <UserIcon className="w-4 h-4" />
                <span className="hidden md:inline">Editar Perfil</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors shadow-md"
                  title="Cancelar"
                >
                  <X className="w-5 h-5" />
                </button>
                <button 
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 px-4 py-2 rounded-lg transition-colors text-sm font-bold uppercase tracking-wider disabled:opacity-50 shadow-md text-white"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span className="hidden md:inline">{isSaving ? 'Guardando' : 'Guardar'}</span>
                </button>
              </div>
            )
          ) : (
            /* SI ES EL PERFIL DE OTRO USUARIO: Muestro botón de eliminar amigo */
            <button 
              onClick={handleRemoveFriend}
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-red-500 px-6 py-2 rounded-lg transition-colors text-sm font-bold uppercase tracking-wider text-red-500 hover:text-white shadow-lg"
            >
              <UserMinus className="w-4 h-4" />
              <span className="hidden md:inline">Eliminar Amigo</span>
            </button>
          )}
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL DEL PERFIL */}
      <main className="max-w-4xl mx-auto pt-[60px]">
        
        {/* ======================= FOTO DE PORTADA ======================= */}
        <div className="relative w-full h-48 md:h-80 bg-gray-800 rounded-b-[2rem] overflow-hidden shadow-2xl">
          <img 
            src={profileUser.coverPicUrl} 
            alt="Portada" 
            className={`w-full h-full object-cover ${isEditing ? 'opacity-70' : ''}`}
          />
          {imageUploading === 'cover' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
          )}
          {isEditing && imageUploading !== 'cover' && (
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/60 cursor-pointer transition-colors group">
              <div className="flex flex-col items-center text-white/80 group-hover:text-white">
                <Camera className="w-10 h-10 mb-2" />
                <span className="text-sm uppercase font-bold tracking-widest drop-shadow-md">Cambiar Portada</span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChange(e, 'cover')} />
            </label>
          )}
        </div>

        {/* ======================= FOTO DE PERFIL ======================= */}
        <div className="relative px-4 sm:px-8 -mt-16 md:-mt-24 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6">
          <div className="relative w-32 h-32 md:w-48 md:h-48 rounded-full border-4 border-[#1a1a1a] bg-black overflow-hidden shadow-2xl z-10 shrink-0">
            <img 
              src={profileUser.profilePicUrl} 
              alt="Perfil" 
              className={`w-full h-full object-cover ${isEditing ? 'opacity-70' : ''}`}
            />
            {imageUploading === 'profile' && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
            {isEditing && imageUploading !== 'profile' && (
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 hover:bg-black/70 cursor-pointer transition-colors group">
                <Camera className="w-8 h-8 text-white/80 group-hover:text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChange(e, 'profile')} />
              </label>
            )}
          </div>

          {/* ======================= NOMBRE ======================= */}
          <div className="flex-1 text-center md:text-left mb-4">
            {isEditing ? (
              <input 
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="TU NOMBRE"
                className="w-full md:max-w-md bg-[#2a2a2a] border-b-2 border-teal-500 px-4 py-2 text-2xl md:text-4xl font-black text-white focus:outline-none text-center md:text-left rounded-t-lg"
              />
            ) : (
              <h2 className="text-3xl md:text-5xl font-black uppercase tracking-wide drop-shadow-lg">
                {profileUser.name}
              </h2>
            )}
          </div>
        </div>

        {/* ======================= BIOGRAFÍA Y DETALLES ======================= */}
        <div className="px-4 sm:px-8 mt-8 flex flex-col gap-8">
          <div className="bg-[#2a2a2a] p-6 rounded-2xl border-2 border-white/5 shadow-lg relative">
            <div className="absolute -top-3 left-6 bg-[#1a1a1a] px-2 text-xs font-bold text-teal-400 uppercase tracking-widest">
              Biografía / Nota
            </div>
            {isEditing ? (
              <textarea 
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Escribe algo sobre ti..."
                rows={3}
                className="w-full bg-transparent border-b-2 border-gray-600 focus:border-teal-500 text-white resize-none focus:outline-none placeholder-gray-500 text-center md:text-left"
              />
            ) : (
              <p className="text-gray-300 text-center md:text-left text-lg leading-relaxed whitespace-pre-wrap">
                {profileUser.bio || <span className="italic text-gray-500 text-sm">Sin biografia</span>}
              </p>
            )}
          </div>

          {/* Grid de Detalles (Edad, Género, País) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Edad */}
            <div className="bg-[#2a2a2a] p-4 rounded-2xl border-2 border-white/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Edad</p>
                {isEditing ? (
                  <input type="number" value={formData.age} onChange={(e) => setFormData({ ...formData, age: e.target.value })} placeholder="Ej. 24" className="w-full bg-transparent border-b border-gray-600 focus:border-indigo-400 text-white focus:outline-none text-lg mt-1" />
                ) : (
                  <p className="text-white text-lg font-medium">{profileUser.age ? `${profileUser.age} años` : '-'}</p>
                )}
              </div>
            </div>

            {/* Género */}
            <div className="bg-[#2a2a2a] p-4 rounded-2xl border-2 border-white/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-pink-500/20 flex items-center justify-center shrink-0">
                <UserIcon className="w-6 h-6 text-pink-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Género</p>
                {isEditing ? (
                  <select value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value })} className="w-full bg-transparent border-b border-gray-600 focus:border-pink-400 text-white focus:outline-none text-lg mt-1 [&>option]:bg-[#2a2a2a]">
                    <option value="">Selecciona...</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                    <option value="No Binario">No Binario</option>
                    <option value="Prefiero no decirlo">Prefiero no decirlo</option>
                  </select>
                ) : (
                  <p className="text-white text-lg font-medium">{profileUser.gender || '-'}</p>
                )}
              </div>
            </div>

            {/* País */}
            <div className="bg-[#2a2a2a] p-4 rounded-2xl border-2 border-white/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                <MapPin className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">País</p>
                {isEditing ? (
                  <input type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} placeholder="Ej. México" className="w-full bg-transparent border-b border-gray-600 focus:border-green-400 text-white focus:outline-none text-lg mt-1" />
                ) : (
                  <p className="text-white text-lg font-medium">{profileUser.country || '-'}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ======================= BOTÓN DE CERRAR SESIÓN ======================= */}
        {isOwnProfile && (
          <div className="mt-12 flex justify-center pb-8">
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-8 py-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all font-bold uppercase tracking-widest text-sm border border-red-500/20 hover:border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)] hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]"
            >
              <LogOut className="w-5 h-5" />
              Cerrar Sesión
            </button>
          </div>
        )}
      </main>
    </div>
  );
}


