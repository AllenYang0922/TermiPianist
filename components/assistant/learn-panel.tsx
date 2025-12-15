'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { emit } from '@/hooks/user-emitter';
import { useAssistantStore } from '@/stores/assistant';
import { toast } from 'sonner';
import {
  startLearning as startLearningApi,
  endLearning as endLearningApi,
} from '@/shared/axios/api-learn';

interface AssistantPanelProps {
  onClose?: () => void;
  isCloseBtn?: boolean;
}

const LearnPanel = ({}: AssistantPanelProps) => {
  const messageListRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const [disabled, setDisabled] = useState(false);
  const [disabled2, setDisabled2] = useState(false);
  const startLearning = async () => {
    try {
      const data = await startLearningApi();
      setDisabled2(true);
      emit('change-stream', { url: data.rtmp_url });
      emit('start-play');

      return data;
    } catch (error) {
      throw error;
    }
  };

  const endLearning = async () => {
    try {
      const data = await endLearningApi();
      if (data && data.file_paths) {
        // 使用状态管理库存储数据
        useAssistantStore.getState().setLearningData({
          filePaths: data.file_paths,
          mode: 'learning',
        });

        // 倒计时 toast
        let countdown = 2;
        const toastId = toast.success(
          `学习完成！${countdown}秒后即将跳转演奏页面进行弹奏`
        );

        const countdownInterval = setInterval(() => {
          countdown--;
          if (countdown > 0) {
            toast.success(
              `学习完成！${countdown}秒后即将跳转演奏页面进行弹奏`,
              {
                id: toastId,
              }
            );
          } else {
            clearInterval(countdownInterval);
          }
        }, 1000);

        setTimeout(() => {
          toast.dismiss(toastId); // 在跳转前关闭 toast
          // 清空所有消息和日志
          useAssistantStore.getState().clearMessages();
          useAssistantStore.getState().clearPlayingLogs();
          useAssistantStore.getState().clearKeyPositionMessages();
          router.push('/perform');
        }, 2000);
      }

      return data;
    } catch (error) {
      throw error;
    }
  };

  const handleStartLearning = () => {
    setDisabled(true);
    startLearning();
  };

  const handleEndLearning = () => {
    setDisabled2(false);
    // 立即通知页面显示加载遮罩，避免看到视频黑屏
    emit('end-learning');
    endLearning();
  };

  return (
    <div className="flex h-full flex-col w-full text-black">
      {/* 头部 */}
      <div className="flex flex-col items-center justify-center pb-4 space-y-2 border-b border-dashed border-gray-500">
        <h3 className="text-md font-semibold">Powered by Termitech</h3>
        <div className="text-sm text-gray-700">学习模式</div>
      </div>

      <div
        ref={messageListRef}
        className="flex-1 overflow-y-auto py-4 space-y-4"
      >
        <div className="flex flex-col items-center justify-center h-full text-center text-gray-700">
          <p className="text-base">请演奏一段30s以内的曲目，供机器人学习</p>
          <div className="flex flex-col items-center mt-6 space-y-4">
            <button
              className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-700"
              onClick={handleStartLearning}
              disabled={disabled}
            >
              开始演奏
            </button>
            <button
              className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-700"
              onClick={handleEndLearning}
              disabled={!disabled2} // 只有在开始演奏按钮被禁用时（即已开始演奏）才能点击
            >
              结束演奏
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearnPanel;
