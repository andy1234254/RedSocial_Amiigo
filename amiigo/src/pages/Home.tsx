import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, User, UserPlus, Menu, X as XIcon, X, Trash2, Edit2, Check, Clock, Search, Bell, ThumbsUp, ThumbsDown, MessageCircleMore, Send } from 'lucide-react'; 
import { auth, db } from '../firebase';
import { onAuthStateChanged} from 'firebase/auth';
import ChatBox from './ChatBox'; 
import { doc, getDocs, arrayUnion, collection, where, onSnapshot, query, orderBy, addDoc, serverTimestamp, deleteDoc, updateDoc, setDoc, runTransaction } from 'firebase/firestore';

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  profilePicUrl: string;
  coverPicUrl: string;
  isOnline: boolean;
  friendsList: string[]; 
}

interface CommentData {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: any;
}

interface PostData {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userCover: string;
  createdAt: any;
  likesCount?: number;
  dislikesCount?: number;
  comments?: CommentData[];
  userReactions?: Record<string, 'like' | 'dislike'>;
}


export default function Home() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [newPostText, setNewPostText] = useState('');
  const [activeChatUser, setActiveChatUser] = useState<any | null>(null);
  // Estados para la edición de posts
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostText, setEditPostText] = useState('');
  // Estado para abrir/cerrar el menú en móviles
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Estados para buscar y agregar amigos
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]); 
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [unreadChats, setUnreadChats] = useState<Record<string, boolean>>({});
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const markChatAsRead = async (friendUid: string) => {
    if (!currentUser) return;
    const chatId = [currentUser.uid, friendUid].sort().join('_');

    try {
      await setDoc(doc(db, 'chatMeta', chatId), {
        unreadFor: {
          [currentUser.uid]: false,
        },
      }, { merge: true });

      setUnreadChats((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    } catch (error) {
      console.error('Error marcando chat como leído:', error);
    }
  };

  // 1. ESCUCHAR SOLICITUDES EN TIEMPO REAL
  useEffect(() => {
    if (!currentUser?.uid) return;
    const q = query(
      collection(db, 'friendRequests'),
      where('receiverId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingRequests(requests);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // 2. ACEPTAR SOLICITUD
  const handleAcceptRequest = async (request: any) => {
    if (!currentUser) return;
    try {
      // A. Actualizamos la solicitud a 'accepted'
      await updateDoc(doc(db, 'friendRequests', request.id), { status: 'accepted' });
      
      // B. Agregamos el ID del remitente a NUESTRA lista de amigos
      await updateDoc(doc(db, 'users', currentUser.uid), {
        friendsList: arrayUnion(request.senderId) 
      });

      // C. Agregamos NUESTRO ID a LA LISTA del remitente
      await updateDoc(doc(db, 'users', request.senderId), {
        friendsList: arrayUnion(currentUser.uid)
      });
      
      await deleteDoc(doc(db, 'friendRequests', request.id));
    } catch (error) {
      console.error("Error al aceptar solicitud:", error);
    }
  };

  // 3. RECHAZAR SOLICITUD
  const handleRejectRequest = async (requestId: string) => {
    try {
      await deleteDoc(doc(db, 'friendRequests', requestId));
    } catch (error) {
      console.error("Error al rechazar solicitud:", error);
    }
  };
  // BUSCAR USUARIOS
  // 1. CARGAR TODOS LOS USUARIOS AL ABRIR EL MODAL
  useEffect(() => {
    if (isSearchModalOpen) {
      const fetchAllUsers = async () => {
        if (!currentUser) return;
        setIsSearching(true);
        try {
          const querySnapshot = await getDocs(collection(db, 'users'));
          const usersList: any[] = [];         
          querySnapshot.forEach((doc) => {
            const userData = doc.data();
            if (userData.uid !== currentUser.uid) {
              usersList.push(userData);
            }
          });
          
          setAllUsers(usersList);
        } catch (error) {
          console.error("Error al cargar usuarios:", error);
        } finally {
          setIsSearching(false);
        }
      };
      
      fetchAllUsers();
    } else {
      setAllUsers([]);
      setSearchResults([]);
      setSearchQuery('');
    }
  }, [isSearchModalOpen, currentUser]);

  // 2. FILTRADO EN TIEMPO REAL AL ESCRIBIR
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const searchTerm = searchQuery.toLowerCase();
    const filteredUsers = allUsers.filter(user => {
    const matchName = user.name && user.name.toLowerCase().includes(searchTerm);
    const matchEmail = user.email && user.email.toLowerCase().includes(searchTerm);
      return matchName || matchEmail;
    });

    setSearchResults(filteredUsers);
  }, [searchQuery, allUsers]);
  // ENVIAR SOLICITUD DE AMISTAD
  const sendFriendRequest = async (receiverId: string) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'friendRequests'), {
        senderId: currentUser.uid,
        senderName: currentUser.name,
        senderAvatar: currentUser.profilePicUrl,
        receiverId: receiverId,
        status: 'pending',
        timestamp: serverTimestamp()
      });
      setSentRequests([...sentRequests, receiverId]);
    } catch (error) {
      console.error("Error enviando solicitud:", error);
    }
  };
  // ELIMINAR POST
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta publicación?')) return;
    
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (error) {
      console.error("Error al eliminar el post:", error);
    }
  };

  // INICIAR EDICIÓN
  const startEditing = (post: any) => {
    setEditingPostId(post.id);
    setEditPostText(post.text);
  };

  // GUARDAR EDICIÓN
  const handleUpdatePost = async (postId: string) => {
    if (!editPostText.trim()) return;

    try {
      await updateDoc(doc(db, 'posts', postId), {
        text: editPostText,
      });
      setEditingPostId(null);
      setEditPostText('');
    } catch (error) {
      console.error("Error al actualizar el post:", error);
    }
  };
  // EFECTO PARA CONTROLAR EL ESTADO EN LÍNEA / DESCONECTADO
  useEffect(() => {
    if (!currentUser?.uid) return;

    const userRef = doc(db, 'users', currentUser.uid);

    const setOnlineStatus = async (status: boolean) => {
      try {
        await updateDoc(userRef, {
          isOnline: status,
          lastSeen: new Date()
        });
      } catch (error) {
        console.error("Error al actualizar estado de conexión:", error);
      }
    };

    setOnlineStatus(true);
    const handlePageHide = () => {
      setOnlineStatus(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setOnlineStatus(true);
      } else {
        setOnlineStatus(false);
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setOnlineStatus(false);
    };
  }, [currentUser?.uid]);
  
  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        unsubscribeUserDoc = onSnapshot(userDocRef, (snapshot) => {
          if (snapshot.exists()) {
            setCurrentUser(snapshot.data() as UserProfile);
          }
        });
      } else {
        navigate('/login');
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, [navigate]);

  useEffect(() => {
    if (!currentUser) return;
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList: UserProfile[] = [];
      snapshot.forEach((doc) => {
        if (doc.id !== currentUser.uid) {
          usersList.push({ uid: doc.id, ...(doc.data() as Omit<UserProfile, 'uid'>) });
        }
      });
      setFriends(usersList);
    });

    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const postsList: PostData[] = [];
      snapshot.forEach((doc) => {
        postsList.push({ id: doc.id, ...doc.data() } as PostData);
      });
      setPosts(postsList);
    });

    return () => {
      unsubscribeUsers();
      unsubscribePosts();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubscribe = onSnapshot(collection(db, 'chatMeta'), (snapshot) => {
      const newUnread: Record<string, boolean> = {};
      const friendIds = new Set(currentUser.friendsList || []);

      snapshot.forEach((doc) => {
        const chatId = doc.id;
        const participants = chatId.split('_');
        if (participants.length !== 2) return;
        if (!friendIds.has(participants[0]) && !friendIds.has(participants[1])) return;

        const metaData = doc.data();
        const unreadFor = metaData?.unreadFor || {};
        if (unreadFor[currentUser.uid]) {
          newUnread[chatId] = true;
        }
      });

      setUnreadChats(newUnread);
    }, (error) => {
      console.error('Error escuchando chats no leídos:', error);
    });

    return () => unsubscribe();
  }, [currentUser, friends]);

  useEffect(() => {
    if (!currentUser || !activeChatUser) return;

    markChatAsRead(activeChatUser.uid);

    if (!currentUser.friendsList?.includes(activeChatUser.uid)) {
      setActiveChatUser(null);
    }
  }, [activeChatUser, currentUser]);

  const handleReaction = async (postId: string, reaction: 'like' | 'dislike') => {
    if (!currentUser) return;

    const postRef = doc(db, 'posts', postId);

    try {
      await runTransaction(db, async (transaction) => {
        const postSnapshot = await transaction.get(postRef);
        if (!postSnapshot.exists()) return;

        const postData = postSnapshot.data() as PostData;
        const nextReactions = { ...(postData.userReactions || {}) };
        const currentReaction = (postData.userReactions?.[currentUser.uid] as 'like' | 'dislike' | undefined) || 'none';
        const nextReaction = currentReaction === reaction ? 'none' : reaction;

        let likesCount = Number(postData.likesCount || 0);
        let dislikesCount = Number(postData.dislikesCount || 0);

        if (currentReaction === 'like') likesCount -= 1;
        if (currentReaction === 'dislike') dislikesCount -= 1;
        if (nextReaction === 'like') likesCount += 1;
        if (nextReaction === 'dislike') dislikesCount += 1;

        if (nextReaction === 'none') {
          delete nextReactions[currentUser.uid];
        } else {
          nextReactions[currentUser.uid] = nextReaction;
        }

        transaction.update(postRef, {
          likesCount,
          dislikesCount,
          userReactions: nextReactions,
        });
      });
    } catch (error) {
      console.error('Error al actualizar reacción:', error);
    }
  };

  const handleAddComment = async (postId: string, event?: React.FormEvent | React.MouseEvent) => {
    event?.preventDefault();

    const commentText = commentDrafts[postId]?.trim();
    if (!commentText || !currentUser) return;

    const postRef = doc(db, 'posts', postId);
    const commentData = {
      id: `${postId}-${Date.now()}`,
      userId: currentUser.uid,
      userName: currentUser.name,
      userAvatar: currentUser.profilePicUrl,
      text: commentText,
      createdAt: new Date(),
    };

    try {
      await setDoc(postRef, {
        comments: arrayUnion(commentData),
      }, { merge: true });

      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
    } catch (error) {
      console.error('Error al agregar comentario:', error);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostText.trim() || !currentUser) return;

    try {
      await addDoc(collection(db, 'posts'), {
        text: newPostText.toUpperCase(),
        userId: currentUser.uid,
        userName: currentUser.name,
        userAvatar: currentUser.profilePicUrl,
        userCover: currentUser.coverPicUrl,
        likesCount: 0,
        dislikesCount: 0,
        comments: [],
        userReactions: {},
        createdAt: serverTimestamp(),
      });
      setNewPostText('');
    } catch (error) {
      console.error("Error al crear la publicación:", error);
    }
  };
  const visiblePosts = posts.filter(post => {
    if (!currentUser) return false;
    if (post.userId === currentUser.uid) return true;
    const misAmigos = currentUser.friendsList || [];
    if (misAmigos.length === 0) return false;
    return misAmigos.includes(post.userId);
  });
  const realFriends = friends.filter(friend => {
    if (!currentUser) return false;
    const misAmigos = currentUser.friendsList || [];
    return misAmigos.includes(friend.uid);
  });

  if (!currentUser) {
    return (
      <div className="flex h-screen w-full bg-[#1a1a1a] items-center justify-center text-white font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#1a1a1a] text-white font-sans overflow-hidden">
      
      {/* ==========================================
          HEADER MÓVIL
          ========================================== */}
        <div className="md:hidden flex items-center justify-between p-4 bg-[#1a1a1a] border-b border-white/10 z-20">
          <img src="/logoAmiigo.png" alt="Amiigo" className="h-8 object-contain" />
        <div className="flex items-center gap-2">
          {/* BOTÓN NOTIFICACIONES MÓVIL */}
          <button onClick={() => setIsNotificationsOpen(true)} className="relative p-2 hover:bg-white/10 rounded-lg transition-colors">
            <Bell className="w-6 h-6 text-white" />
            {pendingRequests.length > 0 && (
              <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border border-[#1a1a1a]"></span>
            )}
          </button>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <Menu className="w-7 h-7 text-white" />
          </button>
        </div>
      </div>

     {/* ==========================================
         BODY (IZQUIERDA) - FEED DE PUBLICACIONES O CHAT
         ========================================== */}
      <main className="flex-1 flex flex-col items-center overflow-y-auto relative px-4 md:px-8 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-indigo-500/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-indigo-500/50 transition-colors">
        
        {activeChatUser ? (
          <div className="w-full max-w-3xl h-full flex flex-col py-4 md:py-8 animate-fade-in">
            <ChatBox 
              currentUser={currentUser} 
              chatUser={activeChatUser} 
              onClose={() => setActiveChatUser(null)} 
            />
          </div>
        ) : (
          <div className="w-full max-w-2xl flex-1 flex flex-col relative pb-12">
            
            {/* BARRA DE ENTRADA DE TEXTO*/}
            <div className="sticky top-0 z-30 bg-[#1a1a1a]/90 backdrop-blur-md pt-6 pb-6 w-full -mx-2 px-2">
              <form 
                onSubmit={handleCreatePost} 
                className="flex items-center w-full h-14 bg-[#2a2a2a] border border-white/20 rounded-2xl px-4 gap-4 shadow-lg focus-within:border-indigo-400 focus-within:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-black overflow-hidden shrink-0 border border-white/30 hidden md:block">
                   <img src={currentUser.profilePicUrl} alt="Yo" className="w-full h-full object-cover" />
                </div>
                <input 
                  type="text" 
                  value={newPostText}
                  onChange={(e) => setNewPostText(e.target.value)}
                  placeholder="¿Qué estás pensando?"
                  className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm md:text-base font-bold focus:outline-none tracking-wider"
                />
                <button 
                  type="submit" 
                  disabled={!newPostText.trim()}
                  className="h-10 w-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors disabled:opacity-50 disabled:bg-gray-600 shrink-0 shadow-md"
                >
                  <ArrowUp className="w-6 h-6 text-white" strokeWidth={3} />
                </button>
              </form>
            </div>

            {/* CONTENEDOR DE PUBLICACIONES */}
            <div className="flex flex-col gap-6 w-full">
              {visiblePosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center mt-20 text-gray-500 text-center">
                  <p className="text-xl uppercase tracking-widest font-bold">Aún no hay publicaciones</p>
                  <p className="text-sm mt-2">¡Sé el primero en compartir algo!</p>
                </div>
              ) : (
                visiblePosts.map((post) => {
                  const userReaction = (post.userReactions?.[currentUser.uid] as 'like' | 'dislike' | undefined) || 'none';
                  const comments = Array.isArray(post.comments) ? post.comments : [];
                  const likesCount = Number(post.likesCount || 0);
                  const dislikesCount = Number(post.dislikesCount || 0);

                  return (
                    <div 
                      key={post.id} 
                      className="relative w-full min-h-[16rem] md:min-h-[20rem] rounded-[2rem] border border-white/10 overflow-hidden group shadow-lg hover:shadow-[0_0_25px_rgba(99,102,241,0.16)] transition-all animate-fade-in"
                    >
                      <img 
                        src={post.userCover} 
                        alt={`Portada de ${post.userName}`} 
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/30"></div>

                      {post.userId === currentUser.uid && editingPostId !== post.id && (
                        <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <button 
                            onClick={() => startEditing(post)}
                            className="p-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-gray-300 hover:text-indigo-400 hover:bg-black/60 transition-all shadow-md"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeletePost(post.id)}
                            className="p-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-gray-300 hover:text-red-400 hover:bg-black/60 transition-all shadow-md"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      <div className="relative z-10 p-5 h-full flex flex-col justify-between gap-4">
                        <div className="flex items-start justify-between gap-3">
                          <div 
                            onClick={() => navigate(`/profile/${post.userId}`)}
                            className="flex items-center gap-3 cursor-pointer group/user w-max"
                          >
                            <div className="w-12 h-12 rounded-full bg-black border-2 border-white/50 group-hover/user:border-indigo-400 overflow-hidden flex items-center justify-center shrink-0 shadow-lg transition-colors duration-300">
                              <img src={post.userAvatar} alt={post.userName} className="w-full h-full object-cover" />
                            </div>
                            <h2 className="text-xl md:text-2xl font-black text-white drop-shadow-md uppercase truncate group-hover/user:text-indigo-400 transition-colors duration-300">
                              {post.userName}
                            </h2>
                          </div>
                        </div>

                        <div className="w-full px-2 z-20">
                          {editingPostId === post.id ? (
                            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md p-2 rounded-xl border border-indigo-500/50">
                              <input 
                                type="text" 
                                value={editPostText}
                                onChange={(e) => setEditPostText(e.target.value)}
                                className="flex-1 bg-transparent text-white font-bold focus:outline-none uppercase text-sm md:text-lg px-2"
                                autoFocus
                              />
                              <button 
                                onClick={() => handleUpdatePost(post.id)}
                                className="p-2 bg-green-500 hover:bg-green-400 text-white rounded-lg transition-colors shadow-md shrink-0"
                              >
                                <Check className="w-4 h-4 md:w-5 md:h-5" strokeWidth={3} />
                              </button>
                              <button 
                                onClick={() => setEditingPostId(null)}
                                className="p-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors shadow-md shrink-0"
                              >
                                <X className="w-4 h-4 md:w-5 md:h-5" strokeWidth={3} />
                              </button>
                            </div>
                          ) : (
                            <p className="text-lg md:text-2xl font-black drop-shadow-lg text-white break-words line-clamp-3">
                              {post.text}
                            </p>
                          )}
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur-md shadow-inner">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <button
                              type="button"
                              onClick={() => handleReaction(post.id, 'like')}
                              className={`flex items-center gap-2 rounded-full px-3 py-2 transition-all ${userReaction === 'like' ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]' : 'bg-white/10 text-gray-200 hover:bg-white/20'}`}
                            >
                              <ThumbsUp className="w-4 h-4" />
                              <span>{likesCount}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReaction(post.id, 'dislike')}
                              className={`flex items-center gap-2 rounded-full px-3 py-2 transition-all ${userReaction === 'dislike' ? 'bg-rose-500/25 text-rose-300 border border-rose-400/30 shadow-[0_0_12px_rgba(244,63,94,0.2)]' : 'bg-white/10 text-gray-200 hover:bg-white/20'}`}
                            >
                              <ThumbsDown className="w-4 h-4" />
                              <span>{dislikesCount}</span>
                            </button>
                            <div className="ml-auto flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-gray-200">
                              <MessageCircleMore className="w-4 h-4" />
                              <span>{comments.length}</span>
                            </div>
                          </div>

                          <form
                            onSubmit={(e) => {
                              void handleAddComment(post.id, e);
                            }}
                            className="mt-3 flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={commentDrafts[post.id] || ''}
                              onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                              placeholder="Escribe un comentario..."
                              className="flex-1 rounded-full border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-400 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleAddComment(post.id, e);
                              }}
                              disabled={!commentDrafts[post.id]?.trim()}
                              className="rounded-full bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </form>

                          <div className="mt-3">
                            {comments.length === 0 ? (
                              <p className="text-xs text-gray-400">Aún no hay comentarios. ¡Sé el primero!</p>
                            ) : (
                              <div className="max-h-44 overflow-y-auto pr-2 space-y-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-indigo-500/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-indigo-500/40">
                                {comments
                                  .slice()
                                  .sort((a, b) => Number(b.createdAt?.toDate?.() || b.createdAt || 0) - Number(a.createdAt?.toDate?.() || a.createdAt || 0))
                                  .map((comment) => (
                                    <div key={comment.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                                      <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10">
                                          <img src={comment.userAvatar} alt={comment.userName} className="h-full w-full object-cover" />
                                        </div>
                                        <div>
                                          <p className="text-sm font-semibold text-white">{comment.userName}</p>
                                          <p className="text-[10px] uppercase tracking-widest text-gray-400">Comentario</p>
                                        </div>
                                      </div>
                                      <p className="mt-2 text-sm text-gray-200">{comment.text}</p>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* ==========================================
          OVERLAY MÓVIL
          ========================================== */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* ==========================================
          SIDEBAR (MÓVIL Y ESCRITORIO)
          ========================================== */}
      <aside className={`
        fixed md:relative top-0 right-0 h-full w-[80%] max-w-[350px] md:w-[350px] 
        bg-[#0a0a0a] flex flex-col p-6 border-l border-white/5 shadow-2xl md:shadow-none
        z-50 transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        
        <button 
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="hidden md:block text-center mb-10 mt-4">         
           <img src="/logoAmiigo.png" alt="Amiigo" className="mx-auto h-20 object-contain" />
        </div>
        <div className="h-8 md:hidden mb-4"></div>
        {/* CONTENEDOR DE USUARIOS*/}
        <div className="flex-1 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-500 transition-colors">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
          {/* BOTÓN NOTIFICACIONES ESCRITORIO*/}
          <button 
            onClick={() => setIsNotificationsOpen(true)} 
            className="relative p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors hidden md:block"
            title="Notificaciones"
          >
            <Bell className="w-5 h-5 text-gray-300 hover:text-white" />
            {pendingRequests.length > 0 && (
              <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#1a1a1a]"></span>
            )}
          </button>
            <h2 className="text-lg text-white font-bold tracking-wider uppercase">Conectados</h2>
          </div>
          <div className="flex flex-col gap-3 pl-1 pb-4">
            {realFriends.length === 0 ? (
              <p className="text-gray-500 text-xs text-center mt-4">No hay usuarios aún.</p>
            ) : (
              realFriends.map((friend) => (
                <div 
                  key={friend.uid} 
                  onClick={() => {
                    markChatAsRead(friend.uid);
                    setActiveChatUser(friend);
                    setIsSidebarOpen(false); 
                  }}
                    className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-all shadow-sm ${
                    activeChatUser?.uid === friend.uid 
                      ? 'bg-indigo-500/20 border border-indigo-500/40 shadow-[0_4px_12px_rgba(99,102,241,0.1)]' 
                      : 'bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 hover:shadow-[0_4px_10px_rgba(0,0,0,0.3)]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-black border border-white/30 overflow-hidden flex items-center justify-center shrink-0">
                    <img src={friend.profilePicUrl} alt={friend.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-200 text-sm font-bold uppercase truncate">{friend.name}</span>
                    {unreadChats[[currentUser.uid, friend.uid].sort().join('_')] && (
                      <span className="mt-1 inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm">
                        Mensaje nuevo
                      </span>
                    )}
                  </div>
                  <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${unreadChats[[currentUser.uid, friend.uid].sort().join('_')] ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : friend.isOnline ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-gray-600 shadow-none'} transition-colors duration-300`}></div>
                </div>
              ))
            )}
          </div>
        </div>

        <button 
          onClick={() => setIsSearchModalOpen(true)} 
          className="w-full border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)] bg-[#1a1a1a] text-white py-3 my-6 rounded-xl hover:bg-indigo-600/20 hover:border-indigo-500/60 transition-all text-xs tracking-wider uppercase font-bold"
        >
          Agregar Nuevo Amiigo
        </button>

        {/* Tarjeta de Perfil del Usuario Actual */}
        <div className="relative w-full h-24 rounded-2xl border border-white/10 overflow-hidden group shadow-lg shrink-0">
          <img 
            src={currentUser.coverPicUrl} 
            alt="Fondo de Perfil" 
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-colors"></div>
          
          <div className="relative z-10 p-3 h-full flex items-center gap-3 transition-opacity duration-300 group-hover:opacity-0">
            <div className="w-12 h-12 rounded-full bg-black border-2 border-white overflow-hidden flex items-center justify-center shadow-lg shrink-0">
               <img src={currentUser.profilePicUrl} alt={currentUser.name} className="w-full h-full object-cover" />
            </div>
            <span className="text-lg font-black text-white drop-shadow-md uppercase truncate">
              {currentUser.name}
            </span>
          </div>

          <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button 
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 bg-indigo-600/90 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-bold tracking-wider uppercase backdrop-blur-sm transition-all shadow-lg"
            >
              <User className="w-4 h-4" />
              Mi Perfil
            </button>
          </div>
        </div>

      </aside>
      {/* ==========================================
          MODAL DE BÚSQUEDA DE AMIGOS
          ========================================== */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1a1a1a] border border-white/10 w-full max-w-md rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
            
            {/* Header del Modal */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#2a2a2a]">
              <h2 className="text-white font-black uppercase tracking-widest text-lg">Buscar Amiigos</h2>
              <button 
                onClick={() => {
                  setIsSearchModalOpen(false);
                  setSearchResults([]);
                  setSearchQuery('');
                }}
                className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Barra de Búsqueda en Tiempo Real */}
            <div className="p-4">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  placeholder="Buscar por nombre o correo..."
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  autoFocus 
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
              </div>
            </div>

            {/* Resultados de Búsqueda */}
            <div className="flex-1 max-h-[400px] overflow-y-auto p-4 pt-0 space-y-3">
              {isSearching ? (
                <p className="text-center text-gray-500 text-sm uppercase tracking-widest mt-4">Buscando...</p>
              ) : searchResults.length === 0 && searchQuery !== '' ? (
                <p className="text-center text-gray-500 text-sm mt-4">No se encontraron usuarios</p>
              ) : (
                searchResults.map((user) => (
                  <div key={user.uid} className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-black border border-white/20">
                        <img src={user.profilePicUrl} alt={user.name} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-white font-bold text-sm uppercase">{user.name}</span>
                    </div>

                    {/* Botón dinámico: Agregar o Pendiente */}
                    {sentRequests.includes(user.uid) ? (
                      <button disabled className="flex items-center gap-1 text-xs text-gray-400 bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 uppercase font-bold tracking-wider">
                        <Clock className="w-3 h-3" /> Pendiente
                      </button>
                    ) : (
                      <button 
                        onClick={() => sendFriendRequest(user.uid)}
                        className="flex items-center gap-1 text-xs text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg transition-colors uppercase font-bold tracking-wider shadow-md"
                      >
                        <UserPlus className="w-3 h-3" /> Agregar
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      )}
      {/* ==========================================
          MODAL DE NOTIFICACIONES
          ========================================== */}
      {isNotificationsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1a1a1a] border border-white/10 w-full max-w-md rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
            
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#2a2a2a]">
              <h2 className="text-white font-black uppercase tracking-widest text-lg">Notificaciones</h2>
              <button onClick={() => setIsNotificationsOpen(false)} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 max-h-[400px] overflow-y-auto p-4 space-y-3">
              {pendingRequests.length === 0 ? (
                <p className="text-center text-gray-500 text-sm mt-4 uppercase tracking-widest font-bold">No tienes solicitudes nuevas</p>
              ) : (
                pendingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-black border border-white/20">
                        <img src={req.senderAvatar} alt={req.senderName} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-white font-bold text-sm uppercase">{req.senderName}</span>
                        <span className="text-gray-400 text-xs">Quiere ser tu amiigo</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button onClick={() => handleAcceptRequest(req)} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-md">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleRejectRequest(req.id)} className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors shadow-md">
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}