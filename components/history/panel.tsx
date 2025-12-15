import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/select';
// 获取路由
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { Loader } from 'lucide-react';
import { getHistoryList } from '@/shared/axios/api-learn';

// 定义演奏历史记录类型
interface PerformHistoryItem {
  id: string;
  pieceId: string;
  pieceName: string;
  composer: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  status: 'ended' | string;
  success: boolean;
}

export default function HistoryPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentMode(pathname === '/learn' ? 'learn' : 'perform');
  }, [pathname]);
  const [performHistory, setPerformHistory] = useState<PerformHistoryItem[]>(
    []
  );
  useEffect(() => {
    getHistoryList()
      .then((data) => {
        setPerformHistory(data);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);
  return (
    <div className="flex h-full flex-col justify-between w-full text-black">
      <div className="h-[calc(100vh-36px)]">
        <div className="flex justify-between items-center mb-4">
          <h1>当前已演奏曲目:</h1>
        </div>
        {isLoading ? (
          <div className="mt-8 text-center">
            <Loader className="inline-block h-6 w-6 animate-spin text-gray-500" />
            <p className="mt-2 text-gray-500">加载中...</p>
          </div>
        ) : performHistory.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm h-[calc(100vh-130px)] overflow-y-auto pr-2">
            {performHistory.map((item, index) => (
              <li key={item.id} className="flex gap-2">
                <div>{index + 1}.</div>
                <div>
                  <div>
                    <span className="mr-3">{item.pieceName}</span>
                    <span>{new Date(item.startedAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="mr-3">
                      {item.status === 'ended' ? '已完成' : '进行中'}
                    </span>
                    <span>{item.success ? '成功' : '失败'}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 text-center text-gray-500">
            <p>暂无演奏记录</p>
          </div>
        )}
      </div>
      <div>
        <Select
          value={currentMode}
          onChange={(e) => {
            setCurrentMode(e.target.value);
            // 根据选择的模式跳转到对应页面
            if (e.target.value === 'perform') {
              router.push('/perform');
            } else if (e.target.value === 'learn') {
              router.push('/learn');
            }
          }}
          options={[
            { value: 'perform', label: '演奏模式' },
            { value: 'learn', label: '学习模式' },
          ]}
          className="w-[180px]"
          placeholder="选择模式"
        />
      </div>
    </div>
  );
}
