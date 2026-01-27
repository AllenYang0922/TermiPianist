'use client';

import { useState } from 'react';
import { Input, App } from 'antd';
import { useAssistantStore } from '@/stores/assistant';
import { useSmartScroll } from '@/hooks/useSmartScroll';
import { adjustPerformanceSpeed } from '@/shared/axios/api-learn';

export default function PerformLog() {
  // 使用 antd App 组件提供的全局 message
  const { message } = App.useApp();
  // 直接从 assistant store 获取演奏日志消息
  const playingLogs = useAssistantStore((state) => state.performLogMessages);
  // 使用函数初始化 state，确保只在客户端访问 localStorage
   const [speedValue, setSpeedValue] = useState(() => {
     if (typeof window !== 'undefined') {
       return localStorage.getItem('speed') || '85';
     }
     return '0';
   });

  // 使用智能滚动 hook，传入日志数组作为依赖
  const { containerRef, handleScroll } = useSmartScroll([playingLogs], {
    autoScrollResumeTime: 3000, // 3秒后恢复自动滚动
    scrollThreshold: 50, // 50像素的滚动阈值
  });

  // 处理应用按钮点击
  const handleApply = async () => {
    const trimmedValue = speedValue.trim();
    if (!trimmedValue) {
      return;
    }

    // 验证是否为正整数
    const numValue = Number(trimmedValue);
    if (isNaN(numValue) || !/^[1-9]\d*$/.test(trimmedValue)) {
      message.error('请输入有效的正整数');
      return;
    }

    await adjustPerformanceSpeed(numValue);
    localStorage.setItem('speed', numValue.toString());
  };

  return (
    <div className="h-[50vh] flex flex-col gap-3 border-1 border-[#41719C] rounded-md p-4">
      <div className="font-medium text-lg">演奏日志 ：</div>

      <div className="flex items-center gap-2">
        <div>调速:</div>
        <Input
          value={speedValue}
          onChange={(e) => setSpeedValue(e.target.value)}
          placeholder="请输入速度值"
          style={{ width: '200px' }}
        />
        <button
          onClick={handleApply}
          disabled={!speedValue.trim()}
          className="px-4 py-1.5 text-sm bg-[#3C89E8] text-white rounded-md hover:bg-[#3C89E8]/90 cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-700 transition-colors"
        >
          应用
        </button>
      </div>

      {playingLogs.length === 0 ? (
        <p className="text-gray-400">暂无演奏日志</p>
      ) : (
        <div
          ref={containerRef}
          className="space-y-1 overflow-y-auto flex-1"
          onScroll={handleScroll}
        >
          {playingLogs.map((log, index) => (
            <div key={`${log.id}-${index}`} className="space-y-1">
              <p className="text-sm whitespace-pre-wrap">
                {typeof log.content === 'string'
                  ? log.content
                  : JSON.stringify(log.content)}
              </p>
              {/* <p className="text-xs text-gray-500 mt-1">
                {new Date(log.timestamp).toLocaleString()}
              </p> */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
