'use client';

import PerformPanel from './assistant/perform-panel';
import HistoryPanel from './history/panel';
import LearnPanel from './assistant/learn-panel';
import { usePathname } from 'next/navigation';
import { App } from 'antd';

const AppLayoutContent = ({ children }: { children: React.ReactNode }) => {
  
  const pathname = usePathname();
  const isLearn = pathname === '/learn';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 历史面板 */}
      <aside className="w-[16%] bg-white border-r-1 border-[#bae6fd]">
        <div className="p-4 h-full">
          <HistoryPanel />
        </div>
      </aside>
      {/* 中间主内容区*/}
      <main className="w-[64%] bg-white overflow-y-auto">
        <div className="p-4 h-full">{children}</div>
      </main>
      {/* 助手面板 */}
      <aside className="w-[20%] bg-white border-l-1 border-[#bae6fd] overflow-y-auto">
        <div className="py-4 px-3 h-full">
          {isLearn ? <LearnPanel/> : <PerformPanel/>}
        </div>
      </aside>
    </div>
  );
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <App>
      <AppLayoutContent>{children}</AppLayoutContent>
    </App>
  );
}
