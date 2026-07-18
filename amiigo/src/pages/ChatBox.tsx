import { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

interface User {
  uid: string;
  name: string;
  profilePicUrl: string;
  isOnline: boolean;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp: Timestamp | null;
}

interface ChatBoxProps {
  currentUser: User;
  chatUser: User;
  onClose: () => void;
}

export default function ChatBox({ currentUser, chatUser, onClose }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const goToProfile = () => {
    try {
      onClose();
    } finally {
      navigate(`/profile/${chatUser.uid}`);
    }
  };
  const chatId = [currentUser.uid, chatUser.uid].sort().join('_');

  // Auto-scroll hacia abajo cuando hay nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Marcar conversación como leída cuando se abre el chat
  useEffect(() => {
    const markChatAsRead = async () => {
      try {
        const metaRef = doc(db, 'chatMeta', chatId);
        const metaSnap = await getDoc(metaRef);
        if (metaSnap.exists()) {
          await setDoc(metaRef, {
            unreadFor: {
              [currentUser.uid]: false,
            },
          }, { merge: true });
        }
      } catch (error) {
        console.error('Error marcando chat como leído:', error);
      }
    };

    if (currentUser.uid && chatUser.uid) {
      markChatAsRead();
    }
  }, [chatId, currentUser.uid, chatUser.uid]);

  // Escuchar mensajes en tiempo real
  useEffect(() => {
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      
      setMessages(fetchedMessages);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [chatId]);

  // Enviar un mensaje
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const messageText = newMessage;
    setNewMessage(''); 

    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        text: messageText,
        senderId: currentUser.uid,
        timestamp: serverTimestamp(),
      });

      const metaRef = doc(db, 'chatMeta', chatId);
      await setDoc(metaRef, {
        lastMessageAt: serverTimestamp(),
        lastSenderId: currentUser.uid,
        unreadFor: {
          [currentUser.uid]: false,
          [chatUser.uid]: true,
        },
      }, { merge: true });
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#1a1a1a] rounded-[2rem] border-2 border-white/5 shadow-2xl overflow-hidden animate-fade-in">
      
      {/* HEADER DEL CHAT */}
      <div className="bg-[#2a2a2a] p-4 flex items-center gap-4 border-b border-white/10 z-10 shadow-sm">
        <button 
          onClick={onClose}
          className="p-2 bg-[#1a1a1a] hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-full transition-all text-gray-400 hover:text-white shadow-sm"
          title="Regresar"
        >
          <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
        </button>
        
        <button type="button" onClick={goToProfile} className="flex items-center gap-3 p-0 bg-transparent border-none">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden shrink-0 border-2 border-indigo-300 group shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <img src={chatUser.profilePicUrl} alt={chatUser.name} className="w-full h-full object-cover" />
          </div>

          <div>
            <h3 className="text-white font-black uppercase tracking-wider text-sm md:text-base truncate">
              {chatUser.name}
            </h3>
          <p className={`text-[10px] md:text-xs font-bold tracking-widest uppercase mt-0.5 ${
            chatUser.isOnline ? 'text-teal-400 drop-shadow-[0_0_5px_rgba(45,212,191,0.5)]' : 'text-gray-500'
          }`}>
            {chatUser.isOnline ? 'En línea' : 'Desconectado'}
          </p>
        </div>
      </button>
      </div>

      {/* ÁREA DE MENSAJES */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-indigo-500/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-indigo-500/50 transition-colors">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col h-full items-center justify-center text-gray-500 text-sm font-bold uppercase tracking-widest text-center">
            <p>No hay mensajes aún.</p>
            <p className="text-xs mt-1">¡Saluda a {chatUser.name}!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`max-w-[75%] p-3 rounded-2xl text-sm leading-relaxed shadow-md ${
                    isMe 
                      ? 'bg-teal-600 text-white rounded-tr-none' 
                      : 'bg-[#3a3a3a] text-gray-200 rounded-tl-none border border-white/5'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} /> 
      </div>

      {/* INPUT DE MENSAJE */}
      <div className="p-4 bg-[#2a2a2a] border-t border-white/10">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-[#1a1a1a] border border-gray-600 focus:border-teal-500 rounded-full px-4 py-3 text-white placeholder-gray-500 focus:outline-none transition-colors text-sm"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-3 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-full transition-colors shrink-0 shadow-[0_0_10px_rgba(13,148,136,0.3)]"
          >
            <Send className="w-5 h-5 ml-1" />
          </button>
        </form>
      </div>
      
    </div>
  );
}