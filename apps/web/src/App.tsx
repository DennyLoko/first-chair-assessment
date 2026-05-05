import { useState } from 'react';
import Search from './pages/Search.tsx';
import Admin from './pages/Admin.tsx';

type Tab = 'search' | 'admin';

export default function App() {
  const [tab, setTab] = useState<Tab>('search');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-4">
        <div className="flex gap-4">
          <button
            className={`py-3 px-4 text-sm font-medium border-b-2 ${tab === 'search' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setTab('search')}
          >
            Search
          </button>
          <button
            className={`py-3 px-4 text-sm font-medium border-b-2 ${tab === 'admin' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setTab('admin')}
          >
            Admin
          </button>
        </div>
      </nav>
      <main className="p-4">
        {tab === 'search' ? <Search /> : <Admin />}
      </main>
    </div>
  );
}
