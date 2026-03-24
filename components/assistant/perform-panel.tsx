'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useAssistantStore } from '@/stores/assistant';
import { v4 as uuidv4 } from 'uuid';
import { Mic, CircleStop } from 'lucide-react';
import React from 'react';
import MessageComponent from './message';
import useStream from '@/hooks/use-stream';
import type { Message } from '@/stores/assistant/type';
import { Drawer, Steps } from 'antd';
import {
  LoadingOutlined,
  CloseCircleOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { getSongList, stopPerform } from '@/shared/axios/api-learn';

interface AssistantPanelProps {
  onClose?: () => void;
  isCloseBtn?: boolean;
}

// 定义planning消息组类型
interface PlanningGroupMessage {
  type: string;
  id: string;
  content: string;
  planningMessages: Message[];
}

// 定义playing_summary消息组类型
interface PlayingSummaryGroupMessage {
  type: string;
  id: string;
  content: string;
  summaryMessages: Message[];
}

interface SongPromptMessage extends Message {
  type: 'song_prompt';
  content: string;
}

// 辅助函数：根据消息内容判断步骤状态
const getStepStatus = (
  message: PlanningGroupMessage,
  stepTitle: string,
  sessionMessages: Message[]
): 'wait' | 'process' | 'finish' | 'error' => {
  // 检查是否有planning消息
  if (!message.planningMessages || message.planningMessages.length === 0) {
    return 'wait';
  }

  // 获取最新的planning消息
  const latestPlanningMsg =
    message.planningMessages[message.planningMessages.length - 1];

  // 检查各个步骤的状态
  const allPlanningContents = message.planningMessages.map(
    (msg: Message) => msg.content
  );

  // 获取当前 planning-group 所属会话的 sessionId
  const currentSessionId = message.planningMessages[0].sessionId;

  // 在当前会话的消息中查找最后一条消息
  const sessionLastMessage = sessionMessages
    .filter((msg) => msg.sessionId === currentSessionId)
    .slice(-1)[0];

  // 如果是"开始演奏"步骤，并且当前会话的最后一条消息是结束消息，则标记为完成
  if (
    stepTitle === '开始演奏' &&
    sessionLastMessage &&
    sessionLastMessage.type === 'end'
  ) {
    return 'finish';
  }

  // 如果最新消息包含当前步骤标题，则为进行中
  if (
    typeof latestPlanningMsg.content === 'string' &&
    latestPlanningMsg.content.includes(stepTitle)
  ) {
    return 'process';
  }

  // 如果任何消息包含当前步骤标题，则为已完成
  if (
    allPlanningContents.some(
      (content) => typeof content === 'string' && content.includes(stepTitle)
    )
  ) {
    return 'finish';
  }

  // 默认为等待状态
  return 'wait';
};

const PerformPanel = ({}: AssistantPanelProps) => {
  const drawerContainerRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isModeDrawerOpen, setIsModeDrawerOpen] = useState(false);
  const [songList, setSongList] = useState<string[]>([]);
  const [isSongListLoading, setIsSongListLoading] = useState(false);
  const [songListError, setSongListError] = useState<string>('');
  const [selectedSong, setSelectedSong] = useState<string>('');
  const [isSongPerforming, setIsSongPerforming] = useState(false);
  const [songPromptMessages, setSongPromptMessages] = useState<
    SongPromptMessage[]
  >([]);
  // 用于跟踪每个planning组的折叠状态
  const [collapsedStates, setCollapsedStates] = useState<
    Record<string, boolean>
  >({});
  // 用于跟踪每个planning组的第二行描述是否显示
  const [secondLineVisible, setSecondLineVisible] = useState<
    Record<string, boolean>
  >({});

  // 从 assistant store 获取消息
  const allMessages = useAssistantStore((state) => state.messages);

  // 获取所有会话的消息列表（合并所有会话）
  const chatMessages = useMemo(() => {
    // 按会话合并消息：先显示点歌提示，再显示该会话流式返回
    const allChatMessages: Message[] = [];
    const sessionIdSet = new Set(allMessages.map((session) => session.sessionId));

    allMessages.forEach((session) => {
      songPromptMessages
        .filter((prompt) => prompt.sessionId === session.sessionId)
        .forEach((prompt) => {
          allChatMessages.push(prompt);
        });
      allChatMessages.push(...session.messages);
    });

    // 后端首条消息到达前，也要先展示该会话的点歌提示
    songPromptMessages.forEach((prompt) => {
      if (!sessionIdSet.has(prompt.sessionId)) {
        allChatMessages.push(prompt);
      }
    });

    return allChatMessages;
  }, [allMessages, songPromptMessages]);

  // 处理消息列表，合并连续的planning类型消息和playing_summary类型消息
  const processedMessages = useMemo(() => {
    const result: (
      | Message
      | PlanningGroupMessage
      | PlayingSummaryGroupMessage
    )[] = [];
    let planningGroup: Message[] = [];
    let summaryGroup: Message[] = [];

    chatMessages.forEach((message) => {
      // 跳过type为playing_log和end的消息
      if (
        message.type === 'playing_log' ||
        message.type === 'end' ||
        message.type === 'voice_end' ||
        message.type === 'user'
      ) {
        return; // 不处理这种类型的消息
      }

      if (message.type === 'planning') {
        // 收集planning类型消息
        planningGroup.push(message);
      } else if (message.type === 'playing_summary') {
        // 收集playing_summary类型消息
        summaryGroup.push(message);
      } else {
        // 如果有收集到的planning消息，先添加到结果中
        if (planningGroup.length > 0) {
          result.push({
            type: 'planning-group',
            id: `planning-group-${planningGroup[0].id}`,
            content: planningGroup
              .map((msg) =>
                typeof msg.content === 'string' ? msg.content : ''
              )
              .join('\n'),
            planningMessages: planningGroup,
          });
          planningGroup = [];
        }
        // 如果有收集到的summary消息，先添加到结果中
        if (summaryGroup.length > 0) {
          result.push({
            type: 'playing_summary-group',
            id: `playing_summary-group-${summaryGroup[0].id}`,
            content: summaryGroup
              .map((msg) =>
                typeof msg.content === 'string' ? msg.content : ''
              )
              .join('\n'),
            summaryMessages: summaryGroup,
          });
          summaryGroup = [];
        }
        // 添加非planning和playing_summary类型的消息
        result.push(message);
      }
    });

    // 处理最后可能剩余的planning消息
    if (planningGroup.length > 0) {
      result.push({
        type: 'planning-group',
        id: `planning-group-${planningGroup[0].id}`,
        content: planningGroup
          .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
          .join('\n'),
        planningMessages: planningGroup,
      });
    }

    // 处理最后可能剩余的summary消息
    if (summaryGroup.length > 0) {
      result.push({
        type: 'playing_summary-group',
        id: `playing_summary-group-${summaryGroup[0].id}`,
        content: summaryGroup
          .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
          .join('\n'),
        summaryMessages: summaryGroup,
      });
    }

    return result;
  }, [chatMessages]);

  const planningGroupIds = useMemo(
    () =>
      processedMessages
        .filter((message) => message.type === 'planning-group')
        .map((message) => message.id),
    [processedMessages]
  );

  // 监听解析硬件参数步骤状态，延迟显示第二行描述
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    processedMessages.forEach((message) => {
      if (message.type === 'planning-group') {
        const planningGroupMsg = message as PlanningGroupMessage;
        const stepStatus = getStepStatus(
          planningGroupMsg,
          '解析硬件参数',
          chatMessages
        );

        if (
          (stepStatus === 'process' || stepStatus === 'finish') &&
          !secondLineVisible[planningGroupMsg.id]
        ) {
          // 延迟0.5秒后显示第二行
          const timer = setTimeout(() => {
            setSecondLineVisible((prev) => ({
              ...prev,
              [planningGroupMsg.id]: true,
            }));
          }, 500);

          timers.push(timer);
        }
      }
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [processedMessages, chatMessages, secondLineVisible]);

  // 初始化会话 - 使用标准 UUID 格式
  useEffect(() => {
    if (!currentSessionId) {
      const sessionId = uuidv4();
      setCurrentSessionId(sessionId);
    }
  }, [currentSessionId]);

  // 自动滚动到底部
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatMessages, isLoading, currentSessionId, allMessages]);

  // 使用自定义hook处理SSE流
  const {
    sendStreamRequest,
    isStreamEnded,
    setIsStreamEnded,
    hasReceivedData,
    isVoiceEnded,
    setIsVoiceEnded,
  } = useStream(currentSessionId);
  // 监听流结束事件，更新loading状态
  useEffect(() => {
    let isMounted = true;
    if (isStreamEnded && isMounted) {
      // 使用setTimeout避免在effect中直接调用setState
      setTimeout(() => {
        if (isMounted) {
          setIsLoading(false);
          setIsSongPerforming(false);
          setIsStreamEnded(false); // 重置流结束状态
        }
      }, 0);
    }
    return () => {
      isMounted = false;
    };
  }, [isStreamEnded, setIsStreamEnded]);

  // 处理消息发送
  const handleSend = (songName?: string, sessionIdOverride?: string) => {
    if (isLoading) return;
    setIsLoading(true);
    if (songName) {
      sendStreamRequest({ song_name: songName }, sessionIdOverride);
      return;
    }
    sendStreamRequest(undefined, sessionIdOverride);
  };

  // 判断麦克风按钮是否应该禁用
  const isMicDisabled = useMemo(() => {
    // 获取 allMessages 的最后一条会话数据
    if (allMessages.length === 0) return false;

    const lastSession = allMessages[allMessages.length - 1];
    const lastSessionMessages = lastSession.messages;

    // 检查是否有 voice_end 和 end 类型的消息
    const hasVoiceEnd = lastSessionMessages.some(
      (msg) => msg.type === 'voice_end'
    );
    const hasEnd = lastSessionMessages.some((msg) => msg.type === 'end');
    // const hasPlanning = lastSessionMessages.some((msg) => msg.type === 'planning');
    /* if (hasPlanning) {
      return true;
    } */
    // 点歌演奏中，显示停止按钮
    if (isSongPerforming) {
      return true;
    }

    // 当有 voice_end 但没有 end 时，禁用按钮
    if (hasVoiceEnd && !hasEnd) {
      return true;
    }

    return false;
  }, [allMessages, isSongPerforming]);

  // 处理麦克风按钮点击
  const handleMicClick = (songName?: string) => {
    // 如果按钮被禁用，不执行任何操作
    if (isMicDisabled) return;

    // 点歌前先折叠当前已展示的思考过程
    if (songName) {
      setCollapsedStates((prev) => {
        const next: Record<string, boolean> = { ...prev };
        planningGroupIds.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
    }

    // 如果从非激活状态变为激活状态，则发送请求
    // 生成新的 sessionId
    const newSessionId = uuidv4();
    setCurrentSessionId(newSessionId);

    if (songName) {
      setSongPromptMessages((prev) => [
        ...prev,
        {
          type: 'song_prompt',
          id: `song-prompt-${uuidv4()}`,
          sessionId: newSessionId,
          content: `请弹奏 ${songName}`,
          timestamp: new Date().toISOString(),
          status: 1,
        },
      ]);
    }

    // 清空上次的演奏日志
    const clearPlayingLogs = useAssistantStore.getState().clearPlayingLogs;
    clearPlayingLogs();
    // 点歌不走语音采集态，直接显示可停止状态
    if (songName) {
      setIsSongPerforming(true);
      setIsVoiceEnded(true);
    } else {
      // 语音流程保持原行为
      setIsVoiceEnded(false);
    }

    // 直接调用handleSend，显式使用本次新会话 ID，避免落到旧会话
    handleSend(songName, newSessionId);
  };

  // 处理停止演奏
  const handleStopPerform = async () => {
    try {
      await stopPerform();
    } finally {
      setIsSongPerforming(false);
      setIsVoiceEnded(true);
      // 停止演奏时不清空 messageList（store 中的 messages）
      // setIsLoading(false);
      // setIsVoiceEnded(true);
      // setIsStreamEnded(true);
      // // 仅重置本地 UI 状态（不影响消息内容）
      // setCollapsedStates({});
      // setSecondLineVisible({});
    }
  };

  // 获取歌曲清单并打开抽屉
  const handleGetSongList = async () => {
    setIsModeDrawerOpen(true);
    setIsSongListLoading(true);
    setSongListError('');
    setSelectedSong('');

    try {
      const res = await getSongList();
      const maybeList = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.songs)
            ? res.songs
            : [];

      const normalizedList = maybeList
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'name' in item) {
            return String((item as { name: unknown }).name ?? '');
          }
          return '';
        })
        .filter((name) => name.trim().length > 0);

      setSongList(normalizedList);
    } catch {
      setSongList([]);
      setSongListError('获取歌曲失败，请稍后重试');
    } finally {
      setIsSongListLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col w-full text-black">
      {/* 头部 */}
      <div className="flex flex-col items-center justify-center pb-4 space-y-2 border-b border-dashed border-gray-500">
        <h3 className="text-md font-semibold">Powered by Termitech</h3>
        <button
          type="button"
          className="text-sm text-gray-700 cursor-pointer hover:text-gray-900 transition-colors"
          onClick={() => setIsModeDrawerOpen(true)}
        >
          演奏模式
        </button>
        <div className="flex items-center gap-3">
          {/* 语音输入按钮 */}
          {/* 语音波浪动画按钮 */}
          {!isVoiceEnded ? (
            <button className="w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer bg-[#3C89E8] hover:bg-[#3C89E8]/90 text-white">
              <div className="relative">
                {/* 语音波浪动画 */}
                <div className="flex items-center justify-center gap-0.5">
                  <div className="w-0.5 h-3 bg-white animate-sound-wave-1"></div>
                  <div className="w-0.5 h-4 bg-white animate-sound-wave-2"></div>
                  <div className="w-0.5 h-5 bg-white animate-sound-wave-3"></div>
                  <div className="w-0.5 h-4 bg-white animate-sound-wave-2"></div>
                  <div className="w-0.5 h-3 bg-white animate-sound-wave-1"></div>
                </div>
              </div>
            </button>
          ) : (
            <>
              {!isMicDisabled && (
                <button
                  onClick={handleMicClick}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer bg-[#3C89E8] hover:bg-[#3C89E8]/90 text-white"
                  aria-label="语音输入"
                >
                  <Mic size={18} />
                </button>
              )}
              {isMicDisabled && (
                <button
                  onClick={handleStopPerform}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer bg-red-500 hover:bg-red-500/90 text-white"
                  aria-label="停止演奏"
                >
                  <CircleStop size={18} />
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="text-sm text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
            onClick={handleGetSongList}
          >
            获取歌曲
          </button>
          {/* <CircleStop className="cursor-pointer" onClick={handleStopPerform} /> */}
        </div>
      </div>

      {/* 消息列表 */}
      <div
        ref={drawerContainerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
      >
        <div ref={messageListRef} className="h-full overflow-y-auto px-2 py-3">
          <div className={chatMessages.length === 0 ? 'h-full' : 'space-y-4'}>
          {chatMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-700">
              <p className="text-base">你好！</p>
              <p className="mt-2 text-base">请说出你想听的曲目名称</p>
            </div>
          ) : (
            processedMessages.map((message) => {
              if (message.type === 'song_prompt') {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-blue-500 text-white">
                      <div className="text-sm whitespace-pre-wrap wrap-break-word">
                        {typeof message.content === 'string' ? message.content : ''}
                      </div>
                    </div>
                  </div>
                );
              } else if (message.type === 'playing_summary-group') {
                // 渲染合并后的playing_summary消息组
                const summaryGroupMsg = message as PlayingSummaryGroupMessage;
                return (
                  <div key={summaryGroupMsg.id} className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-blue-50 text-gray-900 border border-blue-200">
                      <div className="text-sm whitespace-pre-wrap wrap-break-word">
                        {summaryGroupMsg.content}
                      </div>
                    </div>
                  </div>
                );
              } else if (message.type === 'planning-group') {
                // 渲染合并后的planning消息组
                // 确保消息是 PlanningGroupMessage 类型
                const planningGroupMsg = message as PlanningGroupMessage;
                return (
                  <div key={planningGroupMsg.id} className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-yellow-50 text-gray-900 border border-yellow-200">
                      <div
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          // 使用React状态来管理折叠状态
                          setCollapsedStates((prev) => ({
                            ...prev,
                            [planningGroupMsg.id]: !prev[planningGroupMsg.id],
                          }));
                        }}
                      >
                        <svg
                          className="w-4 h-4 text-yellow-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        <span className="text-sm font-medium text-yellow-700">
                          思考过程 ：
                        </span>
                        {collapsedStates[planningGroupMsg.id] ? (
                          <svg
                            className="w-4 h-4 text-yellow-700 ml-auto"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M9 5l7 7-7 7"
                            ></path>
                          </svg>
                        ) : (
                          <svg
                            className="w-4 h-4 text-yellow-700 ml-auto"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M19 9l-7 7-7-7"
                            ></path>
                          </svg>
                        )}
                      </div>
                      <div
                        className="text-sm whitespace-pre-wrap wrap-break-word mt-3"
                        style={{
                          display: collapsedStates[planningGroupMsg.id]
                            ? 'none'
                            : 'block',
                        }}
                      >
                        <Steps
                          direction="vertical"
                          size="small"
                          className="custom-small-steps"
                          items={(() => {
                            // 当前 planning 组所属会话中是否出现过 error
                            const currentSessionIdForGroup =
                              planningGroupMsg.planningMessages[0]?.sessionId;
                            const hasErrorInSession = chatMessages.some(
                              (msg) =>
                                msg.sessionId === currentSessionIdForGroup &&
                                msg.type === 'error'
                            );

                            const items = [
                              {
                                title: '搜索歌曲',
                                description: '',
                                status: getStepStatus(
                                  planningGroupMsg,
                                  '搜索歌曲',
                                  chatMessages
                                ),
                                icon:
                                  getStepStatus(
                                    planningGroupMsg,
                                    '搜索歌曲',
                                    chatMessages
                                  ) === 'process' ? (
                                    <LoadingOutlined
                                      style={{ fontSize: '16px' }}
                                    />
                                  ) : null,
                              },
                              {
                                title: '分析歌曲',
                                description: '',
                                status: getStepStatus(
                                  planningGroupMsg,
                                  '分析歌曲',
                                  chatMessages
                                ),
                                icon:
                                  getStepStatus(
                                    planningGroupMsg,
                                    '分析歌曲',
                                    chatMessages
                                  ) === 'process' ? (
                                    <LoadingOutlined
                                      style={{ fontSize: '16px' }}
                                    />
                                  ) : null,
                              },
                              {
                                title: '解析硬件参数',
                                description:
                                  getStepStatus(
                                    planningGroupMsg,
                                    '解析硬件参数',
                                    chatMessages
                                  ) === 'process' ||
                                  getStepStatus(
                                    planningGroupMsg,
                                    '解析硬件参数',
                                    chatMessages
                                  ) === 'finish' ? (
                                    <div>
                                      <div>
                                        左右臂：6自由度机械臂UR3E、左右手：21自由度腱绳灵巧手TermiHand。
                                      </div>
                                      {secondLineVisible[planningGroupMsg.id] && (
                                        <div>
                                          经分析，机械臂存在移动时延0.2s以上，灵巧手小拇指可拓展按键一个。
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    ''
                                  ),
                                status: getStepStatus(
                                  planningGroupMsg,
                                  '解析硬件参数',
                                  chatMessages
                                ),
                                icon:
                                  getStepStatus(
                                    planningGroupMsg,
                                    '解析硬件参数',
                                    chatMessages
                                  ) === 'process' ? (
                                    <LoadingOutlined
                                      style={{ fontSize: '16px' }}
                                    />
                                  ) : null,
                              },
                              {
                                title: '大模型基于硬件参数生成指法',
                                description: '',
                                status: getStepStatus(
                                  planningGroupMsg,
                                  '大模型基于硬件参数生成指法',
                                  chatMessages
                                ),
                                icon:
                                  getStepStatus(
                                    planningGroupMsg,
                                    '大模型基于硬件参数生成指法',
                                    chatMessages
                                  ) === 'process' ? (
                                    <LoadingOutlined
                                      style={{ fontSize: '16px' }}
                                    />
                                  ) : null,
                              },
                              {
                                title: '开始演奏',
                                description: '',
                                status: getStepStatus(
                                  planningGroupMsg,
                                  '开始演奏',
                                  chatMessages
                                ),
                                icon:
                                  getStepStatus(
                                    planningGroupMsg,
                                    '开始演奏',
                                    chatMessages
                                  ) === 'process' ? (
                                    <LoadingOutlined
                                      style={{ fontSize: '16px' }}
                                    />
                                  ) : null,
                              },
                            ];

                            // 没有 error：保持原来的 5 步
                            if (!hasErrorInSession) return items;

                            // 有 error：只展示已经开始的步骤（第一步始终展示），并把当前步骤标记为错误
                            let visibleItems = items.filter((item, index) =>
                              index === 0 ? true : item.status !== 'wait'
                            );

                            // 找到最后一个处于进行中/已开始的步骤，替换为 error 图标
                            let lastActiveIndex = -1;
                            visibleItems.forEach((item, index) => {
                              if (
                                item.status === 'process' ||
                                item.status === 'finish'
                              ) {
                                lastActiveIndex = index;
                              }
                            });

                            if (lastActiveIndex >= 0) {
                              visibleItems = visibleItems.map((item, index) =>
                                index === lastActiveIndex
                                  ? {
                                      ...item,
                                      status: 'error',
                                      icon: (
                                        <CloseCircleOutlined
                                          style={{ fontSize: '16px' }}
                                        />
                                      ),
                                    }
                                  : item
                              );
                            }

                            return visibleItems;
                          })()}
                        />
                      </div>
                    </div>
                  </div>
                );
              } else {
                // 确保 content 是字符串类型，并渲染普通消息
                const messageWithStringContent = {
                  ...message,
                  content:
                    typeof message.content === 'string'
                      ? message.content
                      : JSON.stringify(message.content),
                };
                return (
                  <MessageComponent
                    key={message.id}
                    message={messageWithStringContent}
                  />
                );
              }
            })
          )}

          {/* 加载状态 - 仅在收到数据后显示 */}
          {/* {isLoading &&
            hasReceivedData &&
            chatMessages[chatMessages.length - 1]?.type !== 'planning' && ( */}
          {hasReceivedData && (
            <div className="flex justify-start">
              <div className="flex items-center text-sm text-gray-600">
                <span className="flex items-center">
                  <span className="typing-dots ml-1">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </span>
                </span>
              </div>
            </div>
          )}
          </div>
        </div>
        {isModeDrawerOpen && (
          <Drawer
            title={<div className="h-full flex items-center">歌曲清单</div>}
            placement="right"
            width="100%"
            open={isModeDrawerOpen}
            onClose={() => setIsModeDrawerOpen(false)}
            closable={false}
            extra={
              <button
                type="button"
                aria-label="关闭歌曲清单"
                className="text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                onClick={() => setIsModeDrawerOpen(false)}
              >
                <CloseOutlined />
              </button>
            }
            headerStyle={{ height: 56, padding: '0 24px' }}
            getContainer={() => drawerContainerRef.current || document.body}
            rootStyle={{ position: 'absolute', inset: 0, height: '100%' }}
          >
            <div className="space-y-3">
              {isSongListLoading ? (
                <div className="text-sm text-gray-600">加载中...</div>
              ) : songListError ? (
                <div className="text-sm text-red-500">{songListError}</div>
              ) : songList.length === 0 ? (
                <div className="text-sm text-gray-600">暂无歌曲</div>
              ) : (
                <div className="space-y-1.5">
                  {songList.map((song, index) => (
                    <button
                      key={`${song}-${index}`}
                      type="button"
                      onClick={() => {
                        setSelectedSong(song);
                        setIsModeDrawerOpen(false);
                        handleMicClick(song);
                      }}
                      className={`w-full text-left px-2 py-1 rounded transition-colors text-base cursor-pointer ${
                        selectedSong === song
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {index + 1}、 {song}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Drawer>
        )}
      </div>
    </div>
  );
};

export default PerformPanel;
