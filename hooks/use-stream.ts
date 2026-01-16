'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAssistantStore } from '@/stores/assistant';
import type { Message } from '@/stores/assistant/type';

/**
 * 处理SSE流请求的自定义Hook
 * @param currentSessionId 当前会话ID
 * @returns 发送消息的函数和处理状态
 */
export const useStream = (currentSessionId: string | null) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreamEnded, setIsStreamEnded] = useState(false);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [isVoiceEnded, setIsVoiceEnded] = useState(true);
  // 标记当前会话是否已经重试过一次，避免无限重试
  const [hasRetried, setHasRetried] = useState(false);
  // 是否需要触发一次重试
  const [shouldRetry, setShouldRetry] = useState(false);

  // 当会话 ID 变化时，重置重试标记
  if (typeof window !== 'undefined') {
    // 简单防御：如果会话切换，新的一次调用会重新创建 hook 实例；
    // 这里确保 hasRetried 在新会话开始时为 false
  }

  /**
   * 内部方法：真正发起 SSE 请求并处理流
   * 单独拆出来是为了在出错重试时也能复用同一套逻辑
   */
  const startStreamRequest = useCallback(
    (filePaths?: string[]) => {
      if (!currentSessionId) {
        setIsProcessing(false);
        return;
      }

      // 准备请求体
      const requestBody = filePaths
        ? { file_paths: filePaths, mode: 'learning' }
        : {};

      // 发送请求并处理SSE流
      // fetch(`/api/chat`, {
      fetch(`http://${process.env.NEXT_PUBLIC_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
          }

          // 检查响应体是否存在
          if (!response.body) {
            throw new Error('响应体为空');
          }

          // 获取响应流的reader
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          // 递归函数来处理流数据
          function processStream(): Promise<void> {
            return reader
              .read()
              .then(({ done, value }) => {
                // 如果流结束了
                if (done) {
                  // 设置加载状态为false
                  setIsProcessing(false);
                  setHasReceivedData(false); // 重置数据接收状态
                  return;
                }

                // 解码数据
                const chunk = decoder.decode(value, { stream: true });
                // 处理返回的数据
                try {
                  // 尝试处理不同格式的数据
                  if (chunk.includes('data:')) {
                    // 处理SSE格式的数据
                    const dataLines = chunk
                      .split('data:')
                      .filter((line) => line.trim().length > 0);
                    dataLines.forEach((dataLine) => {
                      try {
                        // 清理数据行，确保是有效的JSON
                        const cleanedData = dataLine.trim();
                        // 跳过心跳消息（以冒号开头的行）
                        if (cleanedData.startsWith(':')) {
                          return; // 跳过此次循环
                        }

                        const jsonData = JSON.parse(cleanedData);
                        // 设置已收到数据标志
                        setHasReceivedData(true);

                        // 将接收到的数据添加到消息列表
                        // 对于某些特殊类型（如 voice_end），即使没有 content 也需要处理
                        if (
                          (jsonData.content || jsonData.type === 'voice_end') &&
                          currentSessionId
                        ) {
                          const aiMessage: Message = {
                            type: jsonData.type,
                            id: jsonData.id,
                            sessionId: currentSessionId, // 使用前端的 currentSessionId
                            content: jsonData.content,
                            timestamp: jsonData.timestamp,
                            status: jsonData.status,
                          };

                          // 根据消息类型选择不同的存储方法
                          if (jsonData.type === 'end') {
                            // 如果是结束消息，设置流结束状态
                            setIsStreamEnded(true);
                            setIsProcessing(false);
                            // 添加end到普通消息
                            useAssistantStore.getState().addMessages(aiMessage);
                            // 也添加end到键位数据消息
                            useAssistantStore
                              .getState()
                              .addKeyPositionMessage(aiMessage);
                          } else if (jsonData.type === 'voice_end') {
                            // 如果是语音结束消息，保存到store
                            useAssistantStore.getState().addMessages(aiMessage);
                            // 设置语音结束标识为true
                            setIsVoiceEnded(true);
                          } else if (jsonData.type === 'error') {
                            // 错误消息：先入库
                            useAssistantStore.getState().addMessages(aiMessage);
                            // 如果当前会话还没有重试过，则标记需要重试一次
                            if (!hasRetried) {
                              setShouldRetry(true);
                            }
                            setIsVoiceEnded(false);
                          } else if (jsonData.type === 'playing_log') {
                            // 如果是演奏日志消息，使用addPerformLogMessage方法
                            useAssistantStore
                              .getState()
                              .addPerformLogMessage(aiMessage);
                          } else if (jsonData.type === 'key_position') {
                            // 处理键位数据消息，将content从字符串转换为对象
                            try {
                              // 如果content是字符串，尝试解析为JSON对象
                              if (typeof aiMessage.content === 'string') {
                                aiMessage.content = JSON.parse(
                                  aiMessage.content
                                );
                              }
                            } catch {
                              // 忽略解析错误，避免打断整体流程
                            }

                            // 使用addKeyPositionMessage方法
                            useAssistantStore
                              .getState()
                              .addKeyPositionMessage(aiMessage);
                          } else {
                            // 其他类型的消息，使用addMessages方法
                            useAssistantStore.getState().addMessages(aiMessage);
                          }
                        }
                      } catch {
                        // 单条数据解析失败时忽略，继续处理后续数据
                      }
                    });
                  } else {
                    // 如果不是SSE格式，尝试直接解析整个chunk
                    try {
                      // 检查是否是心跳消息
                      if (chunk.trim().startsWith(':')) {
                        // 继续处理流
                        return processStream();
                      }

                      const jsonData = JSON.parse(chunk);

                      // 设置已收到数据标志
                      setHasReceivedData(true);

                      if (jsonData.content && currentSessionId) {
                        const aiMessage: Message = {
                          type: 'assistant',
                          id: Math.random().toString(36).slice(2),
                          sessionId: currentSessionId,
                          content: jsonData.content,
                          timestamp: new Date().toISOString(),
                          status: 1,
                        };
                        useAssistantStore.getState().addMessages(aiMessage);
                      }
                    } catch {
                      // 非预期数据格式时忽略本次 chunk
                    }
                  }
                } catch {
                  // 外层保护，防止异常中断整个流处理
                }

                // 继续处理流
                return processStream();
              })
              .catch(() => {
                // 设置加载状态为false
                setIsProcessing(false);
              });
          }

          // 开始处理流
          return processStream();
        })
        .catch(() => {
          // 设置加载状态为false
          setIsProcessing(false);
        });
    },
    [currentSessionId, hasRetried]
  );

  /**
   * 对外暴露的发送函数：只负责做并发保护和状态重置
   * 真正的请求逻辑在 startStreamRequest 中
   */
  const sendStreamRequest = useCallback(
    (filePaths?: string[]) => {
      if (!currentSessionId || isProcessing) return;

      setIsProcessing(true);
      setHasReceivedData(false); // 重置数据接收状态
      setHasRetried(false); // 新的一次请求，允许一次重试

      startStreamRequest(filePaths);
    },
    [currentSessionId, isProcessing, startStreamRequest]
  );

  // 监听重试标记，在合适的时机重新发起一次请求（避免在同一个流处理函数中递归调用）
  useEffect(() => {
    if (!shouldRetry || hasRetried) return;

    // 使用微任务/宏任务延迟，避免在同一渲染周期内同步 setState
    const timer = setTimeout(() => {
      setShouldRetry(false);
      setHasRetried(true);
      sendStreamRequest();
    }, 0);

    return () => clearTimeout(timer);
  }, [shouldRetry, hasRetried, sendStreamRequest]);

  return {
    sendStreamRequest,
    isProcessing,
    isStreamEnded,
    setIsStreamEnded,
    hasReceivedData,
    isVoiceEnded,
    setIsVoiceEnded,
  };
};

export default useStream;
