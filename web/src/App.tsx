import { useState } from 'react';
import './App.css';
import { LeagueSetup } from './components/LeagueSetup';
import { GameSimulator } from './components/GameSimulator';
import { SeasonSimulator } from './components/SeasonSimulator';
import type { LeagueResponse } from './api/types';

type Tab = 'league' | 'game' | 'season';

const TABS: { id: Tab; label: string }[] = [
  { id: 'league', label: '리그 설정' },
  { id: 'game', label: '단일 경기' },
  { id: 'season', label: '시즌 시뮬레이션' },
];

function App() {
  const [tab, setTab] = useState<Tab>('league');
  const [league, setLeague] = useState<LeagueResponse | null>(null);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Legend Baseball 시뮬레이터</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
              disabled={t.id !== 'league' && !league}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {tab === 'league' && <LeagueSetup league={league} onLeagueChange={setLeague} />}
        {tab === 'game' && league && <GameSimulator league={league} />}
        {tab === 'season' && league && <SeasonSimulator league={league} />}
      </main>
    </div>
  );
}

export default App;
