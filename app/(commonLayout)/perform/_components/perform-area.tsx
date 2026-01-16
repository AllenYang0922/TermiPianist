'use client';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Image from 'next/image';
import { generatePianoKeys, getBlackKeyPosition } from './piano';
import { useAssistantStore } from '@/stores/assistant';
import { KeyPositionContent } from '@/stores/assistant/type';

// 定义状态类型
type ActiveKeysState = Map<number, { keyId: string; hand: string }>;

// 定义动作类型
type ActiveKeysAction =
  | { type: 'NOTE_ON'; midiId: number; keyId: string; hand: string }
  | { type: 'NOTE_OFF'; midiId: number }
  | { type: 'CLEAR_ALL' };

// 定义reducer
function activeKeysReducer(
  state: ActiveKeysState,
  action: ActiveKeysAction
): ActiveKeysState {
  const newState = new Map(state);

  switch (action.type) {
    case 'NOTE_ON':
      newState.set(action.midiId, { keyId: action.keyId, hand: action.hand });
      return newState;
    case 'NOTE_OFF':
      newState.delete(action.midiId);
      return newState;
    case 'CLEAR_ALL':
      return new Map();
    default:
      return state;
  }
}

export default function PerformArea() {
  // 从piano.tsx导入钢琴键盘数据，使用 useMemo 确保引用稳定，避免导致 useEffect 死循环
  const { whiteKeys, blackKeys } = useMemo(() => generatePianoKeys(), []);

  // 辅助函数：根据 midiNumber 计算手掌位置的百分比
  const calculateHandPosition = (midiNumber: number): number => {
    // 找到对应的白键或黑键
    const whiteKey = whiteKeys.find((key) => key.midiNumber === midiNumber);
    const blackKey = blackKeys.find((key) => key.midiNumber === midiNumber);

    if (whiteKey) {
      // 白键：计算在所有白键中的索引，转换为百分比
      const index = whiteKeys.findIndex((key) => key.midiNumber === midiNumber);
      const whiteKeyWidth = 100 / whiteKeys.length;
      return whiteKeyWidth * index + whiteKeyWidth * 0.2; // 偏移一点以居中
    } else if (blackKey) {
      // 黑键：使用黑键的定位逻辑
      const whiteKeyIndex = getBlackKeyPosition(blackKey, whiteKeys);
      const whiteKeyWidth = 100 / whiteKeys.length;
      return whiteKeyIndex * whiteKeyWidth + whiteKeyWidth * 0.65;
    }
    return 0;
  };

  // 使用useReducer存储激活的键，键为midi_id，值为{keyId, hand}
  const [activeKeys, dispatchActiveKeys] = useReducer(
    activeKeysReducer,
    new Map<number, { keyId: string; hand: string }>()
  );
  const keyPositionMessages = useAssistantStore(
    (state) => state.keyPositionMessages
  );

  // 追踪左右手的当前位置（midiNumber）
  const [leftHandPosition, setLeftHandPosition] = useState<number>(60); // 默认位置
  const [rightHandPosition, setRightHandPosition] = useState<number>(69); // 默认位置

  // 使用ref跟踪已处理的消息ID集合，避免重复处理
  const processedMessageIdsRef = useRef<Set<string>>(new Set());

  // 处理所有新的键位消息
  useEffect(() => {
    // 如果没有消息，直接返回
    if (keyPositionMessages.length === 0) return;

    // 遍历所有消息，处理未处理过的消息
    keyPositionMessages.forEach((message) => {
      // 检查是否已处理过该消息
      if (processedMessageIdsRef.current.has(message.id)) {
        return; // 已处理过，跳过
      }

      // 添加到已处理集合
      processedMessageIdsRef.current.add(message.id);

      // 检查是否为结束消息，如果是则清除所有高亮并重置手的位置
      if (message.type === 'end') {
        dispatchActiveKeys({ type: 'CLEAR_ALL' });
        // 重置左右手位置到默认值
        setLeftHandPosition(60);
        setRightHandPosition(69);
        // 清空已处理消息ID集合，为下次会话做准备
        processedMessageIdsRef.current.clear();
        return;
      }

      // 处理消息内容
      const content = message.content as KeyPositionContent;

      // 确保content是对象类型
      if (typeof content !== 'object' || !content) return;

      // 根据midi_id查找对应的键
      const midiId = content.midi_id;
      const action = content.action;

      const hand = content.hand; // 'left' 或 'right'

      // 查找对应的键
      const whiteKey = whiteKeys.find((key) => key.midiNumber === midiId);
      const blackKey = blackKeys.find((key) => key.midiNumber === midiId);
      const keyId = whiteKey?.id || blackKey?.id;

      if (keyId) {
        // 使用reducer处理状态更新
        if (action === 'note_on') {
          dispatchActiveKeys({
            type: 'NOTE_ON',
            midiId,
            keyId,
            hand,
          });

          // 更新对应手的位置
          if (hand === 'left') {
            setLeftHandPosition(midiId);
          } else if (hand === 'right') {
            setRightHandPosition(midiId);
          }
        } else if (action === 'note_off') {
          dispatchActiveKeys({
            type: 'NOTE_OFF',
            midiId,
          });
        }
      }
    });
  }, [keyPositionMessages, whiteKeys, blackKeys]);
  // 计算钢琴的中间位置
  const totalWhiteKeys = whiteKeys.length;
  const middleKeyIndex = Math.floor(totalWhiteKeys / 2);

  return (
    <div className="flex flex-col border-1 border-[#41719C] rounded-md p-4">
      {/* {keyPositionMessages.map((message) => {
        // 检查content是否为对象，如果是则转换为JSON字符串显示
        const content =
          typeof message.content === 'object'
            ? JSON.stringify(message.content)
            : message.content;
        return <div key={message.id}>{content}</div>;
      })} */}
      <h2 className="text-xl font-bold">演奏区域</h2>

      <div className="relative w-full mt-4 pb-16">
        <div className="piano-container relative h-[240px] w-full">
          {/* 键盘标记 - 显示分割线 */}
          <div className="absolute top-0 left-0 w-full flex z-10">
            {whiteKeys.map((key, index) => {
              // 获取当前键的ID信息
              const keyInfo = key.id.split('');
              const noteName = keyInfo[0];

              // 确定是否需要显示分割线
              let needDivider = false;

              // 第一组AB的起始位置
              if (index === 0) {
                needDivider = true;
              }
              // C的位置（每组的起始）
              else if (noteName === 'C') {
                needDivider = true;
              }

              return (
                <div
                  key={`label-${key.id}`}
                  className={`flex-1 h-6 flex items-center justify-center relative ${
                    needDivider ? 'border-l-2 border-gray-300' : ''
                  }`}
                ></div>
              );
            })}
            {/* 添加最后一个分割线 */}
            <div className="absolute top-0 right-0 h-6 border-l-2 border-gray-300"></div>
          </div>

          {/* 红色边框 - 位于分割线下方 */}
          <div className="absolute top-6 left-0 w-full h-1 bg-red-500 z-10"></div>

          {/* 白键 */}
          <div className="white-keys flex h-full pt-6 relative">
            {whiteKeys.map((key, index) => {
              // 检查这个键是否被激活
              const keyInfo = Array.from(activeKeys.values()).find(
                (info) => info.keyId === key.id
              );
              const isActive = !!keyInfo;
              const hand = keyInfo?.hand || null;

              return (
                <div
                  key={key.id}
                  className={`white-key relative flex-1 border-r-2 border-t-0 border-b-2 border-l-0 border-gray-300 rounded-b-md flex items-end justify-center pb-2 cursor-pointer ${
                    index === 0 ? 'border-l-2' : ''
                  } ${
                    isActive
                      ? key.bgColor
                        ? `bg-[${key.bgColor}]`
                        : hand === 'left'
                        ? 'bg-[#4BC6FE]'
                        : 'bg-[#FCC473]'
                      : 'bg-gradient-to-b from-white to-gray-50 hover:bg-gray-50'
                  }`}
                  // onClick={() => handleKeyClick(key.id)}
                >
                  {/* <span className="absolute bottom-1 text-[10px] text-gray-400">
                    {key.midiNumber}
                  </span> */}
                </div>
              );
            })}
          </div>

          {/* 黑键 */}
          <div className="black-keys absolute top-6 left-0 w-full h-[60%]">
            {blackKeys.map((blackKey) => {
              const whiteKeyWidth = 100 / whiteKeys.length;
              const whiteKeyIndex = getBlackKeyPosition(blackKey, whiteKeys);

              // 计算黑键位置：在对应白键的右侧
              const leftPosition =
                whiteKeyIndex * whiteKeyWidth + whiteKeyWidth * 0.65;

              // 检查这个键是否被激活
              const keyInfo = Array.from(activeKeys.values()).find(
                (info) => info.keyId === blackKey.id
              );
              const isActive = !!keyInfo;
              const hand = keyInfo?.hand || null;

              return (
                <div
                  key={blackKey.id}
                  className={`black-key absolute h-full cursor-pointer shadow-md ${
                    isActive
                      ? whiteKeys.find(
                          (k) => k.midiNumber === blackKey.midiNumber - 1
                        )?.bgColor || (hand === 'left' ? '#4BC6FE' : '#FCC473')
                        ? `bg-[${
                            whiteKeys.find(
                              (k) => k.midiNumber === blackKey.midiNumber - 1
                            )?.bgColor ||
                            (hand === 'left' ? '#4BC6FE' : '#FCC473')
                          }]`
                        : hand === 'left'
                        ? 'bg-[#4BC6FE]'
                        : 'bg-[#FCC473]'
                      : 'bg-gradient-to-b from-gray-900 to-black hover:bg-gray-800'
                  }`}
                  style={{
                    left: `${leftPosition}%`,
                    width: `${whiteKeyWidth * 0.65}%`,
                    zIndex: 5,
                  }}
                  // onClick={() => handleKeyClick(blackKey.id)}
                >
                  {/* <span className="absolute bottom-1 text-[10px] text-white flex justify-center w-full">
                    {blackKey.midiNumber}
                  </span> */}
                </div>
              );
            })}
          </div>
        </div>
        <Image
          src="/left-palm.svg"
          width={70}
          height={70}
          alt="左手"
          loading="eager"
          className="absolute top-[200px] transition-all duration-300"
          style={{
            left: `calc(${calculateHandPosition(leftHandPosition)}% - 40px)`,
          }}
        />
        <Image
          src="/right-palm.svg"
          width={70}
          height={70}
          alt="右手"
          loading="eager"
          className="absolute top-[200px] transition-all duration-300"
          style={{
            left: `calc(${calculateHandPosition(rightHandPosition)}% - 40px)`,
          }}
        />
      </div>
    </div>
  );
}
