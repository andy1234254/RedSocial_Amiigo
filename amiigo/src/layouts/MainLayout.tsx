
import type { ReactNode } from 'react';

interface MainLayoutProps {
  children: ReactNode; 
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    // Contenedor principal: Ocupa toda la pantalla (h-screen), fondo oscuro y usa flexbox
    <div className="flex h-screen w-full bg-gray-900 text-white overflow-hidden">
      
      {/* 
        AREA DEL BODY (Izquierda) 
        flex-1: Toma todo el espacio disponible que el sidebar no use.
      */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* Aquí se inyectarán las tarjetas de usuarios o la ventana de chat */}
        {children}
      </main>

      {/* 
        AREA DEL SIDEBAR (Derecha) 
        w-80: Ancho fijo.
        border-l: Borde izquierdo para separarlo del body.
        hidden md:flex: Responsive. Se oculta en celulares y se muestra como flex en pantallas medianas/grandes.
      */}
      <aside className="w-80 bg-gray-800 border-l border-gray-700 hidden md:flex flex-col">
        
        {/* 1. Header del Sidebar (Logo) */}
        <div className="h-16 flex items-center justify-center border-b border-gray-700">
          <h1 className="text-2xl font-bold text-blue-400">Amiigo</h1>
        </div>

        {/* 2. Lista de Amigos (Medio) - flex-1 para que tome el espacio sobrante con scroll */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">
            Conectados
          </h2>
          <div className="space-y-3">
             <div className="p-3 bg-gray-700 rounded animate-pulse h-12"></div>
             <div className="p-3 bg-gray-700 rounded animate-pulse h-12"></div>
             <div className="p-3 bg-gray-700 rounded animate-pulse h-12"></div>
          </div>
        </div>

        {/* 3. Perfil del Usuario */}
        <div className="p-4 border-t border-gray-700 flex items-center gap-3">
           {/* Círculo de perfil temporal */}
           <div className="w-10 h-10 rounded-full bg-gray-600"></div>
           <div>
             <p className="font-medium text-sm">Mi Perfil</p>
             <p className="text-xs text-gray-400">Ajustes</p>
           </div>
        </div>
        
      </aside>
    </div>
  );
}